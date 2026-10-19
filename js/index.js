let photoBase64 = '';

document.addEventListener('DOMContentLoaded', () => {
  // Toggle Day Buttons Selection
  const dayBtns = document.querySelectorAll('.day-btn');
  dayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
    });
  });

  // Instant Photo Preview
  const photoInput = document.getElementById('photoInput');
  if (photoInput) {
    photoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          photoBase64 = evt.target.result;
          document.getElementById('photoPreview').src = photoBase64;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const pTimeInput = document.getElementById('pickupTime');
  const rTimeInput = document.getElementById('returnTime');
  if (pTimeInput && !pTimeInput.value) pTimeInput.value = '00:00';
  if (rTimeInput && !rTimeInput.value) rTimeInput.value = '12:00';
});

// ==========================================
// TOGGLE FLOATING AI ROBOT CHAT WINDOW
// ==========================================
function toggleAIChat() {
  const chatWindow = document.getElementById('aiChatWindow');
  if (chatWindow) {
    if (chatWindow.style.display === 'none' || chatWindow.style.display === '') {
      chatWindow.style.display = 'flex';
      const inputField = document.getElementById('user-input');
      if (inputField) inputField.focus();
    } else {
      chatWindow.style.display = 'none';
    }
  }
}

// ==========================================
// AI ROBOT CHATBOT FUNCTIONALITY
// ==========================================
async function sendChatMessage() {
  const inputField = document.getElementById('user-input');
  const chatBox = document.getElementById('chat-box');

  if (!inputField || !chatBox) return;

  const message = inputField.value.trim();
  if (!message) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'msg-user';
  userBubble.innerHTML = `<span><b>Ikaw:</b> ${message}</span>`;
  chatBox.appendChild(userBubble);

  inputField.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });

    const data = await response.json();
    const aiBubble = document.createElement('div');
    aiBubble.className = 'msg-ai';

    if (data.success) {
      aiBubble.innerHTML = `<span><b>AI Robot:</b> ${data.reply}</span>`;
    } else {
      aiBubble.innerHTML = `<span style="background:#fee2e2; color:#991b1b;"><b>System:</b> May problema sa pag-proseso ng AI.</span>`;
    }

    chatBox.appendChild(aiBubble);
  } catch (error) {
    console.error('Chat Error:', error);
    const errorBubble = document.createElement('div');
    errorBubble.className = 'msg-ai';
    errorBubble.innerHTML = `<span style="background:#fee2e2; color:#991b1b;"><b>System:</b> Hindi makakonekta sa server.</span>`;
    chatBox.appendChild(errorBubble);
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// YES / NO MODAL & SUBMISSION HANDLERS
// ==========================================
function openConfirmModal() {
  const form = document.getElementById('regForm');
  if (form.checkValidity()) {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'flex';
  } else {
    form.reportValidity();
  }
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.style.display = 'none';
}

// QR Code Modal Handlers (Manual Close)
function openQrModal() {
  const qrModal = document.getElementById('qrModal');
  if (qrModal) qrModal.style.display = 'flex';
}

function closeQrModal() {
  const qrModal = document.getElementById('qrModal');
  if (qrModal) qrModal.style.display = 'none';
}

// ==========================================
// PROCEED REGISTRATION & GENERATE QR CODE
// ==========================================
async function proceedRegistration() {
  closeConfirmModal();

  const selectedDays = Array.from(document.querySelectorAll('.day-btn.selected')).map(btn => btn.dataset.day);
  if (selectedDays.length === 0) {
    alert("Please select at least one working day (Mon, Tue, Wed, etc.).");
    return;
  }

  const whatsappInput = document.getElementById('whatsapp').value.trim();
  if (whatsappInput.length !== 9) {
    alert("Please enter a valid 9-digit UAE phone number (e.g. 501234567).");
    return;
  }

  if (!photoBase64) {
    alert("Please upload a 2x2 ID picture.");
    return;
  }

  const nameVal = document.getElementById('name').value.trim();
  const whatsappNumber = '+971 ' + whatsappInput;

  const formatTime = (timeStr) => {
    if (!timeStr) return '00:00';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${m} ${ampm}`;
  };

  const pTime = formatTime(document.getElementById('pickupTime').value);
  const rTime = formatTime(document.getElementById('returnTime').value);
  const combinedSchedule = `${selectedDays.join(', ')} | ${pTime} Pickup / ${rTime} Return`;

  const rawJoinDate = document.getElementById('joinDate').value;
  let formattedJoinDate = rawJoinDate;
  if (rawJoinDate) {
    if (rawJoinDate.includes('-') && rawJoinDate.indexOf('-') === 4) {
      const parts = rawJoinDate.split('-');
      formattedJoinDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (rawJoinDate.includes('/')) {
      formattedJoinDate = rawJoinDate.replace(/\//g, '-');
    }
  }

  const data = {
    name: nameVal,
    photo: photoBase64,
    mobile: whatsappNumber,
    whatsapp: whatsappNumber,
    pickup: document.getElementById('pickup').value.trim(),
    dropoff: document.getElementById('dropoff').value.trim(),
    schedule: combinedSchedule,
    join_date: formattedJoinDate
  };

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
      // Itago ang form at ipakita ang status card
      document.getElementById('regForm').style.display = 'none';
      const statusResult = document.getElementById('statusResult');
      statusResult.style.display = 'block';

      // ==========================================
      // GENERATE DYNAMIC QR CODE FOR THIS USER (JSON format na may Passenger ID)
      // ==========================================
      const qrContainer = document.getElementById('qrcode');
      qrContainer.innerHTML = ""; 

      const passengerId = result.passengerId || result.id || nameVal;
      const qrPayload = JSON.stringify({ id: passengerId, name: nameVal, phone: whatsappNumber });
      
      new QRCode(qrContainer, {
        text: qrPayload,
        width: 160,
        height: 160,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });

      document.getElementById('qrDetailsText').textContent = `${nameVal} (${whatsappNumber}) - ID: ${passengerId}`;

      // Buksan ang QR modal at MANATILI ITO hanggang pindutin ang "I-close ang QR" button
      openQrModal();

    } else {
      alert("Error: " + (result.error || result.message));
    }
  } catch (err) {
    alert("Server error. Please ensure node server.js is running.");
  }
}

function resetRegistrationForm() {
  const form = document.getElementById('regForm');
  const statusResult = document.getElementById('statusResult');

  form.reset();
  form.style.display = 'block';
  statusResult.style.display = 'none';

  const pTimeInput = document.getElementById('pickupTime');
  const rTimeInput = document.getElementById('returnTime');
  if (pTimeInput) pTimeInput.value = '00:00';
  if (rTimeInput) rTimeInput.value = '12:00';

  photoBase64 = '';
  const photoPreview = document.getElementById('photoPreview');
  if (photoPreview) {
    photoPreview.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
  }

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
}