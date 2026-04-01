import db from '../../database/db.js';

class UserMobileDashboardController {
  static async getDashboard(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const userQuery = `
        SELECT id, first_name, last_name, email, status, is_verified, deleted_at
        FROM users
        WHERE id = $1
        LIMIT 1;
      `;

      const { rows } = await db.query(userQuery, [userId]);
      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      const user = rows[0];
      if (user.deleted_at || !user.is_verified) {
        return res.status(403).json({
          success: false,
          message: 'Account is not allowed to access dashboard.'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            status: user.status
          },
          kpis: {
            avgLoadKg: 0,
            tasksCompleted: 0,
            totalTasks: 0,
            completionRate: 0
          },
          weightTrendKg: [],
          insights: [
            { label: 'Most active route', value: 'No data yet' },
            { label: 'Peak loading window', value: 'No data yet' },
            { label: 'Avg unloading delay', value: 'No data yet' }
          ],
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error loading mobile dashboard:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while loading dashboard data.'
      });
    }
  }
}

export default UserMobileDashboardController;
