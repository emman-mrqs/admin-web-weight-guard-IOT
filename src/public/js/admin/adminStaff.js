// ===========================================
// STAFF MANAGEMENT - CLEAN FRONTEND
// ===========================================
// Structure:
// 1. Modal Control Functions
// 2. State Management & Data
// 3. Verification Code Handling
// 4. Form Submission & Validation
// 5. Table & UI Rendering
// 6. Utility Functions & Formatters
// 7. Page Initialization

// ════════════════════════════════════════════════════════════════
// SECTION 1: MODAL CONTROL FUNCTIONS
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// SECTION 2: STATE MANAGEMENT & DATA
// ════════════════════════════════════════════════════════════════

let staffState = [];
let filteredStaffState = [];
let verificationData = {
    email: null,
    expiresAt: null
};

const staffPagination = {
    page: 1,
    limit: 10
};

const STAFF_ALLOWED_ROLES = new Set(['dispatch_staff', 'incident_staff']);

const API_ROUTES = {
    adminVerify: '/admin/verify',
    adminResendVerification: '/admin/resend-verification',
    adminSignup: '/admin/signup',
    staffList: '/api/admin/staff',
    staffById: (staffId) => `/api/admin/staff/${staffId}`,
    staffSoftDelete: (staffId) => `/api/admin/staff/${staffId}/soft-delete`,
    staffActivity: (staffId) => `/api/admin/staff/${staffId}/activity`,
    staffSuspend: (staffId) => `/api/admin/staff/${staffId}/suspend`,
    staffSuspensionDetails: (staffId) => `/api/admin/staff/${staffId}/suspension-details`,
    staffLiftSuspension: (staffId) => `/api/admin/staff/${staffId}/lift-suspension`,
    staffRestoreSoftDelete: (staffId) => `/api/admin/staff/${staffId}/restore-soft-delete`
};

const DOM_IDS = {
    addStaffForm: 'addStaffForm',
    editStaffForm: 'editStaffForm',
    staffTableBody: 'staffTableBody',
    staffSearchInput: 'staffSearchInput',
    staffRoleFilter: 'staffRoleFilter',
    staffStatusFilter: 'staffStatusFilter',
    paginationInfo: 'pagination-info',
    paginationControls: 'pagination-controls',
    deleteStaffId: 'deleteStaffId',
    deleteStaffName: 'deleteStaffName',
    deleteStaffActionMode: 'deleteStaffActionMode',
    deleteStaffModalTitle: 'deleteStaffModalTitle',
    deleteStaffModalConfirmText: 'deleteStaffModalConfirmText',
    deleteStaffDescription: 'deleteStaffDescription',
    deleteStaffError: 'deleteStaffError',
    deleteStaffSuccess: 'deleteStaffSuccess'
};

// ════════════════════════════════════════════════════════════════
// SECTION 3: UTILITY FUNCTIONS & FORMATTERS
// ════════════════════════════════════════════════════════════════

function formatDate(dateValue) {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatLongDate(dateValue) {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatRelativeTime(dateValue) {
    if (!dateValue) return 'Never';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Never';

    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return 'just now';

    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

function formatDateTime(dateValue) {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function setButtonLoading(button, loadingText) {
    if (!button) return () => {};

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('opacity-80', 'cursor-not-allowed');
    button.innerHTML = `
        <span class="inline-flex items-center justify-center gap-2">
            <svg class="h-4 w-4 animate-spin text-current" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                <path class="opacity-90" d="M22 12a10 10 0 00-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
            </svg>
            <span>${loadingText}</span>
        </span>
    `;

    return () => {
        button.disabled = false;
        button.classList.remove('opacity-80', 'cursor-not-allowed');
        button.innerHTML = originalHtml;
    };
}

function displayError(errorElement, message) {
    if (!errorElement) return;
    errorElement.textContent = message || 'An error occurred. Please try again.';
    errorElement.classList.remove('hidden');
}

function displaySuccess(successElement, message) {
    if (!successElement) return;
    successElement.textContent = message || 'Operation completed successfully.';
    successElement.classList.remove('hidden');
}

function clearMessages(errorElement, successElement) {
    if (errorElement) errorElement.classList.add('hidden');
    if (successElement) successElement.classList.add('hidden');
}

function escapeForSingleQuotedAttr(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getProfileInitials(fullName, fallback = 'AD') {
    const normalized = String(fullName || '').trim();
    if (!normalized) return fallback;

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (!parts.length) return fallback;

    const first = parts[0].charAt(0) || '';
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    const initials = `${first}${second}`.toUpperCase();
    return initials || fallback;
}

function buildSidebarStyleInitialBadge(fullName) {
    const initials = getProfileInitials(fullName);
    return `
        <div class="w-10 h-10 bg-gradient-to-b from-emerald-500/20 to-emerald-600/5 border border-emerald-500/30 ring-1 ring-emerald-400/20 rounded-full flex items-center justify-center text-emerald-400 font-bold text-xs shadow-[0_0_12px_rgba(16,185,129,0.35)]">
            ${initials}
        </div>
    `;
}

function formatRoleLabel(role) {
    if (role === 'dispatch_staff') return 'Dispatch Staff';
    if (role === 'incident_staff') return 'Incident Staff';
    return String(role || 'Staff').replace(/_/g, ' ');
}

function isStrictStaffRole(staff) {
    return Boolean(staff && STAFF_ALLOWED_ROLES.has(String(staff.role || '').toLowerCase()));
}

function getStaffUiFlags(staff) {
    const normalizedStatus = String(staff?.status || '').toLowerCase();
    const isSoftDeleted = Boolean(staff?.deleted_at);
    const isSuspended = Boolean(staff?.is_suspended) || normalizedStatus === 'suspended';
    const isInactive = normalizedStatus === 'inactive';
    const isVerified = Boolean(staff?.is_verified);
    const baseStatus = ['active', 'inactive', 'pending'].includes(normalizedStatus) ? normalizedStatus : 'pending';
    const derivedStatus = isSoftDeleted
        ? 'deleted'
        : (isSuspended ? 'suspended' : baseStatus);

    return {
        normalizedStatus,
        isSoftDeleted,
        isSuspended,
        isInactive,
        isVerified,
        derivedStatus
    };
}

function configureDeleteStaffModal({
    staffId,
    staffName,
    roleLabel,
    mode,
    title,
    confirmText,
    description
}) {
    const deleteStaffId = document.getElementById('deleteStaffId');
    const deleteStaffName = document.getElementById('deleteStaffName');
    const deleteActionMode = document.getElementById('deleteStaffActionMode');
    const deleteModalTitle = document.getElementById('deleteStaffModalTitle');
    const deleteModalConfirmText = document.getElementById('deleteStaffModalConfirmText');
    const deleteStaffDescription = document.getElementById('deleteStaffDescription');
    const deleteStaffError = document.getElementById('deleteStaffError');
    const deleteStaffSuccess = document.getElementById('deleteStaffSuccess');

    if (deleteStaffId) deleteStaffId.value = staffId;
    if (deleteActionMode) deleteActionMode.value = mode;
    if (deleteStaffName) deleteStaffName.textContent = `${staffName} (${roleLabel})`;
    if (deleteModalTitle) deleteModalTitle.textContent = title;
    if (deleteModalConfirmText) deleteModalConfirmText.textContent = confirmText;
    if (deleteStaffDescription) deleteStaffDescription.textContent = description;

    clearMessages(deleteStaffError, deleteStaffSuccess);
    openModal('deleteStaffModal');
}

function upsertStaffInState(staff) {
    if (!staff || !staff.id || !isStrictStaffRole(staff)) return;

    const existingIndex = staffState.findIndex((s) => Number(s.id) === Number(staff.id));
    if (existingIndex === -1) {
        staffState.unshift(staff);
        return;
    }

    staffState[existingIndex] = {
        ...staffState[existingIndex],
        ...staff
    };
}

function clearFieldErrors() {
    const fieldErrorIds = [
        'firstNameError',
        'lastNameError',
        'emailError',
        'roleError',
        'passwordError',
        'confirmPasswordError'
    ];

    fieldErrorIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    });
}

function setFieldError(errorId, message) {
    const el = document.getElementById(errorId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const passwordField = document.getElementById('addPassword');
    const confirmField = document.getElementById('addConfirmPassword');

    if (passwordField) {
        passwordField.value = password;
        passwordField.type = 'text';
    }
    if (confirmField) {
        confirmField.value = password;
        confirmField.type = 'text';
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function resetStaffForm() {
    const form = document.getElementById('addStaffForm');
    if (form) {
        form.reset();
        const errorEl = document.getElementById('staffFormError');
        const successEl = document.getElementById('staffFormSuccess');
        clearMessages(errorEl, successEl);
        clearFieldErrors();

        const passwordField = document.getElementById('addPassword');
        const confirmField = document.getElementById('addConfirmPassword');
        if (passwordField) passwordField.type = 'password';
        if (confirmField) confirmField.type = 'password';
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 4: VERIFICATION CODE HANDLING
// ════════════════════════════════════════════════════════════════

let verificationTimerInterval = null;
let verificationInputsInitialized = false;

function setupVerificationCodeInputs() {
    if (verificationInputsInitialized) return;

    const inputs = ['verifyDigit1', 'verifyDigit2', 'verifyDigit3', 'verifyDigit4', 'verifyDigit5', 'verifyDigit6'];
    
    inputs.forEach((id, index) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
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

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const digits = pastedText.replace(/\D/g, '').slice(0, 6);

            if (!digits.length) return;
            
            for (let i = 0; i < digits.length && i < inputs.length; i++) {
                const inputElement = document.getElementById(inputs[i]);
                if (inputElement) {
                    inputElement.value = digits[i];
                }
            }
            
            const lastIndex = Math.min(digits.length - 1, inputs.length - 1);
            document.getElementById(inputs[lastIndex]).focus();
        });
    });

    verificationInputsInitialized = true;
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

function startVerificationTimer(expiresAtFromDb) {
    const fallbackExpiry = new Date(Date.now() + 5 * 60 * 1000);
    const expiresAt = expiresAtFromDb ? new Date(expiresAtFromDb) : fallbackExpiry;

    if (Number.isNaN(expiresAt.getTime())) {
        return startVerificationTimer();
    }

    const timerDisplay = document.getElementById('verificationTimer');
    const timerBar = document.getElementById('verificationTimerBar');
    const totalDurationSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    
    if (verificationTimerInterval) {
        clearInterval(verificationTimerInterval);
    }

    function updateDisplay() {
        const timeLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        if (timerDisplay) {
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            if (timeLeft <= 60) {
                timerDisplay.classList.remove('text-emerald-300');
                timerDisplay.classList.add('text-amber-300');
            } else {
                timerDisplay.classList.remove('text-amber-300');
                timerDisplay.classList.add('text-emerald-300');
            }
        }

        if (timerBar) {
            const percent = Math.max(0, Math.min(100, (timeLeft / totalDurationSeconds) * 100));
            timerBar.style.width = `${percent}%`;

            if (timeLeft <= 60) {
                timerBar.classList.remove('bg-emerald-400');
                timerBar.classList.add('bg-amber-400');
            } else {
                timerBar.classList.remove('bg-amber-400');
                timerBar.classList.add('bg-emerald-400');
            }
        }

        return timeLeft;
    }

    const initialTime = updateDisplay();
    if (initialTime <= 0) return;

    verificationTimerInterval = setInterval(() => {
        const timeLeft = updateDisplay();
        if (timeLeft <= 0) {
            clearInterval(verificationTimerInterval);
            const verificationModal = document.getElementById('verificationModal');
            if (verificationModal && !verificationModal.classList.contains('hidden')) {
                resetVerificationCode();
                const errorEl = document.getElementById('verificationError');
                if (errorEl) {
                    errorEl.textContent = 'Verification code has expired. Please request a new one.';
                    errorEl.classList.remove('hidden');
                }
            }
        }
    }, 1000);
}

async function submitVerificationCode() {
    const code = getVerificationCode();
    const emailElement = document.getElementById('verificationEmail');
    const email = emailElement ? emailElement.textContent.trim() : '';
    const errorEl = document.getElementById('verificationError');
    const successEl = document.getElementById('verificationSuccess');
    const submitBtn = document.querySelector('#verificationModal button[onclick="submitVerificationCode()"]');

    if (!errorEl || !successEl) return;
    clearMessages(errorEl, successEl);

    if (!email || !code) {
        displayError(errorEl, 'Please enter the verification code.');
        return;
    }

    const restoreBtn = setButtonLoading(submitBtn, 'Verifying');

    try {
        const response = await fetch(API_ROUTES.adminVerify, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                verificationCode: code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Verification failed.');
        } else {
            displaySuccess(successEl, data.message || 'Email verified successfully.');

            if (verificationTimerInterval) {
                clearInterval(verificationTimerInterval);
            }
            
            setTimeout(() => {
                closeModal('verificationModal');
                resetVerificationCode();
                loadStaffData();
            }, 1200);
        }
    } catch (error) {
        console.error('Verification error:', error);
        displayError(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        restoreBtn();
    }
}

async function resendVerificationCode() {
    const emailElement = document.getElementById('verificationEmail');
    const email = emailElement ? emailElement.textContent.trim() : '';
    const errorEl = document.getElementById('verificationError');
    const successEl = document.getElementById('verificationSuccess');
    const resendBtn = document.querySelector('#verificationModal button[onclick="resendVerificationCode()"]');

    if (!errorEl || !successEl) return;
    clearMessages(errorEl, successEl);

    if (!email) {
        displayError(errorEl, 'Email is missing. Please close and try again.');
        return;
    }

    const restoreResendButton = setButtonLoading(resendBtn, 'Sending');

    try {
        const response = await fetch(API_ROUTES.adminResendVerification, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to resend code.');
        } else {
            displaySuccess(successEl, data.message || 'A new verification code has been sent.');
            resetVerificationCode();
            startVerificationTimer(data.verificationExpiresAt);
            setTimeout(() => document.getElementById('verifyDigit1')?.focus(), 300);
        }
    } catch (error) {
        console.error('Resend error:', error);
        displayError(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        restoreResendButton();
    }
}

function openVerificationForStaff(email, _staffId, expiresAt) {
    verificationData.email = email;
    verificationData.expiresAt = expiresAt;
    
    const emailEl = document.getElementById('verificationEmail');
    if (emailEl) emailEl.textContent = email;
    
    setupVerificationCodeInputs();
    resetVerificationCode();
    startVerificationTimer(expiresAt);
    openModal('verificationModal');
    setTimeout(() => document.getElementById('verifyDigit1')?.focus(), 300);
}

function openEditStaffModal(staffId) {
    const staff = staffState.find((s) => Number(s.id) === Number(staffId));
    if (!staff) return;

    const isVerified = Boolean(staff.is_verified);
    const normalizedStatus = String(staff.status || 'pending').toLowerCase();

    const editStaffId = document.getElementById('editStaffId');
    const editFirstName = document.getElementById('editFirstName');
    const editLastName = document.getElementById('editLastName');
    const editEmail = document.getElementById('editEmail');
    const editRole = document.getElementById('editRole');
    const editStatus = document.getElementById('editStatus');
    const editFormError = document.getElementById('editFormError');
    const editFormSuccess = document.getElementById('editFormSuccess');

    if (editStaffId) editStaffId.value = staff.id;
    if (editFirstName) editFirstName.value = staff.first_name || '';
    if (editLastName) editLastName.value = staff.last_name || '';
    if (editEmail) editEmail.value = staff.email || '';
    if (editRole) editRole.value = staff.role || 'dispatch_staff';
    if (editStatus) {
        const pendingOption = editStatus.querySelector('option[value="pending"]');
        if (pendingOption) {
            pendingOption.disabled = true;
            pendingOption.hidden = true;
        }

        if (isVerified) {
            editStatus.value = normalizedStatus === 'inactive' ? 'inactive' : 'active';
            editStatus.disabled = false;
        } else {
            editStatus.value = 'pending';
            editStatus.disabled = true;
        }
    }
    clearMessages(editFormError, editFormSuccess);

    openModal('editStaffModal');
}

async function handleEditStaffFormSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('editStaffForm');
    if (!form) return;

    const staffId = document.getElementById('editStaffId')?.value;
    const firstName = document.getElementById('editFirstName')?.value.trim();
    const lastName = document.getElementById('editLastName')?.value.trim();
    const role = document.getElementById('editRole')?.value;
    const statusEl = document.getElementById('editStatus');
    const errorEl = document.getElementById('editFormError');
    const successEl = document.getElementById('editFormSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    clearMessages(errorEl, successEl);

    const restoreBtn = setButtonLoading(submitBtn, 'Saving changes');

    try {
        const requestBody = {
            firstName,
            lastName,
            role
        };

        const staffInState = staffState.find(s => Number(s.id) === Number(staffId));
        const canEditStatus = Boolean(staffInState && staffInState.is_verified);

        if (canEditStatus && statusEl) {
            requestBody.status = String(statusEl.value || '').toLowerCase();
        }

        const response = await fetch(API_ROUTES.staffById(staffId), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to update staff.');
            return;
        }

        if (data.staff) {
            upsertStaffInState(data.staff);
            updateSummaryStats();
            applyFiltersAndSearch();
        }

        displaySuccess(successEl, data.message || 'Staff updated successfully.');
        setTimeout(() => {
            closeModal('editStaffModal');
        }, 1000);
    } catch (error) {
        console.error('Error updating staff:', error);
        displayError(errorEl, 'Connection error. Please try again.');
    } finally {
        restoreBtn();
    }
}

function openDeleteStaffModal(staffId, staffName, roleLabel) {
    configureDeleteStaffModal({
        staffId,
        staffName,
        roleLabel,
        mode: 'soft-delete',
        title: 'Soft Delete Staff Account?',
        confirmText: 'Soft Delete Staff',
        description: 'This user will be hidden from active operations and can be restored within 30 days.'
    });
}

function openPermanentDeleteStaffModal(staffId, staffName, roleLabel) {
    configureDeleteStaffModal({
        staffId,
        staffName,
        roleLabel,
        mode: 'permanent-delete',
        title: 'Permanently Delete Staff?',
        confirmText: 'Permanently Delete',
        description: 'This action cannot be undone. Related records configured with ON DELETE SET NULL/CASCADE will be applied.'
    });
}

async function confirmDeleteStaff() {
    const staffId = document.getElementById(DOM_IDS.deleteStaffId)?.value;
    const actionMode = document.getElementById(DOM_IDS.deleteStaffActionMode)?.value || 'soft-delete';
    const errorEl = document.getElementById(DOM_IDS.deleteStaffError);
    const successEl = document.getElementById(DOM_IDS.deleteStaffSuccess);
    const submitBtn = document.querySelector('#deleteStaffModal button[onclick="confirmDeleteStaff()"]');

    clearMessages(errorEl, successEl);

    if (!staffId) {
        displayError(errorEl, 'Invalid staff selected.');
        return;
    }

    const loadingLabel = actionMode === 'permanent-delete' ? 'Deleting permanently' : 'Revoking access';
    const restoreBtn = setButtonLoading(submitBtn, loadingLabel);

    try {
        const response = await fetch(API_ROUTES.staffSoftDelete(staffId), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to revoke staff access.');
            return;
        }

        if (data.permanentlyDeleted) {
            staffState = staffState.filter(s => Number(s.id) !== Number(staffId));
        } else if (data.staff) {
            upsertStaffInState(data.staff);
        }

        updateSummaryStats();
        applyFiltersAndSearch();

        displaySuccess(successEl, data.message || 'Staff deleted successfully.');
        setTimeout(() => {
            closeModal('deleteStaffModal');
        }, 1000);
    } catch (error) {
        console.error('Error deleting staff:', error);
        displayError(errorEl, 'Connection error. Please try again.');
    } finally {
        restoreBtn();
    }
}

async function openHistoryModal(staffId, staffName) {
    const historyTableBody = document.getElementById('historyTableBody');
    const historyStaffName = document.getElementById('historyStaffName');

    if (historyStaffName) {
        historyStaffName.textContent = staffName;
    }

    if (historyTableBody) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="px-8 py-6 text-xs text-slate-400 text-center">Loading activity...</td>
            </tr>
        `;
    }

    openModal('historyModal');

    try {
        const response = await fetch(API_ROUTES.staffActivity(staffId));
        const data = await response.json();

        if (!response.ok) {
            if (historyTableBody) {
                historyTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-8 py-6 text-xs text-rose-400 text-center">${data.error || 'Failed to load activity.'}</td>
                    </tr>
                `;
            }
            return;
        }

        const rows = Array.isArray(data.data) ? data.data : [];
        if (historyTableBody) {
            if (!rows.length) {
                historyTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-8 py-6 text-xs text-slate-400 text-center">No activity records found.</td>
                    </tr>
                `;
                return;
            }

            historyTableBody.innerHTML = rows.map((row) => {
                const action = String(row.action || 'Activity').toUpperCase();
                const details = row.description || row.module || 'No details provided.';
                const severity = String(row.severity || 'info').toUpperCase();
                const severityClass = severity === 'ERROR'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : severity === 'WARN'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

                return `
                    <tr class="hover:bg-slate-800/40 transition-colors">
                        <td class="px-8 py-4 text-xs font-bold text-white font-mono">${formatDateTime(row.created_at)}</td>
                        <td class="px-6 py-4 text-xs font-bold text-white">${action}</td>
                        <td class="px-6 py-4 text-xs text-slate-400 font-mono">${details}</td>
                        <td class="px-8 py-4 text-right">
                            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${severityClass}">${severity}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading history:', error);
        if (historyTableBody) {
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-8 py-6 text-xs text-rose-400 text-center">Connection error while loading activity.</td>
                </tr>
            `;
        }
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 4-A: STAFF SUSPENSION MANAGEMENT
// ════════════════════════════════════════════════════════════════

function openSuspensionModal(staffId, staffName) {
    const suspensionStaffId = document.getElementById('suspensionStaffId');
    const suspensionStaffName = document.getElementById('suspensionStaffName');
    
    if (suspensionStaffId) suspensionStaffId.value = staffId;
    if (suspensionStaffName) suspensionStaffName.textContent = staffName;

    document.getElementById('suspensionTypeTemp').checked = true;
    document.getElementById('suspensionReason').value = '';
    document.getElementById('suspensionUntilDate').value = '';
    
    const errorEl = document.getElementById('suspensionError');
    const successEl = document.getElementById('suspensionSuccess');
    
    clearMessages(errorEl, successEl);
    updateStaffSuspensionFields();
    openModal('suspensionModal');
}

function updateStaffSuspensionFields() {
    const isTempSelected = document.getElementById('suspensionTypeTemp').checked;
    const tempDateField = document.getElementById('tempDateField');
    
    if (isTempSelected) {
        tempDateField.classList.remove('hidden');
    } else {
        tempDateField.classList.add('hidden');
    }
}

function resetStaffSuspensionForm() {
    document.getElementById('suspensionTypeTemp').checked = true;
    document.getElementById('suspensionReason').value = '';
    document.getElementById('suspensionUntilDate').value = '';
    document.getElementById('suspensionError').classList.add('hidden');
    document.getElementById('suspensionSuccess').classList.add('hidden');
    updateStaffSuspensionFields();
}

function confirmStaffSuspension() {
    const staffId = document.getElementById('suspensionStaffId').value;
    const suspensionType = document.querySelector('input[name="suspensionType"]:checked').value;
    const reason = document.getElementById('suspensionReason').value.trim();
    const untilDate = document.getElementById('suspensionUntilDate').value;
    const errorEl = document.getElementById('suspensionError');
    const successEl = document.getElementById('suspensionSuccess');
    const submitBtn = document.getElementById('suspensionSubmitBtn');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!reason) {
        errorEl.textContent = 'Please enter a reason for suspension.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (suspensionType === 'temporary') {
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

    const restoreButton = setButtonLoading(submitBtn, 'Applying suspension');

    fetch(API_ROUTES.staffSuspend(staffId), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            suspensionType,
            reason,
            endDate: suspensionType === 'temporary' ? untilDate : null
        })
    })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok) {
                errorEl.textContent = data.error || 'Failed to suspend staff.';
                errorEl.classList.remove('hidden');
                return;
            }

            successEl.textContent = data.message || 'Staff member suspended successfully.';
            successEl.classList.remove('hidden');

            setTimeout(() => {
                closeModal('suspensionModal');
                resetStaffSuspensionForm();
                loadStaffData();
            }, 1200);
        })
        .catch((error) => {
            console.error('Error suspending staff:', error);
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.remove('hidden');
        })
        .finally(() => {
            restoreButton();
        });
}

function openSuspensionDetailsModal(staffId, staffName) {
    const detailsStaffName = document.getElementById('detailsStaffName');
    const detailsBanType = document.getElementById('detailsBanType');
    const detailsReason = document.getElementById('detailsReason');
    const permanentSection = document.getElementById('detailsPermanentDates');
    const temporarySection = document.getElementById('detailsTemporaryDates');
    const errorEl = document.getElementById('detailsError');

    if (detailsStaffName) detailsStaffName.textContent = staffName;
    if (detailsBanType) {
        detailsBanType.textContent = 'LOADING';
        detailsBanType.className = 'text-slate-400 font-bold mt-1';
    }
    if (detailsReason) detailsReason.textContent = 'Loading suspension details...';
    if (permanentSection) permanentSection.classList.add('hidden');
    if (temporarySection) temporarySection.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    openModal('suspensionDetailsModal');

    try {
        fetchSuspensionDetails(staffId);
    } catch (error) {
        console.error('Error opening suspension details modal:', error);
    }
}

async function fetchSuspensionDetails(staffId) {
    try {
        const response = await fetch(API_ROUTES.staffSuspensionDetails(staffId));
        const data = await response.json();

        if (!response.ok) {
            const errorEl = document.getElementById('detailsError');
            if (errorEl) {
                errorEl.textContent = data.error || 'Unable to load suspension information.';
                errorEl.classList.remove('hidden');
            }
            return;
        }

        const details = data.details || {};
        const isPermanent = String(details.type || '').toLowerCase() === 'permanent';

        const detailsStaffName = document.getElementById('detailsStaffName');
        const detailsBanType = document.getElementById('detailsBanType');
        const detailsReason = document.getElementById('detailsReason');
        const detailsSuspendedDate = document.getElementById('detailsSuspendedDate');
        const detailsStartDate = document.getElementById('detailsStartDate');
        const detailsEndDate = document.getElementById('detailsEndDate');

        if (detailsStaffName) detailsStaffName.textContent = details.staffName || String(staffId);
        if (detailsBanType) {
            detailsBanType.textContent = isPermanent ? 'PERMANENT BAN' : 'TEMPORARY';
            detailsBanType.className = isPermanent ? 'text-rose-400 font-bold mt-1' : 'text-blue-400 font-bold mt-1';
        }
        if (detailsReason) detailsReason.textContent = details.reason || 'No reason provided.';

        const permanentSection = document.getElementById('detailsPermanentDates');
        const temporarySection = document.getElementById('detailsTemporaryDates');
        
        if (permanentSection) permanentSection.classList.toggle('hidden', !isPermanent);
        if (temporarySection) temporarySection.classList.toggle('hidden', isPermanent);

        if (isPermanent) {
            if (detailsSuspendedDate) detailsSuspendedDate.textContent = formatDateTime(details.startedAt);
        } else {
            if (detailsStartDate) detailsStartDate.textContent = formatDateTime(details.startedAt);
            if (detailsEndDate) detailsEndDate.textContent = formatDateTime(details.endedAt);
        }
    } catch (error) {
        console.error('Error fetching suspension details:', error);
        const errorEl = document.getElementById('detailsError');
        if (errorEl) {
            errorEl.textContent = 'Failed to load suspension details.';
            errorEl.classList.remove('hidden');
        }
    }
}

function openLiftSuspensionModal(staffId, staffName) {
    const liftStaffIdEl = document.getElementById('liftStaffId');
    const liftStaffNameEl = document.getElementById('liftStaffName');
    const liftTypeEl = document.getElementById('liftSuspensionType');
    const liftErrorEl = document.getElementById('liftError');
    const liftSuccessEl = document.getElementById('liftSuccess');

    if (liftStaffIdEl) liftStaffIdEl.value = staffId;
    if (liftStaffNameEl) liftStaffNameEl.textContent = staffName;
    if (liftTypeEl) liftTypeEl.textContent = 'Loading...';
    if (liftErrorEl) liftErrorEl.classList.add('hidden');
    if (liftSuccessEl) liftSuccessEl.classList.add('hidden');

    openModal('liftSuspensionModal');

    fetch(API_ROUTES.staffSuspensionDetails(staffId))
        .then(async (res) => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
            if (!ok || !liftTypeEl) return;
            const type = String(data.details?.type || 'temporary').toLowerCase();
            liftTypeEl.textContent = type === 'permanent' ? 'PERMANENT BAN' : 'TEMPORARY';
        })
        .catch((error) => {
            console.error('Error loading lift suspension details:', error);
            if (liftTypeEl) liftTypeEl.textContent = 'Unknown';
        });
}

async function confirmLiftSuspension() {
    const staffId = document.getElementById('liftStaffId').value;
    const errorEl = document.getElementById('liftError');
    const successEl = document.getElementById('liftSuccess');
    const submitBtn = document.querySelector('#liftSuspensionModal button[onclick="confirmLiftSuspension()"]');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const restoreButton = setButtonLoading(submitBtn, 'Restoring');

    try {
        const response = await fetch(API_ROUTES.staffLiftSuspension(staffId), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || 'Failed to lift suspension.';
            errorEl.classList.remove('hidden');
            return;
        }

        successEl.textContent = data.message || 'Suspension lifted successfully.';
        successEl.classList.remove('hidden');

        setTimeout(() => {
            closeModal('liftSuspensionModal');
            loadStaffData();
        }, 1200);
    } catch (error) {
        console.error('Error lifting suspension:', error);
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        restoreButton();
    }
}

function openRestoreDeletedStaffModal(staffId, staffName) {
    document.getElementById('restoreDeletedStaffId').value = staffId;
    document.getElementById('restoreDeletedStaffName').textContent = staffName;
    document.getElementById('restoreDeletedFormError').classList.add('hidden');
    document.getElementById('restoreDeletedFormSuccess').classList.add('hidden');
    openModal('restoreDeletedStaffModal');
}

async function confirmRestoreDeletedStaff() {
    const staffId = document.getElementById('restoreDeletedStaffId').value;
    const errorEl = document.getElementById('restoreDeletedFormError');
    const successEl = document.getElementById('restoreDeletedFormSuccess');
    const submitBtn = document.querySelector('#restoreDeletedStaffModal button[onclick="confirmRestoreDeletedStaff()"]');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const restoreButton = setButtonLoading(submitBtn, 'Restoring');

    try {
        const response = await fetch(API_ROUTES.staffRestoreSoftDelete(staffId), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || 'Failed to restore staff.';
            errorEl.classList.remove('hidden');
            return;
        }

        // Always refresh from backend after restore to keep suspension/status state consistent.
        await loadStaffData();

        successEl.textContent = data.message || 'Staff member restored successfully.';
        successEl.classList.remove('hidden');

        setTimeout(() => {
            closeModal('restoreDeletedStaffModal');
        }, 1200);
    } catch (error) {
        console.error('Error restoring staff:', error);
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        restoreButton();
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 5: FORM SUBMISSION & VALIDATION
// ════════════════════════════════════════════════════════════════

async function handleAddStaffSubmit() {
    const form = document.getElementById('addStaffForm');
    if (!form) return;

    const firstName = form.querySelector('input[name="firstName"]').value.trim();
    const lastName = form.querySelector('input[name="lastName"]').value.trim();
    const email = form.querySelector('input[name="email"]').value.trim();
    const role = form.querySelector('select[name="role"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;
    const confirmPassword = form.querySelector('input[name="confirmPassword"]').value;

    const errorEl = document.getElementById('staffFormError');
    const successEl = document.getElementById('staffFormSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    clearMessages(errorEl, successEl);
    clearFieldErrors();

    const restoreSubmitButton = setButtonLoading(submitBtn, 'Creating staff');

    try {
        const response = await fetch(API_ROUTES.adminSignup, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fName: firstName,
                lName: lastName,
                email: email,
                role: role,
                password: password,
                confirmPassword: confirmPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to create staff account.');
            console.error('Staff creation error:', data);
        } else {
            displaySuccess(successEl, data.message || 'Staff member created successfully!');

            setTimeout(() => {
                closeModal('addStaffModal');
                resetStaffForm();
                
                // Open verification modal
                openVerificationForStaff(email, null, data.verificationExpiresAt || null);
                loadStaffData();
            }, 1200);
        }
    } catch (error) {
        console.error('Network or server error:', error);
        displayError(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        restoreSubmitButton();
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 6: TABLE & UI RENDERING
// ════════════════════════════════════════════════════════════════

function updateSummaryStats() {
    const visibleStaff = staffState.filter(s => !s.deleted_at);
    const totalStaff = visibleStaff.length;
    const verifiedStaff = visibleStaff.filter(s => s.is_verified).length;
    const incidentStaff = visibleStaff.filter(s => s.role === 'incident_staff').length;
    const dispatchStaff = visibleStaff.filter(s => s.role === 'dispatch_staff').length;

    const summaryTotal = document.getElementById('summaryTotalStaff');
    const summaryVerified = document.getElementById('summaryVerifiedStaff');
    const summaryAdmin = document.getElementById('summaryAdminStaff');
    const summaryDispatch = document.getElementById('summaryDispatchStaff');

    if (summaryTotal) summaryTotal.textContent = totalStaff;
    if (summaryVerified) summaryVerified.textContent = verifiedStaff;
    if (summaryAdmin) summaryAdmin.textContent = incidentStaff;
    if (summaryDispatch) summaryDispatch.textContent = dispatchStaff;
}

function getPaginatedStaff(totalEntriesOverride = null) {
    const totalEntries = Number.isFinite(totalEntriesOverride)
        ? Number(totalEntriesOverride)
        : filteredStaffState.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / staffPagination.limit));

    if (staffPagination.page > totalPages) {
        staffPagination.page = totalPages;
    }

    const startIndex = totalEntries === 0 ? 0 : (staffPagination.page - 1) * staffPagination.limit;
    const endIndex = Math.min(startIndex + staffPagination.limit, totalEntries);
    const pagedStaff = totalEntries === 0 ? [] : filteredStaffState.slice(startIndex, endIndex);

    return {
        pagedStaff,
        totalEntries,
        totalPages,
        startIndex,
        endIndex,
        page: staffPagination.page
    };
}

function updatePaginationInfo(totalEntries = filteredStaffState.length) {
    const paginationInfo = document.getElementById(DOM_IDS.paginationInfo);
    const paginationControls = document.getElementById(DOM_IDS.paginationControls);
    if (!paginationInfo || !paginationControls) return;

    const { totalPages, startIndex, endIndex, page } = getPaginatedStaff(totalEntries);

    if (totalEntries === 0) {
        paginationInfo.textContent = 'Showing 0 to 0 of 0 entries';
        paginationControls.classList.add('hidden');
        return;
    }

    paginationInfo.innerHTML = `Showing <span class="text-white font-bold">${startIndex + 1}</span> to <span class="text-white font-bold">${endIndex}</span> of <span class="text-white font-bold">${totalEntries}</span> entries`;
    paginationControls.classList.remove('hidden');

    const makePageBtn = (p, active = false) => {
        const cls = active
            ? 'w-8 h-8 flex items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold'
            : 'w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-bold';

        return `<button onclick="goToStaffPage(${p})" class="${cls}">${p}</button>`;
    };

    const makeArrowBtn = (targetPage, direction, disabled = false) => {
        const path = direction === 'prev' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7';
        const baseCls = disabled
            ? 'p-2 rounded-lg border border-slate-700 text-slate-500 opacity-50 cursor-not-allowed bg-slate-800/50'
            : 'p-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition';
        const clickAttr = disabled ? '' : `onclick="goToStaffPage(${targetPage})"`;

        return `<button ${disabled ? 'disabled' : ''} ${clickAttr} class="${baseCls}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${path}"></path></svg></button>`;
    };

    let html = '';
    html += makeArrowBtn(page - 1, 'prev', page <= 1);

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    } else {
        pages.push(1);
        if (page > 3) pages.push('...');
        const start = Math.max(2, page - 1);
        const end = Math.min(totalPages - 1, page + 1);
        for (let i = start; i <= end; i += 1) pages.push(i);
        if (page < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach((entry) => {
        if (entry === '...') {
            html += '<span class="w-8 h-8 flex items-center justify-center text-slate-600 text-xs font-bold">...</span>';
        } else {
            html += makePageBtn(entry, entry === page);
        }
    });

    html += makeArrowBtn(page + 1, 'next', page >= totalPages);
    paginationControls.innerHTML = html;
}

function setStaffTableState(message, isError = false) {
    const tbody = document.getElementById(DOM_IDS.staffTableBody);
    if (!tbody) return;

    const colorClass = isError ? 'text-rose-400' : 'text-slate-400';
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-8 text-center ${colorClass} text-sm">${message}</td>
        </tr>
    `;
}

function getFilteredStaff() {
    const searchValue = String(document.getElementById(DOM_IDS.staffSearchInput)?.value || '').toLowerCase().trim();
    const roleFilter = String(document.getElementById(DOM_IDS.staffRoleFilter)?.value || '').trim();
    const statusFilter = String(document.getElementById(DOM_IDS.staffStatusFilter)?.value || '').trim().toLowerCase();

    return staffState.filter((s) => {
        const { derivedStatus } = getStaffUiFlags(s);

        const matchesSearch = !searchValue
            || String(s.first_name || '').toLowerCase().includes(searchValue)
            || String(s.last_name || '').toLowerCase().includes(searchValue)
            || String(s.email || '').toLowerCase().includes(searchValue);
        const matchesRole = !roleFilter || s.role === roleFilter;
        const matchesStatus = !statusFilter || derivedStatus === statusFilter;

        return matchesSearch && matchesRole && matchesStatus;
    });
}

function renderStaffState() {
    const filtered = getFilteredStaff();
    filteredStaffState = filtered;
    const { pagedStaff } = getPaginatedStaff(filtered.length);
    populateStaffTable(pagedStaff);
    updatePaginationInfo(filtered.length);
}

function getSoftDeleteRetentionState(deletedAt) {
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const deletedAtMs = deletedAt ? Date.parse(deletedAt) : NaN;
    const hasValidDeletedAt = Number.isFinite(deletedAtMs);
    const msSinceSoftDelete = hasValidDeletedAt ? (Date.now() - deletedAtMs) : 0;
    const permanentDeleteEligible = hasValidDeletedAt && (msSinceSoftDelete >= retentionMs);
    const permanentDeleteDaysRemaining = (!permanentDeleteEligible && hasValidDeletedAt)
        ? Math.max(1, Math.ceil((retentionMs - msSinceSoftDelete) / oneDayMs))
        : null;

    return {
        permanentDeleteEligible,
        permanentDeleteDaysRemaining
    };
}

function getStaffStatusPresentation(derivedStatus) {
    const status = String(derivedStatus || 'pending').toLowerCase();

    const statusText = status.toUpperCase();
    const statusBg = status === 'deleted'
        ? 'bg-slate-800/90'
        : (status === 'suspended'
        ? 'bg-rose-500/10'
        : (status === 'inactive' ? 'bg-slate-800/80' : (status === 'active' ? 'bg-emerald-500/10' : 'bg-amber-500/10')));
    const statusBorder = status === 'deleted'
        ? 'border-slate-600/60'
        : (status === 'suspended'
        ? 'border-rose-500/30'
        : (status === 'inactive' ? 'border-slate-600/60' : (status === 'active' ? 'border-emerald-500/20' : 'border-amber-500/20')));
    const statusTextColor = status === 'deleted'
        ? 'text-slate-300'
        : (status === 'suspended'
        ? 'text-rose-400'
        : (status === 'inactive' ? 'text-slate-300' : (status === 'active' ? 'text-emerald-400' : 'text-amber-400')));
    const statusDotColor = status === 'deleted'
        ? 'bg-slate-400'
        : (status === 'suspended'
        ? 'bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,0.8)]'
        : (status === 'inactive'
            ? 'bg-slate-400'
            : (status === 'active' ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]' : 'bg-amber-400')));

    return {
        statusText,
        statusBg,
        statusBorder,
        statusTextColor,
        statusDotColor
    };
}

function buildStaffStatusCell({ s, isVerified, isSuspended, isSoftDeleted, statusText, statusBg, statusTextColor, statusBorder, statusDotColor }) {
    return `
        <td class="px-6 py-4">
            <div class="flex flex-col gap-2">
                ${!isVerified && !isSuspended && !isSoftDeleted ? `
                    <button onclick="openVerificationForStaff('${s.email}', ${s.id}, '${s.verification_expires}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${statusBg} ${statusTextColor} border ${statusBorder} text-[10px] font-bold tracking-wide hover:bg-amber-500/20 hover:border-amber-500/40 transition w-fit" title="Verify Staff">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDotColor}"></span>
                        ${statusText}
                    </button>
                ` : `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${statusBg} ${statusTextColor} border ${statusBorder} text-[10px] font-bold tracking-wide w-fit">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDotColor}"></span>
                        ${statusText}
                    </span>
                `}
                ${!isVerified && !isSuspended && !isSoftDeleted ? '<span class="text-[10px] text-slate-400">Verification Required</span>' : ''}
            </div>
        </td>
    `;
}

function buildStaffActivityCell({ createdAtText, updatedAtText }) {
    return `
        <td class="px-6 py-4">
            <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5">
                    <svg class="w-3 h-3 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <span class="text-[10px] text-slate-300">Joined: ${createdAtText}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <svg class="w-3 h-3 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-9-9m0 0V3m0 3h3"></path></svg>
                    <span class="text-[10px] text-slate-400">Updated: ${updatedAtText}</span>
                </div>
            </div>
        </td>
    `;
}

function buildStaffDeletedCell({ isSoftDeleted, deletedAtText, permanentDeleteEligible, deleteAvailabilityText }) {
    return `
        <td class="px-6 py-4">
            <div class="flex flex-col gap-1">
                <span class="text-[10px] ${isSoftDeleted ? 'text-slate-300' : 'text-slate-500'} font-mono">${deletedAtText}</span>
                ${isSoftDeleted ? `<span class="text-[10px] ${permanentDeleteEligible ? 'text-slate-300' : 'text-slate-400'}">${deleteAvailabilityText}</span>` : ''}
            </div>
        </td>
    `;
}

function buildStaffActionsCell({ s, safeFullName, roleDisplay, isSoftDeleted, isSuspended, permanentDeleteEligible, permanentDeleteDaysRemaining }) {
    return `
        <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
                ${!s.is_verified ? `
                    <button onclick="openVerificationForStaff('${s.email}', ${s.id}, '${s.verification_expires}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-emerald-900/20 hover:border-emerald-500/30 hover:text-emerald-300" title="Send Verification">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>
                ` : ''}
                <button onclick="openHistoryModal(${s.id}, '${safeFullName}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-teal-900/20 hover:border-teal-500/30 hover:text-teal-300" title="History">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </button>
                ${!isSoftDeleted && !isSuspended ? `
                    <button onclick="openEditStaffModal(${s.id})" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-blue-900/20 hover:border-blue-500/30 hover:text-blue-300" title="Edit Staff">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                ` : ''}
                ${!isSoftDeleted ? `
                    ${s.is_suspended ? `
                        <button onclick="openSuspensionDetailsModal(${s.id}, '${safeFullName}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-slate-800 hover:border-slate-500 hover:text-white" title="Suspension Details">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </button>
                        <button onclick="openLiftSuspensionModal(${s.id}, '${safeFullName}')" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-emerald-900/20 hover:border-emerald-500/30 hover:text-emerald-300" title="Restore Access">
                            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9"></path><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v6h6"></path></svg>
                        </button>
                    ` : `
                        <button onclick="openSuspensionModal(${s.id}, '${safeFullName}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-orange-900/20 hover:border-orange-500/30 hover:text-orange-300" title="Suspend Staff">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><line x1="5.636" y1="18.364" x2="18.364" y2="5.636" stroke="currentColor" stroke-width="2"></line></svg>
                        </button>
                    `}
                ` : ''}
                ${isSoftDeleted ? `
                    <button onclick="openRestoreDeletedStaffModal(${s.id}, '${safeFullName}')" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-emerald-900/20 hover:border-emerald-500/30 hover:text-emerald-300" title="Restore Staff">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9"></path><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v6h6"></path></svg>
                    </button>
                    ${permanentDeleteEligible ? `<button onclick="openPermanentDeleteStaffModal(${s.id}, '${safeFullName}', '${roleDisplay}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-rose-900/20 hover:border-rose-500/30 hover:text-rose-300" title="Permanently Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>` : `<button disabled class="p-2 rounded-lg border border-slate-700 text-slate-500 bg-slate-900/30 cursor-not-allowed opacity-70" title="${permanentDeleteDaysRemaining ? `Permanent delete available in ${permanentDeleteDaysRemaining} day${permanentDeleteDaysRemaining === 1 ? '' : 's'}` : 'Permanent delete not available yet'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>`}
                ` : `
                    <button onclick="openDeleteStaffModal(${s.id}, '${safeFullName}', '${roleDisplay}')" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-rose-900/20 hover:border-rose-500/30 hover:text-rose-300" title="Delete Staff">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                `}
            </div>
        </td>
    `;
}

function populateStaffTable(staff) {
    const tbody = document.getElementById(DOM_IDS.staffTableBody);
    if (!tbody) return;

    if (staff.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-slate-400 text-sm">
                    No staff members found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = staff.map(s => {
        const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
        const initialBadge = buildSidebarStyleInitialBadge(fullName);
        const roleDisplay = formatRoleLabel(s.role);
        const safeFullName = escapeForSingleQuotedAttr(fullName);
        const roleColorClass = s.role === 'incident_staff' ? 'text-blue-400' : 'text-amber-400';
        const {
            isSoftDeleted,
            isSuspended,
            isInactive,
            isVerified,
            derivedStatus
        } = getStaffUiFlags(s);
        const { permanentDeleteEligible, permanentDeleteDaysRemaining } = isSoftDeleted
            ? getSoftDeleteRetentionState(s.deleted_at)
            : { permanentDeleteEligible: false, permanentDeleteDaysRemaining: null };
        const {
            statusText,
            statusBg,
            statusBorder,
            statusTextColor,
            statusDotColor
        } = getStaffStatusPresentation(derivedStatus);
        const createdAtText = formatLongDate(s.created_at);
        const updatedAtText = formatRelativeTime(s.updated_at);
        const deletedAtText = isSoftDeleted ? formatDateTime(s.deleted_at) : '-';
        const deleteAvailabilityText = isSoftDeleted
            ? (permanentDeleteEligible
                ? 'Permanent delete available now'
                : (permanentDeleteDaysRemaining
                    ? `Permanent delete in ${permanentDeleteDaysRemaining} day${permanentDeleteDaysRemaining === 1 ? '' : 's'}`
                    : 'Permanent delete pending'))
            : '';

        return `
            <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        ${initialBadge}
                        <div>
                            <div class="font-bold text-white text-sm">${s.first_name} ${s.last_name}</div>
                            <div class="text-[10px] text-slate-500 mt-0.5 font-mono">${s.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold ${roleColorClass}">${roleDisplay}</div>
                </td>
                ${buildStaffStatusCell({ s, isVerified, isSuspended, isSoftDeleted, statusText, statusBg, statusTextColor, statusBorder, statusDotColor })}
                ${buildStaffActivityCell({ createdAtText, updatedAtText })}
                ${buildStaffDeletedCell({ isSoftDeleted, deletedAtText, permanentDeleteEligible, deleteAvailabilityText })}
                ${buildStaffActionsCell({ s, safeFullName, roleDisplay, isSoftDeleted, isSuspended, permanentDeleteEligible, permanentDeleteDaysRemaining })}
            </tr>
        `;
    }).join('');
}

function applyFiltersAndSearch(resetPage = false) {
    if (resetPage) {
        staffPagination.page = 1;
    }
    renderStaffState();
}

// ════════════════════════════════════════════════════════════════
// SECTION 7: DATA LOADING & PAGE INITIALIZATION
// ════════════════════════════════════════════════════════════════

async function loadStaffData() {
    setStaffTableState('Loading staff from database...');

    try {
        const response = await fetch(API_ROUTES.staffList);
        const data = await response.json();

        if (response.ok && Array.isArray(data.data)) {
            staffState = data.data.filter(isStrictStaffRole);
            staffPagination.page = 1;
            updateSummaryStats();
            renderStaffState();
        } else {
            console.error('Error loading staff:', data.error);
            setStaffTableState('Failed to load staff data.', true);
            updatePaginationInfo(0);
        }
    } catch (error) {
        console.error('Network error:', error);
        setStaffTableState('Error loading staff data. Please refresh the page.', true);
        updatePaginationInfo(0);
    }
}

function initializeEventListeners() {
    // Form submission
    const addStaffForm = document.getElementById(DOM_IDS.addStaffForm);
    if (addStaffForm) {
        addStaffForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAddStaffSubmit();
        });
    }

    const editStaffForm = document.getElementById(DOM_IDS.editStaffForm);
    if (editStaffForm) {
        editStaffForm.addEventListener('submit', handleEditStaffFormSubmit);
    }

    // Search and filter
    const searchInput = document.getElementById(DOM_IDS.staffSearchInput);
    if (searchInput) {
        searchInput.addEventListener('input', () => applyFiltersAndSearch(true));
    }

    const roleFilter = document.getElementById(DOM_IDS.staffRoleFilter);
    if (roleFilter) {
        roleFilter.addEventListener('change', () => applyFiltersAndSearch(true));
    }

    const statusFilter = document.getElementById(DOM_IDS.staffStatusFilter);
    if (statusFilter) {
        statusFilter.addEventListener('change', () => applyFiltersAndSearch(true));
    }

    // Verification code inputs
    setupVerificationCodeInputs();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadStaffData();
});

window.goToStaffPage = function goToStaffPage(page) {
    const target = Number(page);
    if (!Number.isFinite(target)) return;

    const totalPages = Math.max(1, Math.ceil(filteredStaffState.length / staffPagination.limit));
    if (target < 1 || target > totalPages) return;

    staffPagination.page = target;
    renderStaffState();
};