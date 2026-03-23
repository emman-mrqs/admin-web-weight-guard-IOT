import db from '../../database/db.js';

class AdminDispatchController {
    static async getTaskDispatch(req, res) {
        try {
            const vehiclesResult = await db.query(`
                SELECT
                    v.id,
                    v.plate_number,
                    v.vehicle_type,
                    v.current_state,
                    v.assigned_driver_id,
                    u.first_name,
                    u.last_name
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.assigned_driver_id
                WHERE LOWER(COALESCE(v.current_state, '')) NOT LIKE '%maintenance%'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM dispatch_tasks dt
                      WHERE dt.vehicle_id = v.id
                        AND LOWER(COALESCE(dt.status, '')) IN ('active', 'pending')
                  )
                ORDER BY v.created_at DESC, v.id DESC
                LIMIT 5
            `);

            res.render('admin/adminTaskDispatch', {
                currentPage: 'task-dispatch',
                initialVehicles: vehiclesResult.rows
            });
        } catch (error) {
            console.error('Error rendering dispatch page:', error);
            return res.status(500).send('An error occurred while loading the dispatch page.');
        }
    }

    static async getAssignableVehicles(req, res) {
        try {
            const requestedLimit = Number(req.query.limit);
            const limit = Number.isFinite(requestedLimit)
                ? Math.max(1, Math.min(50, requestedLimit))
                : 5;
            const includeVehicleId = req.query.includeVehicleId ? Number(req.query.includeVehicleId) : null;
            const requireAssigned = String(req.query.requireAssigned || 'false').toLowerCase() === 'true';

            const params = [limit];
            let includeVehicleClause = '';
            if (includeVehicleId) {
                params.push(includeVehicleId);
                includeVehicleClause = ` OR v.id = $2`;
            }

            const assignedFilterClause = requireAssigned
                ? ` AND v.assigned_driver_id IS NOT NULL`
                : '';

            const result = await db.query(
                `
                    SELECT
                        v.id,
                        v.plate_number,
                        v.vehicle_type,
                        v.current_state,
                        v.assigned_driver_id,
                        u.first_name,
                        u.last_name
                    FROM vehicles v
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    WHERE (
                        LOWER(COALESCE(v.current_state, '')) NOT LIKE '%maintenance%'
                        ${assignedFilterClause}
                        AND NOT EXISTS (
                            SELECT 1
                            FROM dispatch_tasks dt
                            WHERE dt.vehicle_id = v.id
                              AND LOWER(COALESCE(dt.status, '')) IN ('active', 'pending')
                        )
                    )
                    ${includeVehicleClause}
                    ORDER BY v.created_at DESC, v.id DESC
                    LIMIT $1
                `,
                params
            );

            return res.status(200).json({ data: result.rows });
        } catch (error) {
            console.error('Error fetching assignable vehicles:', error);
            return res.status(500).json({ error: 'An error occurred while fetching assignable vehicles.' });
        }
    }

    static async getAssignments(req, res) {
        try {
            const includeCompleted = String(req.query.includeCompleted || 'false').toLowerCase() === 'true';
            const requestedPage = Number(req.query.page);
            const requestedLimit = Number(req.query.limit);
            const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
            const limit = Number.isFinite(requestedLimit)
                ? Math.max(1, Math.min(100, requestedLimit))
                : 20;

            const params = [];
            let statusFilter = '';
            if (!includeCompleted) {
                params.push('active', 'pending');
                statusFilter = `AND LOWER(COALESCE(dt.status, '')) IN ($1, $2)`;
            }

            const countParams = [...params];
            const countResult = await db.query(
                `
                    SELECT COUNT(*)::int AS total
                    FROM dispatch_tasks dt
                    WHERE 1 = 1
                    ${statusFilter}
                `,
                countParams
            );

            const total = countResult.rows[0]?.total || 0;
            const totalPages = Math.max(1, Math.ceil(total / limit));
            const normalizedPage = Math.min(page, totalPages);
            const offset = (normalizedPage - 1) * limit;

            const limitParamIndex = params.length + 1;
            params.push(limit);
            const offsetParamIndex = params.length + 1;
            params.push(offset);

            const result = await db.query(
                `
                    SELECT
                        dt.id AS assignment_id,
                        dt.vehicle_id,
                        dt.pickup_lat,
                        dt.pickup_lng,
                        dt.destination_lat AS dest_lat,
                        dt.destination_lng AS dest_lng,
                        LOWER(COALESCE(dt.status, 'pending')) AS assignment_status,
                        dt.started_at,
                        dt.completed_at,
                        dt.created_at AS assigned_at,
                        v.plate_number,
                        v.vehicle_type,
                        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS full_name,
                        u.id AS user_id,
                        ROUND(
                            (
                                6371 * ACOS(
                                    LEAST(
                                        1,
                                        GREATEST(
                                            -1,
                                            COS(RADIANS(dt.pickup_lat::numeric)) *
                                            COS(RADIANS(dt.destination_lat::numeric)) *
                                            COS(RADIANS(dt.destination_lng::numeric) - RADIANS(dt.pickup_lng::numeric)) +
                                            SIN(RADIANS(dt.pickup_lat::numeric)) *
                                            SIN(RADIANS(dt.destination_lat::numeric))
                                        )
                                    )
                                )
                            )::numeric,
                            2
                        ) AS distance_km
                    FROM dispatch_tasks dt
                    INNER JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    WHERE 1 = 1
                    ${statusFilter}
                    ORDER BY dt.created_at DESC, dt.id DESC
                    LIMIT $${limitParamIndex}
                    OFFSET $${offsetParamIndex}
                `,
                params
            );

            const assignments = result.rows.map((row) => {
                const distanceKm = row.distance_km !== null ? Number(row.distance_km) : null;
                const estDurationMin = distanceKm !== null
                    ? Math.max(1, Math.round((distanceKm / 35) * 60))
                    : null;

                return {
                    ...row,
                    vehicle_number: row.plate_number,
                    vehicle_name: row.vehicle_type,
                    distance_km: distanceKm,
                    est_duration_min: estDurationMin
                };
            });

            return res.status(200).json({
                data: assignments,
                pagination: {
                    page: normalizedPage,
                    limit,
                    total,
                    totalPages,
                    hasPrev: normalizedPage > 1,
                    hasNext: normalizedPage < totalPages
                }
            });
        } catch (error) {
            console.error('Error fetching dispatch assignments:', error);
            return res.status(500).json({ error: 'An error occurred while fetching assignments.' });
        }
    }

    static async getAssignmentById(req, res) {
        try {
            const assignmentId = Number(req.params.assignmentId);
            if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
                return res.status(400).json({ error: 'Assignment ID must be a valid positive number.' });
            }

            const result = await db.query(
                `
                    SELECT
                        dt.id AS assignment_id,
                        dt.vehicle_id,
                        dt.pickup_lat,
                        dt.pickup_lng,
                        dt.destination_lat AS dest_lat,
                        dt.destination_lng AS dest_lng,
                        LOWER(COALESCE(dt.status, 'pending')) AS assignment_status,
                        dt.started_at,
                        dt.completed_at,
                        dt.created_at AS assigned_at,
                        v.plate_number,
                        v.vehicle_type,
                        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS full_name,
                        u.id AS user_id,
                        ROUND(
                            (
                                6371 * ACOS(
                                    LEAST(
                                        1,
                                        GREATEST(
                                            -1,
                                            COS(RADIANS(dt.pickup_lat::numeric)) *
                                            COS(RADIANS(dt.destination_lat::numeric)) *
                                            COS(RADIANS(dt.destination_lng::numeric) - RADIANS(dt.pickup_lng::numeric)) +
                                            SIN(RADIANS(dt.pickup_lat::numeric)) *
                                            SIN(RADIANS(dt.destination_lat::numeric))
                                        )
                                    )
                                )
                            )::numeric,
                            2
                        ) AS distance_km
                    FROM dispatch_tasks dt
                    INNER JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    WHERE dt.id = $1
                    LIMIT 1
                `,
                [assignmentId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found.' });
            }

            const row = result.rows[0];
            const distanceKm = row.distance_km !== null ? Number(row.distance_km) : null;
            const estDurationMin = distanceKm !== null
                ? Math.max(1, Math.round((distanceKm / 35) * 60))
                : null;

            return res.status(200).json({
                data: {
                    ...row,
                    vehicle_number: row.plate_number,
                    vehicle_name: row.vehicle_type,
                    distance_km: distanceKm,
                    est_duration_min: estDurationMin
                }
            });
        } catch (error) {
            console.error('Error fetching dispatch assignment by id:', error);
            return res.status(500).json({ error: 'An error occurred while fetching assignment data.' });
        }
    }

    static async createAssignment(req, res) {
        try {
            const { vehicleId, pickupLat, pickupLng, destLat, destLng } = req.body || {};
            const fieldErrors = {};

            // ─── BASIC INPUT VALIDATION ───
            if (!vehicleId) {
                fieldErrors.vehicleId = 'Vehicle is required.';
            }
            if (pickupLat === undefined || pickupLat === null || pickupLat === '') {
                fieldErrors.pickupLat = 'Pickup latitude is required.';
            }
            if (pickupLng === undefined || pickupLng === null || pickupLng === '') {
                fieldErrors.pickupLng = 'Pickup longitude is required.';
            }
            if (destLat === undefined || destLat === null || destLat === '') {
                fieldErrors.destLat = 'Destination latitude is required.';
            }
            if (destLng === undefined || destLng === null || destLng === '') {
                fieldErrors.destLng = 'Destination longitude is required.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors
                });
            }

            // ─── NORMALIZE & VALIDATE DATA TYPES/RANGES ───
            const normalizedVehicleId = Number(vehicleId);
            const normalizedPickupLat = Number(pickupLat);
            const normalizedPickupLng = Number(pickupLng);
            const normalizedDestLat = Number(destLat);
            const normalizedDestLng = Number(destLng);

            if (!Number.isFinite(normalizedVehicleId) || normalizedVehicleId <= 0) {
                fieldErrors.vehicleId = 'Vehicle must be a valid positive number.';
            }
            if (!Number.isFinite(normalizedPickupLat) || normalizedPickupLat < -90 || normalizedPickupLat > 90) {
                fieldErrors.pickupLat = 'Pickup latitude must be between -90 and 90.';
            }
            if (!Number.isFinite(normalizedPickupLng) || normalizedPickupLng < -180 || normalizedPickupLng > 180) {
                fieldErrors.pickupLng = 'Pickup longitude must be between -180 and 180.';
            }
            if (!Number.isFinite(normalizedDestLat) || normalizedDestLat < -90 || normalizedDestLat > 90) {
                fieldErrors.destLat = 'Destination latitude must be between -90 and 90.';
            }
            if (!Number.isFinite(normalizedDestLng) || normalizedDestLng < -180 || normalizedDestLng > 180) {
                fieldErrors.destLng = 'Destination longitude must be between -180 and 180.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            // ─── BUSINESS LOGIC VALIDATION (database checks) ───

            const vehicleResult = await db.query(
                `
                    SELECT id, assigned_driver_id, plate_number, current_state
                    FROM vehicles
                    WHERE id = $1
                    LIMIT 1
                `,
                [normalizedVehicleId]
            );

            if (vehicleResult.rows.length === 0) {
                fieldErrors.vehicleId = 'Selected vehicle was not found.';
            }

            const selectedVehicle = vehicleResult.rows[0];
            if (selectedVehicle) {
                if (String(selectedVehicle.current_state || '').toLowerCase().includes('maintenance')) {
                    fieldErrors.vehicleId = 'Selected vehicle is currently in maintenance.';
                }

                if (!selectedVehicle.assigned_driver_id) {
                    fieldErrors.vehicleId = 'Selected vehicle is unassigned. Assign a driver in Fleet Management first.';
                }
            }

            const driverActiveTaskResult = selectedVehicle?.assigned_driver_id
                ? await db.query(
                    `
                        SELECT dt.id
                        FROM dispatch_tasks dt
                        INNER JOIN vehicles v ON v.id = dt.vehicle_id
                        WHERE v.assigned_driver_id = $1
                          AND LOWER(COALESCE(dt.status, '')) IN ('active', 'pending')
                        LIMIT 1
                    `,
                    [selectedVehicle.assigned_driver_id]
                )
                : { rows: [] };

            const vehicleActiveTaskResult = await db.query(
                `
                    SELECT id
                    FROM dispatch_tasks
                    WHERE vehicle_id = $1
                      AND LOWER(COALESCE(status, '')) IN ('active', 'pending')
                    LIMIT 1
                `,
                [normalizedVehicleId]
            );

            if (driverActiveTaskResult.rows.length > 0) {
                fieldErrors.vehicleId = 'The assigned driver of this vehicle already has an active task.';
            }

            if (vehicleActiveTaskResult.rows.length > 0) {
                fieldErrors.vehicleId = 'Selected vehicle already has an active task.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            const createResult = await db.query(
                `
                    INSERT INTO dispatch_tasks (
                        vehicle_id,
                        pickup_lat,
                        pickup_lng,
                        destination_lat,
                        destination_lng,
                        status,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
                    RETURNING id
                `,
                [
                    normalizedVehicleId,
                    normalizedPickupLat,
                    normalizedPickupLng,
                    normalizedDestLat,
                    normalizedDestLng
                ]
            );

            return res.status(201).json({
                message: 'Task dispatched successfully.',
                assignmentId: createResult.rows[0].id
            });
        } catch (error) {
            console.error('Error creating dispatch assignment:', error);
            return res.status(500).json({ error: 'An error occurred while dispatching the task.' });
        }
    }

    static async updateAssignment(req, res) {
        try {
            const assignmentId = Number(req.params.assignmentId);
            const { vehicleId, pickupLat, pickupLng, destLat, destLng, status } = req.body || {};
            const fieldErrors = {};

            // ─── VALIDATE ASSIGNMENT ID ───
            if (!assignmentId || !Number.isFinite(assignmentId)) {
                return res.status(400).json({ error: 'Invalid assignment ID.' });
            }

            // ─── BASIC INPUT VALIDATION ───
            if (!vehicleId) {
                fieldErrors.vehicleId = 'Vehicle is required.';
            }
            if (status && typeof status !== 'string') {
                fieldErrors.status = 'Status must be a text value.';
            }
            if (pickupLat === undefined || pickupLat === null || pickupLat === '') {
                fieldErrors.pickupLat = 'Pickup latitude is required.';
            }
            if (pickupLng === undefined || pickupLng === null || pickupLng === '') {
                fieldErrors.pickupLng = 'Pickup longitude is required.';
            }
            if (destLat === undefined || destLat === null || destLat === '') {
                fieldErrors.destLat = 'Destination latitude is required.';
            }
            if (destLng === undefined || destLng === null || destLng === '') {
                fieldErrors.destLng = 'Destination longitude is required.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            // ─── NORMALIZE & VALIDATE DATA TYPES/RANGES ───
            const normalizedVehicleId = Number(vehicleId);
            const normalizedPickupLat = Number(pickupLat);
            const normalizedPickupLng = Number(pickupLng);
            const normalizedDestLat = Number(destLat);
            const normalizedDestLng = Number(destLng);
            const normalizedStatus = String(status || '').trim().toLowerCase();

            if (!Number.isFinite(normalizedVehicleId) || normalizedVehicleId <= 0) {
                fieldErrors.vehicleId = 'Vehicle must be a valid positive number.';
            }

            const allowedStatuses = ['active', 'pending', 'completed', 'cancelled'];
            if (normalizedStatus && !allowedStatuses.includes(normalizedStatus)) {
                fieldErrors.status = `Status must be one of: ${allowedStatuses.join(', ')}.`;
            }

            if (!Number.isFinite(normalizedPickupLat) || normalizedPickupLat < -90 || normalizedPickupLat > 90) {
                fieldErrors.pickupLat = 'Pickup latitude must be between -90 and 90.';
            }
            if (!Number.isFinite(normalizedPickupLng) || normalizedPickupLng < -180 || normalizedPickupLng > 180) {
                fieldErrors.pickupLng = 'Pickup longitude must be between -180 and 180.';
            }
            if (!Number.isFinite(normalizedDestLat) || normalizedDestLat < -90 || normalizedDestLat > 90) {
                fieldErrors.destLat = 'Destination latitude must be between -90 and 90.';
            }
            if (!Number.isFinite(normalizedDestLng) || normalizedDestLng < -180 || normalizedDestLng > 180) {
                fieldErrors.destLng = 'Destination longitude must be between -180 and 180.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            // ─── BUSINESS LOGIC VALIDATION (database checks) ───

            const assignmentResult = await db.query(
                `
                    SELECT id, vehicle_id
                    FROM dispatch_tasks
                    WHERE id = $1
                    LIMIT 1
                `,
                [assignmentId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found.' });
            }

            const vehicleResult = await db.query(
                `
                    SELECT id, assigned_driver_id, current_state
                    FROM vehicles
                    WHERE id = $1
                    LIMIT 1
                `,
                [normalizedVehicleId]
            );

            if (vehicleResult.rows.length === 0) {
                fieldErrors.vehicleId = 'Selected vehicle was not found.';
            }

            const selectedVehicle = vehicleResult.rows[0];
            if (selectedVehicle && String(selectedVehicle.current_state || '').toLowerCase().includes('maintenance')) {
                fieldErrors.vehicleId = 'Selected vehicle is currently in maintenance.';
            }

            const vehicleActiveTaskResult = await db.query(
                `
                    SELECT id
                    FROM dispatch_tasks
                    WHERE vehicle_id = $1
                      AND id <> $2
                      AND LOWER(COALESCE(status, '')) IN ('active', 'pending')
                    LIMIT 1
                `,
                [normalizedVehicleId, assignmentId]
            );

            if (vehicleActiveTaskResult.rows.length > 0) {
                fieldErrors.vehicleId = 'Selected vehicle already has an active task.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({ error: 'Validation failed.', fieldErrors });
            }

            const updateResult = await db.query(
                `
                    UPDATE dispatch_tasks
                    SET vehicle_id = $1,
                        pickup_lat = $2,
                        pickup_lng = $3,
                        destination_lat = $4,
                        destination_lng = $5,
                        status = $6::varchar,
                        updated_at = NOW(),
                        completed_at = CASE
                            WHEN $6::varchar IN ('completed', 'cancelled') THEN NOW()
                            ELSE NULL
                        END
                    WHERE id = $7
                    RETURNING id
                `,
                [
                    normalizedVehicleId,
                    normalizedPickupLat,
                    normalizedPickupLng,
                    normalizedDestLat,
                    normalizedDestLng,
                    normalizedStatus,
                    assignmentId
                ]
            );

            return res.status(200).json({
                message: 'Assignment updated successfully.',
                assignmentId: updateResult.rows[0].id
            });
        } catch (error) {
            console.error('Error updating dispatch assignment:', error);
            return res.status(500).json({ error: 'An error occurred while updating the assignment.' });
        }
    }

    static async cancelAssignment(req, res) {
        try {
            const assignmentId = Number(req.params.assignmentId);
            if (!assignmentId) {
                return res.status(400).json({ error: 'Invalid assignment ID.' });
            }

            const result = await db.query(
                `
                    UPDATE dispatch_tasks
                    SET status = 'cancelled',
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING id
                `,
                [assignmentId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found.' });
            }

            return res.status(200).json({ message: 'Assignment cancelled successfully.' });
        } catch (error) {
            console.error('Error cancelling assignment:', error);
            return res.status(500).json({ error: 'An error occurred while cancelling the assignment.' });
        }
    }
}

export default AdminDispatchController;
