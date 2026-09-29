// Global variable para sa photo base64
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

  // Siguraduhing tama ang default sa pag-load ng page (Morning: 00:00, Afternoon: 12:00)
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

  // Ipakita ang chat bubble ng User
  const userBubble = document.createElement('div');
  userBubble.className = 'msg-user';
  userBubble.innerHTML = `<span><b>Ikaw:</b> ${message}</span>`;
  chatBox.appendChild(userBubble);

  inputField.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch('http://localhost:3000/api/ai-chat', {
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

// 1. Kapag pinindot ang "Submit Registration" button
function openConfirmModal() {
  const form = document.getElementById('regForm');
  if (form.checkValidity()) {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'flex';
  } else {
    form.reportValidity();
  }
}

// 2. Kapag pinindot ang "No, Review First"
function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.style.display = 'none';
}

// 3. Kapag pinindot ang "Yes, Submit Now!" sa modal
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

  // Pag-format ng Join Date patungong DD-MM-YYYY (e.g. 07-09-2026)
  const rawJoinDate = document.getElementById('joinDate').value;
  let formattedJoinDate = rawJoinDate;

  if (rawJoinDate) {
    if (rawJoinDate.includes('-') && rawJoinDate.indexOf('-') === 4) {
      const parts = rawJoinDate.split('-'); // [YYYY, MM, DD]
      formattedJoinDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (rawJoinDate.includes('/')) {
      formattedJoinDate = rawJoinDate.replace(/\//g, '-');
    }
  }

  const data = {
    name: document.getElementById('name').value.trim(),
    photo: photoBase64,
    mobile: whatsappNumber,
    whatsapp: whatsappNumber,
    pickup: document.getElementById('pickup').value.trim(),
    dropoff: document.getElementById('dropoff').value.trim(),
    schedule: combinedSchedule,
    join_date: formattedJoinDate // Eksaktong DD-MM-YYYY format na ang maipapadala
  };

  try {
    const response = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
      // Itago ang form at ipakita ang success card
      document.getElementById('regForm').style.display = 'none';
      const statusResult = document.getElementById('statusResult');
      statusResult.style.display = 'block';

      // ==========================================
      // AUTOMATIC RESET TIMER (3 SECONDS)
      // ==========================================
      let countdown = 3;
      const timerText = document.getElementById('resetTimerText');
      if (timerText) timerText.textContent = `Returning to form in ${countdown} seconds...`;

      const countdownInterval = setInterval(() => {
        countdown--;
        if (timerText) {
          timerText.textContent = `Returning to form in ${countdown} seconds...`;
        }
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          // I-reset ang buong form at ibalik sa simula nang hindi na nagre-refresh ng browser
          resetRegistrationForm();
        }
      }, 1000);

    } else {
      alert("Error: " + (result.error || result.message));
    }
  } catch (err) {
    alert("Server error. Please ensure node server.js is running.");
  }
}

// Function para ibalik ang form sa malinis at bagong estado
function resetRegistrationForm() {
  const form = document.getElementById('regForm');
  const statusResult = document.getElementById('statusResult');

  // I-reset ang mga inputs ng form
  form.reset();
  form.style.display = 'block';
  statusResult.style.display = 'none';

  // I-balik sa default ang oras pagka-reset (Morning: 00:00, Afternoon: 12:00)
  const pTimeInput = document.getElementById('pickupTime');
  const rTimeInput = document.getElementById('returnTime');
  if (pTimeInput) pTimeInput.value = '00:00';
  if (rTimeInput) rTimeInput.value = '12:00';

  // I-clear ang photo base64 at preview image
  photoBase64 = '';
  const photoPreview = document.getElementById('photoPreview');
  if (photoPreview) {
    photoPreview.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' fill='%2394a3b8'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10'>No Photo</text></svg>";
  }

  // Alisin ang selected state sa mga araw (days buttons)
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
}