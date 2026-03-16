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

    static async fetchAvailableDrivers(req, res) {
        try {
            const query = `
                SELECT u.id, u.full_name, u.email, u.status
                FROM users u
                WHERE u.status = 'active'
                AND u.id NOT IN (
                    SELECT driver_id FROM assignments
                    WHERE status IN ('pending', 'active')
                    AND driver_id IS NOT NULL
                )
                ORDER BY u.full_name ASC
            `;
            const result = await db.query(query);
            res.status(200).json({ drivers: result.rows });
        } catch (error) {
            console.error('Error fetching available drivers:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async fetchAssignments(req, res) {
        try {
            const query = `
                SELECT a.*, u.full_name as driver_name, u.email as driver_email
                FROM assignments a
                LEFT JOIN users u ON a.driver_id = u.id
                ORDER BY a.created_at DESC
            `;
            const result = await db.query(query);
            res.status(200).json({ assignments: result.rows });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async assignTaskToUser(req, res) {
        try {
            const {
                driverId,
                vehicleNumber,
                pickupLat,
                pickupLng,
                destLat,
                destLng,
                distanceKm,
                estDurationMin
            } = req.body;

            if (!driverId || !vehicleNumber || !pickupLat || !pickupLng || !destLat || !destLng) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const driverCheck = await db.query('SELECT id FROM users WHERE id = $1', [driverId]);
            if (driverCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Driver not found' });
            }

            const activeCheck = await db.query(
                "SELECT id FROM assignments WHERE driver_id = $1 AND status IN ('pending', 'active')",
                [driverId]
            );
            if (activeCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Driver already has an active assignment' });
            }

            const createQuery = `
                INSERT INTO assignments (
                    driver_id, vehicle_number,
                    pickup_lat, pickup_lng,
                    dest_lat, dest_lng,
                    distance_km, est_duration_min,
                    status, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
                RETURNING id
            `;

            const result = await db.query(createQuery, [
                driverId,
                vehicleNumber,
                pickupLat,
                pickupLng,
                destLat,
                destLng,
                distanceKm || null,
                estDurationMin || null
            ]);

            const assignmentId = result.rows[0].id;
            res.status(201).json({
                message: 'Task assigned successfully',
                assignmentId
            });
        } catch (error) {
            console.error('Error assigning task:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async updateAssignment(req, res) {
        try {
            const id = req.params.id;
            const { vehicle_number, status, pickup_lat, pickup_lng, dest_lat, dest_lng } = req.body;

            if (!vehicle_number || !status) {
                return res.status(400).json({ error: 'Vehicle number and status are required' });
            }

            const assignmentCheck = await db.query('SELECT id FROM assignments WHERE id = $1', [id]);
            if (assignmentCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            const updateQuery = `
                UPDATE assignments
                SET vehicle_number = $1,
                    status = $2,
                    pickup_lat = $3,
                    pickup_lng = $4,
                    dest_lat = $5,
                    dest_lng = $6,
                    updated_at = NOW()
                WHERE id = $7
            `;

            await db.query(updateQuery, [
                vehicle_number,
                status,
                pickup_lat,
                pickup_lng,
                dest_lat,
                dest_lng,
                id
            ]);

            res.status(200).json({ message: 'Assignment updated successfully' });
        } catch (error) {
            console.error('Error updating assignment:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async deleteAssignment(req, res) {
        try {
            const id = req.params.id;

            const assignmentCheck = await db.query('SELECT id FROM assignments WHERE id = $1', [id]);
            if (assignmentCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            const deleteQuery = 'DELETE FROM assignments WHERE id = $1';
            await db.query(deleteQuery, [id]);

            res.status(200).json({ message: 'Assignment cancelled successfully' });
        } catch (error) {
            console.error('Error deleting assignment:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

export default AdminDispatchController;
