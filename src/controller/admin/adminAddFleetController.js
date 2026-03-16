// Admin Add Fleet Controller

class AdminAddFleetController {
    static getAddFleet (req, res) {
        try {
            res.render("admin/adminAddFleet", {
                currentPage: "fleet"
            });
        } catch (error) {
            console.error(error);
        }
    }

   
}

export default AdminAddFleetController;