// Admin Incidents Controller
// Admin Controller for managing incidents and viewing incident data
import db from '../../database/db.js';

class AdminIncidentsController {
    /**
     * GET /admin/incidents
     * Render the incidents page
     */
    static async getIncidents(req, res) {
        try {
            res.render("admin/adminIncidents", {
                currentPage: "incidents"
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidents error:', error);
            res.status(500).send('Server error');
        }
    }

    
}

export default AdminIncidentsController;