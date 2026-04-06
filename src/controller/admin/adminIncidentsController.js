// Admin Incidents Controller
// Admin Controller for managing incidents and viewing incident data
import db from '../../database/db.js';

const ACTIVE_INCIDENT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];
const ALLOWED_INCIDENT_STATUSES = ['pending', 'open', 'closed', 'acknowledged', 'investigating', 'resolved', 'false_alarm'];
const INCIDENT_IMPACT_EPSILON_KG = 0.01;

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

    if (type === 'above_reference') {
        return impact !== null
            ? `Vehicle load increased above the dispatch reference by ${impact.toFixed(2)} kg.`
            : 'Vehicle load increased above the dispatch reference weight.';
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

function normalizeIncidentType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'cargo_loss' || normalized === 'loss') {
        return 'loss';
    }

    if (normalized === 'overload') {
        return 'overload';
    }

    if (normalized === 'above_reference') {
        return 'above_reference';
    }

    return normalized;
}

function getIncidentTypeAliases(type) {
    const normalized = normalizeIncidentType(type);
    if (normalized === 'loss') {
        return ['loss', 'cargo_loss'];
    }

    return [normalized];
}

function normalizeImpactKg(value) {
    const parsed = toFiniteOrNull(value);
    if (parsed === null) {
        return null;
    }

    return Math.round(parsed * 100) / 100;
}

function areImpactsEquivalent(a, b) {
    const left = normalizeImpactKg(a);
    const right = normalizeImpactKg(b);

    if (left === null || right === null) {
        return left === right;
    }

    return Math.abs(left - right) < INCIDENT_IMPACT_EPSILON_KG;
}

async function insertAutoIncident({
    taskId,
    vehicleId,
    driverId,
    incidentType,
    severity,
    status,
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
                latitude,
                longitude,
                created_at
            )
            VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `,
        [vehicleId, driverId, taskId, incidentType, severity, status, weightImpactKg, latitude, longitude]
    );
}

async function getLatestOpenIncident(taskId, vehicleId, incidentType) {
        const typeAliases = getIncidentTypeAliases(incidentType);
    const result = await db.query(
        `
                        SELECT id, status, weight_impact_kg, LOWER(COALESCE(incident_type, '')) AS incident_type
            FROM incidents
            WHERE task_id = $1
              AND vehicle_id = $2
                            AND LOWER(COALESCE(incident_type, '')) = ANY($3::text[])
              AND LOWER(COALESCE(status, 'open')) IN ('pending', 'open', 'acknowledged', 'investigating')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        `,
                [taskId, vehicleId, typeAliases]
    );

    return result.rows[0] || null;
}

async function resolveOpenIncident(incidentId) {
    await db.query(
        `
            UPDATE incidents
            SET
                status = 'resolved',
                resolved_at = NOW()
            WHERE id = $1
        `,
        [incidentId]
    );
}

function determineWeightIncident({
    dispatchStatus,
    initialWeightKg,
    maxCapacityKg,
    currentWeightKg
}) {
    if (dispatchStatus !== 'in_transit') {
        return null;
    }

    if (initialWeightKg === null || maxCapacityKg === null || currentWeightKg === null) {
        return null;
    }

    if (currentWeightKg > maxCapacityKg) {
        return {
            incidentType: 'overload',
            severity: 'high',
            weightImpactKg: currentWeightKg - maxCapacityKg
        };
    }

    if (currentWeightKg < initialWeightKg) {
        return {
            incidentType: 'loss',
            severity: 'high',
            weightImpactKg: currentWeightKg - initialWeightKg
        };
    }

    if (currentWeightKg > initialWeightKg) {
        return {
            incidentType: 'above_reference',
            severity: 'medium',
            weightImpactKg: currentWeightKg - initialWeightKg
        };
    }

    return null;
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

function formatCsvTimestamp(value) {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString();
}

function csvEscape(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
    const headerLine = headers.map(csvEscape).join(',');
    const bodyLines = rows.map((row) => row.map(csvEscape).join(','));
    return [headerLine, ...bodyLines].join('\n');
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
                    vls.current_weight_kg AS current_weight_kg,
                    vls.current_latitude AS live_latitude,
                    vls.current_longitude AS live_longitude
                FROM dispatch_tasks dt
                INNER JOIN vehicles v ON v.id = dt.vehicle_id
                LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
                WHERE LOWER(COALESCE(dt.status, 'pending')) = 'in_transit'
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
            const liveLat = toFiniteOrNull(row.live_latitude);
            const liveLng = toFiniteOrNull(row.live_longitude);

            const incident = determineWeightIncident({
                dispatchStatus,
                initialWeightKg,
                maxCapacityKg,
                currentWeightKg
            });

            const openOverload = await getLatestOpenIncident(taskId, vehicleId, 'overload');
            const openLoss = await getLatestOpenIncident(taskId, vehicleId, 'loss');
            const openAboveReference = await getLatestOpenIncident(taskId, vehicleId, 'above_reference');

            if (incident) {
                const targetOpenIncident = incident.incidentType === 'overload'
                    ? openOverload
                    : incident.incidentType === 'loss'
                        ? openLoss
                        : openAboveReference;

                const incidentLatitude = liveLat ?? pickupLat;
                const incidentLongitude = liveLng ?? pickupLng;

                for (const activeIncident of [openOverload, openLoss, openAboveReference].filter(Boolean)) {
                    if (!targetOpenIncident || activeIncident.id !== targetOpenIncident.id) {
                        await resolveOpenIncident(activeIncident.id);
                    }
                }

                if (targetOpenIncident) {
                    const oldImpact = normalizeImpactKg(targetOpenIncident.weight_impact_kg);
                    const newImpact = normalizeImpactKg(incident.weightImpactKg);

                    // Insert only when impact meaningfully changes.
                    if (!areImpactsEquivalent(oldImpact, newImpact)) {
                        await insertAutoIncident({
                            taskId,
                            vehicleId,
                            driverId,
                            incidentType: incident.incidentType,
                            severity: incident.severity,
                            status: 'open',
                            weightImpactKg: newImpact,
                            latitude: incidentLatitude,
                            longitude: incidentLongitude
                        });
                    }
                } else {
                    const newImpact = normalizeImpactKg(incident.weightImpactKg);

                    await insertAutoIncident({
                        taskId,
                        vehicleId,
                        driverId,
                        incidentType: incident.incidentType,
                        severity: incident.severity,
                        status: 'open',
                        weightImpactKg: newImpact,
                        latitude: incidentLatitude,
                        longitude: incidentLongitude
                    });
                }
            } else {
                for (const activeIncident of [openOverload, openLoss, openAboveReference].filter(Boolean)) {
                    await resolveOpenIncident(activeIncident.id);
                }
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
            const incidentGroupKey = `COALESCE(i.task_id::text, CONCAT('incident-', i.id::text))`;

            const countResult = await db.query(
                `
                    WITH filtered_incidents AS (
                        SELECT
                            i.id,
                            i.task_id,
                            i.vehicle_id,
                            i.driver_id,
                            LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                            LOWER(COALESCE(i.severity, 'info')) AS severity,
                            LOWER(COALESCE(i.status, 'pending')) AS status,
                            i.weight_impact_kg AS weight_difference_kg,
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
                            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS driver_name,
                            ${incidentGroupKey} AS incident_group_key,
                            COUNT(*) OVER (PARTITION BY ${incidentGroupKey})::int AS events_count
                        FROM incidents i
                        LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                        LEFT JOIN vehicles v ON v.id = i.vehicle_id
                        LEFT JOIN users u ON u.id = i.driver_id
                        ${whereClause}
                    ), grouped_incidents AS (
                        SELECT DISTINCT ON (incident_group_key)
                            *
                        FROM filtered_incidents
                        ORDER BY incident_group_key, created_at DESC, id DESC
                    )
                    SELECT COUNT(*)::int AS total
                    FROM grouped_incidents
                `,
                params
            );

            const totalEntries = Number(countResult.rows[0]?.total || 0);
            const totalPages = Math.max(1, Math.ceil(totalEntries / limit));

            const result = await db.query(
                `
                    WITH filtered_incidents AS (
                        SELECT
                            i.id,
                            i.task_id,
                            i.vehicle_id,
                            i.driver_id,
                            LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                            LOWER(COALESCE(i.severity, 'info')) AS severity,
                            LOWER(COALESCE(i.status, 'pending')) AS status,
                            i.weight_impact_kg AS weight_difference_kg,
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
                            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS driver_name,
                            ${incidentGroupKey} AS incident_group_key,
                            COUNT(*) OVER (PARTITION BY ${incidentGroupKey})::int AS events_count
                        FROM incidents i
                        LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                        LEFT JOIN vehicles v ON v.id = i.vehicle_id
                        LEFT JOIN users u ON u.id = i.driver_id
                        ${whereClause}
                    ), grouped_incidents AS (
                        SELECT DISTINCT ON (incident_group_key)
                            *
                        FROM filtered_incidents
                        ORDER BY incident_group_key, created_at DESC, id DESC
                    )
                    SELECT
                        id,
                        task_id,
                        vehicle_id,
                        driver_id,
                        incident_type,
                        severity,
                        status,
                        weight_difference_kg,
                        latitude,
                        longitude,
                        created_at,
                        resolved_at,
                        dispatch_status,
                        initial_weight_kg,
                        pickup_lat,
                        pickup_lng,
                        destination_lat,
                        destination_lng,
                        vehicle_name,
                        vehicle_number,
                        driver_name,
                        events_count
                    FROM grouped_incidents
                    ORDER BY created_at DESC, id DESC
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
     * GET /api/admin/incidents/export.csv
     * Export filtered grouped incidents with detailed fields.
     */
    static async exportIncidentLogsCsv(req, res) {
        try {
            await AdminIncidentsController.syncIncidentLogsFromDispatch();

            const typeFilter = String(req.query.type || '').trim().toLowerCase();
            const statusFilter = String(req.query.status || '').trim().toLowerCase();
            const view = String(req.query.view || 'active').trim().toLowerCase();

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
            const incidentGroupKey = `COALESCE(i.task_id::text, CONCAT('incident-', i.id::text))`;

            const result = await db.query(
                `
                    WITH filtered_incidents AS (
                        SELECT
                            i.id,
                            i.task_id,
                            i.vehicle_id,
                            i.driver_id,
                            i.managed_by,
                            i.description,
                            LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                            LOWER(COALESCE(i.severity, 'info')) AS severity,
                            LOWER(COALESCE(i.status, 'pending')) AS status,
                            i.weight_impact_kg AS weight_difference_kg,
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
                            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS driver_name,
                            TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS managed_by_name,
                            ${incidentGroupKey} AS incident_group_key,
                            COUNT(*) OVER (PARTITION BY ${incidentGroupKey})::int AS events_count
                        FROM incidents i
                        LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                        LEFT JOIN vehicles v ON v.id = i.vehicle_id
                        LEFT JOIN users u ON u.id = i.driver_id
                        LEFT JOIN administrator a ON a.id = i.managed_by
                        ${whereClause}
                    ), grouped_incidents AS (
                        SELECT DISTINCT ON (incident_group_key)
                            *
                        FROM filtered_incidents
                        ORDER BY incident_group_key, created_at DESC, id DESC
                    )
                    SELECT
                        id,
                        incident_group_key,
                        task_id,
                        vehicle_id,
                        driver_id,
                        managed_by,
                        managed_by_name,
                        incident_type,
                        severity,
                        status,
                        description,
                        weight_difference_kg,
                        latitude,
                        longitude,
                        created_at,
                        resolved_at,
                        dispatch_status,
                        initial_weight_kg,
                        pickup_lat,
                        pickup_lng,
                        destination_lat,
                        destination_lng,
                        vehicle_name,
                        vehicle_number,
                        driver_name,
                        events_count
                    FROM grouped_incidents
                    ORDER BY created_at DESC, id DESC
                `,
                params
            );

            const headers = [
                'Incident ID',
                'Incident Group Key',
                'Created At (UTC)',
                'Resolved At (UTC)',
                'Incident Type',
                'Severity',
                'Status',
                'Description',
                'Events Count',
                'Task ID',
                'Dispatch Status',
                'Vehicle ID',
                'Vehicle Type',
                'Vehicle Plate',
                'Driver ID',
                'Driver Name',
                'Managed By ID',
                'Managed By Name',
                'Initial Reference Weight (kg)',
                'Weight Impact (kg)',
                'Incident Latitude',
                'Incident Longitude',
                'Pickup Latitude',
                'Pickup Longitude',
                'Destination Latitude',
                'Destination Longitude'
            ];

            const rows = result.rows.map((row) => {
                const description = buildIncidentDescription(row);
                return [
                    row.id,
                    row.incident_group_key,
                    formatCsvTimestamp(row.created_at),
                    formatCsvTimestamp(row.resolved_at),
                    row.incident_type || '',
                    row.severity || '',
                    row.status || '',
                    description,
                    row.events_count,
                    row.task_id,
                    row.dispatch_status || '',
                    row.vehicle_id,
                    row.vehicle_name || '',
                    row.vehicle_number || '',
                    row.driver_id,
                    row.driver_name || '',
                    row.managed_by,
                    row.managed_by_name || '',
                    row.initial_weight_kg,
                    row.weight_difference_kg,
                    row.latitude,
                    row.longitude,
                    row.pickup_lat,
                    row.pickup_lng,
                    row.destination_lat,
                    row.destination_lng
                ];
            });

            const csv = toCsv(headers, rows);
            const dateStamp = new Date().toISOString().slice(0, 10);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="incident_logs_detailed_${dateStamp}.csv"`);
            return res.status(200).send(`\uFEFF${csv}`);
        } catch (error) {
            console.error('[AdminIncidentsController] exportIncidentLogsCsv error:', error);
            return res.status(500).json({
                error: 'An error occurred while exporting incident logs.'
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
     * Return recent incident-derived weight timeline points for the detail chart.
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
            const historyResult = await db.query(
                `
                    SELECT
                        i.created_at AS recorded_at,
                        CASE
                            WHEN dt.initial_reference_weight_kg IS NOT NULL
                                THEN GREATEST(0, dt.initial_reference_weight_kg + COALESCE(i.weight_impact_kg, 0))
                            ELSE NULL
                        END AS weight_kg
                    FROM incidents i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    WHERE i.vehicle_id = $1
                      AND (
                            (i.task_id IS NOT DISTINCT FROM $2)
                            OR $2 IS NULL
                          )
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT $3
                `,
                [incident.vehicle_id, incident.task_id, limit]
            );

            let points = historyResult.rows
                .filter((row) => row.weight_kg !== null)
                .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

            if (points.length === 0 && incident.vehicle_id !== null && incident.vehicle_id !== undefined) {
                const liveResult = await db.query(
                    `
                        SELECT last_ping_at AS recorded_at, current_weight_kg AS weight_kg
                        FROM vehicle_live_state
                        WHERE vehicle_id = $1
                        LIMIT 1
                    `,
                    [incident.vehicle_id]
                );

                points = (liveResult.rows || []).filter((row) => row.weight_kg !== null);
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

            const historyResult = await db.query(
                `
                    SELECT
                        i.id,
                        i.created_at,
                        i.resolved_at,
                        LOWER(COALESCE(i.status, 'open')) AS status,
                        LOWER(COALESCE(i.severity, 'normal')) AS severity,
                        LOWER(COALESCE(i.incident_type, 'unknown')) AS incident_type,
                        i.weight_impact_kg,
                        i.description AS operator_note,
                        i.managed_by,
                        TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS managed_by_name,
                        i.latitude,
                        i.longitude,
                        dt.initial_reference_weight_kg
                    FROM incidents i
                    LEFT JOIN dispatch_tasks dt ON i.task_id = dt.id
                    LEFT JOIN administrator a ON i.managed_by = a.id
                    WHERE i.task_id = $1
                      AND i.vehicle_id = $2
                    ORDER BY i.created_at ASC, i.id ASC
                `,
                                [target.task_id, target.vehicle_id]
            );

            return res.status(200).json({
                data: historyResult.rows.map((row) => ({
                    ...row,
                    description: buildIncidentDescription({
                        ...row,
                        description: null
                    })
                }))
            });
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
            const rawNote = String(req.body?.note || '').trim();
            const managedBy = Number(req.user?.id);
            const fieldErrors = {};
            const allowedActionStatuses = ['acknowledged', 'investigating', 'resolved', 'false_alarm'];

            if (!Number.isFinite(incidentId) || incidentId <= 0) {
                fieldErrors.incidentId = 'Incident ID must be a valid positive number.';
            }

            if (!Number.isFinite(managedBy) || managedBy <= 0) {
                fieldErrors.session = 'Your admin session is no longer valid. Please sign in again.';
            }

            if (!rawStatus) {
                fieldErrors.status = 'Status is required.';
            } else if (!ALLOWED_INCIDENT_STATUSES.includes(rawStatus)) {
                fieldErrors.status = `Status must be one of: ${ALLOWED_INCIDENT_STATUSES.join(', ')}.`;
            } else if (!allowedActionStatuses.includes(rawStatus)) {
                fieldErrors.status = 'Only acknowledged, investigating, resolved, and false_alarm are allowed from this action.';
            }

            if (!rawNote) {
                fieldErrors.note = 'A note is required for every incident status update.';
            } else if (rawNote.length > 1000) {
                fieldErrors.note = 'Note must be 1000 characters or less.';
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
                        vls.current_weight_kg
                    FROM incidents
                    i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = i.vehicle_id
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

            const noteText = rawNote;
            const noteDescription = noteText;
            const client = await db.connect();
            let updatedIncident = null;

            try {
                await client.query('BEGIN');

                const result = await client.query(
                    `
                        UPDATE incidents
                        SET
                            status = $1::varchar,
                            description = $2::text,
                            managed_by = $3,
                            resolved_at = CASE
                                WHEN $4::text IN ('resolved', 'false_alarm') THEN NOW()
                                ELSE NULL
                            END
                        WHERE id = $5
                        RETURNING id, status, resolved_at, description, managed_by, task_id, vehicle_id
                    `,
                    [rawStatus, noteDescription, managedBy, rawStatus, incidentId]
                );

                updatedIncident = result.rows[0] || null;

                await client.query(
                    `
                        INSERT INTO audit_logs (
                            administrator_id,
                            action,
                            module,
                            description,
                            severity,
                            details,
                            created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
                    `,
                    [
                        managedBy,
                        'INCIDENT_STATUS_UPDATED',
                        'INCIDENTS',
                        `Incident #${incidentId} changed from ${currentStatus} to ${rawStatus}.`,
                        rawStatus === 'resolved' || rawStatus === 'false_alarm' ? 'Medium' : 'Low',
                        JSON.stringify({
                            incidentId,
                            taskId: Number(incidentRow.task_id || 0) || null,
                            vehicleId: Number(incidentRow.vehicle_id || 0) || null,
                            fromStatus: currentStatus,
                            toStatus: rawStatus,
                            note: noteText,
                            managedBy
                        })
                    ]
                );

                await client.query('COMMIT');
            } catch (transactionError) {
                await client.query('ROLLBACK');
                throw transactionError;
            } finally {
                client.release();
            }

            return res.status(200).json({
                message: 'Incident status updated successfully.',
                data: updatedIncident
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