// Admin User Controller
import db from '../../database/db.js';


class AdminUserController {
    static getUsers (req, res) {
        try {
            res.render("admin/adminUser", {
                currentPage: "user"
            });
        } catch (error) {
            console.error("Error rendering admin users page:", error);
            res.status(500).send("An error occurred while loading the users page.");
        }
    }

    static getAllUsers(req, res) {
        try {
            const query =`
                SELECT 
                    id,
                    first_name,
                    last_name,
                    email,
                    is_verified,

            
            `;
        } catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).json({ error: "An error occurred while fetching users." });
        }
    }

}

export default AdminUserController;