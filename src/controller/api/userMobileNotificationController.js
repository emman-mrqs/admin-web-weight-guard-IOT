import db from '../../database/db.js';

class UserMobileNotificationController {
  static async getInbox(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const { rows } = await db.query(`
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
        WHERE nr.user_id = $1
          AND nr.is_deleted = FALSE
        ORDER BY n.created_at DESC, nr.id DESC;
      `, [userId]);

      const notifications = rows.map((row) => ({
        recipientId: Number(row.recipient_id),
        notificationId: Number(row.notification_id),
        title: String(row.title || '').trim() || 'Notification',
        message: String(row.message || '').trim() || '',
        type: String(row.type || 'announcement').trim().toLowerCase(),
        priority: String(row.priority || 'normal').trim().toLowerCase(),
        targetAudience: String(row.target_audience || '').trim().toLowerCase() || null,
        isRead: row.is_read === true,
        readAt: row.read_at,
        createdAt: row.created_at,
        sender: {
          id: row.created_by ? Number(row.created_by) : null,
          name: `${String(row.sender_first_name || '').trim()} ${String(row.sender_last_name || '').trim()}`.trim() || 'System'
        }
      }));

      const unreadCount = notifications.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);

      return res.status(200).json({
        success: true,
        data: notifications,
        unreadCount
      });
    } catch (error) {
      console.error('Error fetching mobile inbox notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications.'
      });
    }
  }

  static async markAllAsRead(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const updateResult = await db.query(`
        UPDATE notification_recipients
        SET is_read = TRUE,
            read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1
          AND is_deleted = FALSE
          AND is_read = FALSE;
      `, [userId]);

      return res.status(200).json({
        success: true,
        message: 'Notifications marked as read.',
        updatedCount: updateResult.rowCount || 0
      });
    } catch (error) {
      console.error('Error marking mobile notifications as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update notifications.'
      });
    }
  }
}

export default UserMobileNotificationController;
