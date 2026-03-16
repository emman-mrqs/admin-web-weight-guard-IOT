// Admin Report Controller


class AdminReportsController {
    static getReports (req, res) {
        try {
            res.render("admin/adminReports", {
                currentPage: "reports"
            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default  AdminReportsController;