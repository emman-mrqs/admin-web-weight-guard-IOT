// Admin auit Logs Controller

class AdminAuditLogsController {
    static getAuditLogs (req, res) {
        try {
            res.render("admin/adminAuditLogs", {
                currentPage: "audit-logs"
            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default AdminAuditLogsController;