// admin login Controller 

class AdminLoginController {
    static getLogin(req, res) {
        try {
            res.render("auth/adminLogin");
        } catch (error) {
            console.error(error);
        }
    }
}

export default AdminLoginController;