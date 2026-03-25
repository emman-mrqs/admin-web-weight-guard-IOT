import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import db from "../database/db.js";

// Express session middlewaer configuration using connect-pg-simple to store sessions in PostgreSQL
class authMiddleware {
    static PgSessionStore = connectPgSimple(session);

    static sessionMiddleware = session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        // Use PostgreSQL to store session data
        store: new authMiddleware.PgSessionStore({
            pool: db,
            tableName: 'administrator_sessions',
            createTableIfMissing: true,

        }),
        cookie: {
            secure: process.env.NODE_ENV === "production", // HttpOnly should be true in production for security
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            maxAge: 1000 * 60 * 60 * 24, // 1 day
            sameSite: 'lax' // Helps protect against CSRF attacks
        },
        name: 'iot_weigh_guard_session', // Custom name for the session cookie
        unset: 'destroy'
    });


    static buildAccountRestrictionMessage(status) {
        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (normalizedStatus === 'deleted') {
            return 'Your account has been deleted. Contact the super administrator for account restoration.';
        }

        if (normalizedStatus === 'banned') {
            return 'Your account has been permanently banned. Please contact the system administrator.';
        }

        if (normalizedStatus === 'suspended') {
            return 'Your account is suspended. Please contact the system administrator.';
        }

        return 'Your account is inactive. Please contact the system administrator.';
    }

    
    static sendRestrictionResponse(req, res, message) {
        if (res.headersSent) {
            return true;
        }

        const expectsHtml = req.headers.accept?.includes('text/html');

        if (req.originalUrl?.startsWith('/admin') && expectsHtml) {
            res.redirect('/');
            return true;
        }

        res.status(403).json({
            message,
            requiresLogout: true
        });

        return true;
    }

    
    static forceLogoutAndDeny(req, res, message) {
        const finalize = () => {
            if (res.headersSent) {
                return;
            }

            res.clearCookie('iot_weigh_guard_session');
            authMiddleware.sendRestrictionResponse(req, res, message);
        };

        if (!req.logout) {
            finalize();
            return;
        }

        req.logout(() => {
            if (req.session) {
                return req.session.destroy(() => finalize());
            }

            finalize();
        });
    }
    
    static denyIfRestrictedAccount(req, res) {
        const status = String(req.user?.status || '').trim().toLowerCase();
        if (!['deleted', 'suspended', 'banned', 'inactive'].includes(status)) {
            return false;
        }

        const message = authMiddleware.buildAccountRestrictionMessage(status);
        authMiddleware.forceLogoutAndDeny(req, res, message);
        return true;
    }

    static forcePasswordChangeMessage() {
        return 'You must change your temporary password before accessing other admin pages.';
    }

    static isPasswordChangeRouteAllowed(req) {
        const stripQuery = (value) => String(value || '').split('?')[0].toLowerCase();
        const originalPath = stripQuery(req.originalUrl);
        const mountedPath = stripQuery(`${req.baseUrl || ''}${req.path || ''}`);
        const pathOnly = stripQuery(req.path);

        const allowlist = new Set([
            '/admin/settings',
            '/settings',
            '/admin/system-settings/super-admin/password-change',
            '/system-settings/super-admin/password-change',
            '/logout'
        ]);

        if (allowlist.has(originalPath)) return true;
        if (allowlist.has(mountedPath)) return true;
        if (allowlist.has(pathOnly)) return true;
        return false;
    }

    
    static isForcedPasswordChangeRequired(user) {
        const role = authMiddleware.normalizeRoleValue(user?.role);
        if (!['co_admin', 'staff'].includes(role)) {
            return false;
        }

        return user?.must_change_password === true;
    }

        static enforceForcedPasswordChange(req, res) {
        if (!authMiddleware.isForcedPasswordChangeRequired(req.user)) {
            return false;
        }

        if (authMiddleware.isPasswordChangeRouteAllowed(req)) {
            return false;
        }

        const message = authMiddleware.forcePasswordChangeMessage();
        const expectsHtml = req.headers.accept?.includes('text/html');

        if (res.headersSent) {
            return true;
        }

        if (req.originalUrl?.startsWith('/admin') && expectsHtml) {
            res.redirect('/admin/settings');
            return true;
        }

        res.status(403).json({
            message,
            requiresPasswordChange: true,
            redirect: '/admin/settings'
        });

        return true;
    }

    static ensureAuthenticated(req, res, next) {
        if (req.isAuthenticated && req.isAuthenticated()) {
            if (authMiddleware.denyIfRestrictedAccount(req, res)) {
                return;
            }

            return next();
        }

        if (req.originalUrl?.startsWith('/admin')) {
            return res.redirect('/');
        }

        return res.status(401).json({ message: 'Unauthorized' });
    }

    static normalizeRoleValue(role) {
        return String(role || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
    }

    static redirectIfAuthenticated(req, res, next) {
        // Avoid caching auth pages so browser back button always revalidates session.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        if (req.isAuthenticated && req.isAuthenticated()) {
            if (authMiddleware.denyIfRestrictedAccount(req, res)) {
                return;
            }

            return res.redirect('/admin');
        }

        return next();
    }
    
    static authorizeRoles(...allowedRoles) {
        const normalizedAllowedRoles = allowedRoles.map((role) => authMiddleware.normalizeRoleValue(role));

        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            if (authMiddleware.denyIfRestrictedAccount(req, res)) {
                return;
            }

            if (authMiddleware.enforceForcedPasswordChange(req, res)) {
                return;
            }

            const currentRole = authMiddleware.normalizeRoleValue(req.user.role);
            if (!normalizedAllowedRoles.includes(currentRole)) {
                if (req.originalUrl?.startsWith('/admin')) {
                    const expectsHtml = req.headers.accept?.includes('text/html');
                    if (expectsHtml) {
                        return res.redirect('/admin');
                    }
                    return res.status(403).json({ message: 'Forbidden: insufficient role permissions.' });
                }

                return res.status(403).json({ message: 'Forbidden' });
            }

            return next();
        };
    }

}

export default authMiddleware;