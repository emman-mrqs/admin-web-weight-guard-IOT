// Admin audit Logs Controller
import db from '../../database/db.js';

class AdminAuditLogsController {
    static getAuditLogs (req, res) {
        try {
            res.render('admin/adminAuditLogs', {
                currentPage: 'audit-logs'
            });
        } catch (error) {
            console.error('Error rendering audit logs page:', error);
            res.status(500).send('Failed to load audit logs page.');
        }
    }

    static async getAuditLogsData(req, res) {
        try {
            const result = await db.query(
                `
                    SELECT
                        al.id,
                        al.action,
                        al.module,
                        al.description,
                        al.severity,
                        al.ip_address,
                        al.user_agent,
                        al.details,
                        al.created_at,
                        al.administrator_id,
                        a.first_name,
                        a.last_name,
                        a.email
                    FROM audit_logs al
                    LEFT JOIN administrator a
                        ON a.id = al.administrator_id
                    ORDER BY al.created_at DESC, al.id DESC
                    LIMIT 500;
                `
            );

            const rows = result.rows.map((row) => {
                const actorName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
                return {
                    id: Number(row.id),
                    eventName: String(row.action || '').trim() || 'UNKNOWN_ACTION',
                    module: String(row.module || '').trim() || 'GENERAL',
                    description: String(row.description || '').trim() || 'No description available.',
                    severity: String(row.severity || 'Medium').trim() || 'Medium',
                    ipAddress: String(row.ip_address || '').trim() || 'N/A',
                    userAgent: String(row.user_agent || '').trim() || 'N/A',
                    details: row.details || {},
                    createdAt: row.created_at,
                    actor: actorName || row.email || 'System',
                    actorEmail: row.email || null,
                    administratorId: row.administrator_id ? Number(row.administrator_id) : null
                };
            });

            return res.status(200).json({ data: rows });
        } catch (error) {
            console.error('Error fetching audit logs data:', error);
            return res.status(500).json({ message: 'Failed to fetch audit logs.' });
        }
    }
}

export default AdminAuditLogsController;