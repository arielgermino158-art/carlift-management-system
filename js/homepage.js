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
});

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

// 3. Loading Micro-interaction & Toast Notification Feedback
function verifyAdmin(event) {
    event.preventDefault();
    const input = document.getElementById('companyInput');
    const companyName = input ? input.value.trim() : "";
    
    if (companyName !== "") {
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const btnSpinner = document.getElementById('btnSpinner');
        
        // I-activate ang loading state ng button
        submitBtn.disabled = true;
        btnText.textContent = "Verifying...";
        btnSpinner.classList.remove('hidden');

        // Kunwari ay may konting delay para sa server response (UX Loading State)
        setTimeout(() => {
            const adminModal = document.getElementById('adminModal');
            if (adminModal) adminModal.classList.add('hidden');

            // Ipakita ang Toast Notification
            showToast();

            // I-redirect matapos ang toast
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1200);
        }, 800);
    }
}

// 4. Toast Notification Trigger Logic
function showToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('translate-y-24', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    }
}

// 5. Backdrop Click para mag-close automatic ang Modal
window.addEventListener('click', (event) => {
    const adminModal = document.getElementById('adminModal');
    if (event.target === adminModal) {
        closeAdminModal();
    }
});