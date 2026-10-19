/* ================= CONFIGURATION & GLOBALS ================= */
const API_BASE_URL = '/api';

let globalPassengerData = [];
let globalPaymentData = [];
let globalRouteData = [];
let reportSummaryData = null;
let revenueChartInstance = null;
let maxVanCapacity = Number(localStorage.getItem('carlift_max_capacity')) || 14;

// PAGINATION STATES (ITEMS PER PAGE = 6)
const ITEMS_PER_PAGE = 6;
let currentPassengerPage = 1;
let currentPaymentPage = 1;
let currentReportPage = 1;
let currentPendingPage = 1;

// TEMPORARY ID STORAGE PARA SA MODALS
let pendingActionPassengerId = null;
let currentDeleteContext = 'passenger'; // 'passenger' or 'approval'

// GLOBAL TIMERS PARA SA AUTO-CLOSE NG NOTIFICATIONS AT SUCCESS RECEIPTS
let customAlertTimer = null;
let receiptTimer = null;

// QR SCANNER INSTANCE
let html5QrCodeScanner = null;

// HELPER: GET AUTH HEADERS
function getAuthHeaders() {
  const token = localStorage.getItem('carlift_admin_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Security Check
  const token = localStorage.getItem('carlift_admin_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Set Capacity Input field if present
  const capInput = document.getElementById('settingCapacityInput');
  if (capInput) capInput.value = maxVanCapacity;

  // Initial Load
  loadDashboard();

  // Auto Refresh Every 5 Seconds (Live Sync)
  setInterval(loadDashboard, 5000);

  // GLOBAL ESCAPE KEY LISTENER (PARA MAG-CLOSE LAHAT NG MODALS)
  window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closePaymentModal();
      closeUpdatePaymentDateModal();
      closeSuccessReceiptModal();
      closeImageModal();
      closeVerifyModal();
      closeDeleteModal();
      closeLogoutModal();
      closeCustomAlertModal();
      closeUpdateWorkingTimeModal();
      closeQRResultModal();
    }
  });

  // CLICK OUTSIDE BACKDROP TO CLOSE MODALS
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.remove('active');
        this.style.display = 'none';
        if (this.id === 'successReceiptModal') {
          if (typeof loadDashboard === 'function') loadDashboard();
        }
      }
    });
  });
});

// MOBILE SIDEBAR TOGGLE
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

// TAB NAVIGATION
function switchTab(tabName, event) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const targetSection = document.getElementById(`view-${tabName}`);
  if (targetSection) targetSection.classList.add('active');

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    toggleMobileSidebar();
  }

  if (tabName === 'reports') {
    loadReportsData();
  } else if (tabName === 'qrscanner') {
    startQRScanner();
  } else {
    stopQRScanner();
  }
}

// UPDATE VAN CAPACITY SETTING
function updateVanCapacitySetting(val) {
  const num = Number(val);
  if (num > 0) {
    maxVanCapacity = num;
    localStorage.setItem('carlift_max_capacity', num);
    updateKPIs(globalPassengerData, globalPaymentData);
  }
}

// MAIN DASHBOARD DATA LOADER
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/summary`, {
      headers: getAuthHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('carlift_admin_token');
      window.location.href = 'login.html';
      return;
    }

    const data = await res.json();

    if (data.success) {
      reportSummaryData = data;
      globalPassengerData = data.passengers || [];
      globalPaymentData = data.payments || [];

      updateKPIs(globalPassengerData, globalPaymentData);
      renderPendingTable(globalPassengerData.filter(p => p.status === 'Pending Payment'));
      renderMasterlistTable(globalPassengerData);
      renderPaymentsTable(globalPaymentData);
      initChart(globalPassengerData, globalPaymentData);
    }
  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

function updateKPIs(passengers, payments) {
  const activeCount = passengers.filter(p => p.status === 'Active').length;
  const pendingCount = passengers.filter(p => p.status === 'Pending Payment').length;
  const totalRev = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const seatsAvailable = Math.max(0, maxVanCapacity - activeCount);
  const occupancyPercent = Math.min(Math.round((activeCount / maxVanCapacity) * 100), 100);

  if (document.getElementById('kpiActiveCount')) document.getElementById('kpiActiveCount').innerText = activeCount;
  if (document.getElementById('kpiPendingCount')) document.getElementById('kpiPendingCount').innerText = pendingCount;
  if (document.getElementById('pendingBadgeCount')) document.getElementById('pendingBadgeCount').innerText = `${pendingCount} Pending`;
  if (document.getElementById('kpiRevenue')) document.getElementById('kpiRevenue').innerText = `AED ${totalRev.toLocaleString()}`;
  if (document.getElementById('kpiOccupancyRate')) document.getElementById('kpiOccupancyRate').innerText = `${occupancyPercent}%`;
  if (document.getElementById('kpiSeatsAvailableText')) document.getElementById('kpiSeatsAvailableText').innerText = `${seatsAvailable} Seats Available`;

  const fbBadge = document.getElementById('fbAwaitingBadge');
  if (fbBadge) {
    if (pendingCount > 0) {
      fbBadge.textContent = pendingCount;
      fbBadge.style.display = 'inline-block';
    } else {
      fbBadge.style.display = 'none';
    }
  }
}

function renderPendingTable(pendingList) {
  const pendingBody = document.getElementById('pendingTableBody');
  if (!pendingBody) return;

  const totalItems = pendingList.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentPendingPage < 1) currentPendingPage = 1;
  if (currentPendingPage > totalPages) currentPendingPage = totalPages;

  const startIndex = (currentPendingPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = pendingList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  pendingBody.innerHTML = '';

  if (paginatedData.length === 0) {
    pendingBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px; color:#94a3b8; font-weight: 700;">No pending cash approvals. All clear!</td></tr>';
  } else {
    paginatedData.forEach(p => {
      const cleanPhone = p.whatsapp ? p.whatsapp.replace(/[^0-9]/g, '') : '';
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = p.photo || defaultAvatar;

      let scheduleText = p.schedule || '';
      let timeText = p.time || '';

      if (scheduleText.includes('|')) {
        const parts = scheduleText.split('|');
        scheduleText = parts[0].trim();
        if (!timeText || timeText === 'N/A') {
          timeText = parts[1].trim();
        }
      }

      if (scheduleText) scheduleText = scheduleText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      if (timeText) timeText = timeText.replace(/pickup/gi, '').replace(/return/gi, '').trim();

      const rawDateToFormat = p.join_date || p.created_at;
      const joinedDateFormatted = rawDateToFormat ? formatDateOnly(rawDateToFormat) : 'N/A';

      const row = `
        <tr>
          <td><span class="id-chip">${p.id}</span></td>
          <td style="font-weight: 800; color: #0f172a;">${p.name}</td>
          <td>
            <img src="${photoSrc}" class="avatar-img" alt="Photo" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view full photo" />
          </td>
          <td>
            <a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-link">
              <i class="fa-brands fa-whatsapp"></i> ${p.whatsapp || p.mobile}
            </a>
          </td>
          <td><b>${p.pickup}</b> → <b>${p.dropoff}</b></td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${scheduleText || 'N/A'}</span></td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${timeText || 'N/A'}</span></td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${joinedDateFormatted}</span></td>
          <td><span class="badge badge-pending">${p.status}</span></td>
          <td>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-action-approve" onclick="openVerifyModal('${p.id}', '${p.name}')">
                <i class="fa-solid fa-circle-check"></i> Approve
              </button>
              <button class="btn-action-delete" onclick="openDeleteModal('${p.id}', '${p.name}', 'approval')">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
      pendingBody.innerHTML += row;
    });
  }

  const infoElem = document.getElementById('pendingPageInfo');
  const prevBtn = document.getElementById('btnPrevPending');
  const nextBtn = document.getElementById('btnNextPending');

  if (infoElem) infoElem.innerText = `Showing page ${currentPendingPage} of ${totalPages} (${totalItems} pending requests)`;
  if (prevBtn) prevBtn.disabled = (currentPendingPage === 1);
  if (nextBtn) nextBtn.disabled = (currentPendingPage === totalPages || totalPages === 0);
}

function renderMasterlistTable(data) {
  const searchElem = document.getElementById('passengerSearch');
  const searchQuery = searchElem ? searchElem.value.toLowerCase() : '';
  
  let displayData = data.filter(p => p.status === 'Active' || p.status !== 'Pending Payment');

  if (searchQuery) {
    displayData = displayData.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchQuery)) ||
      (p.mobile && p.mobile.includes(searchQuery)) ||
      (p.whatsapp && p.whatsapp.includes(searchQuery)) ||
      (p.pickup && p.pickup.toLowerCase().includes(searchQuery)) ||
      (p.dropoff && p.dropoff.toLowerCase().includes(searchQuery)) ||
      (p.id && p.id.toLowerCase().includes(searchQuery))
    );
  }

  const totalItems = displayData.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentPassengerPage < 1) currentPassengerPage = 1;
  if (currentPassengerPage > totalPages) currentPassengerPage = totalPages;

  const startIndex = (currentPassengerPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = displayData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const masterBody = document.getElementById('allPassengersTableBody');
  if (!masterBody) return;

  masterBody.innerHTML = '';

  if (paginatedData.length === 0) {
    masterBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 30px; color:#94a3b8; font-weight:700;">No active passengers found.</td></tr>';
  } else {
    paginatedData.forEach(p => {
      const cleanPhone = p.whatsapp ? p.whatsapp.replace(/[^0-9]/g, '') : '';
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = p.photo || defaultAvatar;

      let scheduleText = p.schedule || '';
      let timeText = p.time || '';

      if (scheduleText.includes('|')) {
        const parts = scheduleText.split('|');
        scheduleText = parts[0].trim();
        if (!timeText || timeText === 'N/A') {
          timeText = parts[1].trim();
        }
      }

      if (scheduleText) scheduleText = scheduleText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      if (timeText) timeText = timeText.replace(/pickup/gi, '').replace(/return/gi, '').trim();

      const rawDateToFormat = p.join_date || p.created_at;
      const joinedDateFormatted = rawDateToFormat ? formatDateOnly(rawDateToFormat) : 'N/A';
      
      const passengerPayments = globalPaymentData.filter(pay => pay.passenger_id === p.id);
      
      let lastPayDateStr = null;
      if (passengerPayments.length > 0) {
        passengerPayments.sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
        lastPayDateStr = passengerPayments[0].payment_date;
      }

      if (!lastPayDateStr) {
        lastPayDateStr = p.last_payment_date || p.join_date || p.created_at;
      }

      let daysLeft = 0;
      let isExpired = false;
      let countdownClass = 'badge-danger';
      let countdownText = 'Expired / Overdue';

      if (lastPayDateStr) {
        const payDate = new Date(lastPayDateStr);
        const today = new Date();
        const diffTime = today - payDate;
        const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        daysLeft = 25 - daysPassed;

        if (daysLeft > 5) {
          countdownClass = 'badge-active';
          countdownText = `${daysLeft} Days Left`;
        } else if (daysLeft >= 0) {
          countdownClass = 'badge-warning';
          countdownText = `${daysLeft} Days Left`;
        } else {
          isExpired = true;
          countdownClass = 'badge-danger';
          countdownText = `Expired / Overdue`;
        }
      } else {
        isExpired = true;
      }

      let rawTotalPaid = Number(p.total_paid) || 0;
      let effectivePaid = isExpired ? 0 : rawTotalPaid; 
      let remainingBalance = Math.max(0, 250 - effectivePaid);

      let balanceHtml = '';
      let statusBadgeHtml = '';

      if (effectivePaid >= 250) {
        balanceHtml = `<span style="color: #10b981; font-weight: 800; background: #ecfdf5; padding: 4px 8px; border-radius: 6px; display: inline-block;">Fully Paid (AED ${effectivePaid})</span>`;
        statusBadgeHtml = `<span class="badge badge-active">Active</span>`;
      } else if (effectivePaid > 0) {
        balanceHtml = `<span style="color: #d97706; font-weight: 700;">Paid: AED ${effectivePaid}<br><b style="color: #ef4444;">Bal: AED ${remainingBalance}</b></span>`;
        statusBadgeHtml = `<span class="badge" style="background: #fef3c7; color: #d97706; font-weight: 700; padding: 6px 10px; border-radius: 6px;">Partial</span>`;
      } else {
        balanceHtml = `<span style="color: #ef4444; font-weight: 700;">Unpaid (Bal: AED 250)</span>`;
        statusBadgeHtml = `<span class="badge" style="background: #fee2e2; color: #ef4444; font-weight: 700; padding: 6px 10px; border-radius: 6px;">Inactive</span>`;
      }

      const row = `
        <tr>
          <td><span class="id-chip">${p.id}</span></td>
          <td style="font-weight: 800; color: #0f172a;">${p.name}</td>
          <td>
            <img src="${photoSrc}" class="avatar-img" alt="Photo" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view full photo" />
          </td>
          <td>
            <a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-link">
              <i class="fa-brands fa-whatsapp"></i> ${p.whatsapp || p.mobile}
            </a>
          </td>
          <td><b>${p.pickup}</b> → <b>${p.dropoff}</b></td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${scheduleText || 'N/A'}</span></td>
          <td style="text-align: center; font-size: 13px; color: #475569; font-weight: 600;">
            <div>${timeText || 'N/A'}</div>
            <div style="margin-top: 4px;">
              <button class="btn-action-update" onclick="openUpdateWorkingTimeModal('${p.id}', '${p.name}', '${p.time || ''}')" style="padding: 2px 8px; font-size: 11px;">
                <i class="fa-solid fa-pen"></i> Edit Shift
              </button>
            </div>
          </td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${joinedDateFormatted}</span></td>
          <td style="text-align: center; font-size: 12px;">
            ${balanceHtml}
            <div style="margin-top: 4px;">
              <button class="btn-action-update" onclick="openUpdatePaymentDateModal('${p.id}', '${p.name}')" style="padding: 2px 8px; font-size: 11px;">
                <i class="fa-solid fa-pen"></i> Add Pay
              </button>
            </div>
          </td>
          <td style="text-align: center;">
            <span class="badge ${countdownClass}" style="padding: 6px 10px; border-radius: 6px; display: inline-block; font-weight: 700;">
              <i class="fa-solid fa-clock"></i> ${countdownText}
            </span>
          </td>
          <td style="text-align: center;">
            ${statusBadgeHtml}
          </td>
          <td style="text-align: center;">
            <button class="btn-action-delete" onclick="openDeleteModal('${p.id}', '${p.name}', 'passenger')">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
      masterBody.innerHTML += row;
    });
  }

  const infoElem = document.getElementById('passengersPageInfo');
  const prevBtn = document.getElementById('btnPrevPassengers');
  const nextBtn = document.getElementById('btnNextPassengers');

  if (infoElem) infoElem.innerText = `Showing page ${currentPassengerPage} of ${totalPages} (${totalItems} passengers)`;
  if (prevBtn) prevBtn.disabled = (currentPassengerPage === 1);
  if (nextBtn) nextBtn.disabled = (currentPassengerPage === totalPages || totalPages === 0);
}

function renderPaymentsTable(data) {
  const searchElem = document.getElementById('paymentSearch');
  const searchQuery = searchElem ? searchElem.value.toLowerCase() : '';
  
  let displayData = [...data];

  displayData.sort((a, b) => {
    const dateA = new Date(a.payment_date || 0);
    const dateB = new Date(b.payment_date || 0);
    return dateB - dateA;
  });

  if (searchQuery) {
    displayData = displayData.filter(pay => 
      (pay.receipt_no && pay.receipt_no.toLowerCase().includes(searchQuery)) ||
      (pay.passenger_name && pay.passenger_name.toLowerCase().includes(searchQuery)) ||
      (pay.passenger_id && pay.passenger_id.toLowerCase().includes(searchQuery)) ||
      (pay.billing_month && pay.billing_month.toLowerCase().includes(searchQuery))
    );
  }

  const totalItems = displayData.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentPaymentPage < 1) currentPaymentPage = 1;
  if (currentPaymentPage > totalPages) currentPaymentPage = totalPages;

  const startIndex = (currentPaymentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = displayData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const payBody = document.getElementById('paymentsTableBody');
  if (!payBody) return;

  payBody.innerHTML = '';

  if (paginatedData.length === 0) {
    payBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color:#94a3b8; font-weight:700;">No payment records found.</td></tr>';
  } else {
    paginatedData.forEach(pay => {
      const matchedPassenger = globalPassengerData.find(p => p.id === pay.passenger_id);
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = (matchedPassenger && matchedPassenger.photo) ? matchedPassenger.photo : defaultAvatar;
      const passName = pay.passenger_name || (matchedPassenger ? matchedPassenger.name : 'N/A');

      const formattedDate = pay.payment_date ? formatDateOnly(pay.payment_date) : 'N/A';
      const billMonth = pay.billing_month ? formatMonthOnly(pay.billing_month) : 'N/A';

      const row = `
        <tr>
          <td><span class="id-chip">${pay.receipt_no}</span></td>
          <td><b>${pay.passenger_id}</b></td>
          <td><b>${passName}</b></td>
          <td>
            <img src="${photoSrc}" class="avatar-img" alt="Photo" onclick="openImageModal('${photoSrc}', '${passName}')" title="Click to view full photo" />
          </td>
          <td><span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 700;">${billMonth}</span></td>
          <td style="font-weight: 800; color: #10b981;">AED ${pay.amount}</td>
          <td>${pay.collector || 'Owner'}</td>
          <td><span style="font-size: 13px; color: #475569; font-weight: 600;">${formattedDate}</span></td>
        </tr>
      `;
      payBody.innerHTML += row;
    });
  }

  const infoElem = document.getElementById('paymentsPageInfo');
  const prevBtn = document.getElementById('btnPrevPayments');
  const nextBtn = document.getElementById('btnNextPayments');

  if (infoElem) infoElem.innerText = `Showing page ${currentPaymentPage} of ${totalPages} (${totalItems} logs)`;
  if (prevBtn) prevBtn.disabled = (currentPaymentPage === 1);
  if (nextBtn) nextBtn.disabled = (currentPaymentPage === totalPages || totalPages === 0);
}

/* ================= QR SCANNER REAL-TIME VERIFICATION ================= */
function startQRScanner() {
  if (!html5QrCodeScanner) {
    html5QrCodeScanner = new Html5QrcodeScanner(
      "qrReader",
      { fps: 10, qrbox: { width: 220, height: 220 } },
      false
    );
  }
  html5QrCodeScanner.render(onScanSuccess, onScanFailure);
}

function stopQRScanner() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.clear().catch(err => console.error("Scanner stop error:", err));
  }
}

function onScanSuccess(decodedText) {
  stopQRScanner();

  // Clean scan string and match against database passengers
  const matchedPassenger = globalPassengerData.find(p => 
    (p.name && decodedText.toLowerCase().includes(p.name.toLowerCase())) || 
    (p.id && decodedText.toLowerCase().includes(p.id.toLowerCase())) || 
    (p.whatsapp && decodedText.includes(p.whatsapp.replace(/[^0-9]/g, '')))
  );

  if (matchedPassenger) {
    displayScannedPassengerModal(matchedPassenger);
  } else {
    showToastNotification("QR Code invalid or Passenger record not found!");
  }
}

function onScanFailure(error) {
  // Silent scan frame listener
}

function displayScannedPassengerModal(passenger) {
  const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";

  document.getElementById('qrScanPhoto').src = passenger.photo || defaultAvatar;
  document.getElementById('qrScanName').innerText = passenger.name;
  document.getElementById('qrScanPhone').innerText = passenger.whatsapp || passenger.mobile;

  const totalPaid = Number(passenger.total_paid) || 0;
  const balance = Math.max(0, 250 - totalPaid);

  document.getElementById('qrScanTotalPaid').innerText = `AED ${totalPaid}`;
  document.getElementById('qrScanBalance').innerText = `AED ${balance}`;

  const passengerPayments = globalPaymentData.filter(pay => pay.passenger_id === passenger.id);
  let lastPayDateStr = passengerPayments.length > 0 ? passengerPayments[0].payment_date : (passenger.join_date || passenger.created_at);
  
  let countdownText = 'No Payment Record';
  if (lastPayDateStr) {
    const payDate = new Date(lastPayDateStr);
    const today = new Date();
    const daysPassed = Math.floor((today - payDate) / (1000 * 60 * 60 * 24));
    const daysLeft = 25 - daysPassed;
    countdownText = daysLeft >= 0 ? `${daysLeft} Days Remaining` : 'Expired / Overdue';
  }

  document.getElementById('qrScanCountdown').innerText = countdownText;

  const badge = document.getElementById('qrScanStatusBadge');
  if (totalPaid >= 250) {
    badge.className = "badge badge-active";
    badge.innerText = "ACTIVE / FULLY PAID";
  } else if (totalPaid > 0) {
    badge.className = "badge";
    badge.style.cssText = "background: #fef3c7; color: #d97706; font-weight: 700;";
    badge.innerText = "PARTIAL PAYMENT";
  } else {
    badge.className = "badge";
    badge.style.cssText = "background: #fee2e2; color: #ef4444; font-weight: 700;";
    badge.innerText = "INACTIVE / UNPAID";
  }

  const modal = document.getElementById('qrResultModal');
  if (modal) modal.classList.add('active');
}

function closeQRResultModal() {
  const modal = document.getElementById('qrResultModal');
  if (modal) modal.classList.remove('active');
  startQRScanner();
}

/* ================= OTHER MODAL HANDLERS & HELPERS ================= */
function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateString)) return dateString;

  let dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) dateObj = new Date(dateString.replace(' ', 'T'));
  if (isNaN(dateObj.getTime())) return dateString;

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatMonthOnly(dateString) {
  if (!dateString) return 'N/A';
  let dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) dateObj = new Date(dateString.replace(' ', 'T'));
  if (isNaN(dateObj.getTime())) return dateString;
  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function showToastNotification(message) {
  let alertModal = document.getElementById('customAlertModal');
  if (!alertModal) {
    alertModal = document.createElement('div');
    alertModal.id = 'customAlertModal';
    alertModal.className = 'modal-overlay';
    alertModal.style.cssText = "display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;";
    alertModal.innerHTML = `
      <div class="modal-box" style="background: #fff; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
        <div style="font-size: 38px; color: #10b981; margin-bottom: 10px;"><i class="fa-solid fa-circle-check"></i></div>
        <h3 style="font-size: 18px; color: #0f172a; font-weight: 800; margin-bottom: 8px;">System Notification</h3>
        <p id="customAlertMessage" style="font-size: 14px; color: #475569; margin-bottom: 20px; line-height: 1.5;"></p>
        <button type="button" onclick="closeCustomAlertModal()" style="padding: 10px 24px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">OK</button>
      </div>
    `;
    document.body.appendChild(alertModal);
  }

  document.getElementById('customAlertMessage').innerText = message;
  alertModal.classList.add('active');
  alertModal.style.display = 'flex';

  if (customAlertTimer) clearTimeout(customAlertTimer);
  customAlertTimer = setTimeout(() => closeCustomAlertModal(), 3000);
}

function closeCustomAlertModal() {
  const alertModal = document.getElementById('customAlertModal');
  if (alertModal) {
    alertModal.classList.remove('active');
    alertModal.style.display = 'none';
  }
}

function initChart(passengersData, paymentsData) {
  const canvasElem = document.getElementById('revenueChart');
  if (!canvasElem) return;

  const ctx = canvasElem.getContext('2d');
  const totalCollected = paymentsData.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const activePassengers = passengersData.filter(p => p.status === 'Active');
  const totalExpectedRevenue = activePassengers.length * 250;
  const totalPending = Math.max(0, totalExpectedRevenue - totalCollected);

  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Collected Revenue', 'Pending Payments'],
      datasets: [{
        data: [totalCollected, totalPending],
        backgroundColor: ['#10b981', '#f59e0b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%'
    }
  });
}

function openLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.style.display = 'flex';
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.style.display = 'none';
}

function confirmLogout() {
  localStorage.removeItem('carlift_admin_token');
  window.location.href = 'login.html';
}