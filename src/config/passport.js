import db from '../database/db.js';
import passport from 'passport';
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";


class PassportConfig {
    static async logDeletedSessionInvalidation (administratorId) {
        try {
            await db.query(`
                INSERT INTO audit_logs (
                    administrator_id,
                    action,
                    module,
                    description,
                    severity,
                    details,
                    created_at
                )
                VALUES ($1, 'ADMIN_SESSION_INVALIDATED', 'AUTH', $2, 'Low', $3::jsonb, NOW());
            `,[
                Number.isFinite(Number(administratorId)) ? Number(administratorId) : null,
                `Session invalidated because administrator account #${administratorId} is deleted.`,
                JSON.stringify({
                    eventType: 'admin_authentication',
                    authOutcome: 'session_invalidated',
                    reason: 'deleted_account',
                    administratorId: Number.isFinite(Number(administratorId)) ? Number(administratorId) : null
                })
            ]);
        } catch (error) {
             console.error('Failed to write deleted-session invalidation audit log:', error);
        }
    }

    static initialize () {
        passport.use(
            "local",
            new LocalStrategy({usernameField: "email"}, async (email, password, done) => {
                try {
                    if (!email || !password) {
                        return done(null, false, { message: "Email and password are required." });
                    }

                    const checkQuery = `
                        SELECT id, first_name, last_name, email, password, role, is_verified, must_change_password, status, deleted_at
                        FROM administrator
                        WHERE email = $1
                    `;

                    const result = await db.query(checkQuery, [email]);

                    if (result.rows.length === 0) {
                        return done(null, false, { message: "Invalid email or password." });
                    }

                    const user = result.rows[0];

                    if (user.deleted_at) {
                        return done(null, false, { message: 'This account has been deleted. Contact the super administrator for account restoration.' });
                    }

                    const passwordMatch = await bcrypt.compare(password, user.password);
                    
                    if (!passwordMatch) {
                        return done(null, false, { message: "Incorrect username or password" });
                    }

                    return done(null, user);
                    
                } catch (error) {
                    console.error("Error during authentication:", error);
                    return done(error);
                }
            }
        ));

        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser(async (id, cb) => {
            try {
                const CheckQuery = `
                    SELECT id, first_name, last_name, email, role, is_verified, must_change_password, status, deleted_at
                    FROM administrator
                    WHERE id = $1 AND deleted_at IS NULL
                `;

                const result = await db.query(CheckQuery, [id]);

                if (result.rows.length === 0) {
                    const deletedLookupResult = await db.query(`
                        SELECT id, deleted_at
                        FROM administrator
                        WHERE id = $1
                        LIMIT 1;
                    `, [id]);

                    if (deletedLookupResult.rowCount > 0 && deletedLookupResult.rows[0].deleted_at) {
                        await PassportConfig.logDeletedSessionInvalidation(id);
                    }
                    
                    return cb(null, false);
                }

                return cb(null, result.rows[0]); // This becomes req.user in route handlers

                
            } catch (error) {
                cb(error);
            }
        });
    }

}


export default PassportConfig;