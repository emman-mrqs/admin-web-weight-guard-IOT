// Admin Dashboard Controller
import db from '../../database/db.js';


class AdminDashboardController {
    static getDashboard (req, res) {
        try {
            res.render("admin/adminDashboard", {
                currentPage: "dashboard"
            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default AdminDashboardController;