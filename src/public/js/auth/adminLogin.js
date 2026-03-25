async function handleLogin(event) {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitButton = document.getElementById('login-btn');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const formError = document.getElementById('form-error');

    if (emailError) {
        emailError.textContent = '';
        emailError.classList.add('hidden');
    }

    if (passwordError) {
        passwordError.textContent = '';
        passwordError.classList.add('hidden');
    }

    if (formError) {
        formError.textContent = '';
        formError.classList.add('hidden');
    }

    emailInput?.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
    passwordInput?.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');

    const email = String(emailInput?.value || '').trim();
    const password = String(passwordInput?.value || '').trim();

    if (!email) {
        if (emailError) {
            emailError.textContent = 'Email is required.';
            emailError.classList.remove('hidden');
        }
        emailInput?.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
    }

    if (!password) {
        if (passwordError) {
            passwordError.textContent = 'Password is required.';
            passwordError.classList.remove('hidden');
        }
        passwordInput?.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
    }

    if (!email || !password) {
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-80', 'cursor-not-allowed', 'bg-emerald-600');
        submitButton.classList.remove('hover:bg-emerald-400');
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        let data = {};
        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Login failed. Please try again.');
        }

        window.location.href = data.redirect || '/admin/dashboard';
    } catch (error) {
        const message = error.message || 'Login failed. Please try again.';
        const lowered = message.toLowerCase();

        if (lowered.includes('email')) {
            if (emailError) {
                emailError.textContent = message;
                emailError.classList.remove('hidden');
            }
            emailInput?.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
        } else if (lowered.includes('password')) {
            if (passwordError) {
                passwordError.textContent = message;
                passwordError.classList.remove('hidden');
            }
            passwordInput?.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
        } else {
            if (formError) {
                formError.textContent = message;
                formError.classList.remove('hidden');
            }
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.classList.remove('opacity-80', 'cursor-not-allowed', 'bg-emerald-600');
            submitButton.classList.add('hover:bg-emerald-400');
        }
    }
}