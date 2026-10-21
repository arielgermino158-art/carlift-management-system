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

let pendingActionPassengerId = null;
let currentDeleteContext = 'passenger';

let customAlertTimer = null;
let receiptTimer = null;
let html5QrCodeScanner = null;

function getAuthHeaders() {
  const token = localStorage.getItem('carlift_admin_token') || localStorage.getItem('supabase_admin_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('carlift_admin_token') || localStorage.getItem('supabase_admin_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const capInput = document.getElementById('settingCapacityInput');
  if (capInput) capInput.value = maxVanCapacity;

  loadDashboard();
  setInterval(loadDashboard, 5000);

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
      closeQRScannerModal();
      closeQRResultModal();
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.remove('active');
        this.style.display = 'none';
        if (this.id === 'qrScannerModal' || this.id === 'view-qrscanner') {
          stopQRScanner();
        }
      }
    });
  });
});

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

function switchTab(tabName, event) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const targetSection = document.getElementById(`view-${tabName}`);
  if (targetSection) targetSection.classList.add('active');

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    toggleMobileSidebar();
  }

  if (tabName === 'reports') {
    loadReportsData();
  }
}

function updateVanCapacitySetting(val) {
  const num = Number(val);
  if (num > 0) {
    maxVanCapacity = num;
    localStorage.setItem('carlift_max_capacity', num);
    updateKPIsAndCategorizedBadges(globalPassengerData, globalPaymentData);
  }
}

/* ================= MAIN DASHBOARD DATA LOADER & CATEGORIZATION ================= */
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/summary`, {
      headers: getAuthHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('carlift_admin_token');
      localStorage.removeItem('supabase_admin_token');
      window.location.href = 'login.html';
      return;
    }

    const data = await res.json();

    if (data && data.success) {
      reportSummaryData = data;
      globalPassengerData = data.passengers || [];
      globalPaymentData = data.payments || [];

      updateKPIsAndCategorizedBadges(globalPassengerData, globalPaymentData);
      renderPendingTable(globalPassengerData.filter(p => p.status === 'Pending Payment'));
      renderMasterlistTable(globalPassengerData);
      renderCategorizedTables(globalPassengerData);
      renderPaymentsTable(globalPaymentData);
      initChart(globalPassengerData, globalPaymentData);
    }
  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

function updateKPIsAndCategorizedBadges(passengers, payments) {
  const activeCount = passengers.filter(p => p.status === 'Active').length;
  const pendingCount = passengers.filter(p => p.status === 'Pending Payment').length;
  const totalRev = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const seatsAvailable = Math.max(0, maxVanCapacity - activeCount);
  const occupancyPercent = maxVanCapacity > 0 ? Math.min(Math.round((activeCount / maxVanCapacity) * 100), 100) : 0;

  if (document.getElementById('kpiActiveCount')) document.getElementById('kpiActiveCount').innerText = activeCount;
  if (document.getElementById('kpiPendingCount')) document.getElementById('kpiPendingCount').innerText = pendingCount;
  if (document.getElementById('pendingBadgeCount')) document.getElementById('pendingBadgeCount').innerText = `${pendingCount} Pending`;
  if (document.getElementById('kpiRevenue')) document.getElementById('kpiRevenue').innerText = `AED ${totalRev.toLocaleString()}`;
  if (document.getElementById('kpiOccupancyRate')) document.getElementById('kpiOccupancyRate').innerText = `${occupancyPercent}%`;
  if (document.getElementById('kpiSeatsAvailableText')) document.getElementById('kpiSeatsAvailableText').innerText = `${seatsAvailable} Seats Available`;

  let fullPaidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  passengers.forEach(p => {
    if (p.status !== 'Pending Payment') {
      const passengerPayments = payments.filter(pay => pay.passenger_id === p.id);
      let lastPayDateStr = passengerPayments.length > 0 ? passengerPayments[0].payment_date : (p.last_payment_date || p.join_date);

      let isExpired = false;
      if (lastPayDateStr) {
        const diffTime = new Date() - new Date(lastPayDateStr);
        const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (25 - daysPassed < 0) isExpired = true;
      } else {
        isExpired = true;
      }

      const totalPaid = Number(p.total_paid) || 0;
      const effectivePaid = isExpired ? 0 : totalPaid;

      if (effectivePaid >= 250) fullPaidCount++;
      else if (effectivePaid > 0) partialCount++;
      else unpaidCount++;
    }
  });

  updateBadge('fbFullPaidBadge', fullPaidCount);
  updateBadge('fbPartialBadge', partialCount);
  updateBadge('fbUnpaidBadge', unpaidCount);
  updateBadge('fbAwaitingBadge', pendingCount);
}

function updateBadge(id, count) {
  const elem = document.getElementById(id);
  if (elem) {
    if (count > 0) {
      elem.innerText = count;
      elem.style.display = 'inline-block';
    } else {
      elem.style.display = 'none';
    }
  }
}

/* ================= RENDER CATEGORIZED TABLES (FULL PAID, PARTIAL, UNPAID) ================= */
function renderCategorizedTables(passengers) {
  const fullPaidBody = document.getElementById('fullPaidTableBody');
  const partialBody = document.getElementById('partialTableBody');
  const unpaidBody = document.getElementById('unpaidTableBody');

  if (fullPaidBody) fullPaidBody.innerHTML = '';
  if (partialBody) partialBody.innerHTML = '';
  if (unpaidBody) unpaidBody.innerHTML = '';

  passengers.forEach(p => {
    if (p.status !== 'Pending Payment') {
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = p.photo || defaultAvatar;

      const passengerPayments = globalPaymentData.filter(pay => pay.passenger_id === p.id);
      let lastPayDateStr = passengerPayments.length > 0 ? passengerPayments[0].payment_date : (p.last_payment_date || p.join_date);

      let daysLeft = 0;
      let isExpired = false;
      if (lastPayDateStr) {
        const diffTime = new Date() - new Date(lastPayDateStr);
        daysLeft = 25 - Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) isExpired = true;
      } else {
        isExpired = true;
      }

      const totalPaid = Number(p.total_paid) || 0;
      const effectivePaid = isExpired ? 0 : totalPaid;
      const remainingBalance = Math.max(0, 250 - effectivePaid);

      const cleanPhone = p.whatsapp ? String(p.whatsapp).replace(/[^0-9]/g, '') : '';
      let waButtonHtml = '';
      if (daysLeft <= 3) {
        const waText = encodeURIComponent(`Hi ${p.name || 'Passenger'}! Paalala mula sa Carlift OS: Ang iyong carlift subscription ay ${daysLeft < 0 ? 'Expired na' : daysLeft === 0 ? 'Due today na' : 'mag-eexpire sa loob ng ' + daysLeft + ' araw'}. Paki-settle ang AED 250. Salamat!`);
        waButtonHtml = `
          <a href="https://wa.me/${cleanPhone}?text=${waText}" target="_blank" style="background:#25d366; color:#fff; padding:3px 8px; font-size:11px; font-weight:700; text-decoration:none; border-radius:4px; display:inline-flex; align-items:center; gap:4px; margin-top:4px;">
            <i class="fa-brands fa-whatsapp"></i> Send WA
          </a>
        `;
      }

      if (effectivePaid >= 250 && fullPaidBody) {
        fullPaidBody.innerHTML += `
          <tr>
            <td><span class="id-chip">${p.id}</span></td>
            <td><b>${p.name}</b></td>
            <td><img src="${photoSrc}" class="avatar-img" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view photo" /></td>
            <td>${p.whatsapp || p.mobile || 'N/A'}</td>
            <td>${p.pickup} → ${p.dropoff}</td>
            <td>${p.time || 'N/A'}</td>
            <td><span style="color:#10b981; font-weight:800;">AED ${effectivePaid}</span></td>
            <td><span class="badge badge-active">${daysLeft} Days Left</span></td>
            <td><span class="badge badge-active">Full Paid</span></td>
          </tr>
        `;
      } else if (effectivePaid > 0 && partialBody) {
        partialBody.innerHTML += `
          <tr>
            <td><span class="id-chip">${p.id}</span></td>
            <td><b>${p.name}</b></td>
            <td><img src="${photoSrc}" class="avatar-img" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view photo" /></td>
            <td>${p.whatsapp || p.mobile || 'N/A'}</td>
            <td>${p.pickup} → ${p.dropoff}</td>
            <td>${p.time || 'N/A'}</td>
            <td><span style="color:#d97706; font-weight:700;">Paid: AED ${effectivePaid}<br><b style="color:#ef4444;">Bal: AED ${remainingBalance}</b></span></td>
            <td><span class="badge badge-warning">${daysLeft >= 0 ? daysLeft + ' Days Left' : 'Expired'}</span><br>${waButtonHtml}</td>
            <td><button class="btn-action-update" onclick="openUpdatePaymentDateModal('${p.id}', '${p.name}')">Add Pay</button></td>
          </tr>
        `;
      } else if (unpaidBody) {
        unpaidBody.innerHTML += `
          <tr>
            <td><span class="id-chip">${p.id}</span></td>
            <td><b>${p.name}</b></td>
            <td><img src="${photoSrc}" class="avatar-img" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view photo" /></td>
            <td>${p.whatsapp || p.mobile || 'N/A'}</td>
            <td>${p.pickup} → ${p.dropoff}</td>
            <td>${p.time || 'N/A'}</td>
            <td><span style="color:#ef4444; font-weight:800;">AED 250 Due</span></td>
            <td><span class="badge badge-danger">${isExpired ? 'Expired / Overdue' : daysLeft + ' Days Left'}</span><br>${waButtonHtml}</td>
            <td><button class="btn-action-update" onclick="openUpdatePaymentDateModal('${p.id}', '${p.name}')">Record Pay</button></td>
          </tr>
        `;
      }
    }
  });
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
      const cleanPhone = p.whatsapp ? String(p.whatsapp).replace(/[^0-9]/g, '') : '';
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = p.photo || defaultAvatar;

      let scheduleText = p.schedule || '';
      let timeText = p.time || '';

      if (scheduleText.includes('|')) {
        const parts = scheduleText.split('|');
        scheduleText = parts[0].trim();
        if (!timeText || timeText === 'N/A') timeText = parts[1].trim();
      }

      const row = `
        <tr>
          <td><span class="id-chip">${p.id}</span></td>
          <td style="font-weight: 800; color: #0f172a;">${p.name || 'N/A'}</td>
          <td><img src="${photoSrc}" class="avatar-img" onclick="openImageModal('${photoSrc}', '${p.name || 'Passenger'}')" title="Click to view photo" /></td>
          <td><a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-link"><i class="fa-brands fa-whatsapp"></i> ${p.whatsapp || p.mobile || 'N/A'}</a></td>
          <td><b>${p.pickup || 'N/A'}</b> → <b>${p.dropoff || 'N/A'}</b></td>
          <td>${scheduleText || 'N/A'}</td>
          <td>${timeText || 'N/A'}</td>
          <td>${formatDateOnly(p.join_date || p.created_at)}</td>
          <td><span class="badge badge-pending">${p.status || 'Pending'}</span></td>
          <td>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-action-approve" onclick="openVerifyModal('${p.id}', '${p.name || ''}')"><i class="fa-solid fa-circle-check"></i> Approve</button>
              <button class="btn-action-delete" onclick="openDeleteModal('${p.id}', '${p.name || ''}', 'approval')"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
          </td>
        </tr>
      `;
      pendingBody.innerHTML += row;
    });
  }
}

function openImageModal(imgSrc, passengerName) {
  const imgPreview = document.getElementById('imageModalPreview');
  const titleElem = document.getElementById('imageModalTitle');
  if (imgPreview) imgPreview.src = imgSrc;
  if (titleElem) titleElem.innerHTML = `<i class="fa-solid fa-user"></i> ${passengerName || 'Passenger Photo'}`;
  const modal = document.getElementById('imageModal');
  if (modal) modal.classList.add('active');
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (modal) modal.classList.remove('active');
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
      const cleanPhone = p.whatsapp ? String(p.whatsapp).replace(/[^0-9]/g, '') : '';
      const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
      const photoSrc = p.photo || defaultAvatar;

      const passengerPayments = globalPaymentData.filter(pay => pay.passenger_id === p.id);
      let lastPayDateStr = passengerPayments.length > 0 ? passengerPayments[0].payment_date : (p.last_payment_date || p.join_date);

      let daysLeft = 0;
      let isExpired = false;
      if (lastPayDateStr) {
        daysLeft = 25 - Math.floor((new Date() - new Date(lastPayDateStr)) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) isExpired = true;
      } else { isExpired = true; }

      const totalPaid = Number(p.total_paid) || 0;
      const effectivePaid = isExpired ? 0 : totalPaid;
      const remainingBalance = Math.max(0, 250 - effectivePaid);

      let waButtonHtml = '';
      if (daysLeft <= 3) {
        const waText = encodeURIComponent(`Hi ${p.name || 'Passenger'}! Paalala mula sa Carlift OS: Subscription mo ay ${daysLeft < 0 ? 'Expired na' : daysLeft === 0 ? 'Due today na' : 'mag-eexpire sa ' + daysLeft + ' araw'}. Paki-settle ang AED 250. Salamat!`);
        waButtonHtml = `
          <div style="margin-top: 4px;">
            <a href="https://wa.me/${cleanPhone}?text=${waText}" target="_blank" style="background:#25d366; color:#fff; padding:3px 8px; font-size:11px; font-weight:700; text-decoration:none; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-brands fa-whatsapp"></i> Send WA
            </a>
          </div>
        `;
      }

      masterBody.innerHTML += `
        <tr>
          <td><span class="id-chip">${p.id}</span></td>
          <td><b>${p.name}</b></td>
          <td><img src="${photoSrc}" class="avatar-img" onclick="openImageModal('${photoSrc}', '${p.name}')" title="Click to view photo" /></td>
          <td><a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-link"><i class="fa-brands fa-whatsapp"></i> ${p.whatsapp || p.mobile || 'N/A'}</a></td>
          <td>${p.pickup} → ${p.dropoff}</td>
          <td>${p.schedule || 'N/A'}</td>
          <td>${p.time || 'N/A'}</td>
          <td>${formatDateOnly(p.join_date || p.created_at)}</td>
          <td style="text-align:center;">${effectivePaid >= 250 ? '<span style="color:#10b981; font-weight:800;">Fully Paid (AED 250)</span>' : '<span style="color:#ef4444; font-weight:700;">Bal: AED ' + remainingBalance + '</span>'}</td>
          <td style="text-align:center;"><span class="badge ${daysLeft > 5 ? 'badge-active' : daysLeft >= 0 ? 'badge-warning' : 'badge-danger'}">${daysLeft >= 0 ? daysLeft + ' Days Left' : 'Expired'}</span>${waButtonHtml}</td>
          <td><span class="badge badge-active">Active</span></td>
          <td style="text-align:center;"><button class="btn-action-delete" onclick="openDeleteModal('${p.id}', '${p.name}', 'passenger')"><i class="fa-solid fa-trash"></i> Delete</button></td>
        </tr>
      `;
    });
  }
}

/* ================= QR CODE SCANNER CONTROLS ================= */
function openQRScannerModal() {
  const modal = document.getElementById('qrScannerModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  if (typeof Html5Qrcode !== 'undefined') {
    if (!html5QrCodeScanner) {
      html5QrCodeScanner = new Html5Qrcode("qrReader");
    }
    
    html5QrCodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        handleScannedQRCode(decodedText);
      },
      () => {}
    ).catch(err => {
      console.warn("Camera access error:", err);
      showToastNotification("Unable to access camera.");
    });
  } else {
    showToastNotification("QR Scanner library not loaded.");
  }
}

function stopQRScanner() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.stop().then(() => {
      html5QrCodeScanner.clear();
      html5QrCodeScanner = null;
    }).catch(err => {
      console.warn("Error stopping scanner:", err);
      html5QrCodeScanner = null;
    });
  }
}

function closeQRScannerModal() {
  stopQRScanner();
  const modal = document.getElementById('qrScannerModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function closeQRResultModal() {
  const modal = document.getElementById('qrResultModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function handleScannedQRCode(scannedCode) {
  stopQRScanner();
  closeQRScannerModal();
  if (!scannedCode) return;

  let cleanCode = scannedCode.trim();

  const matchedPassenger = globalPassengerData.find(p => 
    (p.id && p.id.toLowerCase() === cleanCode.toLowerCase()) ||
    (p.name && p.name.toLowerCase() === cleanCode.toLowerCase()) ||
    (p.whatsapp && String(p.whatsapp).includes(cleanCode))
  );

  if (matchedPassenger) {
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='11'>No Photo</text></svg>";

    const photoElem = document.getElementById('qrScanPhoto');
    const nameElem = document.getElementById('qrScanName');
    const phoneElem = document.getElementById('qrScanPhone');
    const statusBadgeElem = document.getElementById('qrScanStatusBadge');
    const latestPaymentElem = document.getElementById('qrScanLatestPayment');
    const balanceElem = document.getElementById('qrScanBalance');
    const countdownElem = document.getElementById('qrScanCountdown');
    const recordPayBtn = document.getElementById('qrRecordPayBtn');

    const photoSrc = matchedPassenger.photo || defaultAvatar;

    if (photoElem) {
      photoElem.src = photoSrc;
      photoElem.onclick = function() {
        openImageModal(photoSrc, matchedPassenger.name);
      };
    }

    if (nameElem) nameElem.innerText = `${matchedPassenger.name || 'N/A'} (${matchedPassenger.id || 'N/A'})`;
    if (phoneElem) phoneElem.innerText = matchedPassenger.whatsapp || matchedPassenger.mobile || 'No Phone';

    const passengerPayments = globalPaymentData.filter(pay => pay.passenger_id === matchedPassenger.id);
    let lastPayDateStr = passengerPayments.length > 0 ? passengerPayments[0].payment_date : (matchedPassenger.last_payment_date || matchedPassenger.join_date);

    let daysLeft = 0;
    let isExpired = false;
    if (lastPayDateStr) {
      daysLeft = 25 - Math.floor((new Date() - new Date(lastPayDateStr)) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) isExpired = true;
    } else { isExpired = true; }

    const totalPaid = Number(matchedPassenger.total_paid) || 0;
    const effectivePaid = isExpired ? 0 : totalPaid;
    const remainingBalance = Math.max(0, 250 - effectivePaid);

    if (statusBadgeElem) {
      if (effectivePaid >= 250) {
        statusBadgeElem.className = 'badge badge-active';
        statusBadgeElem.innerText = 'Active (Fully Paid)';
      } else if (effectivePaid > 0) {
        statusBadgeElem.className = 'badge';
        statusBadgeElem.style.background = '#fef3c7'; statusBadgeElem.style.color = '#d97706';
        statusBadgeElem.innerText = 'Partial Payment';
      } else {
        statusBadgeElem.className = 'badge';
        statusBadgeElem.style.background = '#fee2e2'; statusBadgeElem.style.color = '#ef4444';
        statusBadgeElem.innerText = 'Inactive / Expired';
      }
    }

    if (latestPaymentElem) latestPaymentElem.innerText = lastPayDateStr ? `AED ${effectivePaid} (${formatDateOnly(lastPayDateStr)})` : 'No record';
    if (balanceElem) balanceElem.innerText = `AED ${remainingBalance}`;
    if (countdownElem) countdownElem.innerText = isExpired ? 'Expired / Overdue' : `${daysLeft} Days Left`;

    if (recordPayBtn) {
      recordPayBtn.onclick = function() {
        closeQRResultModal();
        openUpdatePaymentDateModal(matchedPassenger.id, matchedPassenger.name);
      };
    }

    const resultModal = document.getElementById('qrResultModal');
    if (resultModal) resultModal.style.display = 'flex';
  } else {
    showToastNotification(`Scanned Code: "${cleanCode}" - No matching passenger found.`);
  }
}

/* ================= UTILITY & MODAL CONTROLS ================= */
function formatDateOnly(d) {
  if (!d) return 'N/A';
  let dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return d;
  return `${String(dateObj.getDate()).padStart(2,'0')}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${dateObj.getFullYear()}`;
}

function openPaymentModal() { document.getElementById('paymentModal').style.display = 'flex'; }
function closePaymentModal() { document.getElementById('paymentModal').style.display = 'none'; }
function openUpdatePaymentDateModal(id, name) {
  pendingActionPassengerId = id;
  document.getElementById('updateModalPassengerName').innerText = name;
  document.getElementById('modalUpdatePassengerId').value = id;
  document.getElementById('updatePaymentDateModal').style.display = 'flex';
}
function closeUpdatePaymentDateModal() { document.getElementById('updatePaymentDateModal').style.display = 'none'; }
function openLogoutModal() { document.getElementById('logoutModal').style.display = 'flex'; }
function closeLogoutModal() { document.getElementById('logoutModal').style.display = 'none'; }
function confirmLogout() { localStorage.clear(); window.location.href = 'login.html'; }

function initChart(passengersData, paymentsData) {
  const canvasElem = document.getElementById('revenueChart');
  if (!canvasElem) return;
  const ctx = canvasElem.getContext('2d');
  const totalCollected = paymentsData.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPending = Math.max(0, (passengersData.filter(p => p.status === 'Active').length * 250) - totalCollected);

  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Collected Revenue', 'Pending Payments'],
      datasets: [{ data: [totalCollected, totalPending], backgroundColor: ['#10b981', '#f59e0b'] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}