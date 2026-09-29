// Global variable para sa alert timer para hindi magka-conflict kung sunud-sunod ang error
let alertTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const recoveryForm = document.getElementById('recoveryForm');

  // 1. Standard Login Handler
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const btnSubmit = loginForm.querySelector('.btn-submit') || document.getElementById('btnSubmit');
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      hideAlert();
      setLoading(btnSubmit, true, 'Signing in...');

      try {
        const response = await fetch('http://localhost:3000/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // I-save ang eksaktong token key na hinahanap ng admin.js
          localStorage.setItem('carlift_admin_token', result.token);
          window.location.href = 'admin.html';
        } else {
          // Kapag nagkamali, magpapakita ng error tapos KUSAng buburahin ang mga tinype mo pagkalipas ng 3 segundo
          showAlert(result.message || 'Invalid Admin Credentials', 'error', true);
        }
      } catch (err) {
        showAlert('Server error. Make sure node server.js is running on port 3000.', 'error', true);
      } finally {
        setLoading(btnSubmit, false, 'Sign In to Dashboard');
      }
    });
  }

  // 2. Recovery & Reset Password Handler
  if (recoveryForm) {
    recoveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('recUsername').value.trim();
      const recoveryPin = document.getElementById('recoveryPin').value.trim();
      const newPassword = document.getElementById('newPassword').value;
      const btnResetSubmit = document.getElementById('btnResetSubmit');

      hideAlert();
      setLoading(btnResetSubmit, true, 'Resetting...');

      try {
        const res = await fetch('http://localhost:3000/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, pin: recoveryPin, newPassword })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          showAlert("Password reset successful! Logging in...", 'success', false);
          if (data.token) {
            localStorage.setItem('carlift_admin_token', data.token);
          }
          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 1500);
        } else {
          showAlert(data.message || "Invalid Recovery PIN or Username", 'error', true);
        }
      } catch (err) {
        showAlert("Server connection failed. Please check backend.", 'error', true);
      } finally {
        setLoading(btnResetSubmit, false, 'Reset Password & Login');
      }
    });
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Reusable Toggle Function para sa Username, Password, at PIN visibility
function toggleVisibility(inputId, iconId) {
  const inputField = document.getElementById(inputId);
  const eyeIcon = document.getElementById(iconId);

  if (inputField && eyeIcon) {
    if (inputField.type === 'password') {
      inputField.type = 'text';
      eyeIcon.classList.remove('fa-eye');
      eyeIcon.classList.add('fa-eye-slash');
    } else {
      inputField.type = 'password';
      eyeIcon.classList.remove('fa-eye-slash');
      eyeIcon.classList.add('fa-eye');
    }
  }
}

// Switch View Modes (Login vs Recovery Form)
function switchMode(mode) {
  const loginForm = document.getElementById('loginForm');
  const recoveryForm = document.getElementById('recoveryForm');

  hideAlert();

  if (mode === 'recovery') {
    if (loginForm) loginForm.classList.add('hidden');
    if (recoveryForm) recoveryForm.classList.remove('hidden');
  } else {
    if (recoveryForm) recoveryForm.classList.add('hidden');
    if (loginForm) loginForm.classList.remove('hidden');
  }
}

// Magpakita ng Alert Box na may 3-second auto-hide timer at optional clearing ng inputs
function showAlert(message, type = 'error', shouldClearFields = false) {
  const alertBox = document.getElementById('alertBox');
  if (!alertBox) return;

  alertBox.innerText = message;
  alertBox.className = `alert-msg ${type}`;
  alertBox.style.display = 'block';

  // I-clear ang lumang timer para hindi mag-overlap
  if (alertTimer) clearTimeout(alertTimer);

  // Automatic mawawala ang alert box pagkatapos ng 3 seconds
  alertTimer = setTimeout(() => {
    alertBox.style.display = 'none';

    // Kung kailangan i-clear ang mga tinype (kapag nagkamali sa login)
    if (shouldClearFields) {
      const loginForm = document.getElementById('loginForm');
      const recoveryForm = document.getElementById('recoveryForm');
      
      if (loginForm && !loginForm.classList.contains('hidden')) {
        loginForm.reset();
      }
      if (recoveryForm && !recoveryForm.classList.contains('hidden')) {
        recoveryForm.reset();
      }
    }
  }, 3000);
}

// Itago ang Alert Box agad
function hideAlert() {
  const alertBox = document.getElementById('alertBox');
  if (alertBox) alertBox.style.display = 'none';
  if (alertTimer) clearTimeout(alertTimer);
}

// Button Loading State Helper
function setLoading(buttonElement, isLoading, defaultText) {
  if (!buttonElement) return;
  
  if (isLoading) {
    buttonElement.disabled = true;
    buttonElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${defaultText}`;
  } else {
    buttonElement.disabled = false;
    buttonElement.innerHTML = defaultText;
  }
}