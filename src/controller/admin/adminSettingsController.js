// Admin Settings Controller
import bcrypt from 'bcrypt';
import db from '../../database/db.js';

class AdminSettingsController {
    static getSessionAdministratorId(req) {
        const fromSessionCookie = Number(req.session?.passport?.user);
        if (Number.isFinite(fromSessionCookie) && fromSessionCookie > 0) {
            return fromSessionCookie;
        }

        const fromUser = Number(req.user?.id);
        if (Number.isFinite(fromUser) && fromUser > 0) {
            return fromUser;
        }

        return null;
    }

    static formatDateLabel(value) {
        if (!value) {
            return 'N/A';
        }

        const dateValue = new Date(value);
        if (Number.isNaN(dateValue.getTime())) {
            return 'N/A';
        }

        return dateValue.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        });
    }

    static normalizeRole(role) {
        return String(role || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
    }

    static resolveRoleLabel(role) {
        const normalizedRole = AdminSettingsController.normalizeRole(role);
        if (!normalizedRole) {
            return 'Administrator';
        }

        return normalizedRole
            .split(' ')
            .filter(Boolean)
            .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
            .join(' ');
    }

    static buildInitials(firstName, lastName) {
        const first = String(firstName || '').trim().charAt(0);
        const last = String(lastName || '').trim().charAt(0);
        return `${first}${last}`.toUpperCase() || 'AD';
    }

    static async getSettings (req, res) {
        try {
            return res.render('admin/adminSettings', {
                currentPage: 'settings'
            });
        } catch (error) {
            console.error('Error loading admin settings:', error);
            return res.status(500).send('An error occurred while loading account settings.');
        }
    }

    static async getCurrentAccount(req, res) {
        try {
            const administratorId = AdminSettingsController.getSessionAdministratorId(req);
            if (!administratorId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const result = await db.query(
                `
                    SELECT
                        id,
                        first_name,
                        last_name,
                        email,
                        role,
                        status,
                        is_verified,
                        created_at,
                        updated_at
                    FROM administrator
                    WHERE id = $1
                      AND deleted_at IS NULL
                    LIMIT 1;
                `,
                [administratorId]
            );

            if (!result.rows.length) {
                return res.status(404).json({ message: 'Administrator not found.' });
            }

            const admin = result.rows[0];
            return res.status(200).json({
                account: {
                    id: admin.id,
                    firstName: admin.first_name || '',
                    lastName: admin.last_name || '',
                    fullName: `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Administrator',
                    email: admin.email || 'N/A',
                    role: admin.role || null,
                    roleLabel: AdminSettingsController.resolveRoleLabel(admin.role),
                    status: String(admin.status || 'inactive').toLowerCase(),
                    isVerified: Boolean(admin.is_verified),
                    memberSince: AdminSettingsController.formatDateLabel(admin.created_at),
                    updatedAt: AdminSettingsController.formatDateLabel(admin.updated_at),
                    initials: AdminSettingsController.buildInitials(admin.first_name, admin.last_name)
                }
            });
        } catch (error) {
            console.error('Error fetching current account settings:', error);
            return res.status(500).json({ message: 'Failed to load account settings.' });
        }
    }

    static async changePassword(req, res) {
        try {
            const administratorId = AdminSettingsController.getSessionAdministratorId(req);
            if (!administratorId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const currentPassword = String(req.body?.currentPassword || '');
            const newPassword = String(req.body?.newPassword || '');
            const confirmPassword = String(req.body?.confirmPassword || '');

            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: 'All password fields are required.' });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: 'New password and confirm password do not match.' });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
            }

            const accountResult = await db.query(
                `
                    SELECT id, password
                    FROM administrator
                    WHERE id = $1
                      AND deleted_at IS NULL
                    LIMIT 1;
                `,
                [administratorId]
            );

            if (!accountResult.rows.length) {
                return res.status(404).json({ success: false, message: 'Administrator account not found.' });
            }

            const admin = accountResult.rows[0];
            const passwordMatches = await bcrypt.compare(currentPassword, String(admin.password || ''));
            if (!passwordMatches) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
            }

            const sameAsCurrent = await bcrypt.compare(newPassword, String(admin.password || ''));
            if (sameAsCurrent) {
                return res.status(400).json({ success: false, message: 'New password must be different from current password.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await db.query(
                `
                    UPDATE administrator
                    SET password = $1,
                        must_change_password = FALSE,
                        updated_at = NOW()
                    WHERE id = $2
                      AND deleted_at IS NULL;
                `,
                [hashedPassword, administratorId]
            );

            return res.status(200).json({ success: true, message: 'Password changed successfully.' });
        } catch (error) {
            console.error('Error changing administrator password:', error);
            return res.status(500).json({ success: false, message: 'Failed to change password.' });
        }
    }
}

export default AdminSettingsController;