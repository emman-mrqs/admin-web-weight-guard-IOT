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
    const modals = ['addStaffModal', 'editStaffModal', 'deleteStaffModal', 'historyModal', 'verificationModal', 'suspensionDetailsViewModal', 'liftSuspensionModal'];
    
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

document.addEventListener('DOMContentLoaded', () => {
    initStaffFilters();
    setupVerificationCodeInputs();
});

// ===== Verification Code Functions =====
function setupVerificationCodeInputs() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    
    inputs.forEach((id, index) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', (e) => {
            if (e.target.value.length > 0 && index < inputs.length - 1) {
                document.getElementById(inputs[index + 1]).focus();
            }
            if (allInputsFilled()) {
                document.getElementById(inputs[5]).blur();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                document.getElementById(inputs[index - 1]).focus();
            }
        });

        input.addEventListener('keypress', (e) => {
            if (!/[0-9]/.test(e.key)) {
                e.preventDefault();
            }
        });
    });
}

function allInputsFilled() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    return inputs.every(id => document.getElementById(id).value !== '');
}

function getVerificationCode() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    return inputs.map(id => document.getElementById(id).value).join('');
}

function resetVerificationCode() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    const errorEl = document.getElementById('verificationError');
    const successEl = document.getElementById('verificationSuccess');
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
}

function submitVerificationCode() {
    const code = getVerificationCode();
    const errorEl = document.getElementById('verificationError');
    const successEl = document.getElementById('verificationSuccess');

    if (!errorEl || !successEl) return;

    errorEl.textContent = '';
    successEl.textContent = '';
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (code.length !== 6) {
        errorEl.textContent = 'Please enter all 6 digits';
        errorEl.classList.remove('hidden');
        return;
    }

    if (/^\d{6}$/.test(code)) {
        successEl.textContent = 'Account verified successfully!';
        successEl.classList.remove('hidden');
        
        // Create staff record from tempStaffData if available
        if (window.tempStaffData) {
            const newStaff = {
                id: Math.max(...staticStaff.map(s => s.id), 0) + 1,
                first_name: window.tempStaffData.firstName,
                last_name: window.tempStaffData.lastName,
                email: window.tempStaffData.email,
                role: window.tempStaffData.role,
                status: 'active',
                joining_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                phone: '',
                location: 'Headquarters'
            };

            staticStaff.push(newStaff);
            window.tempStaffData = null;
        }
        
        // Case 2: Verify existing staff member by email
        if (window.currentVerifyingStaffEmail) {
            // Update the staff member's verification status (in a real system, this would be a database update)
            // For now, we'll just show success - in a real implementation, you'd mark this in the table
            window.currentVerifyingStaffEmail = null;
        }

        setTimeout(() => {
            closeAllModals();
            resetVerificationCode();
            const form = document.getElementById('addStaffForm');
            if (form) form.reset();
            // Reload staff list if needed (would call loadStaff() and renderSummaryStats())
        }, 1000);
    } else {
        errorEl.textContent = 'Invalid verification code';
        errorEl.classList.remove('hidden');
    }
}

// ===== Staff Verification Functions =====
function openVerificationForStaff(staffEmail) {
    // Show verification email
    const verificationEmail = document.getElementById('verificationEmail');
    if (verificationEmail) {
        verificationEmail.textContent = staffEmail;
    }

    // Store the current staff email being verified
    window.currentVerifyingStaffEmail = staffEmail;

    // Reset and setup verification modal
    resetVerificationCode();
    setupVerificationCodeInputs();

    // Open verification modal
    openModal('verificationModal');
    setTimeout(() => document.getElementById('verifyDigit1').focus(), 300);
}

function handleAddStaffSubmit() {
    const form = document.getElementById('addStaffForm');
    if (!form) return;

    const firstName = form.querySelector('input[name="firstName"]').value.trim();
    const lastName = form.querySelector('input[name="lastName"]').value.trim();
    const email = form.querySelector('input[name="email"]').value.trim();
    const role = form.querySelector('select').value;
    const password = document.getElementById('addPassword').value;
    const confirmPassword = document.getElementById('addConfirmPassword').value;

    // Basic validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    // Store staff data temporarily
    window.tempStaffData = {
        firstName,
        lastName,
        email,
        role,
        password
    };

    // Show verification email
    const verificationEmail = document.getElementById('verificationEmail');
    if (verificationEmail) {
        verificationEmail.textContent = email;
    }

    // Reset and setup verification modal
    resetVerificationCode();
    setupVerificationCodeInputs();

    // Close add modal and show verification modal
    closeAllModals();
    
    setTimeout(() => {
        openModal('verificationModal');
        document.getElementById('verifyDigit1').focus();
    }, 350);
}

/*
╔════════════════════════════════════════════════════════════════╗
║  SUSPENSION DATA & FORMATTING HELPERS                         ║
║  Centralized suspension info, date formatter utility           ║
╚════════════════════════════════════════════════════════════════╝
*/

// Date formatter helper
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Centralized suspension data for staff members
const suspensionData = {
    'robert.b@weighguard.io': {
        type: 'temporary',
        reason: 'Breach of operational protocol - excessive delays on routes',
        suspendedDate: '2026-02-15T10:30:00Z',
        liftDate: null,
        status: 'inactive'
    }
};

/*
╔════════════════════════════════════════════════════════════════╗
║  SUSPENSION WORKFLOW - VIEW DETAILS                           ║
║  openSuspensionDetailsModal, populate and display details      ║
╚════════════════════════════════════════════════════════════════╝
*/

function openSuspensionDetailsModal(staffEmail, staffName) {
    const data = suspensionData[staffEmail];
    if (!data) return;

    // Populate details
    const detailsStaffName = document.getElementById('detailsStaffName');
    const detailsBanType = document.getElementById('detailsBanType');
    const detailsReason = document.getElementById('detailsReason');
    const detailsSuspensionDate = document.getElementById('detailsSuspensionDate');
    const detailsLiftDate = document.getElementById('detailsLiftDate');
    const detailsLiftsectionContainer = document.getElementById('detailsLiftsectionContainer');

    if (detailsStaffName) detailsStaffName.textContent = staffName || '—';
    if (detailsBanType) detailsBanType.textContent = data.type === 'temporary' ? 'Temporary Suspension' : 'Permanent Ban';
    if (detailsReason) detailsReason.textContent = data.reason || '—';
    if (detailsSuspensionDate) detailsSuspensionDate.textContent = formatDate(data.suspendedDate);
    
    if (data.liftDate && detailsLiftDate && detailsLiftsectionContainer) {
        detailsLiftDate.textContent = formatDate(data.liftDate);
        detailsLiftsectionContainer.classList.remove('hidden');
    } else if (detailsLiftsectionContainer) {
        detailsLiftsectionContainer.classList.add('hidden');
    }

    openModal('suspensionDetailsViewModal');
}

/*
╔════════════════════════════════════════════════════════════════╗
║  LIFT SUSPENSION - RESTORE ACCESS                             ║
║  openLiftSuspensionModal, confirmLiftSuspension logic          ║
╚════════════════════════════════════════════════════════════════╝
*/

function openLiftSuspensionModal(staffEmail, staffName) {
    const data = suspensionData[staffEmail];
    if (!data) return;

    const liftStaffName = document.getElementById('liftStaffName');
    const liftSuspensionType = document.getElementById('liftSuspensionType');

    if (liftStaffName) liftStaffName.textContent = staffName || '—';
    if (liftSuspensionType) liftSuspensionType.textContent = data.type === 'temporary' ? 'Temporary Suspension' : 'Permanent Ban';

    // Store current staff for confirmation
    window.currentLiftingSuspensionEmail = staffEmail;

    openModal('liftSuspensionModal');
}

function confirmLiftSuspension() {
    const staffEmail = window.currentLiftingSuspensionEmail;
    if (!staffEmail || !suspensionData[staffEmail]) return;

    // Update suspension data with lift date
    suspensionData[staffEmail].liftDate = new Date().toISOString();
    suspensionData[staffEmail].status = 'active';

    // In a real application, this would make an API call to update the database
    // For now, we just close the modal and show success
    
    closeAllModals();
    window.currentLiftingSuspensionEmail = null;
    
    // Show success feedback (would update table in real implementation)
    console.log(`Suspension lifted for ${staffEmail}`);
}