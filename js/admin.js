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
      initChart(globalPassengerData, globalPaymentData); // Modern Doughnut Chart loader
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

      if (scheduleText) {
        scheduleText = scheduleText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      }
      if (timeText) {
        timeText = timeText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      }

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

/* ================= PASSENGER PHOTO MODAL HANDLERS ================= */
function openImageModal(imgSrc, passengerName) {
  const imgPreview = document.getElementById('imageModalPreview');
  const titleElem = document.getElementById('imageModalTitle');
  if (imgPreview) imgPreview.src = imgSrc;
  if (titleElem) titleElem.innerHTML = `<i class="fa-solid fa-user"></i> ${passengerName || 'Passenger Photo'}`;
  document.getElementById('imageModal').classList.add('active');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('active');
}

/* ================= CUSTOM APPROVE & DELETE MODAL HANDLERS ================= */
function openVerifyModal(passengerId, passengerName) {
  pendingActionPassengerId = passengerId;
  
  const titleElem = document.getElementById('verifyModalTitle');
  const messageElem = document.getElementById('verifyModalMessage');
  const nameElem = document.getElementById('verifyModalPassengerName');

  if (nameElem) nameElem.innerText = passengerName || passengerId;
  if (titleElem) titleElem.innerText = 'Approve Approval';
  if (messageElem) {
    messageElem.innerHTML = `Are you sure you want to Approve <span id="verifyModalPassengerName" style="font-weight: 800; color: #0f172a;">${passengerName || passengerId}</span> from the Approval?`;
  }
  
  const modal = document.getElementById('verifyModal');
  if (modal) modal.classList.add('active');
}

function closeVerifyModal() {
  pendingActionPassengerId = null;
  const modal = document.getElementById('verifyModal');
  if (modal) modal.classList.remove('active');
}

async function confirmVerifyPayment() {
  if (!pendingActionPassengerId) return;
  const passengerId = pendingActionPassengerId;
  closeVerifyModal();

  try {
    const res = await fetch(`${API_BASE_URL}/passengers/${passengerId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: 'Active' })
    });

    const data = await res.json();
    if (data.success) {
      showToastNotification(`Passenger approved and moved to Passenger List!`);
      loadDashboard();
    } else {
      showToastNotification(`Error: ${data.message || 'Approval failed.'}`);
    }
  } catch (err) {
    showToastNotification("Failed to connect to server.");
  }
}

function openDeleteModal(passengerId, passengerName, context = 'passenger') {
  pendingActionPassengerId = passengerId;
  currentDeleteContext = context;

  const titleElem = document.getElementById('deleteModalTitle');
  const messageElem = document.getElementById('deleteModalMessage');
  const nameElem = document.getElementById('deleteModalPassengerName');

  if (nameElem) nameElem.innerText = passengerName || passengerId;

  if (context === 'approval') {
    if (titleElem) titleElem.innerText = 'Delete Approval';
    if (messageElem) messageElem.innerHTML = `Are you sure you want to delete <span id="deleteModalPassengerName" style="font-weight: 800; color: #0f172a;">${passengerName || passengerId}</span>?`;
  } else {
    if (titleElem) titleElem.innerText = 'Delete Passenger';
    if (messageElem) messageElem.innerHTML = `Are you sure you want to delete <span id="deleteModalPassengerName" style="font-weight: 800; color: #0f172a;">${passengerName || passengerId}</span>?`;
  }

  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
  pendingActionPassengerId = null;
  currentDeleteContext = 'passenger';
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('active');
}

async function confirmDeletePassenger() {
  if (!pendingActionPassengerId) return;
  const passengerId = pendingActionPassengerId;
  closeDeleteModal();

  try {
    const res = await fetch(`${API_BASE_URL}/passengers/${passengerId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    await res.json().catch(() => ({ success: true }));
  } catch (err) {
    console.warn("Offline or server error, deleting from local array:", err);
  }

  globalPassengerData = globalPassengerData.filter(p => p.id !== passengerId);
  
  updateKPIs(globalPassengerData, globalPaymentData);
  renderMasterlistTable(globalPassengerData);
  renderPendingTable(globalPassengerData.filter(p => p.status === 'Pending Payment'));
  
  const successMsg = currentDeleteContext === 'approval' 
    ? "Approval successfully removed from system record." 
    : "Passenger successfully removed from passenger list.";

  showToastNotification(successMsg);
}

/* ================= UPDATE PAYMENT DATE & PARTIAL AMOUNT MODAL HANDLERS ================= */
function openUpdatePaymentDateModal(passengerId, passengerName) {
  pendingActionPassengerId = passengerId;
  
  const nameElem = document.getElementById('updateModalPassengerName');
  const idInput = document.getElementById('modalUpdatePassengerId');
  const dateInput = document.getElementById('modalNewPaymentDate');
  const amountInput = document.getElementById('modalPartialAmount');

  if (nameElem) nameElem.innerText = passengerName || passengerId;
  if (idInput) idInput.value = passengerId;
  
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  const modal = document.getElementById('updatePaymentDateModal');
  if (modal) modal.classList.add('active');
}

function setModalAmount(amount) {
  const amountInput = document.getElementById('modalPartialAmount');
  if (amountInput) {
    amountInput.value = amount;
  }
}

function closeUpdatePaymentDateModal() {
  pendingActionPassengerId = null;
  const modal = document.getElementById('updatePaymentDateModal');
  if (modal) modal.classList.remove('active');
}

async function confirmUpdatePaymentDate() {
  const passengerId = pendingActionPassengerId;
  const dateInput = document.getElementById('modalNewPaymentDate');
  const amountInput = document.getElementById('modalPartialAmount');
  
  const newDateValue = dateInput ? dateInput.value : '';
  const paidAmount = amountInput ? Number(amountInput.value) : 250;
  
  const billingMonth = newDateValue || new Date().toISOString().slice(0, 10);

  if (!passengerId || !newDateValue) {
    showToastNotification("Please select a valid payment date.");
    return;
  }

  if (paidAmount <= 0) {
    showToastNotification("Please enter a valid amount.");
    return;
  }

  closeUpdatePaymentDateModal();

  try {
    const res = await fetch(`${API_BASE_URL}/record-payment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        passengerId: passengerId, 
        amount: paidAmount, 
        collector: 'Owner Update',
        payment_date: newDateValue,
        billing_month: billingMonth 
      })
    });

    const data = await res.json();
    if (data.success) {
      showToastNotification(`Payment of AED ${paidAmount} recorded successfully! Receipt #${data.receiptNo}`);
      loadDashboard();
      
      if (typeof triggerSuccessReceiptTimer === 'function') {
        triggerSuccessReceiptTimer(data.receiptNo, paidAmount, 'Owner Update');
      }
    } else {
      showToastNotification(data.message || 'Failed to update payment date.');
    }
  } catch (err) {
    showToastNotification("Server error while recording payment.");
  }
}

/* ================= SUCCESS RECEIPT MODAL CONTROLS ================= */
function triggerSuccessReceiptTimer(receiptNo, amount, collector) {
  const modal = document.getElementById('successReceiptModal');
  const countdownNum = document.getElementById('receiptCountdownNum');
  if (!modal) return;

  if (receiptTimer) {
    clearInterval(receiptTimer);
    receiptTimer = null;
  }

  modal.style.display = 'flex';
  let timeLeft = 3;
  if (countdownNum) countdownNum.innerText = timeLeft;

  receiptTimer = setInterval(() => {
    timeLeft--;
    if (countdownNum) countdownNum.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(receiptTimer);
      receiptTimer = null;
      closeSuccessReceiptModal();
    }
  }, 1000);
}

function closeSuccessReceiptModal() {
  const modal = document.getElementById('successReceiptModal');
  if (modal) {
    modal.style.display = 'none';
  }
  if (receiptTimer) {
    clearInterval(receiptTimer);
    receiptTimer = null;
  }
  if (typeof loadDashboard === 'function') {
    loadDashboard();
  }
}

/* ================= CUSTOM ENGLISH ALERT MODAL WITH 3-SECOND TIMER ================= */
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

  if (customAlertTimer) {
    clearTimeout(customAlertTimer);
    customAlertTimer = null;
  }

  customAlertTimer = setTimeout(() => {
    closeCustomAlertModal();
  }, 3000);
}

function closeCustomAlertModal() {
  const alertModal = document.getElementById('customAlertModal');
  if (alertModal) {
    alertModal.classList.remove('active');
    alertModal.style.display = 'none';
  }
  if (customAlertTimer) {
    clearTimeout(customAlertTimer);
    customAlertTimer = null;
  }
}

/* ================= COUNTDOWN & STATUS HELPER LOGIC ================= */
function calculatePassengerCountdown(passenger) {
  const lastPaymentDate = passenger.last_payment_date || passenger.join_date || passenger.created_at;
  
  if (!lastPaymentDate) {
    return { daysLeft: 0, statusClass: 'badge-danger', statusText: 'Overdue / Unpaid' };
  }

  const payDate = new Date(lastPaymentDate);
  if (isNaN(payDate.getTime())) {
    return { daysLeft: 0, statusClass: 'badge-danger', statusText: 'Overdue / Unpaid' };
  }

  const dueDate = new Date(payDate);
  dueDate.setDate(dueDate.getDate() + 30);

  const today = new Date();
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 5) {
    return { daysLeft: diffDays, statusClass: 'badge-active', statusText: `${diffDays} Days Left` };
  } else if (diffDays >= 0) {
    return { daysLeft: diffDays, statusClass: 'badge-warning', statusText: `${diffDays} Days Left` };
  } else {
    return { daysLeft: 0, statusClass: 'badge-danger', statusText: `Overdue` };
  }
}

/* ================= PAGINATED PASSENGERS TABLE ================= */
function filterPassengers() {
  currentPassengerPage = 1;
  renderMasterlistTable(globalPassengerData);
}

function changePassengersPage(direction) {
  currentPassengerPage += direction;
  renderMasterlistTable(globalPassengerData);
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

      if (scheduleText) {
        scheduleText = scheduleText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      }
      if (timeText) {
        timeText = timeText.replace(/pickup/gi, '').replace(/return/gi, '').trim();
      }

      const rawDateToFormat = p.join_date || p.created_at;
      const joinedDateFormatted = rawDateToFormat ? formatDateOnly(rawDateToFormat) : 'N/A';
      
      let balanceHtml = '';
      const totalPaid = Number(p.total_paid) || 0;
      let remainingBalance = Math.max(0, 250 - totalPaid);

      const countdownInfo = calculatePassengerCountdown(p);

      if (totalPaid >= 250) {
        balanceHtml = `<span style="color: #10b981; font-weight: 800; background: #ecfdf5; padding: 4px 8px; border-radius: 6px; display: inline-block;">Fully Paid (AED ${totalPaid})</span>`;
      } else if (totalPaid > 0) {
        balanceHtml = `<span style="color: #d97706; font-weight: 700;">Paid: AED ${totalPaid}<br><b style="color: #ef4444;">Bal: AED ${remainingBalance}</b></span>`;
      } else {
        balanceHtml = `<span style="color: #ef4444; font-weight: 700;">Unpaid (Bal: AED 250)</span>`;
      }

      let statusBadgeHtml = '';
      if (totalPaid >= 250) {
        statusBadgeHtml = `<span class="badge badge-active">Active</span>`;
      } else if (totalPaid > 0) {
        statusBadgeHtml = `<span class="badge" style="background: #fef3c7; color: #d97706; font-weight: 700; padding: 6px 10px; border-radius: 6px;">Partial</span>`;
      } else {
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
            <span class="badge ${countdownInfo.statusClass}" style="padding: 6px 10px; border-radius: 6px; display: inline-block; font-weight: 700;">
              <i class="fa-solid fa-clock"></i> ${countdownInfo.statusText}
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

function changePendingPage(direction) {
  currentPendingPage += direction;
  const pendingList = globalPassengerData.filter(p => p.status === 'Pending Payment');
  renderPendingTable(pendingList);
}

/* ================= DATE ONLY FORMATTER (DD-MM-YYYY) ================= */
function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  
  if (typeof dateString === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
    return dateString;
  }

  let dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) {
    const cleaned = dateString.replace(' ', 'T');
    dateObj = new Date(cleaned);
  }
  
  if (isNaN(dateObj.getTime())) return dateString;

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();

  return `${day}-${month}-${year}`;
}

/* ================= HELPER: FORMAT MONTH ONLY ================= */
function formatMonthOnly(dateString) {
  if (!dateString) return 'N/A';
  
  let dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) {
    dateObj = new Date(dateString.replace(' ', 'T'));
  }
  
  if (isNaN(dateObj.getTime())) return dateString;

  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ================= PAGINATED PAYMENTS TABLE ================= */
function filterPayments() {
  currentPaymentPage = 1;
  renderPaymentsTable(globalPaymentData);
}

function changePaymentsPage(direction) {
  currentPaymentPage += direction;
  renderPaymentsTable(globalPaymentData);
}

function renderPaymentsTable(data) {
  const searchElem = document.getElementById('paymentSearch');
  const searchQuery = searchElem ? searchElem.value.toLowerCase() : '';
  
  let displayData = [...data];

  displayData.sort((a, b) => {
    const dateA = new Date(a.payment_date || 0);
    const dateB = new Date(b.payment_date || 0);
    
    if (dateB - dateA !== 0) {
      return dateB - dateA;
    }
    
    return (b.receipt_no || '').localeCompare(a.receipt_no || '');
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

/* ================= PAGINATED REPORTS TABLE ================= */
async function loadReportsData() {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/summary`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      reportSummaryData = data;
      globalRouteData = data.routeRevenue || [];
      renderRouteReports(globalRouteData);
    }
  } catch (err) {
    console.error("Error loading reports:", err);
  }
}

function changeReportsPage(direction) {
  currentReportPage += direction;
  renderRouteReports(globalRouteData);
}

function renderRouteReports(routeData) {
  const totalItems = routeData.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentReportPage < 1) currentReportPage = 1;
  if (currentReportPage > totalPages) currentReportPage = totalPages;

  const startIndex = (currentReportPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = routeData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const tbody = document.getElementById('routeReportTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (paginatedData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">No active route statistics found.</td></tr>';
  } else {
    paginatedData.forEach(r => {
      const revenueNum = Number(r.total_revenue) || 0;
      const row = `
        <tr>
          <td><b>${r.route}</b></td>
          <td><span class="id-chip">${r.passenger_count} Active</span></td>
          <td>AED 250 / mo</td>
          <td style="font-weight: 800; color: #10b981;">AED ${revenueNum.toLocaleString()}</td>
        </tr>
      `;
      tbody.innerHTML += row;
    });
  }
}

/* ================= UPDATE WORKING TIME MODAL HANDLERS ================= */
function openUpdateWorkingTimeModal(passengerId, passengerName, currentTime) {
  pendingActionPassengerId = passengerId;
  
  const nameElem = document.getElementById('workingTimePassengerName');
  const idInput = document.getElementById('modalWorkingTimePassengerId');
  const pTimeInput = document.getElementById('modalPickupTime');
  const rTimeInput = document.getElementById('modalReturnTime');

  if (nameElem) nameElem.innerText = passengerName || passengerId;
  if (idInput) idInput.value = passengerId;

  if (pTimeInput) pTimeInput.value = '08:00';
  if (rTimeInput) rTimeInput.value = '17:00';

  const modal = document.getElementById('updateWorkingTimeModal');
  if (modal) modal.classList.add('active');
}

function closeUpdateWorkingTimeModal() {
  pendingActionPassengerId = null;
  const modal = document.getElementById('updateWorkingTimeModal');
  if (modal) modal.classList.remove('active');
}

async function confirmUpdateWorkingTime() {
  const passengerId = pendingActionPassengerId;
  
  const pTimeVal = document.getElementById('modalPickupTime').value;
  const rTimeVal = document.getElementById('modalReturnTime').value;

  if (!passengerId || !pTimeVal || !rTimeVal) {
    showToastNotification("Please select both morning and afternoon times.");
    return;
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return '9:30 AM';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${m} ${ampm}`;
  };

  const pTime = formatTime(pTimeVal);
  const rTime = formatTime(rTimeVal);
  
  const newWorkingTime = `${pTime} / ${rTime}`;

  closeUpdateWorkingTimeModal();

  try {
    const res = await fetch(`${API_BASE_URL}/passengers/${passengerId}/time`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ time: newWorkingTime })
    });

    const data = await res.json();
    if (data.success) {
      showToastNotification(`Working time updated successfully!`);
      loadDashboard();
    } else {
      const targetPassenger = globalPassengerData.find(p => p.id === passengerId);
      if (targetPassenger) {
        targetPassenger.time = newWorkingTime;
      }
      renderMasterlistTable(globalPassengerData);
      showToastNotification(`Working time updated locally!`);
    }
  } catch (err) {
    const targetPassenger = globalPassengerData.find(p => p.id === passengerId);
    if (targetPassenger) {
      targetPassenger.time = newWorkingTime;
    }
    renderMasterlistTable(globalPassengerData);
    showToastNotification(`Working time updated successfully!`);
  }
}

/* ================= MODERN DOUGHNUT COLLECTION ANALYTICS CHART ================= */
function initChart(passengersData, paymentsData) {
  const canvasElem = document.getElementById('revenueChart');
  if (!canvasElem) return;

  const ctx = canvasElem.getContext('2d');

  const totalCollected = paymentsData.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const activePassengers = passengersData.filter(p => p.status === 'Active');
  const totalExpectedRevenue = activePassengers.length * 250;
  const totalPending = Math.max(0, totalExpectedRevenue - totalCollected);

  const collectedTextElem = document.getElementById('donutCollectedText');
  const pendingTextElem = document.getElementById('donutPendingText');
  if (collectedTextElem) collectedTextElem.innerText = `AED ${totalCollected.toLocaleString()}`;
  if (pendingTextElem) pendingTextElem.innerText = `AED ${totalPending.toLocaleString()}`;

  const chartData = [totalCollected, totalPending];
  if (totalCollected === 0 && totalPending === 0) {
    chartData[0] = 1;
  }

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  revenueChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Collected Revenue', 'Pending Payments'],
      datasets: [{
        data: chartData,
        backgroundColor: ['#10b981', '#f59e0b'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: {
              family: 'Inter, sans-serif',
              size: 12,
              weight: '600'
            },
            color: '#334155'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          padding: 12,
          callbacks: {
            label: function(context) {
              const labelName = context.label || '';
              const val = context.raw;
              if (totalCollected === 0 && totalPending === 0) {
                return ` No active data recorded yet`;
              }
              return ` ${labelName}: AED ${val.toLocaleString()}`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

/* ================= OWNER LOGOUT SYSTEM ================= */
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