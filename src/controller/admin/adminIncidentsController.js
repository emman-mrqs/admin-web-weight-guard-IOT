// Admin Incidents Controller
// Admin Controller for managing incidents and viewing incident data
import db from '../../database/db.js';

const ACTIVE_INCIDENT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];
const ALLOWED_INCIDENT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating', 'resolved', 'false_alarm'];

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function buildIncidentDescription(row) {
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

    /**
     * GET /api/admin/incidents
     * Return incidents for admin table/map rendering.
     */
    static async getIncidentLogs(req, res) {
        try {
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
                        i.latitude,
                        i.longitude,
                        i.created_at,
                        i.resolved_at,
                        dt.initial_reference_weight_kg AS initial_weight_kg,
                        dt.pickup_lat,
                        dt.pickup_lng,
                        dt.destination_lat,
                        dt.destination_lng,
                        v.plate_number AS vehicle_number,
                        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS driver_name
                    FROM incidents i
                    LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    LEFT JOIN users u ON u.id = i.driver_id
                    ${whereClause}
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT 500
                `,
                params
            );

            const data = result.rows.map((row) => ({
                ...row,
                description: buildIncidentDescription(row)
            }));

            return res.status(200).json({ data });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentLogs error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incidents.'
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
                    SELECT id, task_id, vehicle_id
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
            const pointsResult = await db.query(
                `
                    SELECT
                        tl.recorded_at,
                        tl.current_weight_kg AS weight_kg
                    FROM telemetry_logs tl
                    WHERE (
                        ($1::bigint IS NOT NULL AND tl.task_id = $1::bigint)
                        OR ($2::bigint IS NOT NULL AND tl.vehicle_id = $2::bigint)
                    )
                    ORDER BY tl.recorded_at DESC
                    LIMIT $3
                `,
                [incident.task_id, incident.vehicle_id, limit]
            );

            return res.status(200).json({ data: pointsResult.rows.reverse() });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentTimeline error:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching incident timeline.'
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
            const resolutionNotes = String(req.body?.resolutionNotes || '').trim();
            const fieldErrors = {};

            if (!Number.isFinite(incidentId) || incidentId <= 0) {
                fieldErrors.incidentId = 'Incident ID must be a valid positive number.';
            }

            if (!rawStatus) {
                fieldErrors.status = 'Status is required.';
            } else if (!ALLOWED_INCIDENT_STATUSES.includes(rawStatus)) {
                fieldErrors.status = `Status must be one of: ${ALLOWED_INCIDENT_STATUSES.join(', ')}.`;
            }

            if ((rawStatus === 'resolved' || rawStatus === 'false_alarm') && resolutionNotes.length < 3) {
                fieldErrors.resolutionNotes = 'Resolution notes are required for resolved and false alarm statuses.';
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors
                });
            }

            const existing = await db.query(
                `
                    SELECT id
                    FROM incidents
                    WHERE id = $1
                    LIMIT 1
                `,
                [incidentId]
            );

            if (existing.rows.length === 0) {
                return res.status(404).json({ error: 'Incident not found.' });
            }

            const result = await db.query(
                `
                    UPDATE incidents
                    SET
                        status = $1,
                        resolved_at = CASE
                            WHEN $1 IN ('resolved', 'false_alarm') THEN NOW()
                            ELSE NULL
                        END
                    WHERE id = $2
                    RETURNING id, status, resolved_at
                `,
                [rawStatus, incidentId]
            );

            return res.status(200).json({
                message: 'Incident status updated successfully.',
                data: {
                    ...result.rows[0],
                    resolutionNotes
                }
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