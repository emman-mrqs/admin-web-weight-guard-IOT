// Admin notification controller

class AdminNotificationController {
    static getNotifications (req, res) {
        try {
            res.render("admin/adminNotification", {
                currentPage: "notifications"
            });
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }
}


export default AdminNotificationController;