function openModal(modalId) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById(modalId);
    
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('opacity-0', 'scale-95');
        modal.classList.add('opacity-100', 'scale-100');
    }, 10);
}

function closeAllModals() {
    const overlay = document.getElementById('modalOverlay');
    const modals = ['addStaffModal', 'editStaffModal', 'deleteStaffModal', 'historyModal']; // Added historyModal here
    
    overlay.classList.add('opacity-0');
    modals.forEach(id => {
        const m = document.getElementById(id);
        if(m) {
            m.classList.remove('opacity-100', 'scale-100');
            m.classList.add('opacity-0', 'scale-95');
        }
    });

    setTimeout(() => {
        overlay.classList.add('hidden');
        modals.forEach(id => {
            const m = document.getElementById(id);
            if(m) m.classList.add('hidden');
        });
    }, 300);
}

function closeModal(modalId) {
    closeAllModals();
}

// Password Generator and Visibility Toggle
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function generateRandomPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const passInput = document.getElementById('addPassword');
    const confirmInput = document.getElementById('addConfirmPassword');
    
    if(passInput) passInput.value = password;
    if(confirmInput) confirmInput.value = password;
    
    // Temporarily show the password so the admin can copy it
    if(passInput) passInput.type = 'text';
    if(confirmInput) confirmInput.type = 'text';
    
    // Hide it again after 5 seconds for security
    setTimeout(() => {
        if(passInput) passInput.type = 'password';
        if(confirmInput) confirmInput.type = 'password';
    }, 5000);
}

function initStaffFilters() {
    const searchInput = document.getElementById('staffSearchInput');
    const roleFilter = document.getElementById('staffRoleFilter');
    const statusFilter = document.getElementById('staffStatusFilter');

    if (!searchInput || !roleFilter || !statusFilter) {
        return;
    }

    const runFilter = () => filterStaffRows(searchInput.value, roleFilter.value, statusFilter.value);

    searchInput.addEventListener('input', runFilter);
    roleFilter.addEventListener('change', runFilter);
    statusFilter.addEventListener('change', runFilter);

    runFilter();
}

function filterStaffRows(searchTerm, roleValue, statusValue) {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    const noResultsRow = document.getElementById('staffNoResultsRow');
    const allRows = Array.from(tbody.querySelectorAll('tr')).filter((row) => row.id !== 'staffNoResultsRow');

    const normalizedSearch = (searchTerm || '').trim().toLowerCase();
    const normalizedRole = (roleValue || 'all').toLowerCase();
    const normalizedStatus = (statusValue || 'all').toLowerCase();

    let visibleCount = 0;

    allRows.forEach((row) => {
        const name = row.querySelector('td:nth-child(1) .font-bold.text-white')?.textContent?.trim().toLowerCase() || '';
        const email = row.querySelector('td:nth-child(1) .font-mono')?.textContent?.trim().toLowerCase() || '';
        const role = row.querySelector('td:nth-child(2) .font-bold')?.textContent?.trim().toLowerCase() || '';
        const status = row.querySelector('td:nth-child(3) span')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

        const searchMatch = !normalizedSearch || name.includes(normalizedSearch) || email.includes(normalizedSearch);
        const roleMatch = normalizedRole === 'all' || role === normalizedRole;
        const statusMatch = normalizedStatus === 'all' || status.includes(normalizedStatus);

        const shouldShow = searchMatch && roleMatch && statusMatch;
        row.classList.toggle('hidden', !shouldShow);

        if (shouldShow) {
            visibleCount += 1;
        }
    });

    if (noResultsRow) {
        noResultsRow.classList.toggle('hidden', visibleCount > 0);
    }
}

document.addEventListener('DOMContentLoaded', initStaffFilters);