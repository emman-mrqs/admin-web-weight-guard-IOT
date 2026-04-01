import db from '../../database/db.js';
import AuditLogService from '../../utils/auditLogService.js';

// Admin notification controller

class AdminNotificationController {
    static normalizeRole(role) {
        return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    static isSuperAdmin(user) {
        return AdminNotificationController.normalizeRole(user?.role) === 'super_admin';
    }

    static isAllowedSender(user) {
        const role = AdminNotificationController.normalizeRole(user?.role);
        return ['super_admin', 'incident_staff', 'dispatch_staff'].includes(role);
    }

    static normalizeAudience(audience) {
        const value = String(audience || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

        const map = {
            all: 'all',
            all_users: 'all',
            all_staff: 'staff',
            all_staff_and_drivers: 'all',
            staff: 'staff',
            staff_and_drivers: 'all',
            incident_staff: 'incident_staff',
            dispatch_staff: 'dispatch_staff',
            super_admin: 'super_admin',
            super_admins: 'super_admin',
            system_admins: 'super_admin',
            drivers: 'drivers',
            active_drivers_only: 'drivers',
            driver: 'drivers'
        };

        return map[value] || null;
    }

    static getAllowedAudiencesForRole(role) {
        if (role === 'super_admin') {
            return ['all', 'staff', 'incident_staff', 'dispatch_staff', 'super_admin', 'drivers'];
        }

        if (role === 'incident_staff') {
            return ['incident_staff', 'super_admin', 'drivers'];
        }

        if (role === 'dispatch_staff') {
            return ['dispatch_staff', 'super_admin', 'drivers'];
        }

        return [];
    }

    static normalizePriority(priority) {
        const value = String(priority || '').trim().toLowerCase();
        if (['critical', 'alert', 'high'].includes(value)) return 'critical';
        if (['warning', 'medium'].includes(value)) return 'high';
        return 'normal';
    }

    static resolveTypeFromPriority(priority) {
        if (priority === 'critical') return 'alert';
        if (priority === 'high') return 'warning';
        return 'announcement';
    }

    static getNotifications (req, res) {
        try {
            res.render("admin/adminNotification", {
                currentPage: "notifications"
            });
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }

    static getSendCapabilities(req, res) {
        const role = AdminNotificationController.normalizeRole(req.user?.role);
        const canSendAnnouncements = AdminNotificationController.isAllowedSender(req.user);

        return res.status(200).json({
            canSendAnnouncements,
            role,
            allowedAudiences: canSendAnnouncements
                ? AdminNotificationController.getAllowedAudiencesForRole(role)
                : []
        });
    }

    static async getInboxNotifications(req, res) {
        const adminId = Number(req.user?.id);
        if (!adminId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        try {
            const result = await db.query(`
                SELECT
                    nr.id AS recipient_id,
                    nr.notification_id,
                    nr.is_read,
                    nr.read_at,
                    n.title,
                    n.message,
                    n.type,
                    n.priority,
                    n.target_audience,
                    n.created_at,
                    n.created_by,
                    creator.first_name AS sender_first_name,
                    creator.last_name AS sender_last_name
                FROM notification_recipients nr
                INNER JOIN notification n ON n.id = nr.notification_id
                LEFT JOIN administrator creator ON creator.id = n.created_by
                WHERE nr.administrator_id = $1
                  AND nr.is_deleted = FALSE
                ORDER BY n.created_at DESC, nr.id DESC;
            `, [adminId]);

            const notifications = result.rows.map((row) => ({
                recipientId: Number(row.recipient_id),
                notificationId: Number(row.notification_id),
                title: row.title,
                message: row.message,
                type: row.type || 'announcement',
                priority: row.priority || 'normal',
                targetAudience: row.target_audience || null,
                isRead: row.is_read === true,
                readAt: row.read_at,
                createdAt: row.created_at,
                sender: {
                    id: row.created_by ? Number(row.created_by) : null,
                    name: `${String(row.sender_first_name || '').trim()} ${String(row.sender_last_name || '').trim()}`.trim() || 'System'
                }
            }));

            return res.status(200).json({
                data: notifications,
                unreadCount: notifications.filter((item) => !item.isRead).length
            });
        } catch (error) {
            console.error('Error loading inbox notifications:', error);
            return res.status(500).json({ message: 'Failed to load inbox notifications.' });
        }
    }

    static async getSentNotifications(req, res) {
        const adminId = Number(req.user?.id);
        if (!adminId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        try {
            const result = await db.query(`
                SELECT
                    n.id,
                    n.title,
                    n.message,
                    n.type,
                    n.priority,
                    n.target_audience,
                    n.created_at,
                    COUNT(nr.id)::int AS recipient_count
                FROM notification n
                LEFT JOIN notification_recipients nr ON nr.notification_id = n.id
                WHERE n.created_by = $1
                GROUP BY n.id
                ORDER BY n.created_at DESC, n.id DESC;
            `, [adminId]);

            const notifications = result.rows.map((row) => ({
                id: Number(row.id),
                title: row.title,
                message: row.message,
                type: row.type || 'announcement',
                priority: row.priority || 'normal',
                targetAudience: row.target_audience || null,
                recipientCount: Number(row.recipient_count) || 0,
                createdAt: row.created_at
            }));

            return res.status(200).json({ data: notifications });
        } catch (error) {
            console.error('Error loading sent notifications:', error);
            return res.status(500).json({ message: 'Failed to load sent notifications.' });
        }
    }

    static async markInboxAsRead(req, res) {
        const adminId = Number(req.user?.id);
        if (!adminId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        try {
            const result = await db.query(`
                UPDATE notification_recipients
                SET is_read = TRUE,
                    read_at = COALESCE(read_at, NOW())
                WHERE administrator_id = $1
                  AND is_deleted = FALSE
                  AND is_read = FALSE;
            `, [adminId]);

            return res.status(200).json({
                message: 'Inbox marked as read.',
                updatedCount: result.rowCount || 0
            });
        } catch (error) {
            console.error('Error marking inbox as read:', error);
            return res.status(500).json({ message: 'Failed to mark notifications as read.' });
        }
    }

    static async sendNotification(req, res) {
        if (!AdminNotificationController.isAllowedSender(req.user)) {
            return res.status(403).json({
                message: 'Forbidden: only super_admin, incident_staff, or dispatch_staff can send notifications.'
            });
        }

        const title = String(req.body?.title || '').trim();
        const message = String(req.body?.message || '').trim();
        const audience = AdminNotificationController.normalizeAudience(req.body?.targetAudience);
        const priority = AdminNotificationController.normalizePriority(req.body?.priority);
        const type = String(req.body?.type || '').trim().toLowerCase() || AdminNotificationController.resolveTypeFromPriority(priority);
        const senderRole = AdminNotificationController.normalizeRole(req.user?.role);
        const allowedAudiences = AdminNotificationController.getAllowedAudiencesForRole(senderRole);

        if (!title || title.length < 3) {
            return res.status(400).json({ message: 'Title must be at least 3 characters long.' });
        }

        if (!message || message.length < 5) {
            return res.status(400).json({ message: 'Message must be at least 5 characters long.' });
        }

        if (!audience) {
            return res.status(400).json({
                message: 'Invalid target audience. Allowed values: all, staff, incident_staff, dispatch_staff, super_admin, drivers.'
            });
        }

        if (!allowedAudiences.includes(audience)) {
            return res.status(403).json({
                message: `Forbidden: ${senderRole} cannot send to ${audience}.`
            });
        }

        const actorId = Number(req.user?.id) || null;
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            const notificationResult = await client.query(`
                INSERT INTO notification (created_by, title, message, type, target_audience, priority, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id, created_at;
            `, [actorId, title, message, type, audience, priority]);

            const notificationId = notificationResult.rows[0].id;

            let adminRoles = [];
            if (audience === 'all') {
                adminRoles = ['super_admin', 'incident_staff', 'dispatch_staff'];
            } else if (audience === 'staff') {
                adminRoles = ['incident_staff', 'dispatch_staff'];
            } else if (audience === 'incident_staff') {
                adminRoles = ['incident_staff'];
            } else if (audience === 'dispatch_staff') {
                adminRoles = ['dispatch_staff'];
            } else if (audience === 'super_admin') {
                adminRoles = ['super_admin'];
            }

            let adminRecipientIds = [];
            if (adminRoles.length > 0) {
                const adminRecipients = await client.query(`
                    SELECT id
                    FROM administrator
                    WHERE deleted_at IS NULL
                      AND LOWER(REGEXP_REPLACE(COALESCE(role, ''), '[\\s-]+', '_', 'g')) = ANY($1::text[]);
                `, [adminRoles]);
                adminRecipientIds = adminRecipients.rows.map((row) => Number(row.id)).filter(Boolean);
            }

            let driverRecipientIds = [];
            if (audience === 'all' || audience === 'drivers') {
                const driverRecipients = await client.query(`
                    SELECT id
                    FROM users
                    WHERE deleted_at IS NULL;
                `);
                driverRecipientIds = driverRecipients.rows.map((row) => Number(row.id)).filter(Boolean);
            }

            const totalRecipients = adminRecipientIds.length + driverRecipientIds.length;
            if (totalRecipients === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No recipients found for the selected target audience.' });
            }

            if (adminRecipientIds.length > 0) {
                await client.query(`
                    INSERT INTO notification_recipients (notification_id, administrator_id, user_id, is_read, is_deleted)
                    SELECT $1, recipient_id, NULL, FALSE, FALSE
                    FROM UNNEST($2::bigint[]) AS recipient_id;
                `, [notificationId, adminRecipientIds]);
            }

            if (driverRecipientIds.length > 0) {
                await client.query(`
                    INSERT INTO notification_recipients (notification_id, administrator_id, user_id, is_read, is_deleted)
                    SELECT $1, NULL, recipient_id, FALSE, FALSE
                    FROM UNNEST($2::bigint[]) AS recipient_id;
                `, [notificationId, driverRecipientIds]);
            }

            await AuditLogService.logAdminAction(client, req, {
                action: 'NOTIFICATION_SENT',
                module: 'NOTIFICATIONS',
                description: `Notification sent to ${totalRecipients} recipients.`,
                severity: priority === 'critical' ? 'High' : 'Medium',
                details: {
                    notificationId,
                    audience,
                    priority,
                    adminRecipients: adminRecipientIds.length,
                    driverRecipients: driverRecipientIds.length
                }
            });

            await client.query('COMMIT');

            return res.status(201).json({
                message: 'Notification sent successfully.',
                data: {
                    id: notificationId,
                    title,
                    audience,
                    priority,
                    type,
                    recipients: {
                        total: totalRecipients,
                        staff: adminRecipientIds.length,
                        drivers: driverRecipientIds.length
                    },
                    createdAt: notificationResult.rows[0].created_at
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error sending notification:', error);
            return res.status(500).json({ message: 'Internal server error while sending notification.' });
        } finally {
            client.release();
        }
    }
}


export default AdminNotificationController;