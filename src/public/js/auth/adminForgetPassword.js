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

const getErrorElement = (step) => document.getElementById(`forget-password-error-${step}`);

function showStepError(step, message) {
    const errorEl = getErrorElement(step);
    if (!errorEl) {
        return;
    }

    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearStepError(step) {
    const errorEl = getErrorElement(step);
    if (!errorEl) {
        return;
    }

    errorEl.textContent = '';
    errorEl.classList.add('hidden');
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

async function handleSendCode(e) {
    e.preventDefault();
    const btn = document.getElementById('send-code-btn');
    const emailInput = String(document.getElementById('email')?.value || '').trim();

    clearStepError('step-1');

    btn.innerHTML = btnSpinner + ' TRANSMITTING...';
    btn.disabled = true;
    btn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        const response = await fetch('/forget-password/send-code', {
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
    } catch (error) {
        showStepError('step-1', error.message || 'Unable to send verification code.');
    } finally {
        btn.innerHTML = `<span>Send Code</span><svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
        btn.classList.remove('opacity-80', 'cursor-not-allowed');
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
        const response = await fetch('/forget-password/verify-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                email: state.email,
                verificationCode
            })
        });

        const payload = await parseJsonResponse(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Verification failed.');
        }

        state.verificationCode = verificationCode;
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

    btn.innerHTML = btnSpinner + ' UPDATING...';
    btn.disabled = true;
    btn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        const response = await fetch('/forget-password/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                email: state.email,
                verificationCode: state.verificationCode,
                newPassword,
                confirmPassword
            })
        });

        const payload = await parseJsonResponse(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Unable to reset password.');
        }

        switchStep('step-3', 'step-4');
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
    state.verificationCode = '';
    clearStepError('step-2');
}