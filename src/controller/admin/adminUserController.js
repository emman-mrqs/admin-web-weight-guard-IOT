// Admin User Controller
class AdminUserController {
    static getUsers (req, res) {
        try {
            res.render("admin/adminUser", {
                currentPage: "user"
            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default AdminUserController;