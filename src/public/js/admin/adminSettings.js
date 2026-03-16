        let pendingAction = null; // 'email' or 'password'

        // 1. Trigger the Modal
        function initiateSecurityCheck(event, actionType) {
            event.preventDefault();
            pendingAction = actionType;
            
            // Show Notification simulating Email Send
            showNotification('Sending verification code to admin@weighguard.io...', 'info');
            
            // Simulate API delay then open modal
            setTimeout(() => {
                const modal = document.getElementById('security-modal');
                modal.classList.remove('hidden', 'pointer-events-none');
                // Small timeout to allow display:block to apply before opacity transition
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    document.body.classList.add('modal-active');
                    document.querySelector('.otp-field').focus();
                }, 50);
            }, 1000);
        }

        // 2. Close Modal
        function closeModal() {
            const modal = document.getElementById('security-modal');
            modal.classList.add('opacity-0');
            document.body.classList.remove('modal-active');
            
            setTimeout(() => {
                modal.classList.add('hidden', 'pointer-events-none');
                // Reset OTP fields
                document.querySelectorAll('.otp-field').forEach(input => input.value = '');
            }, 300);
        }

        // 3. Verify OTP Logic
        function verifyAndSave() {
            // Collect OTP
            let otp = '';
            document.querySelectorAll('.otp-field').forEach(field => otp += field.value);

            if (otp.length < 6) {
                alert('Please enter the full 6-digit code.');
                return;
            }

            // Simulate Verification Success
            showNotification('Verifying code...', 'info');
            
            setTimeout(() => {
                closeModal();
                if (pendingAction === 'email') {
                    const newEmail = document.getElementById('new-email-input').value;
                    showNotification(`Success: Admin email updated to ${newEmail}`, 'success');
                    // In real app, you'd reload or update the UI here
                } else if (pendingAction === 'password') {
                    showNotification('Success: Admin password changed successfully', 'success');
                }
            }, 1000);
        }

        // 4. Helper: Notification System
        function showNotification(message, type) {
            const notif = document.getElementById('notification-area');
            const notifText = document.getElementById('notification-text');
            
            notifText.innerText = message;
            notif.classList.remove('hidden');
            notif.classList.add('opacity-100');
            
            // Auto hide after 3 seconds
            setTimeout(() => {
                notif.classList.remove('opacity-100');
                setTimeout(() => notif.classList.add('hidden'), 500);
            }, 4000);
        }

        function resendCode() {
            showNotification('New code sent to admin@weighguard.io', 'info');
        }

        // 5. Auto-focus next OTP field
        const otpInputs = document.querySelectorAll('.otp-field');
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
        });