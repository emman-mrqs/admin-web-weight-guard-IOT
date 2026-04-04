// Admin Fleet Controller
import db from '../../database/db.js';
import AdminIncidentsController from './adminIncidentsController.js';

class AdminFleetController {
    static toFiniteNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    static normalizeDispatchTaskStatus(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (['pending', 'active', 'in_transit'].includes(normalized)) {
            return normalized;
        }
        return 'unassigned';
    }

    static deriveVehicleCurrentState(row) {
        const initialWeightKg = AdminFleetController.toFiniteNumber(row.initial_reference_weight_kg);
        const maxCapacityKg = AdminFleetController.toFiniteNumber(row.max_capacity_kg);
        const currentWeightKg = AdminFleetController.toFiniteNumber(row.current_weight_kg);
        const persistedLoadState = String(row.current_load_status || '').trim().toLowerCase();

        const exceedsVehicleCapacity = currentWeightKg !== null
            && maxCapacityKg !== null
            && currentWeightKg > maxCapacityKg;

        const isLoss = initialWeightKg !== null
            && currentWeightKg !== null
            && currentWeightKg < initialWeightKg;

        const isAboveReference = initialWeightKg !== null
            && currentWeightKg !== null
            && currentWeightKg > initialWeightKg
            && !exceedsVehicleCapacity;

        if (isLoss) return 'loss';
        if (exceedsVehicleCapacity) return 'overload';
        if (isAboveReference) return 'above_reference';

        if (persistedLoadState.includes('loss')) return 'loss';
        if (persistedLoadState.includes('overload')) return 'overload';
        if (persistedLoadState.includes('above_reference')) return 'above_reference';
        return 'normal';
    }

    static async syncFleetStateFromDispatch() {
        await db.query(`
            WITH latest_dispatch AS (
                SELECT DISTINCT ON (dt.vehicle_id)
                    dt.vehicle_id,
                    LOWER(COALESCE(dt.status, '')) AS dispatch_status,
                    dt.initial_reference_weight_kg
                FROM dispatch_tasks dt
                ORDER BY dt.vehicle_id, dt.created_at DESC, dt.id DESC
            )
            UPDATE vehicles v
            SET
                current_state = CASE
                    WHEN ld.dispatch_status = 'pending' THEN 'loading'
                    WHEN ld.dispatch_status = 'active' THEN 'loading'
                    WHEN ld.dispatch_status = 'in_transit' THEN 'in_transit'
                    ELSE v.current_state
                END,
                current_load_status = CASE
                    WHEN ld.dispatch_status IN ('pending', 'active', 'in_transit') THEN
                        CASE
                            WHEN COALESCE(ld.initial_reference_weight_kg, 0)::numeric > COALESCE(v.max_capacity_kg, 0)::numeric
                                THEN 'overload'
                            ELSE 'normal'
                        END
                    ELSE v.current_load_status
                END
            FROM latest_dispatch ld
            WHERE v.id = ld.vehicle_id
                            AND ld.dispatch_status IN ('pending', 'active', 'in_transit')
        `);

        const hasCurrentStatusColumn = await db.query(`
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'vehicles'
              AND column_name = 'current_status'
            LIMIT 1
        `);

        if (hasCurrentStatusColumn.rows.length > 0) {
            await db.query(`
                WITH latest_dispatch AS (
                    SELECT DISTINCT ON (dt.vehicle_id)
                        dt.vehicle_id,
                        LOWER(COALESCE(dt.status, '')) AS dispatch_status
                    FROM dispatch_tasks dt
                    ORDER BY dt.vehicle_id, dt.created_at DESC, dt.id DESC
                )
                UPDATE vehicles v
                SET current_status = 'in_transit'
                FROM latest_dispatch ld
                WHERE v.id = ld.vehicle_id
                  AND ld.dispatch_status = 'in_transit'
            `);
        }
    }

    static async getFleet(req, res) {
        try {
            await AdminIncidentsController.syncIncidentLogsFromDispatch();

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
            await AdminFleetController.syncFleetStateFromDispatch();
            await AdminIncidentsController.syncIncidentLogsFromDispatch();

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

            if (filter === 'loss') {
                conditions.push(`(
                    (
                        dt.initial_reference_weight_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND vls.current_weight_kg < dt.initial_reference_weight_kg
                    )
                    OR LOWER(COALESCE(v.current_load_status, '')) LIKE '%loss%'
                )`);
            } else if (filter === 'overload') {
                conditions.push(`(
                    (
                        v.max_capacity_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND vls.current_weight_kg > v.max_capacity_kg
                    )
                    OR LOWER(COALESCE(v.current_load_status, '')) LIKE '%overload%'
                )`);
            } else if (filter === 'above_ref') {
                conditions.push(`(
                    (
                        dt.initial_reference_weight_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND v.max_capacity_kg IS NOT NULL
                        AND vls.current_weight_kg > dt.initial_reference_weight_kg
                        AND vls.current_weight_kg <= v.max_capacity_kg
                    )
                    OR LOWER(COALESCE(v.current_load_status, '')) LIKE '%above_reference%'
                )`);
            } else if (filter === 'operational') {
                conditions.push(`(
                    LOWER(COALESCE(v.current_load_status, '')) NOT LIKE '%loss%'
                    AND LOWER(COALESCE(v.current_load_status, '')) NOT LIKE '%overload%'
                    AND LOWER(COALESCE(v.current_load_status, '')) NOT LIKE '%above_reference%'
                    AND NOT (
                        dt.initial_reference_weight_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND vls.current_weight_kg < dt.initial_reference_weight_kg
                    )
                    AND NOT (
                        v.max_capacity_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND vls.current_weight_kg > v.max_capacity_kg
                    )
                    AND NOT (
                        dt.initial_reference_weight_kg IS NOT NULL
                        AND vls.current_weight_kg IS NOT NULL
                        AND v.max_capacity_kg IS NOT NULL
                        AND vls.current_weight_kg > dt.initial_reference_weight_kg
                        AND vls.current_weight_kg <= v.max_capacity_kg
                    )
                )`);
            }

            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const baseFrom = `
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.assigned_driver_id
                LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
                LEFT JOIN LATERAL (
                    SELECT
                                                dt.id AS task_id,
                        LOWER(COALESCE(dt.status, '')) AS dispatch_status,
                        dt.initial_reference_weight_kg
                    FROM dispatch_tasks dt
                    WHERE dt.vehicle_id = v.id
                      AND LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                    ORDER BY dt.created_at DESC, dt.id DESC
                    LIMIT 1
                ) dt ON true
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
                    vls.current_weight_kg,
                    dt.dispatch_status,
                    dt.initial_reference_weight_kg,
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
            const data = listResult.rows.map((row) => ({
                ...row,
                dispatch_task_status: AdminFleetController.normalizeDispatchTaskStatus(row.dispatch_status),
                current_load_status: AdminFleetController.deriveVehicleCurrentState(row)
            }));

            const statsResult = await db.query(`
                WITH latest_dispatch AS (
                    SELECT DISTINCT ON (dt.vehicle_id)
                        dt.vehicle_id,
                        dt.initial_reference_weight_kg
                    FROM dispatch_tasks dt
                    WHERE LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                    ORDER BY dt.vehicle_id, dt.created_at DESC, dt.id DESC
                ),
                fleet_state AS (
                    SELECT
                        v.id,
                        v.max_capacity_kg,
                        LOWER(COALESCE(v.current_load_status, '')) AS persisted_load_status,
                        vls.current_weight_kg,
                        ld.initial_reference_weight_kg,
                        CASE
                            WHEN ld.initial_reference_weight_kg IS NOT NULL
                                 AND vls.current_weight_kg IS NOT NULL
                                 AND vls.current_weight_kg < ld.initial_reference_weight_kg
                                THEN 'loss'
                            WHEN v.max_capacity_kg IS NOT NULL
                                 AND vls.current_weight_kg IS NOT NULL
                                 AND vls.current_weight_kg > v.max_capacity_kg
                                THEN 'overload'
                            WHEN ld.initial_reference_weight_kg IS NOT NULL
                                 AND vls.current_weight_kg IS NOT NULL
                                 AND v.max_capacity_kg IS NOT NULL
                                 AND vls.current_weight_kg > ld.initial_reference_weight_kg
                                 AND vls.current_weight_kg <= v.max_capacity_kg
                                THEN 'above_reference'
                            WHEN LOWER(COALESCE(v.current_load_status, '')) LIKE '%loss%'
                                THEN 'loss'
                            WHEN LOWER(COALESCE(v.current_load_status, '')) LIKE '%overload%'
                                THEN 'overload'
                            WHEN LOWER(COALESCE(v.current_load_status, '')) LIKE '%above_reference%'
                                THEN 'above_reference'
                            ELSE 'operational'
                        END AS derived_load_state
                    FROM vehicles v
                    LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
                    LEFT JOIN latest_dispatch ld ON ld.vehicle_id = v.id
                )
                SELECT
                    COUNT(*)::int AS total_fleet,
                    COUNT(*) FILTER (WHERE derived_load_state = 'operational')::int AS operational_count,
                    COUNT(*) FILTER (WHERE derived_load_state = 'above_reference')::int AS above_ref_count,
                    COUNT(*) FILTER (WHERE derived_load_state = 'loss')::int AS loss_count,
                    COUNT(*) FILTER (WHERE derived_load_state = 'overload')::int AS overload_count,
                    AVG(max_capacity_kg)::numeric(10,2) AS avg_capacity
                FROM fleet_state
            `);

            const stats = statsResult.rows[0] || {};

            return res.status(200).json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                },
                stats: {
                    totalFleet: Number(stats.total_fleet || 0),
                    operationalCount: Number(stats.operational_count || 0),
                    aboveRefCount: Number(stats.above_ref_count || 0),
                    lossCount: Number(stats.loss_count || 0),
                    overloadCount: Number(stats.overload_count || 0),
                    avgCapacityKg: Number(stats.avg_capacity || 0),
                    alertCount: Number((stats.loss_count || 0) + (stats.overload_count || 0))
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
            const { vehicleType, plateNumber, maxCapacity, driverId } = req.body;
            const fieldErrors = {};

            if (!vehicleId) {
                return res.status(400).json({ error: 'Invalid vehicle ID.' });
            }

            const normalizedVehicleType = String(vehicleType || '').trim();
            const normalizedPlate = String(plateNumber || '').trim().toUpperCase();
            const normalizedCapacity = Number(maxCapacity);
            const normalizedDriverId = driverId ? Number(driverId) : null;

            if (!normalizedVehicleType) fieldErrors.vehicleType = 'Vehicle type is required.';
            if (!normalizedPlate) fieldErrors.plateNumber = 'Plate number is required.';
            if (!Number.isFinite(normalizedCapacity) || normalizedCapacity <= 0) fieldErrors.maxCapacity = 'Max capacity must be greater than 0.';

            const existingResult = await db.query(
                `
                    SELECT
                        v.id,
                        v.max_capacity_kg,
                        COALESCE(ld.dispatch_status, 'unassigned') AS latest_dispatch_status
                    FROM vehicles v
                    LEFT JOIN LATERAL (
                        SELECT LOWER(COALESCE(dt.status, '')) AS dispatch_status
                        FROM dispatch_tasks dt
                        WHERE dt.vehicle_id = v.id
                          AND LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                        ORDER BY dt.created_at DESC, dt.id DESC
                        LIMIT 1
                    ) ld ON true
                    WHERE v.id = $1
                `,
                [vehicleId]
            );
            if (existingResult.rows.length === 0) {
                return res.status(404).json({ error: 'Vehicle not found.' });
            }

            const existingVehicle = existingResult.rows[0];
            const currentCapacity = Number(existingVehicle.max_capacity_kg);
            const latestDispatchStatus = String(existingVehicle.latest_dispatch_status || 'unassigned').toLowerCase();
            const isCapacityDecrease = Number.isFinite(currentCapacity)
                && Number.isFinite(normalizedCapacity)
                && normalizedCapacity < currentCapacity;

            if (isCapacityDecrease && !['pending', 'unassigned'].includes(latestDispatchStatus)) {
                fieldErrors.maxCapacity = 'Max capacity can only be decreased when dispatch is Pending or there is no assigned task.';
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
                        assigned_driver_id = $4
                    WHERE id = $5
                    RETURNING id, assigned_driver_id, vehicle_type, plate_number, max_capacity_kg, current_state, current_load_status, created_at
                `,
                [normalizedVehicleType, normalizedPlate, normalizedCapacity, normalizedDriverId, vehicleId]
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

            const assignmentCountResult = await db.query(
                `
                    SELECT
                        COUNT(*)::int AS total_assignments,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(status, '')) IN ('pending', 'active', 'in_transit')
                        )::int AS open_assignments
                    FROM dispatch_tasks
                    WHERE vehicle_id = $1
                `,
                [vehicleId]
            );

            const assignmentInfo = assignmentCountResult.rows[0] || {};
            const totalAssignments = Number(assignmentInfo.total_assignments || 0);
            const openAssignments = Number(assignmentInfo.open_assignments || 0);

            if (totalAssignments > 0) {
                const openAssignmentHint = openAssignments > 0
                    ? ` It has ${openAssignments} open assignment(s).`
                    : '';

                return res.status(409).json({
                    error: `Vehicle cannot be deleted because it already has dispatch assignment record(s).${openAssignmentHint}`
                });
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