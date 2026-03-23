// Admin Staff Management Controller
import db from '../../database/db.js';
import nodemailerService from '../../utils/emailService.js';

async function hasActiveSuspension(administratorId, queryClient = db) {
    const result = await queryClient.query(
        `
            SELECT id
            FROM suspension_logs
            WHERE administrator_id = $1
              AND (ended_at IS NULL OR ended_at > NOW())
            ORDER BY started_at DESC NULLS LAST, id DESC
            LIMIT 1
        `,
        [administratorId]
    );

    return result.rows.length > 0;
}

async function resolveAdministratorStatus({ administratorId, isVerified, deletedAt }, queryClient = db) {
    if (deletedAt) {
        return 'deleted';
    }

    const activeSuspended = await hasActiveSuspension(administratorId, queryClient);
    if (activeSuspended) {
        return 'suspended';
    }

    return Boolean(isVerified) ? 'active' : 'pending';
}

class AdminStaffController {

    static async getStaffList(req, res) {
        try {
            res.render("admin/adminStaff", {
                currentPage: "staff"
            });
        } catch (error) {
            console.error("Error rendering staff list page:", error);
            res.status(500).send("An error occurred while loading the staff page.");
        }
    }

    static async fetchAllStaff(req, res) {
        try {
            const query = `
                SELECT
                    a.id,
                    a.first_name,
                    a.last_name,
                    a.email,
                    a.role,
                    a.is_verified,
                    a.status,
                    a.verification_expires,
                    a.created_at,
                    a.updated_at,
                    a.deleted_at,
                                        EXISTS (
                                                SELECT 1
                                                FROM suspension_logs sl
                                                WHERE sl.administrator_id = a.id
                                                    AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                                        ) as is_suspended,
                    (
                        SELECT reason
                        FROM suspension_logs sl
                        WHERE sl.administrator_id = a.id
                          AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                                                ORDER BY sl.started_at DESC NULLS LAST, sl.id DESC
                        LIMIT 1
                    ) as suspension_reason,
                    (
                        SELECT started_at
                        FROM suspension_logs sl
                        WHERE sl.administrator_id = a.id
                          AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                                                ORDER BY sl.started_at DESC NULLS LAST, sl.id DESC
                        LIMIT 1
                    ) as suspension_started_at
                FROM administrator a
                WHERE a.role IN ('dispatch_staff', 'incident_staff')
                ORDER BY a.created_at DESC
            `;

            const result = await db.query(query);
            return res.status(200).json({ data: result.rows });
        } catch (error) {
            console.error("Error fetching staff list:", error);
            return res.status(500).json({ error: "An error occurred while fetching staff list." });
        }
    }

    static async updateStaff(req, res) {
        try {
            const { staffId } = req.params;
            const { firstName, lastName, role, status } = req.body;

            const normalizedStaffId = Number(staffId);
            if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
                return res.status(400).json({ error: 'Invalid staff ID.' });
            }

            const normalizedFirstName = String(firstName || '').trim();
            const normalizedLastName = String(lastName || '').trim();
            const normalizedRole = String(role || '').trim().toLowerCase();
            const normalizedStatus = String(status || '').trim().toLowerCase();

            if (!normalizedFirstName || !normalizedLastName) {
                return res.status(400).json({ error: 'First name and last name are required.' });
            }

            if (!['dispatch_staff', 'incident_staff'].includes(normalizedRole)) {
                return res.status(400).json({ error: 'Invalid role. Allowed values: dispatch_staff, incident_staff.' });
            }

            const staffResult = await db.query(
                `
                    SELECT
                        id,
                        is_verified,
                        status,
                        EXISTS (
                            SELECT 1
                            FROM suspension_logs sl
                            WHERE sl.administrator_id = administrator.id
                              AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                        ) AS is_suspended
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    LIMIT 1
                `,
                [normalizedStaffId]
            );

            if (staffResult.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found.' });
            }

            const existingStaff = staffResult.rows[0];

            if (Boolean(existingStaff.is_suspended)) {
                return res.status(400).json({ error: 'Suspended staff cannot be edited until suspension is lifted.' });
            }

            let nextStatus = String(existingStaff.status || '').toLowerCase();
            if (status !== undefined && status !== null) {
                if (!['active', 'inactive'].includes(normalizedStatus)) {
                    return res.status(400).json({ error: 'Invalid status. Allowed values: active, inactive.' });
                }

                if (!existingStaff.is_verified) {
                    return res.status(400).json({ error: 'Cannot change status for unverified staff. Verify the account first.' });
                }

                nextStatus = normalizedStatus;
            }

            const updateResult = await db.query(
                `
                    UPDATE administrator
                    SET
                        first_name = $1,
                        last_name = $2,
                        role = $3,
                        status = $4,
                        updated_at = NOW()
                                        WHERE id = $5
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    RETURNING id, first_name, last_name, email, role, status, is_verified, verification_expires, created_at, updated_at, deleted_at
                `,
                [normalizedFirstName, normalizedLastName, normalizedRole, nextStatus, normalizedStaffId]
            );

            return res.status(200).json({
                message: 'Staff updated successfully.',
                staff: updateResult.rows[0]
            });
        } catch (error) {
            console.error('Error updating staff:', error);
            return res.status(500).json({ error: 'An error occurred while updating staff.' });
        }
    }

    static async softDeleteStaff(req, res) {
        try {
            const { staffId } = req.params;
            const normalizedStaffId = Number(staffId);

            if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
                return res.status(400).json({ error: 'Invalid staff ID.' });
            }

            const existingResult = await db.query(
                `
                    SELECT
                        a.id,
                        a.first_name,
                        a.last_name,
                        a.email,
                        a.role,
                        a.status,
                        a.is_verified,
                        a.created_at,
                        a.updated_at,
                        a.deleted_at,
                        EXISTS (
                            SELECT 1
                            FROM suspension_logs sl
                            WHERE sl.administrator_id = a.id
                              AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                        ) AS is_suspended
                    FROM administrator a
                                        WHERE a.id = $1
                                            AND a.role IN ('dispatch_staff', 'incident_staff')
                    LIMIT 1
                `,
                [normalizedStaffId]
            );

            if (existingResult.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found.' });
            }

            const staff = existingResult.rows[0];

            if (staff.deleted_at) {
                const deletedAt = new Date(staff.deleted_at);
                const elapsedDays = Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));

                if (elapsedDays < 30) {
                    return res.status(400).json({
                        error: `Permanent delete is available after 30 days. ${30 - elapsedDays} day(s) remaining.`
                    });
                }

                await db.query(
                    `DELETE FROM administrator WHERE id = $1 AND role IN ('dispatch_staff', 'incident_staff')`,
                    [normalizedStaffId]
                );

                return res.status(200).json({
                    message: 'Staff permanently deleted successfully.',
                    permanentlyDeleted: true,
                    staffId: normalizedStaffId
                });
            }

            const softDeleteResult = await db.query(
                `
                    UPDATE administrator
                    SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
                                        WHERE id = $1
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    RETURNING id, first_name, last_name, email, role, status, is_verified, verification_expires, created_at, updated_at, deleted_at
                `,
                [normalizedStaffId]
            );

            return res.status(200).json({
                message: 'Staff soft deleted successfully.',
                permanentlyDeleted: false,
                staff: {
                    ...softDeleteResult.rows[0],
                    is_suspended: Boolean(staff.is_suspended)
                }
            });
        } catch (error) {
            console.error('Error deleting staff:', error);
            return res.status(500).json({ error: 'An error occurred while deleting staff.' });
        }
    }

    static async restoreDeletedStaff(req, res) {
        const { staffId } = req.params;
        const normalizedStaffId = Number(staffId);

        if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
            return res.status(400).json({ error: 'Invalid staff ID.' });
        }

        try {
            const staffResult = await db.query(
                `
                    SELECT id, first_name, last_name, is_verified, deleted_at
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NOT NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [normalizedStaffId]
            );

            if (staffResult.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found or not deleted.' });
            }

            const staff = staffResult.rows[0];
            const restoredStatus = await resolveAdministratorStatus({
                administratorId: normalizedStaffId,
                isVerified: staff.is_verified,
                deletedAt: null
            });

            await db.query(
                `
                    UPDATE administrator
                    SET deleted_at = NULL, status = $1, updated_at = NOW()
                                        WHERE id = $2
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [restoredStatus, normalizedStaffId]
            );

            const updatedStaff = await db.query(
                `
                    SELECT id, first_name, last_name, email, role, is_verified, status, created_at, updated_at, deleted_at,
                           EXISTS (
                               SELECT 1
                               FROM suspension_logs sl
                               WHERE sl.administrator_id = administrator.id
                                 AND (sl.ended_at IS NULL OR sl.ended_at > NOW())
                           ) AS is_suspended
                    FROM administrator
                                        WHERE id = $1
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [normalizedStaffId]
            );

            return res.status(200).json({
                message: 'Staff member restored successfully.',
                staff: updatedStaff.rows[0]
            });
        } catch (error) {
            console.error('Error restoring staff:', error);
            return res.status(500).json({ error: 'An error occurred while restoring staff.' });
        }
    }

    static async getStaffActivity(req, res) {
        try {
            const { staffId } = req.params;
            const normalizedStaffId = Number(staffId);

            if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
                return res.status(400).json({ error: 'Invalid staff ID.' });
            }

            const staffResult = await db.query(
                `
                    SELECT id, first_name, last_name
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    LIMIT 1
                `,
                [normalizedStaffId]
            );

            if (staffResult.rows.length === 0) {
                return res.status(404).json({ error: 'Staff member not found.' });
            }

            const activityResult = await db.query(
                `
                    SELECT
                        id,
                        action,
                        module,
                        description,
                        severity,
                        created_at
                    FROM audit_logs
                    WHERE administrator_id = $1
                    ORDER BY created_at DESC
                    LIMIT 25
                `,
                [normalizedStaffId]
            );

            return res.status(200).json({
                data: activityResult.rows
            });
        } catch (error) {
            console.error('Error fetching staff activity:', error);
            return res.status(500).json({ error: 'An error occurred while fetching staff activity.' });
        }
    }

    // ==============================
    // Staff Suspension Management
    // ==============================

    static async suspendStaff(req, res) {
        const { staffId } = req.params;
        const { suspensionType, reason, endDate } = req.body;

        const normalizedStaffId = Number(staffId);

        if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
            return res.status(400).json({ error: "Staff ID is required." });
        }

        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ error: "Suspension reason is required." });
        }

        const normalizedType = String(suspensionType || 'permanent').toLowerCase();
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

            const staffResult = await db.query(
                `
                    SELECT id, email, first_name, last_name, role
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [normalizedStaffId]
            );

            if (staffResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: "Staff member not found." });
            }

            const activeSuspensionResult = await db.query(
                `
                    SELECT id
                    FROM suspension_logs
                    WHERE administrator_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                    LIMIT 1
                `,
                [normalizedStaffId]
            );

            if (activeSuspensionResult.rows.length > 0) {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Staff member already has an active suspension." });
            }

            await db.query(
                `
                    INSERT INTO suspension_logs (administrator_id, reason, started_at, ended_at)
                    VALUES ($1, $2, NOW(), $3)
                `,
                [normalizedStaffId, String(reason).trim(), parsedEndDate]
            );

            const updatedStaffResult = await db.query(
                `
                    UPDATE administrator
                    SET status = 'suspended', updated_at = NOW()
                                        WHERE id = $1
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    RETURNING id, first_name, last_name, email, role, status, is_verified, verification_expires, created_at, updated_at, deleted_at
                `,
                [normalizedStaffId]
            );

            // Send suspension notification email
            const staff = staffResult.rows[0];
            if (staff.email) {
                await nodemailerService.sendSuspensionNoticeEmail(
                    staff.email,
                    staff.first_name,
                    staff.last_name,
                    String(reason).trim(),
                    parsedEndDate
                );
            }

            await db.query('COMMIT');

            return res.status(200).json({ 
                message: "Staff member suspended successfully.",
                suspended: true,
                staff: {
                    ...updatedStaffResult.rows[0],
                    is_suspended: true
                }
            });
        } catch (error) {
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during suspension rollback:', rollbackError);
            }
            console.error('Error suspending staff:', error);
            return res.status(500).json({ error: 'An error occurred while suspending the staff member.' });
        }
    }

    static async liftSuspension(req, res) {
        const { staffId } = req.params;

        const normalizedStaffId = Number(staffId);

        if (!Number.isFinite(normalizedStaffId) || normalizedStaffId <= 0) {
            return res.status(400).json({ error: "Staff ID is required." });
        }

        try {
            await db.query('BEGIN');

            const staffResult = await db.query(
                `
                    SELECT id, email, first_name, last_name, role, is_verified
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [normalizedStaffId]
            );

            if (staffResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: "Staff member not found." });
            }

            const suspensionResult = await db.query(
                `
                    SELECT id
                    FROM suspension_logs
                    WHERE administrator_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                    LIMIT 1
                `,
                [normalizedStaffId]
            );

            if (suspensionResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Staff member does not have an active suspension." });
            }

            await db.query(
                `
                    UPDATE suspension_logs
                    SET ended_at = NOW()
                    WHERE administrator_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                `,
                [normalizedStaffId]
            );

            const staff = staffResult.rows[0];
            const restoredStatus = await resolveAdministratorStatus({
                administratorId: normalizedStaffId,
                isVerified: staff.is_verified,
                deletedAt: null
            }, db);

            const updatedStaffResult = await db.query(
                `
                    UPDATE administrator
                    SET status = $1, updated_at = NOW()
                                        WHERE id = $2
                                            AND role IN ('dispatch_staff', 'incident_staff')
                    RETURNING id, first_name, last_name, email, role, status, is_verified, verification_expires, created_at, updated_at, deleted_at
                `,
                [restoredStatus, normalizedStaffId]
            );

            // Send suspension lifted email
            if (staff.email) {
                await nodemailerService.sendSuspensionLiftedEmail(
                    staff.email,
                    staff.first_name,
                    staff.last_name
                );
            }

            await db.query('COMMIT');

            return res.status(200).json({ 
                message: "Suspension lifted successfully.",
                suspended: false,
                staff: {
                    ...updatedStaffResult.rows[0],
                    is_suspended: false
                }
            });
        } catch (error) {
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during lift rollback:', rollbackError);
            }
            console.error('Error lifting suspension:', error);
            return res.status(500).json({ error: 'An error occurred while lifting the suspension.' });
        }
    }

    static async getSuspensionDetails(req, res) {
        const { staffId } = req.params;

        if (!staffId) {
            return res.status(400).json({ error: "Staff ID is required." });
        }

        try {
            const staffResult = await db.query(
                `
                    SELECT id, first_name, last_name
                    FROM administrator
                                        WHERE id = $1
                                            AND deleted_at IS NULL
                                            AND role IN ('dispatch_staff', 'incident_staff')
                `,
                [staffId]
            );

            if (staffResult.rows.length === 0) {
                return res.status(404).json({ error: "Staff member not found." });
            }

            const result = await db.query(
                `
                    SELECT
                        id,
                        reason,
                        started_at,
                        ended_at
                    FROM suspension_logs
                    WHERE administrator_id = $1
                      AND (ended_at IS NULL OR ended_at > NOW())
                    LIMIT 1
                `,
                [staffId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "No active suspension found." });
            }

            const suspension = result.rows[0];
            const staff = staffResult.rows[0];
            const type = suspension.ended_at ? 'temporary' : 'permanent';

            return res.status(200).json({ 
                details: {
                    staffId: staff.id,
                    staffName: `${staff.first_name} ${staff.last_name}`,
                    type,
                    reason: suspension.reason,
                    startedAt: suspension.started_at,
                    endedAt: suspension.ended_at
                }
            });
        } catch (error) {
            console.error('Error fetching suspension details:', error);
            return res.status(500).json({ error: 'An error occurred while fetching suspension details.' });
        }
    }
}

export default AdminStaffController;