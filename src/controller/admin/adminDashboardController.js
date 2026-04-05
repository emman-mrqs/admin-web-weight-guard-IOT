// Admin Dashboard Controller
import db from '../../database/db.js';

const ACTIVE_INCIDENT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeLoadStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return 'normal';
    if (value.includes('over')) return 'overloaded';
    if (value.includes('loss')) return 'loss';
    return 'normal';
}

function formatBucketLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}


class AdminDashboardController {
    static getDashboard(req, res) {
        try {
            res.render("admin/adminDashboard", {
                currentPage: "dashboard"
            });
        } catch (error) {
            console.error(error);
        }
    }

    static async getDashboardAnalytics(req, res) {
        try {
            const fleetSummaryResult = await db.query(
                `
                    SELECT
                        COUNT(*)::INT AS total_fleet,
                        COALESCE(SUM(
                            CASE
                                WHEN LOWER(COALESCE(current_state, 'active')) IN ('inactive', 'retired', 'maintenance') THEN 0
                                ELSE 1
                            END
                        ), 0)::INT AS active_fleet
                    FROM vehicles
                `
            );

            const loadStatusResult = await db.query(
                `
                    SELECT
                        COALESCE(current_load_status, 'normal') AS current_load_status,
                        COUNT(*)::INT AS count
                    FROM vehicles
                    GROUP BY COALESCE(current_load_status, 'normal')
                `
            );

            const activeLossVehiclesResult = await db.query(
                `
                    SELECT COUNT(DISTINCT vehicle_id)::INT AS active_loss_vehicle_count
                    FROM incidents
                    WHERE LOWER(COALESCE(incident_type, '')) IN ('loss', 'cargo_loss')
                      AND LOWER(COALESCE(status, 'open')) = ANY($1)
                `,
                [ACTIVE_INCIDENT_STATUSES]
            );

            const alertsTodayResult = await db.query(
                `
                    SELECT
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(severity, '')) IN ('high', 'critical') THEN 1 ELSE 0 END), 0)::INT AS critical_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(severity, '')) IN ('medium', 'warning') THEN 1 ELSE 0 END), 0)::INT AS warning_count
                    FROM incidents
                    WHERE created_at >= DATE_TRUNC('day', NOW())
                      AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
                      AND LOWER(COALESCE(status, 'open')) = ANY($1)
                `,
                [ACTIVE_INCIDENT_STATUSES]
            );

            const lossEventsResult = await db.query(
                `
                    SELECT COUNT(*)::INT AS total_loss_events
                    FROM incidents
                    WHERE LOWER(COALESCE(incident_type, '')) IN ('loss', 'cargo_loss')
                      AND created_at >= NOW() - INTERVAL '30 days'
                `
            );

            const liveVehicleResult = await db.query(
                `
                    SELECT
                        v.id AS vehicle_id,
                        COALESCE(v.vehicle_type, 'Vehicle') AS vehicle_type,
                        COALESCE(v.current_load_status, 'normal') AS current_load_status,
                        latest_incident.latitude,
                        latest_incident.longitude,
                        latest_incident.created_at AS latest_recorded_at,
                        COALESCE(active_incidents.has_loss, FALSE) AS has_loss,
                        COALESCE(active_incidents.has_overload, FALSE) AS has_overload
                    FROM vehicles v
                    LEFT JOIN LATERAL (
                        SELECT i.latitude, i.longitude, i.created_at
                        FROM incidents i
                        WHERE i.vehicle_id = v.id
                          AND i.latitude IS NOT NULL
                          AND i.longitude IS NOT NULL
                        ORDER BY i.created_at DESC, i.id DESC
                        LIMIT 1
                    ) latest_incident ON true
                    LEFT JOIN LATERAL (
                        SELECT
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss')) AS has_loss,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) = 'overload') AS has_overload
                        FROM incidents i
                        WHERE i.vehicle_id = v.id
                          AND LOWER(COALESCE(i.status, 'open')) = ANY($1)
                    ) active_incidents ON true
                    ORDER BY COALESCE(latest_incident.created_at, v.created_at) DESC, v.id DESC
                    LIMIT 2
                `,
                [ACTIVE_INCIDENT_STATUSES]
            );

            const latestLossAlertResult = await db.query(
                `
                    SELECT
                        i.id AS incident_id,
                        COALESCE(v.vehicle_type, 'Vehicle') AS vehicle_type,
                        v.id AS vehicle_id
                    FROM incidents i
                    LEFT JOIN vehicles v ON v.id = i.vehicle_id
                    WHERE LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss')
                      AND LOWER(COALESCE(i.status, 'open')) = ANY($1)
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT 1
                `,
                [ACTIVE_INCIDENT_STATUSES]
            );

            const weightFluctuationResult = await db.query(
                `
                    WITH completed_task_weights AS (
                        SELECT
                            DATE_TRUNC('hour', dt.completed_at)
                                - (EXTRACT(HOUR FROM dt.completed_at)::INT % 3) * INTERVAL '1 hour' AS bucket_start,
                            COALESCE(
                                CASE
                                    WHEN latest_incident.weight_impact_kg IS NOT NULL
                                        THEN GREATEST(0, COALESCE(dt.initial_reference_weight_kg, 0) + latest_incident.weight_impact_kg)
                                    ELSE dt.initial_reference_weight_kg
                                END
                            ) AS latest_weight_kg
                        FROM dispatch_tasks dt
                        LEFT JOIN LATERAL (
                            SELECT i2.weight_impact_kg
                            FROM incidents i2
                            WHERE i2.task_id = dt.id
                            ORDER BY i2.created_at DESC, i2.id DESC
                            LIMIT 1
                        ) latest_incident ON true
                        WHERE dt.completed_at >= NOW() - INTERVAL '24 hours'
                          AND dt.completed_at < NOW()
                          AND LOWER(COALESCE(dt.status, '')) = 'completed'
                    ),
                    bucket_weights AS (
                        SELECT
                            bucket_start,
                            AVG(latest_weight_kg) AS avg_weight_kg
                        FROM completed_task_weights
                        WHERE latest_weight_kg IS NOT NULL AND latest_weight_kg > 0
                        GROUP BY 1
                    )
                    SELECT
                        bucket_start,
                        avg_weight_kg
                    FROM bucket_weights
                    ORDER BY bucket_start ASC
                `
            );

            const fleetSummary = fleetSummaryResult.rows[0] || {};
            const totalFleet = toNumber(fleetSummary.total_fleet, 0);
            const activeFleet = toNumber(fleetSummary.active_fleet, 0);
            const activeFleetPct = totalFleet > 0 ? (activeFleet / totalFleet) * 100 : 0;

            let normalCapacity = 0;
            let overloadedWarning = 0;
            for (const row of loadStatusResult.rows || []) {
                const status = normalizeLoadStatus(row.current_load_status);
                const count = toNumber(row.count, 0);

                if (status === 'overloaded') {
                    overloadedWarning += count;
                } else if (status === 'normal') {
                    normalCapacity += count;
                }
            }

            const potentialLoss = toNumber(activeLossVehiclesResult.rows?.[0]?.active_loss_vehicle_count, 0);
            const criticalAlerts = toNumber(alertsTodayResult.rows?.[0]?.critical_count, 0);
            const warningAlerts = toNumber(alertsTodayResult.rows?.[0]?.warning_count, 0);
            const totalLossEvents = toNumber(lossEventsResult.rows?.[0]?.total_loss_events, 0);

            const liveVehicles = (liveVehicleResult.rows || []).map((row) => {
                let loadStatus = normalizeLoadStatus(row.current_load_status);
                if (row.has_loss) {
                    loadStatus = 'loss';
                } else if (row.has_overload) {
                    loadStatus = 'overloaded';
                }

                return {
                    vehicleId: toNumber(row.vehicle_id, 0),
                    vehicleType: row.vehicle_type,
                    loadStatus,
                    latitude: row.latitude === null ? null : Number(row.latitude),
                    longitude: row.longitude === null ? null : Number(row.longitude),
                    latestRecordedAt: row.latest_recorded_at
                };
            });

            const latestLossAlertRow = latestLossAlertResult.rows?.[0] || null;
            const mapAlert = latestLossAlertRow
                ? {
                    title: 'Alert: Cargo Loss',
                    vehicle: `Vehicle: ${latestLossAlertRow.vehicle_type} #${String(toNumber(latestLossAlertRow.vehicle_id, 0)).padStart(3, '0')}`
                }
                : {
                    title: 'Alert: No Active Loss',
                    vehicle: 'Vehicle: Monitoring all active fleet'
                };

            const fluctuationRows = weightFluctuationResult.rows || [];
            const fluctuationLabels = fluctuationRows.map((row) => formatBucketLabel(row.bucket_start));
            let fluctuationValues = fluctuationRows.map((row) => Number((toNumber(row.avg_weight_kg, 0) / 1000).toFixed(2)));

            const hasIncidentFluctuation = fluctuationValues.some((value) => value > 0);

            return res.status(200).json({
                summary: {
                    activeFleet,
                    totalFleet,
                    activeFleetPct: Number(activeFleetPct.toFixed(1)),
                    normalCapacity,
                    overloadedWarning,
                    potentialLoss,
                    criticalAlerts,
                    warningAlerts,
                    totalLossEvents
                },
                liveVehicles,
                mapAlert,
                charts: {
                    weightFluctuation: {
                        labels: fluctuationLabels,
                        values: fluctuationValues
                    },
                    fleetComposition: {
                        labels: ['Normal Capacity', 'Overloaded', 'Potential Loss'],
                        values: [normalCapacity, overloadedWarning, potentialLoss]
                    }
                },
                dataQuality: {
                    hasIncidentData: hasIncidentFluctuation,
                    hasLiveFallbackData: false
                }
            });
        } catch (error) {
            console.error('Failed to load dashboard analytics:', error);
            return res.status(500).json({
                error: 'Failed to load dashboard analytics.'
            });
        }
    }
}

export default AdminDashboardController;