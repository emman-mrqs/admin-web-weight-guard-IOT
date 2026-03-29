const btnSpinner = `
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
`;

const state = {
    email: '',
    verificationCode: ''
};

let resendTimerInterval = null;

const getErrorElement = (step) => document.getElementById(`forget-password-error-${step}`);

function showStepError(step, message, isSuccess = false) {
    const errorEl = getErrorElement(step);
    if (!errorEl) return;

    errorEl.textContent = message;
    
    // Toggle styles based on success/error state
    if (isSuccess) {
        errorEl.classList.remove('text-rose-400');
        errorEl.classList.add('text-emerald-400');
    } else {
        errorEl.classList.remove('text-emerald-400');
        errorEl.classList.add('text-rose-400');
    }
    
    errorEl.classList.remove('hidden');
}

function clearStepError(step) {
    const errorEl = getErrorElement(step);
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    // Reset to default error color just in case
    errorEl.classList.remove('text-emerald-400');
    errorEl.classList.add('text-rose-400');
}

function switchStep(fromStepId, toStepId) {
    document.getElementById(fromStepId)?.classList.add('hidden');
    document.getElementById(toStepId)?.classList.remove('hidden');
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

// --- Start Cooldown Timer ---
function startResendCooldown() {
    const resendBtn = document.getElementById('resend-btn');
    let timeLeft = 60;

    resendBtn.disabled = true;
    resendBtn.classList.remove('text-emerald-400', 'hover:text-emerald-300');
    resendBtn.classList.add('text-slate-500');

    clearInterval(resendTimerInterval);

    resendTimerInterval = setInterval(() => {
        timeLeft--;
        resendBtn.textContent = `Resend Code (${timeLeft}s)`;

        if (timeLeft <= 0) {
            clearInterval(resendTimerInterval);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
            resendBtn.classList.add('text-emerald-400', 'hover:text-emerald-300');
            resendBtn.classList.remove('text-slate-500');
        }
    }, 1000);
}


async function handleSendCode(e) {
    e.preventDefault();
    const btn = document.getElementById('send-code-btn');
    const emailInput = String(document.getElementById('email')?.value || '').trim();

    clearStepError('step-1');

    btn.innerHTML = btnSpinner + ' TRANSMITTING...';
    btn.disabled = true;
    btn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        const response = await fetch('/forget-password', { // Matches your updated router
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ email: emailInput })
        });

        const payload = await parseJsonResponse(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Failed to send verification code.');
        }

        state.email = emailInput;
        document.getElementById('display-email').innerText = emailInput;
        switchStep('step-1', 'step-2');
        
        // Start cooldown on step 2
        startResendCooldown();
        
    } catch (error) {
        showStepError('step-1', error.message || 'Unable to send verification code.');
    } finally {
        btn.innerHTML = `<span>Send Code</span><svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
        btn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
}

async function handleResendCode() {
    const resendBtn = document.getElementById('resend-btn');
    clearStepError('step-2');

    resendBtn.textContent = 'Sending...';
    resendBtn.disabled = true;

    try {
        const response = await fetch('/forget/resend-code', { // Matches your updated router
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ email: state.email })
        });

        const payload = await parseJsonResponse(response);
        
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Failed to resend code.');
        }

        // Show success message inline
        showStepError('step-2', 'A new code has been sent successfully.', true);
        startResendCooldown();

    } catch (error) {
        showStepError('step-2', error.message || 'Unable to resend code.');
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend Code';
    }
}

async function handleVerifyCode(e) {
    e.preventDefault();
    const btn = document.getElementById('verify-btn');
    const verificationCode = String(document.getElementById('verification-code')?.value || '').trim();

    clearStepError('step-2');

    btn.innerHTML = btnSpinner + ' VERIFYING...';
    btn.disabled = true;
    btn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        const response = await fetch('/forget/verify-code', { // Matches your updated router
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                email: state.email,
                code: verificationCode // Updated key to match backend expectation
            })
        });

        const payload = await parseJsonResponse(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Verification failed.');
        }

        state.verificationCode = verificationCode;
        clearInterval(resendTimerInterval); // Stop timer on success
        switchStep('step-2', 'step-3');
    } catch (error) {
        showStepError('step-2', error.message || 'Unable to verify code.');
    } finally {
        btn.innerHTML = `<span>Authenticate Code</span><svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
        btn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
}

async function handleResetPassword(e) {
    e.preventDefault();

    const btn = document.getElementById('reset-password-btn');
    const newPassword = String(document.getElementById('new-password')?.value || '');
    const confirmPassword = String(document.getElementById('confirm-password')?.value || '');

    clearStepError('step-3');

    // Frontend validation just in case
    if (newPassword !== confirmPassword) {
        showStepError('step-3', 'Passwords do not match.');
        return;
    }

    btn.innerHTML = btnSpinner + ' UPDATING...';
    btn.disabled = true;
    btn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        const response = await fetch('/forget/reset-password', { // Matches your updated router
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                email: state.email,
                code: state.verificationCode, // Updated key to match backend expectation
                newPassword,
                confirmPassword
            })
        });

        const payload = await parseJsonResponse(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Unable to reset password.');
        }

        switchStep('step-3', 'step-4');
        
        // Clear sensitive data
        state.email = '';
        state.verificationCode = '';

    } catch (error) {
        showStepError('step-3', error.message || 'Unable to reset password.');
    } finally {
        btn.innerHTML = `<span>Update Password</span><svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
        btn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
}

function resetToStep1() {
    switchStep('step-2', 'step-1');
    document.getElementById('verification-code').value = '';
    
    // Clear state
    state.verificationCode = '';
    state.email = '';
    
    // Stop any active timers
    clearInterval(resendTimerInterval);
    
    clearStepError('step-2');
}