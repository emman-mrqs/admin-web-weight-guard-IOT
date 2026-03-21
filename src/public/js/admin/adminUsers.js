// ===========================================
// USER MANAGEMENT - MODERN FRONTEND
// ===========================================
// 
// FILE STRUCTURE OVERVIEW:
// 1. Modal Display & Control Functions
// 2. Password Visibility & Generation
// 3. Verification & Email Confirmation with Timer
// 4. Edit User Modal - Form Management
// 5. Delete User Modal - Confirmation
// 6. Suspension Creation - Modal & Form
// 7. Suspension Data - Configuration
// 8. Suspension Details View - Display
// 9. Lift Suspension - Restore User Access
// 10. Utility Helpers - Form Reset
// 11. User Data Fetching & Display
// 12. Page Initialization - DOM Setup with API integration
//
// ===========================================

// ════════════════════════════════════════════════════════════════
// SECTION 1: MODAL DISPLAY & CONTROL FUNCTIONS
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

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
        openModal(modalId);
    } else {
        closeModal(modalId);
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 2: PASSWORD VISIBILITY & GENERATION
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// SECTION 3: VERIFICATION & EMAIL CONFIRMATION WITH COUNTDOWN TIMER
// ════════════════════════════════════════════════════════════════

let verificationTimerInterval = null;
let verificationInputsInitialized = false;
let usersState = [];
const usersPagination = {
    page: 1,
    limit: 10
};

function escapeForSingleQuotedAttr(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

function upsertUserInState(user) {
    if (!user || !user.id) return;

    const existingIndex = usersState.findIndex(u => Number(u.id) === Number(user.id));
    if (existingIndex === -1) {
        usersState.unshift(user);
        return;
    }

    usersState[existingIndex] = {
        ...usersState[existingIndex],
        ...user
    };
}

function renderUsersState() {
    const { pagedUsers } = getPaginatedUsers();
    populateUsersTable(pagedUsers);
    updateSummaryStats(usersState);
    updatePaginationInfo();
}

function getPaginatedUsers(totalEntriesOverride = null) {
    const totalEntries = Number.isFinite(totalEntriesOverride) ? Number(totalEntriesOverride) : usersState.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / usersPagination.limit));

    if (usersPagination.page > totalPages) {
        usersPagination.page = totalPages;
    }

    const startIndex = totalEntries === 0 ? 0 : (usersPagination.page - 1) * usersPagination.limit;
    const endIndex = Math.min(startIndex + usersPagination.limit, totalEntries);
    const pagedUsers = totalEntries === 0 ? [] : usersState.slice(startIndex, endIndex);

    return {
        pagedUsers,
        totalEntries,
        totalPages,
        startIndex,
        endIndex,
        page: usersPagination.page
    };
}

function setUsersTableState(message, isError = false) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const colorClass = isError ? 'text-rose-400' : 'text-slate-400';
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-8 text-center ${colorClass} text-sm">${message}</td>
        </tr>
    `;
}

function updatePaginationInfo(totalEntries = usersState.length) {
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');
    if (!paginationInfo || !paginationControls) return;

    const { totalPages, startIndex, endIndex, page } = getPaginatedUsers(totalEntries);

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

        return `<button onclick="goToUsersPage(${p})" class="${cls}">${p}</button>`;
    };

    const makeArrowBtn = (targetPage, direction, disabled = false) => {
        const path = direction === 'prev' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7';
        const baseCls = disabled
            ? 'p-2 rounded-lg border border-slate-700 text-slate-500 opacity-50 cursor-not-allowed bg-slate-800/50'
            : 'p-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition';
        const clickAttr = disabled ? '' : `onclick="goToUsersPage(${targetPage})"`;

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

function setupVerificationCodeInputs() {
    if (verificationInputsInitialized) return;

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

        // ─── ALLOW PASTING 6-DIGIT CODE ───
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const digits = pastedText.replace(/\D/g, '').slice(0, 6);
            
            // Fill the digit inputs with pasted digits
            for (let i = 0; i < digits.length && i < inputs.length; i++) {
                const inputElement = document.getElementById(inputs[i]);
                if (inputElement) {
                    inputElement.value = digits[i];
                }
            }
            
            // Focus on the last filled input or the next empty one
            const lastIndex = Math.min(digits.length, inputs.length - 1);
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

    // ─── MINIMAL UI VALIDATION ───
    if (!email || !code) {
        displayError(errorEl, 'Please enter the verification code.');
        return;
    }

    const restoreSubmitButton = setButtonLoading(submitBtn, 'Verifying');

    try {
        // ─── SEND TO BACKEND - LET IT VALIDATE ───
        const response = await fetch('/users/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                verificationCode: code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // ─── WIRE BACKEND ERROR RESPONSE ───
            displayError(errorEl, data.error);
        } else {
            // ─── SUCCESS: WIRE BACKEND SUCCESS MESSAGE ───
            displaySuccess(successEl, data.message);
            
            if (verificationTimerInterval) {
                clearInterval(verificationTimerInterval);
            }

            setTimeout(() => {
                closeModal('verificationModal');
                resetVerificationCode();
                const addForm = document.getElementById('addUserForm');
                if (addForm) addForm.reset();
                const userInState = usersState.find(u => String(u.email).toLowerCase() === email.toLowerCase());
                if (userInState) {
                    userInState.is_verified = true;
                    renderUsersState();
                }
            }, 1200);
        }
    } catch (error) {
        console.error('Verification error:', error);
        displayError(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        restoreSubmitButton();
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

    // ─── MINIMAL UI VALIDATION ───
    if (!email) {
        displayError(errorEl, 'Email is missing. Please close and try again.');
        return;
    }

    const restoreResendButton = setButtonLoading(resendBtn, 'Sending');

    try {
        // ─── SEND TO BACKEND - LET IT VALIDATE & PROCESS ───
        const response = await fetch('/users/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (!response.ok) {
            // ─── WIRE BACKEND ERROR RESPONSE ───
            displayError(errorEl, data.error);
        } else {
            // ─── SUCCESS: WIRE BACKEND SUCCESS MESSAGE ───
            displaySuccess(successEl, data.message);
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

function openVerificationForUser(userEmailOrId, verificationExpiresAt = null) {
    let resolvedEmail = '';
    let resolvedVerificationExpiresAt = verificationExpiresAt;

    if (typeof userEmailOrId === 'number' || /^\d+$/.test(String(userEmailOrId))) {
        const userRow = document.querySelector(`[data-user-id="${userEmailOrId}"]`);
        resolvedEmail = userRow?.querySelector('[data-field="email"]')?.textContent?.trim() || '';
    } else {
        resolvedEmail = String(userEmailOrId || '').trim();
    }

    if (!resolvedVerificationExpiresAt && resolvedEmail) {
        const userInState = usersState.find(u => String(u.email || '').toLowerCase() === resolvedEmail.toLowerCase());
        resolvedVerificationExpiresAt = userInState?.verification_expires || null;
    }

    if (!resolvedEmail) {
        console.error('Unable to resolve user email for verification:', userEmailOrId);
        return;
    }

    const verificationEmail = document.getElementById('verificationEmail');
    if (verificationEmail) {
        verificationEmail.textContent = resolvedEmail;
    }

    resetVerificationCode();
    setupVerificationCodeInputs();
    openModal('verificationModal');
    startVerificationTimer(resolvedVerificationExpiresAt);
    setTimeout(() => document.getElementById('verifyDigit1').focus(), 300);
}

// ════════════════════════════════════════════════════════════════
// SECTION 4: EDIT USER MODAL - FORM MANAGEMENT
// ════════════════════════════════════════════════════════════════

function openEditUserModal(userId) {
    const user = usersState.find(u => Number(u.id) === Number(userId));
    if (!user) return;

    const isVerified = Boolean(user.is_verified);

    document.getElementById('editUserId').value = userId;
    document.getElementById('editFirstName').value = user.first_name;
    document.getElementById('editLastName').value = user.last_name;
    document.getElementById('editEmail').value = user.email;

    const statusEl = document.getElementById('editStatus');

    if (statusEl) {
        const pendingOption = statusEl.querySelector('option[value="pending"]');
        if (pendingOption) {
            pendingOption.disabled = true;
            pendingOption.hidden = true;
        }

        if (isVerified) {
            const normalizedStatus = String(user.status || 'active').toLowerCase();
            statusEl.value = normalizedStatus === 'inactive' ? 'inactive' : 'active';
            statusEl.disabled = false;
        } else {
            // Unverified users cannot be switched; keep dropdown visible but locked.
            statusEl.value = 'pending';
            statusEl.disabled = true;
        }
    }

    openModal('editUserModal');
}

// ════════════════════════════════════════════════════════════════
// SECTION 5: DELETE USER MODAL - CONFIRMATION
// ════════════════════════════════════════════════════════════════

function openDeleteUserModal(userId, userName) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteUserName').textContent = userName;
    document.getElementById('deleteActionMode').value = 'soft-delete';
    document.getElementById('deleteModalTitle').textContent = 'Soft Delete User Account?';
    document.getElementById('deleteModalDescription').textContent = 'This user will be hidden from active operations and can be restored within 30 days.';
    document.getElementById('deleteModalConfirmText').textContent = 'Soft Delete User';
    document.getElementById('deleteFormError').classList.add('hidden');
    document.getElementById('deleteFormSuccess').classList.add('hidden');
    openModal('deleteUserModal');
}

function openPermanentDeleteUserModal(userId, userName) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteUserName').textContent = userName;
    document.getElementById('deleteActionMode').value = 'permanent-delete';
    document.getElementById('deleteModalTitle').textContent = 'Permanently Delete User?';
    document.getElementById('deleteModalDescription').textContent = 'This action cannot be undone. Related references configured with ON DELETE SET NULL/CASCADE will be applied.';
    document.getElementById('deleteModalConfirmText').textContent = 'Permanently Delete';
    document.getElementById('deleteFormError').classList.add('hidden');
    document.getElementById('deleteFormSuccess').classList.add('hidden');
    openModal('deleteUserModal');
}

async function confirmDeleteUser() {
    const userId = document.getElementById('deleteUserId').value;
    const actionMode = document.getElementById('deleteActionMode').value;
    const errorEl = document.getElementById('deleteFormError');
    const successEl = document.getElementById('deleteFormSuccess');
    const submitBtn = document.querySelector('#deleteUserModal button[onclick="confirmDeleteUser()"]');

    clearMessages(errorEl, successEl);

    const loadingLabel = actionMode === 'permanent-delete' ? 'Deleting permanently' : 'Soft deleting';
    const restoreButton = setButtonLoading(submitBtn, loadingLabel);

    try {
        const response = await fetch(`/api/admin/users/${userId}/soft-delete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to delete user.');
            return;
        }

        if (data.permanentlyDeleted) {
            usersState = usersState.filter(u => Number(u.id) !== Number(userId));
        } else if (data.user) {
            upsertUserInState(data.user);
        }

        renderUsersState();
        displaySuccess(successEl, data.message || 'User deleted successfully.');

        setTimeout(() => {
            closeModal('deleteUserModal');
        }, 1000);
    } catch (error) {
        console.error('Error deleting user:', error);
        displayError(errorEl, 'Connection error. Please try again.');
    } finally {
        restoreButton();
    }
}

function openRestoreDeletedUserModal(userId, userName) {
    document.getElementById('restoreDeletedUserId').value = userId;
    document.getElementById('restoreDeletedUserName').textContent = userName;
    document.getElementById('restoreDeletedFormError').classList.add('hidden');
    document.getElementById('restoreDeletedFormSuccess').classList.add('hidden');
    openModal('restoreDeletedUserModal');
}

async function confirmRestoreDeletedUser() {
    const userId = document.getElementById('restoreDeletedUserId').value;
    const errorEl = document.getElementById('restoreDeletedFormError');
    const successEl = document.getElementById('restoreDeletedFormSuccess');
    const submitBtn = document.querySelector('#restoreDeletedUserModal button[onclick="confirmRestoreDeletedUser()"]');

    clearMessages(errorEl, successEl);

    const restoreButton = setButtonLoading(submitBtn, 'Restoring');

    try {
        const response = await fetch(`/api/admin/users/${userId}/restore-soft-delete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            displayError(errorEl, data.error || 'Failed to restore user.');
            return;
        }

        if (data.user) {
            upsertUserInState(data.user);
            renderUsersState();
        }

        displaySuccess(successEl, data.message || 'User restored successfully.');
        setTimeout(() => {
            closeModal('restoreDeletedUserModal');
        }, 1000);
    } catch (error) {
        console.error('Error restoring user:', error);
        displayError(errorEl, 'Connection error. Please try again.');
    } finally {
        restoreButton();
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 6: SUSPENSION CREATION - MODAL & FORM
// ════════════════════════════════════════════════════════════════

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

    fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'PUT',
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
                errorEl.textContent = data.error || 'Failed to suspend user.';
                errorEl.classList.remove('hidden');
                return;
            }

            if (data.user) {
                upsertUserInState(data.user);
                renderUsersState();
            }

            successEl.textContent = data.message || 'User suspended successfully.';
            successEl.classList.remove('hidden');

            setTimeout(() => {
                closeModal('suspensionModal');
                resetSuspensionForm();
            }, 1200);
        })
        .catch((error) => {
            console.error('Error suspending user:', error);
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.remove('hidden');
        })
        .finally(() => {
            restoreButton();
        });
}

// ════════════════════════════════════════════════════════════════
// SECTION 8: SUSPENSION DETAILS VIEW - DISPLAY
// ════════════════════════════════════════════════════════════════

async function openSuspensionDetailsModal(userId, userName) {
    const detailsUserName = document.getElementById('detailsUserName');
    const detailsBanType = document.getElementById('detailsBanType');
    const detailsReason = document.getElementById('detailsReason');
    const permanentSection = document.getElementById('detailsPermanentDates');
    const temporarySection = document.getElementById('detailsTemporaryDates');

    if (detailsUserName) detailsUserName.textContent = userName;
    if (detailsBanType) {
        detailsBanType.textContent = 'LOADING';
        detailsBanType.className = 'text-slate-400 font-bold mt-1';
    }
    if (detailsReason) detailsReason.textContent = 'Loading suspension details...';
    if (permanentSection) permanentSection.classList.add('hidden');
    if (temporarySection) temporarySection.classList.add('hidden');

    openModal('suspensionDetailsModal');

    try {
        const response = await fetch(`/api/admin/users/${userId}/suspension-details`);
        const data = await response.json();

        if (!response.ok) {
            if (detailsReason) detailsReason.textContent = data.error || 'Unable to load suspension details.';
            return;
        }

        const details = data.details || {};
        const isPermanent = String(details.type || '').toLowerCase() === 'permanent';

        if (detailsUserName) detailsUserName.textContent = details.fullName || userName;
        if (detailsBanType) {
            detailsBanType.textContent = isPermanent ? 'PERMANENT BAN' : 'TEMPORARY';
            detailsBanType.className = isPermanent ? 'text-rose-400 font-bold mt-1' : 'text-blue-400 font-bold mt-1';
        }
        if (detailsReason) detailsReason.textContent = details.reason || 'No reason provided.';

        if (permanentSection) permanentSection.classList.toggle('hidden', !isPermanent);
        if (temporarySection) temporarySection.classList.toggle('hidden', isPermanent);

        if (isPermanent) {
            document.getElementById('detailsSuspendedDate').textContent = formatDateTime(details.startedAt);
        } else {
            document.getElementById('detailsStartDate').textContent = formatDateTime(details.startedAt);
            document.getElementById('detailsEndDate').textContent = formatDateTime(details.endedAt);
        }
    } catch (error) {
        console.error('Error loading suspension details:', error);
        if (detailsReason) detailsReason.textContent = 'Connection error. Please try again.';
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 9: LIFT SUSPENSION - RESTORE USER ACCESS
// ════════════════════════════════════════════════════════════════

async function openLiftSuspensionModal(userId, userName) {
    document.getElementById('liftUserId').value = userId;
    document.getElementById('liftUserName').textContent = userName;
    document.getElementById('liftBanType').textContent = 'Loading...';
    document.getElementById('liftError').classList.add('hidden');
    document.getElementById('liftSuccess').classList.add('hidden');

    openModal('liftSuspensionModal');

    try {
        const response = await fetch(`/api/admin/users/${userId}/suspension-details`);
        const data = await response.json();

        if (!response.ok) {
            document.getElementById('liftError').textContent = data.error || 'Unable to load suspension information.';
            document.getElementById('liftError').classList.remove('hidden');
            return;
        }

        const type = String(data.details?.type || 'temporary').toLowerCase();
        document.getElementById('liftBanType').textContent = type === 'permanent' ? 'PERMANENT BAN' : 'TEMPORARY';
    } catch (error) {
        console.error('Error loading lift suspension details:', error);
        document.getElementById('liftError').textContent = 'Connection error. Please try again.';
        document.getElementById('liftError').classList.remove('hidden');
    }
}

async function confirmLiftSuspension() {
    const userId = document.getElementById('liftUserId').value;
    const errorEl = document.getElementById('liftError');
    const successEl = document.getElementById('liftSuccess');
    const submitBtn = document.querySelector('#liftSuspensionModal button[onclick="confirmLiftSuspension()"]');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const restoreButton = setButtonLoading(submitBtn, 'Restoring');

    try {
        const response = await fetch(`/api/admin/users/${userId}/lift-suspension`, {
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

        if (data.user) {
            upsertUserInState(data.user);
            renderUsersState();
        }

        successEl.textContent = data.message || 'Suspension lifted. User account is active.';
        successEl.classList.remove('hidden');

        setTimeout(() => closeModal('liftSuspensionModal'), 1200);
    } catch (error) {
        console.error('Error lifting suspension:', error);
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        restoreButton();
    }
}

// ════════════════════════════════════════════════════════════════
// SECTION 10: USER DATA FETCHING & DISPLAY
// ════════════════════════════════════════════════════════════════

async function fetchAllUsers() {
    setUsersTableState('Loading users from database...');

    try {
        const response = await fetch('/api/admin/users');
        const result = await response.json();

        if (!response.ok) {
            console.error('Error fetching users:', result.error);
            setUsersTableState('Unable to load users right now. Please refresh.', true);
            updatePaginationInfo(0);
            return;
        }

        usersState = result.data || [];
        usersPagination.page = 1;
        renderUsersState();
    } catch (error) {
        console.error('Error fetching users:', error);
        setUsersTableState('Unable to load users right now. Please refresh.', true);
        updatePaginationInfo(0);
    }
}

function populateUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    // Clear existing rows except if we want to keep some template
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 text-sm">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const safeEmail = escapeForSingleQuotedAttr(user.email);
        const safeFullName = escapeForSingleQuotedAttr(`${user.first_name} ${user.last_name}`);
        const verificationExpiresArg = user.verification_expires
            ? `'${escapeForSingleQuotedAttr(user.verification_expires)}'`
            : 'null';
        const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
        const isVerified = Boolean(user.is_verified);
        const normalizedStatus = String(user.status || '').toLowerCase();
        const isSoftDeleted = Boolean(user.deleted_at);
        const isSuspended = Boolean(user.is_suspended) || normalizedStatus === 'suspended';
        const isInactive = normalizedStatus === 'inactive';
        const hasAssignment = Boolean(user.vehicle_id);
        const permanentDeleteEligible = isSoftDeleted && ((Date.now() - new Date(user.deleted_at).getTime()) >= (30 * 24 * 60 * 60 * 1000));

        const statusText = isSoftDeleted ? 'DELETED' : (isSuspended ? 'SUSPENDED' : (isInactive ? 'INACTIVE' : (isVerified ? 'ACTIVE' : 'PENDING')));
        const statusBg = isSoftDeleted
            ? 'bg-slate-800/90'
            : (isSuspended
            ? 'bg-rose-500/10'
            : (isInactive ? 'bg-slate-800/80' : (isVerified ? 'bg-emerald-500/10' : 'bg-amber-500/10')));
        const statusBorder = isSoftDeleted
            ? 'border-slate-600/60'
            : (isSuspended
            ? 'border-rose-500/30'
            : (isInactive ? 'border-slate-600/60' : (isVerified ? 'border-emerald-500/20' : 'border-amber-500/20')));
        const statusTextColor = isSoftDeleted
            ? 'text-slate-300'
            : (isSuspended
            ? 'text-rose-400'
            : (isInactive ? 'text-slate-300' : (isVerified ? 'text-emerald-400' : 'text-amber-400')));
        const dot = isSoftDeleted
            ? 'bg-slate-400'
            : (isSuspended
            ? 'bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,0.8)]'
            : (isInactive
                ? 'bg-slate-400'
                : (isVerified ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]' : 'bg-amber-400')));

        const assignmentBadgeClass = hasAssignment
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-slate-800 text-slate-400 border border-slate-700';
        const assignmentLabel = hasAssignment
            ? (String(user.vehicle_state || '').toUpperCase() || 'ASSIGNED')
            : 'UNASSIGNED';
        const assignmentPlate = hasAssignment ? user.vehicle_plate_number : '—';
        const assignmentTruckName = hasAssignment ? (user.vehicle_type || 'Unknown Truck') : '';
        const createdAtText = formatLongDate(user.created_at);
        const updatedAtText = formatRelativeTime(user.updated_at);
        const deletedAtText = isSoftDeleted ? formatDateTime(user.deleted_at) : '-';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-800/40 transition-colors group';
        row.setAttribute('data-user-id', user.id);

        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xs">${initials}</div>
                    <div>
                        <div class="font-bold text-white text-sm" data-field="name">${user.first_name} ${user.last_name}</div>
                        <div class="text-xs text-slate-500 mt-0.5" data-field="email">${user.email}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold w-fit mb-1 ${assignmentBadgeClass}">${assignmentLabel}</span>
                ${hasAssignment ? `<span class="text-xs text-slate-300 font-mono block">${assignmentPlate}</span><span class="text-[10px] text-slate-500 block mt-0.5">${assignmentTruckName}</span>` : ''}
            </td>
            <td class="px-6 py-4" data-field="status">
                <div class="flex flex-col gap-2">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${statusBg} ${statusTextColor} border ${statusBorder} text-[10px] font-bold tracking-wide w-fit">
                        <span class="w-1.5 h-1.5 rounded-full ${dot}"></span>
                        ${statusText}
                    </span>
                    ${!isVerified && !isSuspended && !isSoftDeleted ? '<span class="text-[10px] text-slate-400">Verification Required</span>' : ''}
                </div>
            </td>
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
            <td class="px-6 py-4">
                <span class="text-[10px] ${isSoftDeleted ? 'text-rose-300' : 'text-slate-500'} font-mono">${deletedAtText}</span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    ${!isVerified && !isSoftDeleted ? `<button onclick="openVerificationForUser('${safeEmail}', ${verificationExpiresArg})" class="p-2 text-emerald-400 hover:text-emerald-300 transition bg-emerald-900/20 rounded-lg border border-emerald-500/30" title="Send Verification">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>` : ''}
                    <button onclick="openModal('historyModal')" class="p-2 text-teal-400 hover:text-teal-300 transition bg-teal-900/20 rounded-lg border border-teal-500/30" title="History">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    </button>
                    ${!isSuspended && !isSoftDeleted ? `<button onclick="openEditUserModal(${user.id})" class="p-2 text-blue-400 hover:text-blue-300 transition bg-blue-900/20 rounded-lg border border-blue-500/30" title="Edit User">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>` : ''}
                    ${isSoftDeleted ? `
                    <button onclick="openRestoreDeletedUserModal(${user.id}, '${safeFullName}')" class="w-9 h-9 inline-flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition bg-emerald-900/20 rounded-lg border border-emerald-500/30" title="Restore User">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9"></path><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v6h6"></path></svg>
                    </button>
                    ${permanentDeleteEligible ? `<button onclick="openPermanentDeleteUserModal(${user.id}, '${safeFullName}')" class="p-2 text-rose-400 hover:text-rose-300 transition bg-rose-900/20 rounded-lg border border-rose-500/30" title="Permanently Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>` : ''}
                    ` : isSuspended ? `
                    <button onclick="openSuspensionDetailsModal(${user.id}, '${safeFullName}')" class="p-2 text-slate-300 hover:text-white transition bg-slate-800/70 rounded-lg border border-slate-600/70" title="Suspension Details">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </button>
                    <button onclick="openLiftSuspensionModal(${user.id}, '${safeFullName}')" class="w-9 h-9 inline-flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition bg-emerald-900/20 rounded-lg border border-emerald-500/30" title="Restore Access">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9"></path><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v6h6"></path></svg>
                    </button>
                    ` : `
                    <button onclick="openSuspensionModal(${user.id}, '${safeFullName}')" class="p-2 text-orange-400 hover:text-orange-300 transition bg-orange-900/20 rounded-lg border border-orange-500/30" title="Suspend User">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><line x1="5.636" y1="18.364" x2="18.364" y2="5.636" stroke="currentColor" stroke-width="2"></line></svg>
                    </button>
                    `}
                    ${!isSoftDeleted ? `<button onclick="openDeleteUserModal(${user.id}, '${safeFullName}')" class="p-2 text-red-500 hover:text-red-400 transition bg-red-900/20 rounded-lg border border-red-500/30" title="Soft Delete User">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>` : ''}
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function updateSummaryStats(users) {
    const visibleUsers = users.filter(u => !u.deleted_at);
    const totalUsers = visibleUsers.length;
    const activeUsers = visibleUsers.filter(u => {
        const status = String(u.status || '').toLowerCase();
        return Boolean(u.is_verified) && !Boolean(u.is_suspended) && status !== 'suspended' && status !== 'inactive';
    }).length;
    const unassignedUsers = visibleUsers.filter(u => !u.vehicle_id).length;
    const suspendedUsers = visibleUsers.filter(u => Boolean(u.is_suspended) || String(u.status || '').toLowerCase() === 'suspended').length;

    document.getElementById('summaryTotalUsers').textContent = totalUsers;
    document.getElementById('summaryActiveUsers').textContent = activeUsers;
    document.getElementById('summaryUnassigned').textContent = unassignedUsers;
    document.getElementById('summarySuspendedUsers').textContent = suspendedUsers;
}

// ════════════════════════════════════════════════════════════════
// SECTION 11: PAGE INITIALIZATION - DOM SETUP
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// SECTION 12: ADD USER - ASYNC FORM SUBMISSION WITH LOADING STATE
// ════════════════════════════════════════════════════════════════

async function handleAddUserFormSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('addUserForm');
    if (!form) return;

    const firstName = form.querySelector('input[name="firstName"]').value.trim();
    const lastName = form.querySelector('input[name="lastName"]').value.trim();
    const email = form.querySelector('input[name="email"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;
    const confirmPassword = form.querySelector('input[name="confirmPassword"]').value;

    const errorEl = document.getElementById('formError');
    const successEl = document.getElementById('formSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    clearMessages(errorEl, successEl);

    // ─── MINIMAL UI VALIDATION ─ ONLY CHECK EMPTY FIELDS ───
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        displayError(errorEl, 'All fields are required.');
        return;
    }

    const restoreSubmitButton = setButtonLoading(submitBtn, 'Creating account');

    try {
        // ─── SEND TO BACKEND ─ LET IT VALIDATE ALL BUSINESS RULES ───
        // Backend will validate: password length, password match, email format, email exists, etc.
        const response = await fetch('/users/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fName: firstName,
                lName: lastName,
                email: email,
                password: password,
                confirmPassword: confirmPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // ─── WIRE BACKEND ERROR RESPONSE ───
            displayError(errorEl, data.error);
            console.error('Signup error:', data);
        } else {
            // ─── SUCCESS: WIRE BACKEND SUCCESS MESSAGE ───
            displaySuccess(successEl, data.message);

            if (data.user) {
                upsertUserInState(data.user);
                renderUsersState();
            }

            // Wait briefly then transition to verification modal
            setTimeout(() => {
                closeModal('addUserModal');
                form.reset();
                openVerificationForUser(email, data.verificationExpiresAt);
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
// SECTION 12B: EDIT USER - ASYNC FORM SUBMISSION
// ════════════════════════════════════════════════════════════════

async function handleEditUserFormSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('editUserForm');
    const userId = document.getElementById('editUserId').value;
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const statusEl = document.getElementById('editStatus');

    const errorEl = document.getElementById('editFormError');
    const successEl = document.getElementById('editFormSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    clearMessages(errorEl, successEl);

    // ─── MINIMAL UI VALIDATION ───
    if (!firstName || !lastName) {
        displayError(errorEl, 'First name and last name are required.');
        return;
    }

    const restoreSubmitButton = setButtonLoading(submitBtn, 'Saving changes');

    try {
        // ─── BUILD REQUEST BODY ───
        const requestBody = {
            firstName: firstName,
            lastName: lastName
        };

        const userInState = usersState.find(u => Number(u.id) === Number(userId));
        const canEditStatus = Boolean(userInState && userInState.is_verified);

        // ─── ONLY VERIFIED USERS CAN CHANGE STATUS; NEVER ALLOW PENDING ───
        if (canEditStatus && statusEl) {
            const selectedStatus = String(statusEl.value || '').toLowerCase();
            if (selectedStatus === 'pending') {
                displayError(errorEl, 'Pending status cannot be set manually.');
                return;
            }
            requestBody.status = selectedStatus;
        }

        // ─── SEND TO BACKEND ───
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            // ─── WIRE BACKEND ERROR RESPONSE ───
            displayError(errorEl, data.error);
            console.error('Edit error:', data);
        } else {
            // ─── SUCCESS: UPDATE STATE & RENDER ───
            displaySuccess(successEl, data.message);

            // Update local state with returning user data
            if (data.user) {
                upsertUserInState(data.user);
                renderUsersState();
            }

            setTimeout(() => {
                closeModal('editUserModal');
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
// PAGE INITIALIZATION - DOM SETUP WITH EVENT LISTENERS
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Fetch all users on page load
    await fetchAllUsers();

    // ─── ADD USER FORM HANDLER ───
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', handleAddUserFormSubmit);
    }

    // ─── EDIT USER FORM HANDLER ───
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleEditUserFormSubmit);
    }

    // Setup verification code inputs on page load
    setupVerificationCodeInputs();
});

window.goToUsersPage = function goToUsersPage(page) {
    const target = Number(page);
    if (!Number.isFinite(target)) return;

    const totalPages = Math.max(1, Math.ceil(usersState.length / usersPagination.limit));
    if (target < 1 || target > totalPages) return;

    usersPagination.page = target;
    renderUsersState();
};

window.resendVerificationCode = resendVerificationCode;
