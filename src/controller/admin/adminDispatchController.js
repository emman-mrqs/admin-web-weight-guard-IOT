import db from '../../database/db.js';

class AdminDispatchController {
    static getTaskDispatch(req, res) {
        try {
            res.render('admin/adminTaskDispatch', {
                currentPage: 'task-dispatch'
            });
        } catch (error) {
            console.error(error);
        }
    }

}

export default AdminDispatchController;
