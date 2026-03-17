// Fleet Maps Controller for Admin Panel


class AdminFleetMapsController {
    static async getFleetMaps(req, res) {
        try {
            res.render('admin/adminFleetMaps', { 
                currentPage: 'fleet-maps' 
            });

        } catch (error) {
            console.error('Error fetching fleet maps:', error);
            res.status(500).send('Error fetching fleet maps');
        }
    }
}

export default AdminFleetMapsController;