// ===========================================
// USER MANAGEMENT - STATIC FRONTEND ONLY
// ===========================================
// 
// FILE STRUCTURE OVERVIEW:
// 1. Modal Display & Control Functions
// 2. Password Visibility & Generation
// 3. Verification & Email Confirmation  
// 4. Edit User Modal - Form Management
// 5. Delete User Modal - Confirmation
// 6. Suspension Creation - Modal & Form
// 7. Suspension Data - Configuration
// 8. Suspension Details View - Display
// 9. Lift Suspension - Restore User Access
// 10. Utility Helpers - Form Reset
// 11. Page Initialization - DOM Setup
//
// ===========================================

// ╔═══════════════════════════════════════════╗
// ║     MODAL DISPLAY & CONTROL FUNCTIONS     ║
// ║  openModal, closeModal, toggleModal, etc  ║
// ╚═══════════════════════════════════════════╝
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.remove('opacity-0');
    }

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0', 'scale-95');
        modal.classList.add('opacity-100', 'scale-100');
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const overlay = document.getElementById('modalOverlay');
    
    modal.classList.remove('opacity-100', 'scale-100');
    modal.classList.add('opacity-0', 'scale-95');
    
    if (overlay) {
        overlay.classList.add('opacity-0');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
        if (overlay && !document.querySelector('[id$="Modal"]:not(.hidden)')) {
            overlay.classList.add('hidden');
        }
    }, 300);
}

function closeAllModals() {
    document.querySelectorAll('[id$="Modal"]').forEach(modal => {
        if (!modal.classList.contains('hidden')) {
            closeModal(modal.id);
        }
    });
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
        openModal(modalId);
    } else {
        closeModal(modalId);
    }
}

// ╔═══════════════════════════════════════════╗
// ║   PASSWORD VISIBILITY & GENERATION         ║
// ║  Show/hide password, generate random pass ║
// ╚═══════════════════════════════════════════╝
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);

    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
        }
    }
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < 12; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }

    const passwordField = document.getElementById('addPassword');
    const confirmField = document.getElementById('addConfirmPassword');

    if (passwordField) passwordField.value = password;
    if (confirmField) confirmField.value = password;

    passwordField.type = 'text';
    confirmField.type = 'text';

    const eyeOffSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';

    const icon1 = document.getElementById('toggleAddPasswordIcon');
    const icon2 = document.getElementById('toggleAddConfirmPasswordIcon');
    if (icon1) icon1.innerHTML = eyeOffSvg;
    if (icon2) icon2.innerHTML = eyeOffSvg;
}

// ╔═══════════════════════════════════════════╗
// ║   VERIFICATION & EMAIL CONFIRMATION        ║
// ║  Verification code input, email confirm   ║
// ╚═══════════════════════════════════════════╝
function setupVerificationCodeInputs() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    
    inputs.forEach((id, index) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', (e) => {
            if (e.target.value.length > 0 && index < inputs.length - 1) {
                document.getElementById(inputs[index + 1]).focus();
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

function getVerificationCode() {
    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    return inputs.map(id => document.getElementById(id).value).join('');
}

// ╔═══════════════════════════════════════════╗
// ║   UTILITY HELPERS - FORM RESET             ║
// ║  Clear fields, close forms gracefully     ║
// ╚═══════════════════════════════════════════╝
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

    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');

    if (code.length !== 6) {
        if (errorEl) {
            errorEl.textContent = 'Please enter all 6 digits';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (/^\d{6}$/.test(code)) {
        if (successEl) {
            successEl.textContent = 'Account verified successfully!';
            successEl.classList.remove('hidden');
        }
        
        setTimeout(() => {
            closeModal('verificationModal');
            resetVerificationCode();
            const addForm = document.getElementById('addUserForm');
            if (addForm) addForm.reset();
        }, 1000);
    } else {
        if (errorEl) {
            errorEl.textContent = 'Invalid verification code';
            errorEl.classList.remove('hidden');
        }
    }
}

// ╔═══════════════════════════════════════════╗
// ║    EDIT USER MODAL - FORM MANAGEMENT       ║
// ║  Open/close edit modal, update user data  ║
// ╚═══════════════════════════════════════════╝
function openEditUserModal(userId) {
    const userRow = document.querySelector(`[data-user-id="${userId}"]`);
    if (!userRow) return;

    const fullName = userRow.querySelector('[data-field="name"]')?.textContent || '';
    const email = userRow.querySelector('[data-field="email"]')?.textContent || '';
    
    const nameParts = fullName.split(' ');
    document.getElementById('editUserId').value = userId;
    document.getElementById('editFirstName').value = nameParts[0] || '';
    document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
    document.getElementById('editEmail').value = email;

    const statusEl = document.getElementById('editStatus');
    const currentStatus = userRow.querySelector('[data-field="status"]')?.textContent.trim().toLowerCase() || 'active';
    if (statusEl) statusEl.value = currentStatus === 'inactive' ? 'inactive' : 'active';

    openModal('editUserModal');
}

// ╔═══════════════════════════════════════════╗
// ║   DELETE USER MODAL - CONFIRMATION         ║
// ║  Confirm deletion, remove user from list  ║
// ╚═══════════════════════════════════════════╝
function openDeleteUserModal(userId, userName) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteUserName').textContent = userName;
    openModal('deleteUserModal');
}

function confirmDeleteUser() {
    const userId = document.getElementById('deleteUserId').value;
    const userRow = document.querySelector(`[data-user-id="${userId}"]`);
    
    if (userRow) {
        userRow.remove();
    }

    setTimeout(() => {
        closeModal('deleteUserModal');
    }, 300);
}

// ╔═══════════════════════════════════════════╗
// ║  SUSPENSION CREATION - MODAL & FORM        ║
// ║  Create suspension, select type/reason    ║
// ╚═══════════════════════════════════════════╝
function openSuspensionModal(userId, userName) {
    document.getElementById('suspensionUserId').value = userId;
    document.getElementById('suspensionUserName').textContent = userName;
    document.getElementById('suspensionTypeTemp').checked = true;
    document.getElementById('suspensionReason').value = '';
    document.getElementById('suspensionUntilDate').value = '';
    document.getElementById('suspensionError').classList.add('hidden');
    document.getElementById('suspensionSuccess').classList.add('hidden');
    updateSuspensionFields();
    openModal('suspensionModal');
}

function updateSuspensionFields() {
    const isTempSelected = document.getElementById('suspensionTypeTemp').checked;
    const tempDateField = document.getElementById('tempDateField');
    
    if (isTempSelected) {
        tempDateField.classList.remove('hidden');
    } else {
        tempDateField.classList.add('hidden');
    }
}

function resetSuspensionForm() {
    document.getElementById('suspensionTypeTemp').checked = true;
    document.getElementById('suspensionReason').value = '';
    document.getElementById('suspensionUntilDate').value = '';
    document.getElementById('suspensionError').classList.add('hidden');
    document.getElementById('suspensionSuccess').classList.add('hidden');
    updateSuspensionFields();
}

function confirmSuspension() {
    const userId = document.getElementById('suspensionUserId').value;
    const suspensionType = document.querySelector('input[name="suspensionType"]:checked').value;
    const reason = document.getElementById('suspensionReason').value.trim();
    const errorEl = document.getElementById('suspensionError');
    const successEl = document.getElementById('suspensionSuccess');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!reason) {
        errorEl.textContent = 'Please enter a reason for suspension.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (suspensionType === 'temporary') {
        const untilDate = document.getElementById('suspensionUntilDate').value;
        if (!untilDate) {
            errorEl.textContent = 'Please select a suspension end date.';
            errorEl.classList.remove('hidden');
            return;
        }

        const selectedDate = new Date(untilDate);
        const today = new Date();
        if (selectedDate <= today) {
            errorEl.textContent = 'Please select a future date.';
            errorEl.classList.remove('hidden');
            return;
        }
    }

    // Update user row status
    const userRow = document.querySelector(`[data-user-id="${userId}"]`);
    if (userRow) {
        const statusCell = userRow.querySelector('[data-field="status"]');
        if (statusCell) {
            statusCell.innerHTML = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>INACTIVE</span>';
        }
    }

    successEl.textContent = `User suspended successfully (${suspensionType}).`;
    successEl.classList.remove('hidden');

    setTimeout(() => {
        closeModal('suspensionModal');
        resetSuspensionForm();
    }, 1500);
}

function openVerificationForUser(userId) {
    const userRow = document.querySelector(`[data-user-id="${userId}"]`);
    if (!userRow) return;

    const email = userRow.querySelector('[data-field="email"]')?.textContent || 'email@example.com';
    const verificationEmail = document.getElementById('verificationEmail');
    if (verificationEmail) {
        verificationEmail.textContent = email;
    }

    resetVerificationCode();
    setupVerificationCodeInputs();
    openModal('verificationModal');
    setTimeout(() => document.getElementById('verifyDigit1').focus(), 300);
}

// ╔═══════════════════════════════════════════╗
// ║   SUSPENSION DATA - CONFIGURATION          ║
// ║  Suspension types, reasons, dates         ║
// ╚═══════════════════════════════════════════╝
const suspensionData = {
    1: { type: 'temporary', reason: 'Unauthorized truck modifications detected during routine inspection.', startDate: '2026-03-01', endDate: '2026-04-01' },
    2: { type: 'permanent', reason: 'Account flagged for fraudulent GPS data submission and evasion of monitoring protocols.', suspendedDate: '2026-03-05' },
    3: { type: 'temporary', reason: 'Repeated violations of safety protocols and non-compliance with dispatch procedures.', startDate: '2026-03-10', endDate: '2026-03-25' },
    4: { type: 'permanent', reason: 'Multiple unauthorized access attempts and security breach investigation.', suspendedDate: '2026-02-28' },
    5: { type: 'temporary', reason: 'Scheduled maintenance - account temporarily restricted.', startDate: '2026-03-15', endDate: '2026-03-20' }
};

const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// ╔═══════════════════════════════════════════╗
// ║  SUSPENSION DETAILS VIEW - DISPLAY         ║
// ║  Show suspension reason, type, dates      ║
// ╚═══════════════════════════════════════════╝
// ===== Suspension Details View =====
function openSuspensionDetailsModal(userId, userName) {
    const data = suspensionData[userId];
    if (!data) return;

    const isPermanent = data.type === 'permanent';
    document.getElementById('detailsUserName').textContent = userName;
    document.getElementById('detailsBanType').textContent = isPermanent ? 'PERMANENT BAN' : 'TEMPORARY';
    document.getElementById('detailsBanType').className = isPermanent ? 'text-rose-400 font-bold mt-1' : 'text-blue-400 font-bold mt-1';
    document.getElementById('detailsReason').textContent = data.reason;

    document.getElementById('detailsPermanentDates').classList.toggle('hidden', !isPermanent);
    document.getElementById('detailsTemporaryDates').classList.toggle('hidden', isPermanent);

    if (isPermanent) {
        document.getElementById('detailsSuspendedDate').textContent = formatDate(data.suspendedDate);
    } else {
        document.getElementById('detailsStartDate').textContent = formatDate(data.startDate);
        document.getElementById('detailsEndDate').textContent = formatDate(data.endDate);
    }

    openModal('suspensionDetailsModal');
}

// ╔═══════════════════════════════════════════╗
// ║  LIFT SUSPENSION - RESTORE USER ACCESS     ║
// ║  Remove suspension & restore ACTIVE status║
// ╚═══════════════════════════════════════════╝
// ===== Lift Suspension =====
function openLiftSuspensionModal(userId, userName) {
    const data = suspensionData[userId];
    if (!data) return;

    document.getElementById('liftUserId').value = userId;
    document.getElementById('liftUserName').textContent = userName;
    document.getElementById('liftBanType').textContent = data.type === 'permanent' ? 'PERMANENT BAN' : 'TEMPORARY';
    document.getElementById('liftError').classList.add('hidden');
    document.getElementById('liftSuccess').classList.add('hidden');

    openModal('liftSuspensionModal');
}

function confirmLiftSuspension() {
    const userId = document.getElementById('liftUserId').value;
    const userRow = document.querySelector(`[data-user-id="${userId}"]`);
    if (!userRow) return;

    const statusCell = userRow.querySelector('[data-field="status"]');
    statusCell.innerHTML = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>ACTIVE</span>';

    const liftBtn = userRow.querySelector('button[title="Lift Suspension"]');
    if (liftBtn) {
        liftBtn.title = 'Suspend User';
        liftBtn.className = 'p-2 text-orange-400 hover:text-orange-300 transition bg-orange-900/20 rounded-lg border border-orange-500/30';
        liftBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><line x1="5.636" y1="18.364" x2="18.364" y2="5.636" stroke="currentColor" stroke-width="2"></line></svg>';
        liftBtn.onclick = () => openSuspensionModal(userId, 'Michael Brown');
    }

    document.getElementById('liftSuccess').textContent = 'Suspension lifted. User account is active.';
    document.getElementById('liftSuccess').classList.remove('hidden');

    setTimeout(() => closeModal('liftSuspensionModal'), 1500);
}

// ╔═══════════════════════════════════════════╗
// ║  PAGE INITIALIZATION - DOM SETUP           ║
// ║  Form handlers, event listeners on load   ║
// ╚═══════════════════════════════════════════╝
// ===== Page Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    // ─── ADD USER FORM HANDLER ───
    // Add User Form Handler
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const firstName = addUserForm.firstName.value;
            const lastName = addUserForm.lastName.value;
            const email = addUserForm.email.value;

            const errorEl = document.getElementById('formError');
            if (errorEl) errorEl.classList.add('hidden');

            if (!firstName || !lastName || !email) {
                if (errorEl) {
                    errorEl.textContent = 'All fields are required';
                    errorEl.classList.remove('hidden');
                }
                return;
            }

            const verificationEmail = document.getElementById('verificationEmail');
            if (verificationEmail) verificationEmail.textContent = email;
            resetVerificationCode();
            setupVerificationCodeInputs();
            closeModal('addUserModal');
            openModal('verificationModal');
            setTimeout(() => document.getElementById('verifyDigit1').focus(), 300);
        });
    }

    // ─── EDIT USER FORM HANDLER ───
    // Edit User Form Handler
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const userId = document.getElementById('editUserId').value;
            const firstName = document.getElementById('editFirstName').value;
            const lastName = document.getElementById('editLastName').value;
            const status = document.getElementById('editStatus').value;

            const errorEl = document.getElementById('editFormError');
            if (errorEl) errorEl.classList.add('hidden');

            if (!firstName || !lastName || !status) {
                if (errorEl) {
                    errorEl.textContent = 'All fields are required';
                    errorEl.classList.remove('hidden');
                }
                return;
            }

            // Update in DOM
            const userRow = document.querySelector(`[data-user-id="${userId}"]`);
            if (userRow) {
                const nameEl = userRow.querySelector('[data-field="name"]');
                if (nameEl) nameEl.textContent = `${firstName} ${lastName}`;
                
                const statusEl = userRow.querySelector('[data-field="status"]');
                if (statusEl) {
                    if (status === 'inactive') {
                        statusEl.innerHTML = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>INACTIVE</span>';
                    } else {
                        statusEl.innerHTML = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>ACTIVE</span>';
                    }
                }
            }

            setTimeout(() => {
                closeModal('editUserModal');
            }, 600);
        });
    }

    // Setup verification code inputs on page load
    setupVerificationCodeInputs();
});
