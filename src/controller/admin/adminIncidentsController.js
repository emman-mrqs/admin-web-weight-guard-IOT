// Admin Incidents Controller
// Admin Controller for managing incidents and viewing incident data
import db from '../../database/db.js';

const ACTIVE_INCIDENT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];
const ALLOWED_INCIDENT_STATUSES = ['pending', 'open', 'closed', 'acknowledged', 'investigating', 'resolved', 'false_alarm'];

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function buildIncidentDescription(row) {
    if (row.description && String(row.description).trim().length > 0) {
        return String(row.description).trim();
    }

    const type = String(row.incident_type || '').toLowerCase();
    const impact = toNumberOrNull(row.weight_difference_kg);
    if (type === 'overload') {
        return impact !== null
            ? `Vehicle exceeded safe load by ${impact.toFixed(2)} kg.`
            : 'Vehicle exceeded safe load limit.';
    }

    if (type === 'cargo_loss') {
        return impact !== null
            ? `Detected cargo loss of ${impact.toFixed(2)} kg during dispatch.`
            : 'Detected sudden cargo weight drop.';
    }

    if (type === 'route_deviation') {
        return 'Vehicle deviated from planned route.';
    }

    if (type === 'unauthorized_stop') {
        return 'Vehicle stopped outside expected route window.';
    }

    return 'Incident detected by automated monitoring.';
}

function toFiniteOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

async function insertAutoIncident({
    taskId,
    vehicleId,
    driverId,
    incidentType,
    severity,
    status,
    description,
    weightImpactKg,
    latitude,
    longitude
}) {
    await db.query(
        `
            INSERT INTO incidents (
                managed_by,
                vehicle_id,
                driver_id,
                task_id,
                incident_type,
                severity,
                status,
                weight_impact_kg,
                description,
                latitude,
                longitude,
                created_at
            )
            VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `,
        [vehicleId, driverId, taskId, incidentType, severity, status, weightImpactKg, description || null, latitude, longitude]
    );
}

function normalizeIncidentType(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('overload')) return 'overload';
    if (t.includes('loss')) return 'loss';
    return t;
}

async function getLatestOpenIncident(taskId, vehicleId, incidentType) {
    const result = await db.query(
        `
            SELECT id, status
            FROM incidents
            WHERE task_id = $1
              AND vehicle_id = $2
              AND LOWER(COALESCE(incident_type, '')) = $3
              AND LOWER(COALESCE(status, 'open')) IN ('pending', 'open', 'acknowledged', 'investigating')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        `,
        [taskId, vehicleId, incidentType]
    );

    return result.rows[0] || null;
}

async function resolveOpenIncident(incidentId, description) {
    await db.query(
        `
            UPDATE incidents
            SET
                status = 'resolved',
                resolved_at = NOW(),
                description = COALESCE(description, $1)
            WHERE id = $2
        `,
        [description || null, incidentId]
    );
}

function buildOverloadDescription(dispatchStatus, overloadKg, latitude, longitude) {
    const amount = Number(overloadKg || 0).toFixed(2);
    if (dispatchStatus === 'in_transit') {
        const latText = Number.isFinite(latitude) ? latitude.toFixed(6) : 'unknown';
        const lngText = Number.isFinite(longitude) ? longitude.toFixed(6) : 'unknown';
        return `Overload detected during transit at latitude ${latText} and longitude ${lngText}. Vehicle exceeded safe load capacity by ${amount} kg. Immediate action recommended.`;
    }

    return `Vehicle exceeded safe load capacity by ${amount} kg at the pickup location. This issue can still be resolved before transit.`;
}

function buildLossDescription(lossKg, latitude, longitude) {
    const amount = Number(Math.abs(lossKg || 0)).toFixed(2);
    const latText = Number.isFinite(latitude) ? latitude.toFixed(6) : 'unknown';
    const lngText = Number.isFinite(longitude) ? longitude.toFixed(6) : 'unknown';
    return `Cargo loss detected during transit at latitude ${latText} and longitude ${lngText}. Weight dropped by ${amount} kg. Immediate action recommended.`;
}

function buildNormalizedDescription(baseType) {
    if (baseType === 'overload') {
        return 'Load returned to normal range. Vehicle is now within safe capacity limits.';
    }

    if (baseType === 'loss') {
        return 'Cargo weight returned to expected range. No active loss detected.';
    }

    return 'Incident condition returned to normal range.';
}

function hasConfirmedEvidenceForFalseAlarmCheck(row) {
    const type = String(row.incident_type || '').toLowerCase();
    const impact = toFiniteOrNull(row.weight_impact_kg);
    const initialWeight = toFiniteOrNull(row.initial_reference_weight_kg);
    const maxCapacity = toFiniteOrNull(row.max_capacity_kg);
    const currentWeight = toFiniteOrNull(row.current_weight_kg);

    if (type === 'overload') {
        const dispatchEvidence = initialWeight !== null && maxCapacity !== null && initialWeight > maxCapacity;
        const incidentEvidence = impact !== null && impact > 0;
        return dispatchEvidence || incidentEvidence;
    }

    if (type === 'loss' || type === 'cargo_loss') {
        const dispatchEvidence = initialWeight !== null && currentWeight !== null && currentWeight < initialWeight;
        const incidentEvidence = impact !== null && Math.abs(impact) > 0;
        return dispatchEvidence || incidentEvidence;
    }

    return false;
}

function isValidStatusTransition(currentStatus, nextStatus) {
    const from = String(currentStatus || '').toLowerCase();
    const to = String(nextStatus || '').toLowerCase();

    if (from === to) {
        return false;
    }

    const allowedTransitions = {
        pending: ['acknowledged', 'false_alarm'],
        open: ['acknowledged', 'false_alarm'],
        acknowledged: ['investigating', 'resolved', 'false_alarm'],
        investigating: ['resolved', 'false_alarm'],
        resolved: [],
        false_alarm: [],
        closed: []
    };

    return (allowedTransitions[from] || []).includes(to);
}

function getTransitionErrorMessage(currentStatus, nextStatus) {
    const from = String(currentStatus || '').toLowerCase();
    const to = String(nextStatus || '').toLowerCase();

    if (from === to) {
        return `Incident is already marked as ${to.replace('_', ' ')}.`;
    }

    if (to === 'acknowledged') {
        if (from === 'investigating') {
            return 'Incident is already under investigation. Acknowledge is no longer needed.';
        }
        if (from === 'resolved' || from === 'false_alarm' || from === 'closed') {
            return 'Finalized incidents cannot be acknowledged.';
        }
    }

    if (to === 'investigating') {
        if (from === 'pending' || from === 'open') {
            return 'Please acknowledge this incident first before marking it as Investigating.';
        }
        if (from === 'resolved' || from === 'false_alarm' || from === 'closed') {
            return 'Finalized incidents cannot be moved to Investigating.';
        }
    }

    if (to === 'resolved') {
        if (from === 'pending' || from === 'open') {
            return 'Please acknowledge and investigate this incident before resolving it.';
        }
        if (from === 'resolved' || from === 'false_alarm' || from === 'closed') {
            return 'This incident is already finalized and cannot be resolved again.';
        }
    }

    if (to === 'false_alarm') {
        if (from === 'resolved' || from === 'false_alarm' || from === 'closed') {
            return 'This incident is already finalized and cannot be marked as False Alarm.';
        }
    }

    return `Invalid transition from ${from} to ${to}.`;
}

class AdminIncidentsController {
    static async syncIncidentLogsFromDispatch() {
        const rows = await db.query(
            `
                SELECT
                    dt.id AS task_id,
                    dt.vehicle_id,
                    LOWER(COALESCE(dt.status, 'pending')) AS dispatch_status,
                    dt.initial_reference_weight_kg,
                    dt.pickup_lat,
                    dt.pickup_lng,
                    v.assigned_driver_id,
                    v.max_capacity_kg,
                    tl.current_weight_kg,
                    tl.latitude AS telemetry_lat,
                    tl.longitude AS telemetry_lng
                FROM dispatch_tasks dt
                INNER JOIN vehicles v ON v.id = dt.vehicle_id
                LEFT JOIN LATERAL (
                    SELECT
                        current_weight_kg,
                        latitude,
                        longitude
                    FROM telemetry_logs
                    WHERE task_id = dt.id
                    ORDER BY recorded_at DESC, id DESC
                    LIMIT 1
                ) tl ON true
                WHERE LOWER(COALESCE(dt.status, 'pending')) IN ('active', 'in_transit')
            `
        );

        for (const row of rows.rows) {
            const dispatchStatus = String(row.dispatch_status || '').toLowerCase();
            const taskId = Number(row.task_id);
            const vehicleId = Number(row.vehicle_id);
            const driverId = row.assigned_driver_id !== null ? Number(row.assigned_driver_id) : null;

            const initialWeightKg = toFiniteOrNull(row.initial_reference_weight_kg);
            const maxCapacityKg = toFiniteOrNull(row.max_capacity_kg);
            const currentWeightKg = toFiniteOrNull(row.current_weight_kg);

            const pickupLat = toFiniteOrNull(row.pickup_lat);
            const pickupLng = toFiniteOrNull(row.pickup_lng);
            const telemetryLat = toFiniteOrNull(row.telemetry_lat);
            const telemetryLng = toFiniteOrNull(row.telemetry_lng);

            const overloadDetected = initialWeightKg !== null
                && maxCapacityKg !== null
                && initialWeightKg > maxCapacityKg;
            const overloadImpact = overloadDetected ? initialWeightKg - maxCapacityKg : 0;
            const overloadLat = dispatchStatus === 'active' ? pickupLat : telemetryLat;
            const overloadLng = dispatchStatus === 'active' ? pickupLng : telemetryLng;

            const lossDetected = dispatchStatus === 'in_transit'
                && initialWeightKg !== null
                && currentWeightKg !== null
                && currentWeightKg < initialWeightKg;
            const lossImpact = lossDetected ? (currentWeightKg - initialWeightKg) : 0;

            const openOverload = await getLatestOpenIncident(taskId, vehicleId, 'overload');
            const openLoss = await getLatestOpenIncident(taskId, vehicleId, 'loss');

            if ((dispatchStatus === 'active' || dispatchStatus === 'in_transit') && overloadDetected) {
                if (!openOverload) {
                    await insertAutoIncident({
                        taskId,
                        vehicleId,
                        driverId,
                        incidentType: 'overload',
                        severity: dispatchStatus === 'active' ? 'medium' : 'high',
                        status: 'open',
                        description: buildOverloadDescription(dispatchStatus, overloadImpact, overloadLat, overloadLng),
                        weightImpactKg: overloadImpact,
                        latitude: overloadLat,
                        longitude: overloadLng
                    });
                }
            } else if (openOverload) {
                await resolveOpenIncident(openOverload.id, buildNormalizedDescription('overload'));
                await insertAutoIncident({
                    taskId,
                    vehicleId,
                    driverId,
                    incidentType: 'overload',
                    severity: 'normal',
                    status: 'resolved',
                    description: buildNormalizedDescription('overload'),
                    weightImpactKg: 0,
                    latitude: overloadLat,
                    longitude: overloadLng
                });
            }

            if (lossDetected) {
                if (!openLoss) {
                    await insertAutoIncident({
                        taskId,
                        vehicleId,
                        driverId,
                        incidentType: 'loss',
                        severity: 'high',
                        status: 'open',
                        description: buildLossDescription(lossImpact, telemetryLat, telemetryLng),
                        weightImpactKg: lossImpact,
                        latitude: telemetryLat,
                        longitude: telemetryLng
                    });
                }
            } else if (openLoss) {
                await resolveOpenIncident(openLoss.id, buildNormalizedDescription('loss'));
                await insertAutoIncident({
                    taskId,
                    vehicleId,
                    driverId,
                    incidentType: 'loss',
                    severity: 'normal',
                    status: 'resolved',
                    description: buildNormalizedDescription('loss'),
                    weightImpactKg: 0,
                    latitude: telemetryLat,
                    longitude: telemetryLng
                });
            }
        }
    }

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

    /**
     * GET /api/admin/incidents
     * Return incidents for admin table/map rendering.
     */
    static async getIncidentLogs(req, res) {
        try {
            await AdminIncidentsController.syncIncidentLogsFromDispatch();

            const typeFilter = String(req.query.type || '').trim().toLowerCase();
            const statusFilter = String(req.query.status || '').trim().toLowerCase();
            const view = String(req.query.view || 'active').trim().toLowerCase();
            const page = Math.max(1, Number(req.query.page) || 1);
            const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
            const offset = (page - 1) * limit;

            const params = [];
            const where = [];

            if (typeFilter) {
                params.push(typeFilter);
                where.push(`LOWER(COALESCE(i.incident_type, '')) = $${params.length}`);
            }

            if (statusFilter) {
                params.push(statusFilter);
                where.push(`LOWER(COALESCE(i.status, 'pending')) = $${params.length}`);
            } else if (view === 'active') {
                params.push(...ACTIVE_INCIDENT_STATUSES);
                const startIndex = params.length - ACTIVE_INCIDENT_STATUSES.length + 1;
                where.push(`LOWER(COALESCE(i.status, 'pending')) IN ($${startIndex}, $${startIndex + 1}, $${startIndex + 2}, $${startIndex + 3})`);
            }

            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

            const countResult = await db.query(
                `
                    SELECT COUNT(*)::int AS total
                    FROM incidents i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    LEFT JOIN users u ON u.id = i.driver_id
                    ${whereClause}
                `,
                params
            );

            const totalEntries = Number(countResult.rows[0]?.total || 0);
            const totalPages = Math.max(1, Math.ceil(totalEntries / limit));

            const result = await db.query(
                `
                    SELECT
                        i.id,
                        i.task_id,
                        i.vehicle_id,
                        i.driver_id,
                        LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                        LOWER(COALESCE(i.severity, 'info')) AS severity,
                        LOWER(COALESCE(i.status, 'pending')) AS status,
                        i.weight_impact_kg AS weight_difference_kg,
                        i.description,
                        i.latitude,
                        i.longitude,
                        i.created_at,
                        i.resolved_at,
                        LOWER(COALESCE(dt.status, 'pending')) AS dispatch_status,
                        dt.initial_reference_weight_kg AS initial_weight_kg,
                        dt.pickup_lat,
                        dt.pickup_lng,
                        dt.destination_lat,
                        dt.destination_lng,
                        v.vehicle_type AS vehicle_name,
                        v.plate_number AS vehicle_number,
                        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS driver_name
                    FROM incidents i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    LEFT JOIN users u ON u.id = i.driver_id
                    ${whereClause}
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT $${params.length + 1}
                    OFFSET $${params.length + 2}
                `,
                [...params, limit, offset]
            );

            const data = result.rows.map((row) => ({
                ...row,
                description: buildIncidentDescription(row)
            }));

            return res.status(200).json({
                data,
                pagination: {
                    page,
                    limit,
                    totalEntries,
                    totalPages
                }
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentLogs error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incidents.'
            });
        }
    }

    /**
     * GET /api/admin/incidents/count
     * Return active incident count for sidebar badge.
     */
    static async getIncidentCount(req, res) {
        try {
            await AdminIncidentsController.syncIncidentLogsFromDispatch();

            const result = await db.query(
                `
                    SELECT COUNT(*)::int AS total
                    FROM incidents i
                    WHERE LOWER(COALESCE(i.status, 'pending')) IN ('pending', 'open', 'acknowledged', 'investigating')
                `
            );

            return res.status(200).json({
                count: Number(result.rows[0]?.total || 0)
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentCount error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incident count.'
            });
        }
    }

    /**
     * GET /api/admin/incidents/:incidentId/timeline
     * Return recent telemetry points used by the detail chart.
     */
    static async getIncidentTimeline(req, res) {
        try {
            const incidentId = Number(req.params.incidentId);
            const requestedLimit = Number(req.query.limit);
            const limit = Number.isFinite(requestedLimit)
                ? Math.max(5, Math.min(120, requestedLimit))
                : 30;

            if (!Number.isFinite(incidentId) || incidentId <= 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors: {
                        incidentId: 'Incident ID must be a valid positive number.'
                    }
                });
            }

            const incidentResult = await db.query(
                `
                    SELECT id, task_id, vehicle_id, created_at
                    FROM incidents
                    WHERE id = $1
                    LIMIT 1
                `,
                [incidentId]
            );

            if (incidentResult.rows.length === 0) {
                return res.status(404).json({ error: 'Incident not found.' });
            }

            const incident = incidentResult.rows[0];
            const incidentTime = incident.created_at;

            const fetchNearestPointsByTask = async () => db.query(
                `
                    SELECT picked.recorded_at, picked.weight_kg
                    FROM (
                        SELECT
                            tl.recorded_at,
                            tl.current_weight_kg AS weight_kg
                        FROM telemetry_logs tl
                        WHERE tl.task_id = $1
                          AND tl.recorded_at BETWEEN ($2::timestamp - INTERVAL '24 hours') AND ($2::timestamp + INTERVAL '24 hours')
                        ORDER BY ABS(EXTRACT(EPOCH FROM (tl.recorded_at - $2::timestamp))) ASC, tl.recorded_at DESC
                        LIMIT $3
                    ) AS picked
                    ORDER BY picked.recorded_at ASC
                `,
                [incident.task_id, incidentTime, limit]
            );

            const fetchLatestPointsByTask = async () => db.query(
                `
                    SELECT picked.recorded_at, picked.weight_kg
                    FROM (
                        SELECT
                            tl.recorded_at,
                            tl.current_weight_kg AS weight_kg
                        FROM telemetry_logs tl
                        WHERE tl.task_id = $1
                        ORDER BY tl.recorded_at DESC
                        LIMIT $2
                    ) AS picked
                    ORDER BY picked.recorded_at ASC
                `,
                [incident.task_id, limit]
            );

            const fetchNearestPointsByVehicle = async () => db.query(
                `
                    SELECT picked.recorded_at, picked.weight_kg
                    FROM (
                        SELECT
                            tl.recorded_at,
                            tl.current_weight_kg AS weight_kg
                        FROM telemetry_logs tl
                        WHERE tl.vehicle_id = $1
                          AND tl.recorded_at BETWEEN ($2::timestamp - INTERVAL '24 hours') AND ($2::timestamp + INTERVAL '24 hours')
                        ORDER BY ABS(EXTRACT(EPOCH FROM (tl.recorded_at - $2::timestamp))) ASC, tl.recorded_at DESC
                        LIMIT $3
                    ) AS picked
                    ORDER BY picked.recorded_at ASC
                `,
                [incident.vehicle_id, incidentTime, limit]
            );

            const fetchLatestPointsByVehicle = async () => db.query(
                `
                    SELECT picked.recorded_at, picked.weight_kg
                    FROM (
                        SELECT
                            tl.recorded_at,
                            tl.current_weight_kg AS weight_kg
                        FROM telemetry_logs tl
                        WHERE tl.vehicle_id = $1
                        ORDER BY tl.recorded_at DESC
                        LIMIT $2
                    ) AS picked
                    ORDER BY picked.recorded_at ASC
                `,
                [incident.vehicle_id, limit]
            );

            let points = [];

            if (incident.task_id !== null && incident.task_id !== undefined) {
                const taskScoped = await fetchNearestPointsByTask();
                points = taskScoped.rows;

                if (points.length === 0) {
                    const latestTaskScoped = await fetchLatestPointsByTask();
                    points = latestTaskScoped.rows;
                }
            }

            if (points.length === 0 && incident.vehicle_id !== null && incident.vehicle_id !== undefined) {
                const vehicleScoped = await fetchNearestPointsByVehicle();
                points = vehicleScoped.rows;

                if (points.length === 0) {
                    const latestVehicleScoped = await fetchLatestPointsByVehicle();
                    points = latestVehicleScoped.rows;
                }
            }

            return res.status(200).json({ data: points });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentTimeline error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incident timeline.'
            });
        }
    }

    /**
     * GET /api/admin/incidents/:incidentId/history
     * Return lifecycle history for the same task and incident type group.
     */
    static async getIncidentHistory(req, res) {
        try {
            const incidentId = Number(req.params.incidentId);
            if (!Number.isFinite(incidentId) || incidentId <= 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors: {
                        incidentId: 'Incident ID must be a valid positive number.'
                    }
                });
            }

            const targetResult = await db.query(
                `
                    SELECT id, task_id, vehicle_id, incident_type
                    FROM incidents
                    WHERE id = $1
                    LIMIT 1
                `,
                [incidentId]
            );

            if (targetResult.rows.length === 0) {
                return res.status(404).json({ error: 'Incident not found.' });
            }

            const target = targetResult.rows[0];
            const baseType = normalizeIncidentType(target.incident_type);

            const historyResult = await db.query(
                `
                    SELECT
                        id,
                        created_at,
                        resolved_at,
                        LOWER(COALESCE(status, 'open')) AS status,
                        LOWER(COALESCE(severity, 'normal')) AS severity,
                        LOWER(COALESCE(incident_type, 'unknown')) AS incident_type,
                        weight_impact_kg,
                        description,
                        latitude,
                        longitude
                    FROM incidents
                    WHERE task_id = $1
                      AND vehicle_id = $2
                      AND LOWER(COALESCE(incident_type, '')) = $3
                    ORDER BY created_at ASC, id ASC
                `,
                [target.task_id, target.vehicle_id, baseType]
            );

            return res.status(200).json({ data: historyResult.rows });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentHistory error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incident history.'
            });
        }
    }

    /**
     * PATCH /api/admin/incidents/:incidentId/status
     * Update incident status and optional resolution notes.
     */
    static async updateIncidentStatus(req, res) {
        try {
            const incidentId = Number(req.params.incidentId);
            const rawStatus = String(req.body?.status || '').trim().toLowerCase();
            const fieldErrors = {};
            const allowedActionStatuses = ['acknowledged', 'investigating', 'resolved', 'false_alarm'];

            if (!Number.isFinite(incidentId) || incidentId <= 0) {
                fieldErrors.incidentId = 'Incident ID must be a valid positive number.';
            }

            if (!rawStatus) {
                fieldErrors.status = 'Status is required.';
            } else if (!ALLOWED_INCIDENT_STATUSES.includes(rawStatus)) {
                fieldErrors.status = `Status must be one of: ${ALLOWED_INCIDENT_STATUSES.join(', ')}.`;
            } else if (!allowedActionStatuses.includes(rawStatus)) {
                fieldErrors.status = 'Only acknowledged, investigating, resolved, and false_alarm are allowed from this action.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors
                });
            }

            const existing = await db.query(
                `
                    SELECT
                        i.id,
                        LOWER(COALESCE(i.status, 'pending')) AS status,
                        LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                        i.weight_impact_kg,
                        i.task_id,
                        i.vehicle_id,
                        dt.initial_reference_weight_kg,
                        v.max_capacity_kg,
                        tl.current_weight_kg
                    FROM incidents
                    i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    LEFT JOIN LATERAL (
                        SELECT current_weight_kg
                        FROM telemetry_logs
                        WHERE (
                            (i.task_id IS NOT NULL AND task_id = i.task_id)
                            OR (i.task_id IS NULL AND i.vehicle_id IS NOT NULL AND vehicle_id = i.vehicle_id)
                        )
                        ORDER BY recorded_at DESC, id DESC
                        LIMIT 1
                    ) tl ON true
                    WHERE i.id = $1
                    LIMIT 1
                `,
                [incidentId]
            );

            if (existing.rows.length === 0) {
                return res.status(404).json({ error: 'Incident not found.' });
            }

            const incidentRow = existing.rows[0];
            const currentStatus = String(incidentRow.status || 'pending').toLowerCase();

            if (!isValidStatusTransition(currentStatus, rawStatus)) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors: {
                        status: getTransitionErrorMessage(currentStatus, rawStatus)
                    }
                });
            }

            if (rawStatus === 'false_alarm' && hasConfirmedEvidenceForFalseAlarmCheck(incidentRow)) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors: {
                        status: 'Cannot mark as False Alarm because evidence confirms this incident occurred (overload/cargo loss detected).'
                    }
                });
            }

            const result = await db.query(
                `
                    UPDATE incidents
                    SET
                        status = $1::varchar,
                        resolved_at = CASE
                            WHEN $2::text IN ('resolved', 'false_alarm') THEN NOW()
                            ELSE NULL
                        END
                    WHERE id = $3
                    RETURNING id, status, resolved_at
                `,
                [rawStatus, rawStatus, incidentId]
            );

            return res.status(200).json({
                message: 'Incident status updated successfully.',
                data: result.rows[0]
            });
        } catch (error) {
            console.error('[AdminIncidentsController] updateIncidentStatus error:', error);
            return res.status(500).json({
                error: 'An error occurred while updating incident status.'
            });
        }
    }

    
}

export default AdminIncidentsController;