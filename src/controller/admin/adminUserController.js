// Admin User Controller
import db from '../../database/db.js';
import nodemailerService from '../../utils/emailService.js';


class AdminUserController {
    static getUsers (req, res) {
        try {
            res.render("admin/adminUser", {
                currentPage: "user"
            });
        } catch (error) {
            console.error("Error rendering admin users page:", error);
            res.status(500).send("An error occurred while loading the users page.");
        }
    }

    static async getAllUsers(req, res) {
        try {
            const query = `
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.email,
                    u.status,
                    u.is_verified,
                    u.created_at,
                    u.updated_at,
                    u.deleted_at,
                    v.id AS vehicle_id,
                    v.plate_number AS vehicle_plate_number,
                    v.current_state AS vehicle_state,
                    EXISTS (
                        SELECT 1
                        FROM suspension_logs s
                        WHERE s.user_id = u.id
                          AND (s.ended_at IS NULL OR s.ended_at > NOW())
                    ) AS is_suspended
                FROM users u
                LEFT JOIN LATERAL (
                    SELECT id, plate_number, current_state
                    FROM vehicles
                    WHERE assigned_driver_id = u.id
                    ORDER BY id DESC
                    LIMIT 1
                ) v ON TRUE
                ORDER BY u.created_at DESC
            `;

            const result = await db.query(query);

            return res.status(200).json({ data: result.rows });
        } catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).json({ error: "An error occurred while fetching users." });
        }
    }

    static async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const { firstName, lastName, status } = req.body;

            // ─── VALIDATION ───
            if (!userId) {
                return res.status(400).json({ error: "User ID is required." });
            }

            if (!firstName || !lastName) {
                return res.status(400).json({ error: "First name and last name are required." });
            }

            const firstNameTrimmed = String(firstName).trim();
            const lastNameTrimmed = String(lastName).trim();

            if (firstNameTrimmed.length === 0 || lastNameTrimmed.length === 0) {
                return res.status(400).json({ error: "First name and last name cannot be empty." });
            }

            // ─── CHECK USER EXISTS ───
            const checkQuery = `
                SELECT id, is_verified, status,
                       EXISTS (
                           SELECT 1
                           FROM suspension_logs s
                           WHERE s.user_id = users.id
                             AND (s.ended_at IS NULL OR s.ended_at > NOW())
                       ) AS is_suspended
                FROM users 
                WHERE id = $1 AND deleted_at IS NULL
            `;
            const checkResult = await db.query(checkQuery, [userId]);

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ error: "User not found." });
            }

            const user = checkResult.rows[0];

            if (Boolean(user.is_suspended)) {
                return res.status(400).json({ error: "Suspended users cannot be edited until suspension is lifted." });
            }

            // ─── VALIDATE STATUS CHANGE ───
            let newStatus = user.status;
            if (status !== undefined && status !== null) {
                const statusLower = String(status).toLowerCase();
                
                // Only allow 'active' or 'inactive' - NOT 'pending'
                if (!['active', 'inactive'].includes(statusLower)) {
                    return res.status(400).json({ error: "Invalid status. Allowed values: active, inactive." });
                }

                // Only allow status change if user is verified
                if (!user.is_verified) {
                    return res.status(400).json({ error: "Cannot change status for unverified users. User must be verified first." });
                }

                newStatus = statusLower;
            }

            // ─── UPDATE USER ───
            const updateQuery = `
                UPDATE users
                SET first_name = $1, last_name = $2, status = $3, updated_at = NOW()
                WHERE id = $4
                RETURNING id, first_name, last_name, email, status, is_verified, created_at, updated_at
            `;

            const updateResult = await db.query(updateQuery, [firstNameTrimmed, lastNameTrimmed, newStatus, userId]);
            const updatedUser = {
                ...updateResult.rows[0],
                is_suspended: false
            };

            return res.status(200).json({
                message: "User updated successfully.",
                user: updatedUser
            });

        } catch (error) {
            console.error("Error updating user:", error);
            res.status(500).json({ error: "An error occurred while updating the user." });
        }
    }

    static async suspendUser(req, res) {
        const { userId } = req.params;
        const { suspensionType, reason, endDate } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required." });
        }

        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ error: "Suspension reason is required." });
        }

        const normalizedType = String(suspensionType || '').toLowerCase();
        if (!['temporary', 'permanent'].includes(normalizedType)) {
            return res.status(400).json({ error: "Invalid suspension type. Allowed values: temporary, permanent." });
        }

        let parsedEndDate = null;
        if (normalizedType === 'temporary') {
            if (!endDate) {
                return res.status(400).json({ error: "End date is required for temporary suspension." });
            }

            parsedEndDate = new Date(endDate);
            if (Number.isNaN(parsedEndDate.getTime()) || parsedEndDate <= new Date()) {
                return res.status(400).json({ error: "End date must be a valid future date." });
            }
        }

        try {
            await db.query('BEGIN');

            const userResult = await db.query(
                `
                    SELECT id, email, first_name, last_name
                    FROM users
                    WHERE id = $1 AND deleted_at IS NULL
                `,
                [userId]
            );

            if (userResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: "User not found." });
            }

            const activeSuspensionResult = await db.query(
                `
                    SELECT id
                    FROM suspension_logs
                    WHERE user_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                    LIMIT 1
                `,
                [userId]
            );

            if (activeSuspensionResult.rows.length > 0) {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "User already has an active suspension." });
            }

            await db.query(
                `
                    INSERT INTO suspension_logs (banned_by, user_id, administrator_id, reason, started_at, ended_at)
                    VALUES ($1, $2, $3, $4, NOW(), $5)
                `,
                [null, userId, null, String(reason).trim(), parsedEndDate]
            );

            const updateUserResult = await db.query(
                `
                    UPDATE users
                    SET status = 'suspended', updated_at = NOW()
                    WHERE id = $1
                    RETURNING id, first_name, last_name, email, status, is_verified, created_at, updated_at
                `,
                [userId]
            );

            await db.query('COMMIT');

            const user = userResult.rows[0];
            const emailResult = await nodemailerService.sendSuspensionNoticeEmail(
                user.email,
                user.first_name,
                user.last_name,
                String(reason).trim(),
                parsedEndDate
            );

            return res.status(200).json({
                message: "User suspended successfully.",
                user: {
                    ...updateUserResult.rows[0],
                    is_suspended: true
                },
                emailSent: Boolean(emailResult?.success)
            });
        } catch (error) {
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during suspension rollback:', rollbackError);
            }

            console.error("Error suspending user:", error);
            return res.status(500).json({ error: "An error occurred while suspending the user." });
        }
    }

    static async getUserSuspensionDetails(req, res) {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required." });
        }

        try {
            const result = await db.query(
                `
                    SELECT
                        s.id,
                        s.reason,
                        s.started_at,
                        s.ended_at,
                        u.id AS user_id,
                        u.first_name,
                        u.last_name
                    FROM suspension_logs s
                    INNER JOIN users u ON u.id = s.user_id
                    WHERE s.user_id = $1
                      AND (s.ended_at IS NULL OR s.ended_at > NOW())
                    ORDER BY s.started_at DESC
                    LIMIT 1
                `,
                [userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "No active suspension found for this user." });
            }

            const suspension = result.rows[0];
            const type = suspension.ended_at ? 'temporary' : 'permanent';

            return res.status(200).json({
                details: {
                    userId: suspension.user_id,
                    fullName: `${suspension.first_name} ${suspension.last_name}`,
                    type,
                    reason: suspension.reason,
                    startedAt: suspension.started_at,
                    endedAt: suspension.ended_at
                }
            });
        } catch (error) {
            console.error("Error fetching suspension details:", error);
            return res.status(500).json({ error: "An error occurred while loading suspension details." });
        }
    }

    static async liftUserSuspension(req, res) {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required." });
        }

        try {
            await db.query('BEGIN');

            const userResult = await db.query(
                `
                    SELECT id, email, first_name, last_name, is_verified
                    FROM users
                    WHERE id = $1 AND deleted_at IS NULL
                `,
                [userId]
            );

            if (userResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: "User not found." });
            }

            const activeSuspensionResult = await db.query(
                `
                    SELECT id
                    FROM suspension_logs
                    WHERE user_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                    ORDER BY started_at DESC
                    LIMIT 1
                `,
                [userId]
            );

            if (activeSuspensionResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: "No active suspension found for this user." });
            }

            const suspensionId = activeSuspensionResult.rows[0].id;

            await db.query(
                `
                    UPDATE suspension_logs
                    SET ended_at = NOW()
                    WHERE id = $1
                `,
                [suspensionId]
            );

            const user = userResult.rows[0];
            const restoredStatus = user.is_verified ? 'active' : 'pending';

            const updatedUserResult = await db.query(
                `
                    UPDATE users
                    SET status = $1, updated_at = NOW()
                    WHERE id = $2
                    RETURNING id, first_name, last_name, email, status, is_verified, created_at, updated_at
                `,
                [restoredStatus, userId]
            );

            await db.query('COMMIT');

            const emailResult = await nodemailerService.sendSuspensionLiftedEmail(
                user.email,
                user.first_name,
                user.last_name
            );

            return res.status(200).json({
                message: "User suspension lifted successfully.",
                user: {
                    ...updatedUserResult.rows[0],
                    is_suspended: false
                },
                emailSent: Boolean(emailResult?.success)
            });
        } catch (error) {
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during lift rollback:', rollbackError);
            }

            console.error("Error lifting suspension:", error);
            return res.status(500).json({ error: "An error occurred while lifting the suspension." });
        }
    }

    static async softDeleteStaff(req, res) {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required." });
        }

        try {
            const userResult = await db.query(
                `
                    SELECT
                        u.id,
                        u.first_name,
                        u.last_name,
                        u.email,
                        u.status,
                        u.is_verified,
                        u.created_at,
                        u.updated_at,
                        u.deleted_at,
                        EXISTS (
                            SELECT 1
                            FROM suspension_logs s
                            WHERE s.user_id = u.id
                              AND (s.ended_at IS NULL OR s.ended_at > NOW())
                        ) AS is_suspended
                    FROM users u
                    WHERE u.id = $1
                `,
                [userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: "User not found." });
            }

            const user = userResult.rows[0];

            if (user.deleted_at) {
                const deletedAt = new Date(user.deleted_at);
                const elapsedDays = Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));

                if (elapsedDays < 30) {
                    return res.status(400).json({
                        error: `Permanent delete is available after 30 days. ${30 - elapsedDays} day(s) remaining.`
                    });
                }

                await db.query(`DELETE FROM users WHERE id = $1`, [userId]);

                return res.status(200).json({
                    message: "User permanently deleted successfully.",
                    permanentlyDeleted: true,
                    userId: Number(userId)
                });
            }

            const softDeleteResult = await db.query(
                `
                    UPDATE users
                    SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
                    WHERE id = $1
                    RETURNING id, first_name, last_name, email, status, is_verified, created_at, updated_at, deleted_at
                `,
                [userId]
            );

            return res.status(200).json({
                message: "User soft deleted successfully.",
                permanentlyDeleted: false,
                user: {
                    ...softDeleteResult.rows[0],
                    is_suspended: Boolean(user.is_suspended)
                }
            });
        } catch (error) {
            console.error("Error soft deleting user:", error);
            return res.status(500).json({ error: "An error occurred while deleting the user." });
        }
    }

    static async restoreSoftDeletedStaff(req, res) {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required." });
        }

        try {
            const userResult = await db.query(
                `
                    SELECT
                        u.id,
                        u.is_verified,
                        u.deleted_at,
                        EXISTS (
                            SELECT 1
                            FROM suspension_logs s
                            WHERE s.user_id = u.id
                              AND (s.ended_at IS NULL OR s.ended_at > NOW())
                        ) AS is_suspended
                    FROM users u
                    WHERE u.id = $1
                `,
                [userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: "User not found." });
            }

            const user = userResult.rows[0];

            if (!user.deleted_at) {
                return res.status(400).json({ error: "User is not soft deleted." });
            }

            const restoredStatus = user.is_suspended
                ? 'suspended'
                : (user.is_verified ? 'active' : 'pending');

            const restoreResult = await db.query(
                `
                    UPDATE users
                    SET deleted_at = NULL, status = $1, updated_at = NOW()
                    WHERE id = $2
                    RETURNING id, first_name, last_name, email, status, is_verified, created_at, updated_at, deleted_at
                `,
                [restoredStatus, userId]
            );

            return res.status(200).json({
                message: "User restored successfully.",
                user: {
                    ...restoreResult.rows[0],
                    is_suspended: Boolean(user.is_suspended)
                }
            });
        } catch (error) {
            console.error("Error restoring soft deleted user:", error);
            return res.status(500).json({ error: "An error occurred while restoring the user." });
        }
    }

}

export default AdminUserController;