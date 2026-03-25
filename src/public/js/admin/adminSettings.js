(function () {
    const notificationArea = document.getElementById('notification-area');
    const notificationText = document.getElementById('notification-text');
    const securityModal = document.getElementById('security-modal');
    const securityModalBackdrop = document.getElementById('securityModalBackdrop');
    const securityModalError = document.getElementById('securityModalError');
    const openSecurityModalBtn = document.getElementById('openSecurityModalBtn');
    const cancelSecurityModalBtn = document.getElementById('cancelSecurityModalBtn');
    const confirmSecurityModalBtn = document.getElementById('confirmSecurityModalBtn');

    const el = {
        initials: document.getElementById('settingsAvatarInitials'),
        fullName: document.getElementById('settingsFullName'),
        roleLabel: document.getElementById('settingsRoleLabel'),
        roleValue: document.getElementById('settingsRoleValue'),
        memberSinceTop: document.getElementById('settingsMemberSinceTop'),
        memberSinceCard: document.getElementById('settingsMemberSinceCard'),
        statusTop: document.getElementById('settingsStatusTop'),
        statusDotTop: document.getElementById('settingsStatusDotTop'),
        statusTextTop: document.getElementById('settingsStatusTextTop'),
        statusCard: document.getElementById('settingsStatusCard'),
        firstName: document.getElementById('settingsFirstName'),
        lastName: document.getElementById('settingsLastName'),
        email: document.getElementById('settingsEmail'),
        verifiedBadge: document.getElementById('settingsVerifiedBadge'),
        verifiedText: document.getElementById('settingsVerifiedText'),
        currentPassword: document.getElementById('settingsCurrentPassword'),
        newPassword: document.getElementById('settingsNewPassword'),
        confirmPassword: document.getElementById('settingsConfirmPassword'),
        toggleCurrentPassword: document.getElementById('toggleSettingsCurrentPassword'),
        toggleNewPassword: document.getElementById('toggleSettingsNewPassword'),
        toggleConfirmPassword: document.getElementById('toggleSettingsConfirmPassword')
    };

    const getStatusLabel = (status) => {
        const normalized = String(status || 'inactive').toLowerCase();
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    };

    const setStatusStyles = (status) => {
        const isActive = String(status || '').toLowerCase() === 'active';

        el.statusTop?.classList.toggle('text-emerald-400', isActive);
        el.statusTop?.classList.toggle('text-amber-400', !isActive);

        el.statusDotTop?.classList.toggle('bg-emerald-400', isActive);
        el.statusDotTop?.classList.toggle('bg-amber-400', !isActive);

        el.statusCard?.classList.toggle('text-emerald-400', isActive);
        el.statusCard?.classList.toggle('text-amber-400', !isActive);
    };

    const setVerifiedStyles = (isVerified) => {
        el.verifiedBadge?.classList.toggle('bg-emerald-500/10', isVerified);
        el.verifiedBadge?.classList.toggle('text-emerald-400', isVerified);
        el.verifiedBadge?.classList.toggle('border-emerald-500/20', isVerified);

        el.verifiedBadge?.classList.toggle('bg-amber-500/10', !isVerified);
        el.verifiedBadge?.classList.toggle('text-amber-400', !isVerified);
        el.verifiedBadge?.classList.toggle('border-amber-500/20', !isVerified);
    };

    const showNotification = (message) => {
        if (!notificationArea || !notificationText) {
            return;
        }

        notificationText.textContent = message;
        notificationArea.classList.remove('hidden');
        notificationArea.classList.add('opacity-100');

        setTimeout(() => {
            notificationArea.classList.remove('opacity-100');
            setTimeout(() => notificationArea.classList.add('hidden'), 300);
        }, 3000);
    };

    const clearSecurityModalError = () => {
        if (!securityModalError) {
            return;
        }

        securityModalError.textContent = '';
        securityModalError.classList.add('hidden');
    };

    const showSecurityModalError = (message) => {
        if (!securityModalError) {
            return;
        }

        securityModalError.textContent = message;
        securityModalError.classList.remove('hidden');
    };

    const openSecurityModal = () => {
        if (!securityModal) {
            return;
        }

        clearSecurityModalError();
        securityModal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    };

    const closeSecurityModal = () => {
        if (!securityModal) {
            return;
        }

        clearSecurityModalError();
        securityModal.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    };

    const resetPasswordFields = () => {
        if (el.currentPassword) el.currentPassword.value = '';
        if (el.newPassword) el.newPassword.value = '';
        if (el.confirmPassword) el.confirmPassword.value = '';
    };

    const togglePasswordVisibility = (inputEl, toggleBtn) => {
        if (!inputEl || !toggleBtn) {
            return;
        }

        const isPassword = inputEl.type === 'password';
        inputEl.type = isPassword ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    };

    const handleConfirmPasswordChange = async () => {
        const currentPassword = String(el.currentPassword?.value || '');
        const newPassword = String(el.newPassword?.value || '');
        const confirmPassword = String(el.confirmPassword?.value || '');

        clearSecurityModalError();

        if (!currentPassword || !newPassword || !confirmPassword) {
            showSecurityModalError('Please complete all password fields first.');
            return;
        }

        const originalButtonText = confirmSecurityModalBtn?.innerHTML || 'Confirm Change';

        if (confirmSecurityModalBtn) {
            confirmSecurityModalBtn.disabled = true;
            confirmSecurityModalBtn.classList.add('opacity-80', 'cursor-not-allowed');
            confirmSecurityModalBtn.textContent = 'Updating...';
        }

        try {
            const response = await fetch('/api/admin/settings/password-change', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.message || 'Failed to change password.');
            }

            closeSecurityModal();
            resetPasswordFields();
            showNotification(payload?.message || 'Password changed successfully.');
        } catch (error) {
            showSecurityModalError(error?.message || 'Failed to change password.');
        } finally {
            if (confirmSecurityModalBtn) {
                confirmSecurityModalBtn.disabled = false;
                confirmSecurityModalBtn.classList.remove('opacity-80', 'cursor-not-allowed');
                confirmSecurityModalBtn.innerHTML = originalButtonText;
            }
        }
    };

    const applyAccount = (account) => {
        el.initials.textContent = account.initials || 'AD';
        el.fullName.textContent = account.fullName || 'Administrator';
        el.roleLabel.textContent = account.roleLabel || 'Administrator';
        el.roleValue.textContent = account.roleLabel || 'Administrator';

        el.memberSinceTop.textContent = account.memberSince || 'N/A';
        el.memberSinceCard.textContent = account.memberSince || 'N/A';

        el.firstName.value = account.firstName || '';
        el.lastName.value = account.lastName || '';
        el.email.value = account.email || 'N/A';

        const statusLabel = getStatusLabel(account.status);
        el.statusTextTop.textContent = statusLabel;
        el.statusCard.textContent = statusLabel;
        setStatusStyles(account.status);

        const isVerified = Boolean(account.isVerified);
        el.verifiedText.textContent = isVerified ? 'Verified' : 'Pending';
        setVerifiedStyles(isVerified);
    };

    const loadAccountSettings = async () => {
        try {
            const response = await fetch('/api/admin/settings/account', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Unable to load account settings.');
            }

            const payload = await response.json();
            if (!payload?.account) {
                throw new Error('Account payload is missing.');
            }

            applyAccount(payload.account);
        } catch (error) {
            console.error('Settings account load error:', error);
            showNotification('Failed to load account information.');
        }
    };

    if (openSecurityModalBtn) {
        openSecurityModalBtn.addEventListener('click', openSecurityModal);
    }

    if (cancelSecurityModalBtn) {
        cancelSecurityModalBtn.addEventListener('click', closeSecurityModal);
    }

    if (securityModalBackdrop) {
        securityModalBackdrop.addEventListener('click', closeSecurityModal);
    }

    if (confirmSecurityModalBtn) {
        confirmSecurityModalBtn.addEventListener('click', handleConfirmPasswordChange);
    }

    if (el.toggleNewPassword) {
        el.toggleNewPassword.addEventListener('click', () => {
            togglePasswordVisibility(el.newPassword, el.toggleNewPassword);
        });
    }

    if (el.toggleCurrentPassword) {
        el.toggleCurrentPassword.addEventListener('click', () => {
            togglePasswordVisibility(el.currentPassword, el.toggleCurrentPassword);
        });
    }

    if (el.toggleConfirmPassword) {
        el.toggleConfirmPassword.addEventListener('click', () => {
            togglePasswordVisibility(el.confirmPassword, el.toggleConfirmPassword);
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSecurityModal();
        }
    });

    loadAccountSettings();
})();