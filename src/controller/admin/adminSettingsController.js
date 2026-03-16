// Admin Report Controller


class AdminSettingsController {
    static getSettings (req, res) {
        try {
            res.render("admin/adminSettings", {
                currentPage: "settings"
            });
        } catch (error) {
            console.error(error);
        }
    }
}

export default  AdminSettingsController;