// Force scroll to top on page refresh or load
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
});

document.addEventListener('DOMContentLoaded', () => {
    // I-force ang pagpunta sa taas pagka-load ng DOM
    window.scrollTo(0, 0);

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const navbar = document.getElementById('navbar');

    // 1. Smart Sticky Header & Shadow Transition
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('glass-panel', 'border-slate-800', 'shadow-lg');
            navbar.classList.remove('bg-transparent', 'border-transparent');
        } else {
            navbar.classList.remove('glass-panel', 'border-slate-800', 'shadow-lg');
            navbar.classList.add('bg-transparent', 'border-transparent');
        }
    });

    // 2. Mobile Burger Menu Toggle & Auto-close on click
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });

        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });
    }

    // 3. Fetch Real-time Passenger Count para sa Today's Bookings
    fetchTotalBookingsCount();
});

// Function para kunin ang kabuuang bilang ng mga pasahero mula sa backend API
async function fetchTotalBookingsCount() {
    try {
        const response = await fetch('/api/reports/summary');
        const data = await response.json();
        
        const bookingsCounter = document.getElementById('totalBookingsCount');
        if (bookingsCounter) {
            let totalCount = 0;
            if (data && data.passengers && Array.isArray(data.passengers)) {
                totalCount = data.passengers.length;
            } else if (data && typeof data.count !== 'undefined') {
                totalCount = data.count;
            } else {
                totalCount = 1429; // Fallback kung sakaling walang mahanap
            }
            bookingsCounter.innerText = totalCount.toLocaleString();
        }
    } catch (err) {
        console.warn("Hindi nakuha ang dynamic count, ginagamit ang default.", err);
        const bookingsCounter = document.getElementById('totalBookingsCount');
        if (bookingsCounter) {
            bookingsCounter.innerText = "1,429";
        }
    }
}

function openAdminModal() {
    const adminModal = document.getElementById('adminModal');
    if (adminModal) {
        adminModal.classList.remove('hidden');
        setTimeout(() => {
            const input = document.getElementById('companyInput');
            if (input) input.focus();
        }, 100);
    }
}

function closeAdminModal() {
    const adminModal = document.getElementById('adminModal');
    const input = document.getElementById('companyInput');
     
    if (adminModal) adminModal.classList.add('hidden');
    if (input) input.value = '';
}

// 4. Loading Micro-interaction & Toast Notification Feedback
function verifyAdmin(event) {
    event.preventDefault();
    const input = document.getElementById('companyInput');
    const companyName = input ? input.value.trim().toLowerCase() : "";
     
    const validNames = ["ms sajjad khan", "ms carlift", "sajjad khan", "sajjad"];

    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
     
    if (validNames.some(name => companyName.includes(name))) {
        const adminModal = document.getElementById('adminModal');
        if (adminModal) adminModal.classList.add('hidden');

        submitBtn.disabled = true;
        btnText.textContent = "Verifying...";
        btnSpinner.classList.remove('hidden');

        setTimeout(() => {
            showToast();

            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1200);
        }, 800);
    } else {
        alert("Incorrect company name. Please enter the authorized company name to proceed.");
        if (input) input.focus();
    }
}

// 5. Toast Notification Trigger Logic
function showToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        toast.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');
    }
}

// 6. Backdrop Click para mag-close automatic ang Modal
window.addEventListener('click', (event) => {
    const adminModal = document.getElementById('adminModal');
    if (event.target === adminModal) {
        closeAdminModal();
    }
});