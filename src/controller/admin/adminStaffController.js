// admin staff controller

class AdminStaffController {
    static async getStaffList(req, res) {
        try {
            res.render("admin/adminStaff",{
                currentPage: "staff"
            });
        } catch (error) {
            console.error("Error fetching staff list:", error);
            res.status(500).json({ error: "Failed to fetch staff list" });
        }
    }
}

export default AdminStaffController;