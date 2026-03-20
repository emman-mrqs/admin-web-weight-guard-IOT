// Admin Fleet Controller
import db from '../../database/db.js';

class AdminFleetController {
    static getFleet(req, res) {
        try {
            res.render('admin/adminFleet', {
                currentPage: 'fleet'
            });
        } catch (error) {
            console.error('Error rendering fleet page:', error);
            res.status(500).send('An error occurred while loading the fleet page.');
        }
    }

    static async getAllFleet(req, res) {
        try {
            const page = Math.max(1, Number(req.query.page) || 1);
            const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
            const search = String(req.query.search || '').trim();
            const filter = String(req.query.filter || 'all').toLowerCase();
            const offset = (page - 1) * limit;

            const params = [];
            const conditions = [];

            if (search) {
                params.push(`%${search}%`);
                const idx = params.length;
                conditions.push(`(
                    v.plate_number ILIKE $${idx}
                    OR v.vehicle_type ILIKE $${idx}
                    OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) ILIKE $${idx}
                )`);
            }

            if (filter === 'maintenance') {
                conditions.push(`LOWER(COALESCE(v.current_state, '')) LIKE '%maintenance%'`);
            } else if (filter === 'alert') {
                conditions.push(`(
                    LOWER(COALESCE(v.current_state, '')) LIKE '%alert%'
                    OR LOWER(COALESCE(v.current_load_status, '')) LIKE '%loss%'
                )`);
            } else if (filter === 'active') {
                conditions.push(`LOWER(COALESCE(v.current_state, '')) NOT LIKE '%maintenance%'`);
            }

            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const baseFrom = `
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.assigned_driver_id
            `;

            const countQuery = `
                SELECT COUNT(*)::int AS total
                ${baseFrom}
                ${whereClause}
            `;
            const countResult = await db.query(countQuery, params);
            const total = Number(countResult.rows[0]?.total || 0);

            params.push(limit);
            const limitIdx = params.length;
            params.push(offset);
            const offsetIdx = params.length;

            const listQuery = `
                SELECT
                    v.id,
                    v.assigned_driver_id,
                    v.vehicle_type,
                    v.plate_number,
                    v.max_capacity_kg,
                    v.current_state,
                    v.current_load_status,
                    v.created_at,
                    u.first_name AS driver_first_name,
                    u.last_name AS driver_last_name,
                    u.status AS driver_status
                ${baseFrom}
                ${whereClause}
                ORDER BY v.created_at DESC, v.id DESC
                LIMIT $${limitIdx} OFFSET $${offsetIdx}
            `;

            const listResult = await db.query(listQuery, params);

            const statsResult = await db.query(`
                SELECT
                    COUNT(*)::int AS total_fleet,
                    COUNT(*) FILTER (WHERE LOWER(COALESCE(current_state, '')) NOT LIKE '%maintenance%')::int AS active_count,
                    COUNT(*) FILTER (WHERE LOWER(COALESCE(current_state, '')) LIKE '%maintenance%')::int AS maintenance_count,
                    COUNT(*) FILTER (
                        WHERE LOWER(COALESCE(current_state, '')) LIKE '%alert%'
                           OR LOWER(COALESCE(current_load_status, '')) LIKE '%loss%'
                    )::int AS alert_count,
                    AVG(max_capacity_kg)::numeric(10,2) AS avg_capacity
                FROM vehicles
            `);

            const stats = statsResult.rows[0] || {};

            return res.status(200).json({
                data: listResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                },
                stats: {
                    totalFleet: Number(stats.total_fleet || 0),
                    activeCount: Number(stats.active_count || 0),
                    maintenanceCount: Number(stats.maintenance_count || 0),
                    avgCapacityKg: Number(stats.avg_capacity || 0),
                    alertCount: Number(stats.alert_count || 0)
                }
            });
        } catch (error) {
            console.error('Error fetching fleet data:', error);
            return res.status(500).json({ error: 'An error occurred while fetching fleet data.' });
        }
    }

    static async getAssignableDrivers(req, res) {
        try {
            const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
            const params = [];

            let includeAssignedClause = '';
            if (vehicleId) {
                params.push(vehicleId);
                includeAssignedClause = ` OR u.id = (SELECT assigned_driver_id FROM vehicles WHERE id = $1)`;
            }

            const query = `
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.email
                FROM users u
                WHERE u.status = 'active'
                  AND u.deleted_at IS NULL
                  AND (
                    NOT EXISTS (
                        SELECT 1
                        FROM vehicles v
                        WHERE v.assigned_driver_id = u.id
                    )
                    ${includeAssignedClause}
                  )
                ORDER BY u.first_name ASC, u.last_name ASC
            `;

            const result = await db.query(query, params);
            return res.status(200).json({ data: result.rows });
        } catch (error) {
            console.error('Error fetching assignable drivers for fleet:', error);
            return res.status(500).json({ error: 'An error occurred while fetching assignable drivers.' });
        }
    }

    static async updateFleet(req, res) {
        try {
            const vehicleId = Number(req.params.vehicleId);
            const { vehicleType, plateNumber, maxCapacity, driverId, currentState } = req.body;
            const fieldErrors = {};

            if (!vehicleId) {
                return res.status(400).json({ error: 'Invalid vehicle ID.' });
            }

            const normalizedVehicleType = String(vehicleType || '').trim();
            const normalizedPlate = String(plateNumber || '').trim().toUpperCase();
            const normalizedCapacity = Number(maxCapacity);
            const normalizedDriverId = driverId ? Number(driverId) : null;
            const normalizedState = String(currentState || 'available').trim().toLowerCase();

            if (!normalizedVehicleType) fieldErrors.vehicleType = 'Vehicle type is required.';
            if (!normalizedPlate) fieldErrors.plateNumber = 'Plate number is required.';
            if (!Number.isFinite(normalizedCapacity) || normalizedCapacity <= 0) fieldErrors.maxCapacity = 'Max capacity must be greater than 0.';

            const existingResult = await db.query('SELECT id FROM vehicles WHERE id = $1', [vehicleId]);
            if (existingResult.rows.length === 0) {
                return res.status(404).json({ error: 'Vehicle not found.' });
            }

            if (normalizedPlate) {
                const plateDupResult = await db.query(
                    'SELECT id FROM vehicles WHERE UPPER(plate_number) = $1 AND id <> $2 LIMIT 1',
                    [normalizedPlate, vehicleId]
                );
                if (plateDupResult.rows.length > 0) {
                    fieldErrors.plateNumber = 'Plate number already exists.';
                }
            }

            if (normalizedDriverId) {
                const driverResult = await db.query(
                    'SELECT id, status, deleted_at FROM users WHERE id = $1 LIMIT 1',
                    [normalizedDriverId]
                );

                if (driverResult.rows.length === 0 || driverResult.rows[0].deleted_at) {
                    fieldErrors.driverId = 'Selected driver was not found.';
                } else if (driverResult.rows[0].status !== 'active') {
                    fieldErrors.driverId = 'Selected driver must be active.';
                } else {
                    const assignmentResult = await db.query(
                        'SELECT id FROM vehicles WHERE assigned_driver_id = $1 AND id <> $2 LIMIT 1',
                        [normalizedDriverId, vehicleId]
                    );
                    if (assignmentResult.rows.length > 0) {
                        fieldErrors.driverId = 'Selected driver already has an assigned vehicle.';
                    }
                }
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            const updateResult = await db.query(
                `
                    UPDATE vehicles
                    SET vehicle_type = $1,
                        plate_number = $2,
                        max_capacity_kg = $3,
                        assigned_driver_id = $4,
                        current_state = $5
                    WHERE id = $6
                    RETURNING id, assigned_driver_id, vehicle_type, plate_number, max_capacity_kg, current_state, current_load_status, created_at
                `,
                [normalizedVehicleType, normalizedPlate, normalizedCapacity, normalizedDriverId, normalizedState, vehicleId]
            );

            return res.status(200).json({
                message: 'Vehicle updated successfully.',
                vehicle: updateResult.rows[0]
            });
        } catch (error) {
            console.error('Error updating vehicle:', error);
            return res.status(500).json({ error: 'An error occurred while updating the vehicle.' });
        }
    }

    static async deleteFleet(req, res) {
        try {
            const vehicleId = Number(req.params.vehicleId);
            if (!vehicleId) {
                return res.status(400).json({ error: 'Invalid vehicle ID.' });
            }

            const existingResult = await db.query('SELECT id FROM vehicles WHERE id = $1', [vehicleId]);
            if (existingResult.rows.length === 0) {
                return res.status(404).json({ error: 'Vehicle not found.' });
            }

            // Permanent delete is supported by SQL schema. Related rows cascade via FK constraints.
            await db.query('DELETE FROM vehicles WHERE id = $1', [vehicleId]);

            return res.status(200).json({ message: 'Vehicle deleted permanently.' });
        } catch (error) {
            console.error('Error deleting vehicle:', error);
            return res.status(500).json({ error: 'An error occurred while deleting the vehicle.' });
        }
    }
}

export default AdminFleetController;