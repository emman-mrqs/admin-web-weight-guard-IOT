// Admin Fleet Controller


class AdminFleetController {
    static getFleet (req, res) {
        try {
            res.render("admin/adminFleet", {
                currentPage: "fleet"

            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default AdminFleetController;