import bcrypt from 'bcrypt';
import db from '../../../database/db.js';
import nodemailerService from '../../../utils/emailService.js';
import AuditLogService from '../../../utils/auditLogService.js';

const forgotPasswordLimitStore = new Map();

class AdminForgetPasswordController {
    static PASSWORD_RESET_TTL_MINUTES = 5;

    static SEND_CODE_LIMIT = { windowMs: 5 * 60 * 1000, maxAttempts: 3 };
    static VERIFY_CODE_LIMIT = { windowMs: 5 * 60 * 1000, maxAttempts: 5 };
    static RESET_PASSWORD_LIMIT = { windowMs: 10 * 60 * 1000, maxAttempts: 5 };

    static normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    static generateResetCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    static buildRateLimitKey(req, email, action) {
        const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
        return `${action}:${ip}:${email || 'unknown'}`;
    }

    static checkRateLimit(req, email, action, policy) {
        const now = Date.now();
        const key = AdminForgetPasswordController.buildRateLimitKey(req, email, action);
        const current = forgotPasswordLimitStore.get(key);

        if (!current || now >= current.expiresAt) {
            forgotPasswordLimitStore.delete(key);
            return { blocked: false, key, retryAfterSeconds: 0 };
        }

        if (current.count >= policy.maxAttempts) {
            return {
                blocked: true,
                key,
                retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
            };
        }

        return { blocked: false, key, retryAfterSeconds: 0 };
    }

    static recordRateLimitAttempt(key, policy) {
        const now = Date.now();
        const current = forgotPasswordLimitStore.get(key);

        if (!current || now >= current.expiresAt) {
            forgotPasswordLimitStore.set(key, {
                count: 1,
                expiresAt: now + policy.windowMs
            });
            return;
        }

        current.count += 1;
    }

    static clearRateLimit(req, email, action) {
        const key = AdminForgetPasswordController.buildRateLimitKey(req, email, action);
        forgotPasswordLimitStore.delete(key);
    }

    static getForgetPassword(req, res) {
        try {
            res.render('auth/adminForgetPassword');
        } catch (error) {
            console.error(error);
            res.status(500).send('Failed to load forgot password page.');
        }
    }

    static async sendResetCode(req, res) {
        try {
            const email = AdminForgetPasswordController.normalizeEmail(req.body?.email);
            if (!email) {
                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_SEND_CODE_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password send code failed due to missing email.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_send_code_failed',
                        reason: 'missing_email'
                    }
                });
                return res.status(400).json({ success: false, message: 'Email is required.' });
            }

            const sendRateState = AdminForgetPasswordController.checkRateLimit(
                req,
                email,
                'send-code',
                AdminForgetPasswordController.SEND_CODE_LIMIT
            );

            if (sendRateState.blocked) {
                res.set('Retry-After', String(sendRateState.retryAfterSeconds));

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_SEND_CODE_RATE_LIMITED',
                    module: 'AUTH',
                    description: 'Forgot-password send code request was rate-limited.',
                    severity: 'High',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_send_code_rate_limited',
                        emailAttempted: email,
                        retryAfterSeconds: sendRateState.retryAfterSeconds
                    }
                });

                return res.status(429).json({
                    success: false,
                    message: `Too many requests. Please retry in ${sendRateState.retryAfterSeconds} second(s).`
                });
            }

            AdminForgetPasswordController.recordRateLimitAttempt(sendRateState.key, AdminForgetPasswordController.SEND_CODE_LIMIT);

            const adminResult = await db.query(
                `
                    SELECT id, first_name, last_name, email
                    FROM administrator
                    WHERE email = $1
                      AND deleted_at IS NULL
                    LIMIT 1;
                `,
                [email]
            );

            if (!adminResult.rows.length) {
                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_SEND_CODE_UNKNOWN_EMAIL',
                    module: 'AUTH',
                    description: 'Forgot-password send code requested for unknown administrator email.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_send_code_unknown_email',
                        emailAttempted: email
                    }
                });

                return res.status(200).json({
                    success: true,
                    message: 'If the email exists, a verification code has been sent.'
                });
            }

            const admin = adminResult.rows[0];
            const resetCode = AdminForgetPasswordController.generateResetCode();
            const expiresAt = new Date(Date.now() + AdminForgetPasswordController.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

            await db.query(
                `
                    DELETE FROM password_reset
                    WHERE user_type = 'administrator'
                      AND email = $1;
                `,
                [email]
            );

            await db.query(
                `
                    INSERT INTO password_reset (user_type, email, reset_code, expires_at, created_at)
                    VALUES ('administrator', $1, $2, $3, NOW());
                `,
                [email, resetCode, expiresAt]
            );

            await nodemailerService.sendPasswordResetEmail(
                admin.email,
                admin.first_name || 'Admin',
                admin.last_name || 'User',
                resetCode
            );

            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_SEND_CODE_SUCCESS',
                module: 'AUTH',
                description: 'Forgot-password verification code sent successfully.',
                severity: 'Low',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_send_code_success',
                    emailAttempted: email,
                    expiresInMinutes: AdminForgetPasswordController.PASSWORD_RESET_TTL_MINUTES
                }
            });

            return res.status(200).json({
                success: true,
                message: 'Verification code sent successfully.'
            });
        } catch (error) {
            console.error('Error sending administrator reset code:', error);
            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_SEND_CODE_ERROR',
                module: 'AUTH',
                description: 'Forgot-password send code failed due to server error.',
                severity: 'High',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_send_code_error',
                    emailAttempted: AdminForgetPasswordController.normalizeEmail(req.body?.email),
                    reason: String(error?.message || 'unknown_error')
                }
            }).catch(() => {});
            return res.status(500).json({ success: false, message: 'Failed to send reset code.' });
        }
    }

    static async verifyResetCode(req, res) {
        try {
            const email = AdminForgetPasswordController.normalizeEmail(req.body?.email);
            const verificationCode = String(req.body?.verificationCode || '').trim();

            if (!email || !verificationCode) {
                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password code verification failed due to missing payload.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_verify_code_failed',
                        emailAttempted: email || null,
                        reason: 'missing_email_or_code'
                    }
                });
                return res.status(400).json({ success: false, message: 'Email and code are required.' });
            }

            const verifyRateState = AdminForgetPasswordController.checkRateLimit(
                req,
                email,
                'verify-code',
                AdminForgetPasswordController.VERIFY_CODE_LIMIT
            );

            if (verifyRateState.blocked) {
                res.set('Retry-After', String(verifyRateState.retryAfterSeconds));

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_RATE_LIMITED',
                    module: 'AUTH',
                    description: 'Forgot-password code verification request was rate-limited.',
                    severity: 'High',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_verify_code_rate_limited',
                        emailAttempted: email,
                        retryAfterSeconds: verifyRateState.retryAfterSeconds
                    }
                });

                return res.status(429).json({
                    success: false,
                    message: `Too many attempts. Please retry in ${verifyRateState.retryAfterSeconds} second(s).`
                });
            }

            const codeResult = await db.query(
                `
                    SELECT id, expires_at
                    FROM password_reset
                    WHERE user_type = 'administrator'
                      AND email = $1
                      AND reset_code = $2
                    ORDER BY created_at DESC
                    LIMIT 1;
                `,
                [email, verificationCode]
            );

            if (!codeResult.rows.length) {
                AdminForgetPasswordController.recordRateLimitAttempt(verifyRateState.key, AdminForgetPasswordController.VERIFY_CODE_LIMIT);

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password code verification failed with invalid code.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_verify_code_failed',
                        emailAttempted: email,
                        reason: 'invalid_code'
                    }
                });
                return res.status(400).json({ success: false, message: 'Invalid verification code.' });
            }

            const entry = codeResult.rows[0];
            const expired = !entry.expires_at || new Date(entry.expires_at).getTime() < Date.now();
            if (expired) {
                AdminForgetPasswordController.recordRateLimitAttempt(verifyRateState.key, AdminForgetPasswordController.VERIFY_CODE_LIMIT);

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password code verification failed due to expired code.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_verify_code_failed',
                        emailAttempted: email,
                        reason: 'expired_code'
                    }
                });
                return res.status(400).json({ success: false, message: 'Verification code has expired.' });
            }

            AdminForgetPasswordController.clearRateLimit(req, email, 'verify-code');

            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_SUCCESS',
                module: 'AUTH',
                description: 'Forgot-password code verified successfully.',
                severity: 'Low',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_verify_code_success',
                    emailAttempted: email
                }
            });

            return res.status(200).json({ success: true, message: 'Verification successful.' });
        } catch (error) {
            console.error('Error verifying administrator reset code:', error);
            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_VERIFY_CODE_ERROR',
                module: 'AUTH',
                description: 'Forgot-password code verification failed due to server error.',
                severity: 'High',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_verify_code_error',
                    emailAttempted: AdminForgetPasswordController.normalizeEmail(req.body?.email),
                    reason: String(error?.message || 'unknown_error')
                }
            }).catch(() => {});
            return res.status(500).json({ success: false, message: 'Failed to verify code.' });
        }
    }

    static async resetPassword(req, res) {
        try {
            const email = AdminForgetPasswordController.normalizeEmail(req.body?.email);
            const verificationCode = String(req.body?.verificationCode || '').trim();
            const newPassword = String(req.body?.newPassword || '');
            const confirmPassword = String(req.body?.confirmPassword || '');

            if (!email || !verificationCode || !newPassword || !confirmPassword) {
                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_RESET_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password reset failed due to missing payload.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_reset_failed',
                        emailAttempted: email || null,
                        reason: 'missing_fields'
                    }
                });
                return res.status(400).json({ success: false, message: 'All fields are required.' });
            }

            const resetRateState = AdminForgetPasswordController.checkRateLimit(
                req,
                email,
                'reset-password',
                AdminForgetPasswordController.RESET_PASSWORD_LIMIT
            );

            if (resetRateState.blocked) {
                res.set('Retry-After', String(resetRateState.retryAfterSeconds));

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_RESET_RATE_LIMITED',
                    module: 'AUTH',
                    description: 'Forgot-password reset request was rate-limited.',
                    severity: 'High',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_reset_rate_limited',
                        emailAttempted: email,
                        retryAfterSeconds: resetRateState.retryAfterSeconds
                    }
                });

                return res.status(429).json({
                    success: false,
                    message: `Too many attempts. Please retry in ${resetRateState.retryAfterSeconds} second(s).`
                });
            }

            if (newPassword !== confirmPassword) {
                AdminForgetPasswordController.recordRateLimitAttempt(resetRateState.key, AdminForgetPasswordController.RESET_PASSWORD_LIMIT);
                return res.status(400).json({ success: false, message: 'Passwords do not match.' });
            }

            if (newPassword.length < 8) {
                AdminForgetPasswordController.recordRateLimitAttempt(resetRateState.key, AdminForgetPasswordController.RESET_PASSWORD_LIMIT);
                return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
            }

            const resetResult = await db.query(
                `
                    SELECT id, expires_at
                    FROM password_reset
                    WHERE user_type = 'administrator'
                      AND email = $1
                      AND reset_code = $2
                    ORDER BY created_at DESC
                    LIMIT 1;
                `,
                [email, verificationCode]
            );

            if (!resetResult.rows.length) {
                AdminForgetPasswordController.recordRateLimitAttempt(resetRateState.key, AdminForgetPasswordController.RESET_PASSWORD_LIMIT);

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_RESET_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password reset failed due to invalid verification context.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_reset_failed',
                        emailAttempted: email,
                        reason: 'invalid_reset_request'
                    }
                });
                return res.status(400).json({ success: false, message: 'Invalid reset request.' });
            }

            const resetEntry = resetResult.rows[0];
            const expired = !resetEntry.expires_at || new Date(resetEntry.expires_at).getTime() < Date.now();
            if (expired) {
                AdminForgetPasswordController.recordRateLimitAttempt(resetRateState.key, AdminForgetPasswordController.RESET_PASSWORD_LIMIT);

                await AuditLogService.logAdminAction(db, req, {
                    action: 'ADMIN_FORGOT_PASSWORD_RESET_FAILED',
                    module: 'AUTH',
                    description: 'Forgot-password reset failed due to expired code.',
                    severity: 'Medium',
                    details: {
                        eventType: 'admin_authentication',
                        authOutcome: 'forgot_password_reset_failed',
                        emailAttempted: email,
                        reason: 'expired_code'
                    }
                });
                return res.status(400).json({ success: false, message: 'Reset code has expired.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            const updateResult = await db.query(
                `
                    UPDATE administrator
                    SET password = $1,
                        must_change_password = FALSE,
                        updated_at = NOW()
                    WHERE email = $2
                      AND deleted_at IS NULL
                    RETURNING id;
                `,
                [hashedPassword, email]
            );

            if (!updateResult.rows.length) {
                AdminForgetPasswordController.recordRateLimitAttempt(resetRateState.key, AdminForgetPasswordController.RESET_PASSWORD_LIMIT);
                return res.status(404).json({ success: false, message: 'Administrator account not found.' });
            }

            await db.query(
                `
                    DELETE FROM password_reset
                    WHERE user_type = 'administrator'
                      AND email = $1;
                `,
                [email]
            );

            AdminForgetPasswordController.clearRateLimit(req, email, 'reset-password');

            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_RESET_SUCCESS',
                module: 'AUTH',
                description: 'Forgot-password reset completed successfully.',
                severity: 'Low',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_reset_success',
                    emailAttempted: email,
                    administratorId: Number(updateResult.rows[0].id)
                }
            });

            return res.status(200).json({ success: true, message: 'Password updated successfully.' });
        } catch (error) {
            console.error('Error resetting administrator password:', error);
            await AuditLogService.logAdminAction(db, req, {
                action: 'ADMIN_FORGOT_PASSWORD_RESET_ERROR',
                module: 'AUTH',
                description: 'Forgot-password reset failed due to server error.',
                severity: 'High',
                details: {
                    eventType: 'admin_authentication',
                    authOutcome: 'forgot_password_reset_error',
                    emailAttempted: AdminForgetPasswordController.normalizeEmail(req.body?.email),
                    reason: String(error?.message || 'unknown_error')
                }
            }).catch(() => {});
            return res.status(500).json({ success: false, message: 'Failed to reset password.' });
        }
    }
}

export default AdminForgetPasswordController;