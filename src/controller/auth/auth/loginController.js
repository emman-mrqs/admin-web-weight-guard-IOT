import passport from 'passport';
import db from '../../../database/db.js';
import AuditLogService from '../../../utils/auditLogService.js';
import nodemailerService from '../../../utils/emailService.js';


const LOGIN_WINDOW_MS = 2 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginRateLimitStore = new Map();

const AdminLoginRateLimit = {
    getKey(req) {
        const email = String(req.body?.email || '').trim().toLowerCase();
        return `${req.ip || 'unknown'}:${email}`;
    },

    check(req) {
        const now = Date.now();
        const key = this.getKey(req);
        const state = loginRateLimitStore.get(key);

        if (!state) {
            return { blocked: false, retryAfterSeconds: 0 };
        }

        if (now >= state.expiresAt) {
            loginRateLimitStore.delete(key);
            return { blocked: false, retryAfterSeconds: 0 };
        }

        if (state.count >= LOGIN_MAX_ATTEMPTS) {
            return {
                blocked: true,
                retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAt - now) / 1000))
            };
        }

        return { blocked: false, retryAfterSeconds: 0 };
    },

    recordFailure(req) {
        const now = Date.now();
        const key = this.getKey(req);
        const current = loginRateLimitStore.get(key);

        if (!current || now >= current.expiresAt) {
            loginRateLimitStore.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
            return;
        }

        current.count += 1;
    },

    recordSuccess(req) {
        loginRateLimitStore.delete(this.getKey(req));
    }
};

const SuspensionService = {
    async restoreExpiredAdminSuspensionIfNeeded(adminId, database) {
        try {
            const { rows } = await database.query(
                `
                    UPDATE administrator
                    SET status = 'active',
                        updated_at = NOW()
                    WHERE id = $1
                      AND LOWER(status) = 'suspended'
                      AND EXISTS (
                          SELECT 1
                          FROM suspension_logs
                          WHERE administrator_id = $1
                            AND ended_at IS NOT NULL
                            AND ended_at <= NOW()
                      )
                    RETURNING *;
                `,
                [adminId]
            );

            if (!rows.length) {
                return { restored: false, admin: null };
            }

            return { restored: true, admin: rows[0] };
        } catch (error) {
            console.error('Failed to auto-restore expired suspension:', error);
            return { restored: false, admin: null };
        }
    },

    async getLatestAdminSuspension(database, adminId) {
        try {
            const { rows } = await database.query(
                `
                    SELECT started_at, ended_at
                    FROM suspension_logs
                    WHERE administrator_id = $1
                    ORDER BY started_at DESC
                    LIMIT 1;
                `,
                [adminId]
            );

            return rows[0] || null;
        } catch (error) {
            console.error('Failed to get latest suspension details:', error);
            return null;
        }
    }
};


class AdminLoginController {
    static normalizeRole(role) {
        return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    static resolvePostLoginRedirect(user) {
        const normalizedRole = AdminLoginController.normalizeRole(user?.role);
        if (['dispatch_staff', 'incident_staff'].includes(normalizedRole) && user?.must_change_password === true) {
            return '/admin/settings';
        }

        return '/admin';
    }

    static isJsonRequest(req) {
        return req.xhr || req.headers.accept?.includes('application/json');
    }

    static sendAuthError(req, res, message, status = 401) {
        if (res.headersSent) {
            return;
        }

        if (AdminLoginController.isJsonRequest(req)) {
            return res.status(status).json({ success: false, message });
        }

        return res.status(status).render('auth/login', { error: message });
    }

    static getLogin(req, res) {
        try {
            res.render('auth/adminLogin');
        } catch (error) {
            console.error(error);
        }
    }

    static isJsonRequest(req) {
        return req.headers.accept?.includes('application/json') || req.xhr;
    }

    static sendAuthError(req, res, message, status = 401) {
        if (AdminLoginController.isJsonRequest(req)) {
            return res.status(status).json({ success: false, message });
        }

        return res.redirect(`/?error=${encodeURIComponent(message)}`);
    }

    static getRestrictionMessage(status) {
        const normalizedStatus = String(status || '').toLowerCase();
        if (normalizedStatus === 'banned') {
            return 'Your account has been banned. Please contact the system administrator.';
        }

        if (normalizedStatus === 'suspended') {
            return 'Your account is suspended. Please contact the system administrator.';
        }

        return 'Your account is inactive. Please contact the system administrator.';
    }

    static resolvePostLoginRedirect() {
        return '/admin';
    }

    static async handleLogin (req, res, next) {
        const rateLimitState = AdminLoginRateLimit.check(req);
        if (rateLimitState.blocked) {
            res.set('Retry-After', String(rateLimitState.retryAfterSeconds || 60));

            await AuditLogService.logAdminFailedLoginThrottled(db, req, {
                emailAttempted: String(req.body?.email || '').trim() || null,
                reason: `Rate limited login attempt. Retry after ${rateLimitState.retryAfterSeconds || 60}s.`,
                windowSeconds: 120
            });

            return AdminLoginController.sendAuthError(
                req,
                res,
                `Too many login attempts. Please wait ${rateLimitState.retryAfterSeconds || 60} second(s) and try again.`,
                429
            );
        }

        passport.authenticate('local', async (err, user, info) => {
            try {
                if (err) return next(err);
                    if (!user) {
                        AdminLoginRateLimit.recordFailure(req);

                        await AuditLogService.logAdminFailedLoginThrottled(db, req, {
                            emailAttempted: String(req.body?.email || '').trim() || null,
                            reason: String(info?.message || 'Invalid credentials').trim() || 'Invalid credentials',
                            windowSeconds: 120
                        });
                        return AdminLoginController.sendAuthError(req, res, info.message || 'Login failed. Please try again.', 401);
                    }
                    AdminLoginRateLimit.recordSuccess(req);

                    const restoreResult = await SuspensionService.restoreExpiredAdminSuspensionIfNeeded(user.id, db);
                    if (restoreResult.restored && restoreResult.admin) {
                        user = { ...user, ...restoreResult.admin };
                        await nodemailerService.sendSuspensionLiftedEmail(user.email, user.first_name, user.last_name);
                    }

                    const accountStatus = String(user.status || '').toLowerCase();


                    if (accountStatus === 'banned') {
                        await AuditLogService.logAdminAction(db, req, {
                            action: 'ADMIN_LOGIN_BLOCKED',
                            module: 'AUTH',
                            description: 'Administrator login was blocked due to banned status.',
                            severity: 'High',
                            details: {
                                eventType: 'admin_authentication',
                                authOutcome: 'blocked',
                                administratorId: Number(user.id),
                                accountStatus: 'banned',
                                email: user.email || null
                            }
                        });
                        return AdminLoginController.sendAuthError(req, res, 'Your account has been permanently banned. Please contact the system administrator.', 403);
                    }

                if (accountStatus === 'suspended') {
                    const latestSuspension = await SuspensionService.getLatestAdminSuspension(db, user.id);
                    const endDate = latestSuspension?.ended_at ? new Date(latestSuspension.ended_at) : null;
                    const hasEndDate = endDate && !Number.isNaN(endDate.getTime());

                    const message = hasEndDate
                        ? `Your account is temporarily suspended until ${endDate.toLocaleString('en-US')}.`
                        : 'Your account is suspended. Please contact the system administrator.';

                    await AuditLogService.logAdminAction(db, req, {
                        action: 'ADMIN_LOGIN_BLOCKED',
                        module: 'AUTH',
                        description: 'Administrator login was blocked due to suspended status.',
                        severity: 'High',
                        details: {
                            eventType: 'admin_authentication',
                            authOutcome: 'blocked',
                            administratorId: Number(user.id),
                            accountStatus: 'suspended',
                            suspensionEndsAt: hasEndDate ? endDate.toISOString() : null,
                            email: user.email || null
                        }
                    });

                    return AdminLoginController.sendAuthError(req, res, message, 403);
            }

            if (['banned', 'suspended', 'inactive'].includes(accountStatus)) {
                return AdminLoginController.sendAuthError(req, res, AdminLoginController.getRestrictionMessage(accountStatus), 403);
            }

            if (!user.is_verified) {
                return AdminLoginController.sendAuthError(req, res, 'Your account is not verified yet.', 403);
            }

                if (accountStatus === 'inactive') {
                    await AuditLogService.logAdminAction(db, req, {
                        action: 'ADMIN_LOGIN_BLOCKED',
                        module: 'AUTH',
                        description: 'Administrator login was blocked due to inactive status.',
                        severity: 'Medium',
                        details: {
                            eventType: 'admin_authentication',
                            authOutcome: 'blocked',
                            administratorId: Number(user.id),
                            accountStatus: 'inactive',
                            email: user.email || null
                        }
                    });
                    return AdminLoginController.sendAuthError(req, res, 'Your account is inactive. Please contact the system administrator.', 403);
                }

                if (!user.is_verified) {
                    await AuditLogService.logAdminAction(db, req, {
                        action: 'ADMIN_LOGIN_BLOCKED',
                        module: 'AUTH',
                        description: 'Administrator login was blocked because the account is not verified.',
                        severity: 'Medium',
                        details: {
                            eventType: 'admin_authentication',
                            authOutcome: 'blocked',
                            administratorId: Number(user.id),
                            accountStatus: accountStatus || null,
                            verificationRequired: true,
                            email: user.email || null
                        }
                    });
                    return AdminLoginController.sendAuthError(req, res, 'Your account is not verified. Please check your email for the verification link.', 403);
                }
                req.login(user, async (loginError) => {
                    if (loginError) return next(loginError);
                    if (res.headersSent) return;

                    const redirectTarget = AdminLoginController.resolvePostLoginRedirect(user);

                    try {
                        await db.query(
                            `
                                UPDATE administrator
                                SET login_at = NOW(),
                                    logout_at = NULL,
                                    updated_at = NOW()
                                WHERE id = $1
                                  AND deleted_at IS NULL;
                            `,
                            [user.id]
                        );
                    } catch (timestampError) {
                        console.error('Failed to update administrator login timestamp:', timestampError);
                    }

                    AuditLogService.logAdminAction(db, req, {
                        action: 'ADMIN_LOGIN_SUCCESS',
                        module: 'AUTH',
                        description: `Administrator ${`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || `#${user.id}`} logged in successfully.`,
                        severity: 'Low',
                        details: {
                            eventType: 'admin_authentication',
                            authOutcome: 'success',
                            administratorId: Number(user.id),
                            role: user.role || null,
                            email: user.email || null
                        }
                    }).catch((auditError) => {
                        console.error('Failed to write login success audit log:', auditError);
                    });

                    if (AdminLoginController.isJsonRequest(req)) {
                        return res.status(200).json({ success: true, redirect: redirectTarget });
                    }

                    return res.redirect(redirectTarget);
                });
                
            } catch (callbackError) {
                if (res.headersSent) {
                    console.error('Error after response sent:', callbackError);
                }
                return next(callbackError);
            }

        })(req, res, next);
    }

    static passportLogout(req) {
        return new Promise((resolve, reject) => {
            const logoutFn = req.logout || req.logOut;
            if (!logoutFn) {
                resolve();
                return;
            }

            logoutFn.call(req, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    static async handleLogout(req, res, next) {
        try {
            const adminId = Number(req.user?.id || req.session?.passport?.user);

            if (Number.isFinite(adminId) && adminId > 0) {
                try {
                    await db.query(
                        `
                            UPDATE administrator
                            SET logout_at = NOW(),
                                updated_at = NOW()
                            WHERE id = $1
                              AND deleted_at IS NULL;
                        `,
                        [adminId]
                    );
                } catch (logoutTimestampError) {
                    console.error('Failed to update administrator logout timestamp:', logoutTimestampError);
                }
            }

            await AdminLoginController.passportLogout(req);

            const finish = () => {
                res.clearCookie('iot_weigh_guard_session');

                if (AdminLoginController.isJsonRequest(req)) {
                    return res.status(200).json({ success: true, redirect: '/' });
                }

                return res.redirect('/');
            };

            if (!req.session) {
                return finish();
            }

            return req.session.destroy(() => finish());
        } catch (error) {
            return next(error);
        }
    }
}

export default AdminLoginController;