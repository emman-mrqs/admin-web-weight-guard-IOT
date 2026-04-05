// Admin Report Controller
import db from '../../database/db.js';

const ACTIVE_ALERT_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];

function clampScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.min(100, numeric));
}

function getRangeDays(range) {
    const normalized = String(range || '').trim().toLowerCase();
    if (normalized === 'monthly') {
        return 30;
    }

    return 7;
}

function buildRangeBounds(range) {
    const days = getRangeDays(range);
    const endDay = new Date();
    endDay.setUTCHours(0, 0, 0, 0);

    const startDay = new Date(endDay);
    startDay.setUTCDate(endDay.getUTCDate() - (days - 1));

    const exclusiveEnd = new Date(endDay);
    exclusiveEnd.setUTCDate(endDay.getUTCDate() + 1);

    return {
        days,
        startDay,
        exclusiveEnd
    };
}

function formatLabel(dateValue, range) {
    const date = new Date(dateValue);
    const normalizedRange = String(range || '').trim().toLowerCase();

    if (normalizedRange === 'monthly') {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit'
        });
    }

    return date.toLocaleDateString('en-US', {
        weekday: 'short'
    });
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toCsvCell(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

class AdminReportsController {
    static getReports(req, res) {
        try {
            res.render('admin/adminReports', {
                currentPage: 'reports'
            });
        } catch (error) {
            console.error(error);
            res.status(500).render('admin/adminReports', {
                currentPage: 'reports'
            });
        }
    }

    static async getReportsAnalytics(req, res) {
        try {
            const range = String(req.query.range || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
            const { startDay, exclusiveEnd } = buildRangeBounds(range);

            const summaryResult = await db.query(
                `
                    WITH period_tasks AS (
                        SELECT
                            id,
                            status,
                            initial_reference_weight_kg,
                            started_at,
                            completed_at,
                            COALESCE(started_at, created_at) AS activity_at
                        FROM dispatch_tasks
                        WHERE COALESCE(started_at, created_at) >= $1
                          AND COALESCE(started_at, created_at) < $2
                                        ),
                                        completed_tasks AS (
                                                SELECT *
                                                FROM period_tasks
                                                WHERE LOWER(COALESCE(status, '')) = 'completed'
                                                    AND completed_at >= $1
                                                    AND completed_at < $2
                    ),
                    latest_task_incident AS (
                        SELECT DISTINCT ON (i.task_id)
                            i.task_id,
                            i.weight_impact_kg
                        FROM incidents i
                        WHERE i.task_id IS NOT NULL
                        ORDER BY i.task_id, i.created_at DESC, i.id DESC
                    ),
                    task_incident_flags AS (
                        SELECT
                            pt.id,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) IN ('overload', 'loss', 'cargo_loss')) AS has_weight_incident
                        FROM period_tasks pt
                        LEFT JOIN incidents i ON i.task_id = pt.id
                        GROUP BY pt.id
                    )
                    SELECT
                        COALESCE(SUM(
                            CASE
                                WHEN LOWER(COALESCE(ct.status, '')) = 'completed'
                                  AND ct.completed_at >= $1
                                  AND ct.completed_at < $2
                                THEN COALESCE(
                                    CASE
                                        WHEN lti.weight_impact_kg IS NOT NULL
                                            THEN GREATEST(0, COALESCE(ct.initial_reference_weight_kg, 0) + lti.weight_impact_kg)
                                        ELSE ct.initial_reference_weight_kg
                                    END,
                                    0
                                )
                                ELSE 0
                            END
                        ), 0) AS total_cargo_kg,
                        COALESCE(AVG(
                            CASE
                                WHEN ct.started_at IS NOT NULL
                                  AND ct.completed_at IS NOT NULL
                                  AND ct.completed_at >= ct.started_at
                                THEN EXTRACT(EPOCH FROM (ct.completed_at - ct.started_at)) / 60
                                ELSE NULL
                            END
                        ), 0) AS avg_transit_mins,
                        COUNT(*)::INT AS total_tasks,
                        COALESCE(SUM(CASE WHEN tif.has_weight_incident THEN 1 ELSE 0 END), 0)::INT AS tasks_with_weight_incidents
                    FROM completed_tasks ct
                    LEFT JOIN latest_task_incident lti ON lti.task_id = ct.id
                    LEFT JOIN task_incident_flags tif ON tif.id = ct.id
                `,
                [startDay, exclusiveEnd]
            );

            const summaryRow = summaryResult.rows[0] || {};
            const totalTasks = toNumber(summaryRow.total_tasks, 0);
            const tasksWithWeightIncidents = toNumber(summaryRow.tasks_with_weight_incidents, 0);
            const avgTransitMins = toNumber(summaryRow.avg_transit_mins, 0);

            const avgEfficiencyPct = totalTasks > 0
                ? clampScore(100 - ((tasksWithWeightIncidents / totalTasks) * 100))
                : 0;

            const activeAlertsResult = await db.query(
                `
                    SELECT COUNT(*)::INT AS active_alerts
                    FROM incidents
                    WHERE LOWER(COALESCE(status, 'open')) = ANY($1)
                      AND created_at >= $2
                      AND created_at < $3
                `,
                [ACTIVE_ALERT_STATUSES, startDay, exclusiveEnd]
            );

            const trendResult = await db.query(
                `
                    WITH completed_tasks AS (
                        SELECT
                            dt.id,
                            DATE_TRUNC('day', dt.completed_at) AS day_start,
                            COALESCE(dt.initial_reference_weight_kg, 0) AS initial_weight_kg,
                            COALESCE(
                                CASE
                                    WHEN latest_incident.weight_impact_kg IS NOT NULL
                                        THEN GREATEST(0, COALESCE(dt.initial_reference_weight_kg, 0) + latest_incident.weight_impact_kg)
                                    ELSE dt.initial_reference_weight_kg
                                END,
                                0
                            ) AS transported_weight_kg
                        FROM dispatch_tasks dt
                        LEFT JOIN LATERAL (
                            SELECT i2.weight_impact_kg
                            FROM incidents i2
                            WHERE i2.task_id = dt.id
                            ORDER BY i2.created_at DESC, i2.id DESC
                            LIMIT 1
                        ) latest_incident ON true
                        WHERE dt.completed_at >= $1
                          AND dt.completed_at < $2
                          AND LOWER(COALESCE(dt.status, '')) = 'completed'
                    ),
                    daily_weights AS (
                        SELECT
                            ct.day_start,
                            SUM(ct.initial_weight_kg) AS initial_weight_kg,
                            SUM(ct.transported_weight_kg) AS actual_weight_kg
                        FROM completed_tasks ct
                        GROUP BY ct.day_start
                        HAVING SUM(ct.transported_weight_kg) > 0
                    )
                    SELECT
                        dw.day_start::date AS day_date,
                        dw.initial_weight_kg,
                        dw.actual_weight_kg
                    FROM daily_weights dw
                    ORDER BY dw.day_start ASC
                `,
                [startDay, exclusiveEnd]
            );

            const trendRows = trendResult.rows || [];
            const initialWeights = trendRows.map((row) => Number(toNumber(row.initial_weight_kg, 0).toFixed(2)));
            const actualWeights = trendRows.map((row) => Number(toNumber(row.actual_weight_kg, 0).toFixed(2)));
            const operationalWeights = actualWeights.filter((w) => w > 0);
            const totalActualWeight = operationalWeights.reduce((sum, value) => sum + value, 0);
            const averageTarget = operationalWeights.length > 0 ? totalActualWeight / operationalWeights.length : 0;

            const incidentDistResult = await db.query(
                `
                    WITH completed_tasks AS (
                        SELECT dt.id
                        FROM dispatch_tasks dt
                        WHERE dt.completed_at >= $1
                          AND dt.completed_at < $2
                          AND LOWER(COALESCE(dt.status, '')) = 'completed'
                    ), task_flags AS (
                        SELECT
                            pt.id AS task_id,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) = 'overload') AS has_overload,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss')) AS has_loss
                        FROM completed_tasks pt
                        LEFT JOIN incidents i ON i.task_id = pt.id
                        GROUP BY pt.id
                    )
                    SELECT
                        COALESCE(SUM(CASE WHEN has_overload THEN 1 ELSE 0 END), 0)::INT AS overload_count,
                        COALESCE(SUM(CASE WHEN NOT has_overload AND has_loss THEN 1 ELSE 0 END), 0)::INT AS loss_count,
                        COALESCE(SUM(CASE WHEN NOT has_overload AND NOT has_loss THEN 1 ELSE 0 END), 0)::INT AS normal_count
                    FROM task_flags
                `,
                [startDay, exclusiveEnd]
            );

            const incidentRow = incidentDistResult.rows[0] || {};
            const overloadCount = toNumber(incidentRow.overload_count, 0);
            const lossCount = toNumber(incidentRow.loss_count, 0);
            const normalCount = toNumber(incidentRow.normal_count, 0);

            const zoneResult = await db.query(
                `
                    WITH zone_tasks AS (
                        SELECT
                            dt.id,
                            ROUND(COALESCE(dt.pickup_lat, dt.destination_lat)::numeric, 4) AS location_latitude,
                            ROUND(COALESCE(dt.pickup_lng, dt.destination_lng)::numeric, 4) AS location_longitude
                        FROM dispatch_tasks dt
                        WHERE dt.completed_at >= $1
                          AND dt.completed_at < $2
                          AND LOWER(COALESCE(dt.status, '')) = 'completed'
                                                    AND COALESCE(dt.pickup_lat, dt.destination_lat) IS NOT NULL
                                                    AND COALESCE(dt.pickup_lng, dt.destination_lng) IS NOT NULL
                    ),
                    zone_incident_flags AS (
                        SELECT
                            zt.location_latitude,
                            zt.location_longitude,
                            zt.id,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) IN ('overload', 'loss', 'cargo_loss')) AS has_weight_incident
                        FROM zone_tasks zt
                        LEFT JOIN incidents i ON i.task_id = zt.id
                        GROUP BY zt.location_latitude, zt.location_longitude, zt.id
                    )
                    SELECT
                        location_latitude,
                        location_longitude,
                        COUNT(*)::INT AS total_tasks,
                        COALESCE(SUM(CASE WHEN has_weight_incident THEN 1 ELSE 0 END), 0)::INT AS incident_tasks
                    FROM zone_incident_flags
                    GROUP BY location_latitude, location_longitude
                    ORDER BY total_tasks DESC, location_latitude ASC, location_longitude ASC
                    LIMIT 8
                `,
                [startDay, exclusiveEnd]
            );

            const zoneRows = zoneResult.rows || [];
            const zoneLabels = zoneRows.length > 0
                ? zoneRows.map((_, index) => `Loc ${index + 1}`)
                : ['No location data'];

            const zoneEfficiency = zoneRows.length > 0
                ? zoneRows.map((row) => {
                    const zoneTotalTasks = toNumber(row.total_tasks, 0);
                    const zoneIncidentTasks = toNumber(row.incident_tasks, 0);

                    const score = zoneTotalTasks > 0
                        ? clampScore(100 - ((zoneIncidentTasks / zoneTotalTasks) * 100))
                        : 0;

                    return Number(score.toFixed(0));
                })
                : [0];

            const zoneLatitudes = zoneRows.map((row) => Number(toNumber(row.location_latitude, 0).toFixed(4)));
            const zoneLongitudes = zoneRows.map((row) => Number(toNumber(row.location_longitude, 0).toFixed(4)));

            const speedResult = await db.query(
                `
                    SELECT
                        COUNT(*)::INT AS incident_evidence_count,
                        COALESCE(AVG(ABS(COALESCE(weight_impact_kg, 0))), 0) AS avg_weight_impact_kg
                    FROM incidents
                    WHERE created_at >= $1
                      AND created_at < $2
                      AND weight_impact_kg IS NOT NULL
                `,
                [startDay, exclusiveEnd]
            );

            const incidentEvidenceCount = toNumber(speedResult.rows?.[0]?.incident_evidence_count, 0);
            const hasIncidentEvidence = incidentEvidenceCount > 0;
            const avgWeightImpactKg = hasIncidentEvidence
                ? toNumber(speedResult.rows?.[0]?.avg_weight_impact_kg, 0)
                : null;

            const impactStabilityScore = hasIncidentEvidence
                ? clampScore(100 - (Math.min(avgWeightImpactKg, 50) * 2))
                : 100;
            const hasTransitData = avgTransitMins > 0;
            const deliverySpeedScore = hasTransitData ? clampScore((60 / avgTransitMins) * 100) : 0;
            const fuelEfficiencyScore = clampScore((impactStabilityScore * 0.6) + (avgEfficiencyPct * 0.4));
            const safetyScore = totalTasks > 0
                ? (hasTransitData
                    ? clampScore((avgEfficiencyPct * 0.7) + (deliverySpeedScore * 0.3))
                    : clampScore(avgEfficiencyPct))
                : 0;

            return res.status(200).json({
                range,
                period: {
                    start: startDay,
                    endExclusive: exclusiveEnd
                },
                summary: {
                    totalCargoKg: Number(toNumber(summaryRow.total_cargo_kg, 0).toFixed(2)),
                    avgEfficiencyPct: Number(avgEfficiencyPct.toFixed(1)),
                    avgTransitMins: Number(avgTransitMins.toFixed(1)),
                    activeAlerts: toNumber(activeAlertsResult.rows?.[0]?.active_alerts, 0)
                },
                charts: {
                    weightTrend: {
                        labels: trendRows.map((row) => formatLabel(row.day_date, range)),
                        initialWeight: initialWeights,
                        actualWeight: actualWeights,
                        targetWeight: trendRows.map(() => Number(averageTarget.toFixed(2)))
                    },
                    incidentDistribution: {
                        labels: ['Normal', 'Overload', 'Loss'],
                        values: [normalCount, overloadCount, lossCount]
                    },
                    zoneEfficiency: {
                        labels: zoneLabels,
                        values: zoneEfficiency,
                        latitudes: zoneLatitudes,
                        longitudes: zoneLongitudes,
                        taskCounts: zoneRows.map((row) => toNumber(row.total_tasks, 0))
                    }
                },
                performance: {
                    safetyScore: Number(safetyScore.toFixed(0)),
                    deliverySpeedPct: Number(deliverySpeedScore.toFixed(0)),
                    fuelEfficiencyPct: Number(fuelEfficiencyScore.toFixed(0))
                },
                dataQuality: {
                    hasIncidentEvidence,
                    hasTransitData,
                    totalTasks,
                    incidentEvidenceCount,
                    avgWeightImpactKg: hasIncidentEvidence ? Number(avgWeightImpactKg.toFixed(2)) : null
                }
            });
        } catch (error) {
            console.error('Failed to get report analytics:', error);
            return res.status(500).json({
                error: 'Failed to load report analytics.'
            });
        }
    }

    static async getReportsDetails(req, res) {
        try {
            const range = String(req.query.range || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
            const { startDay, exclusiveEnd } = buildRangeBounds(range);

            const detailsResult = await db.query(
                `
                    SELECT
                        dt.id AS task_id,
                        COALESCE(v.plate_number, '-') AS plate_number,
                        COALESCE(
                            CONCAT(
                                ROUND(COALESCE(dt.pickup_lat, dt.destination_lat)::numeric, 4)::text,
                                ', ',
                                ROUND(COALESCE(dt.pickup_lng, dt.destination_lng)::numeric, 4)::text
                            ),
                            'Unknown Location'
                        ) AS zone_label,
                        COALESCE(dt.status, '-') AS task_status,
                        COALESCE(dt.initial_reference_weight_kg, 0) AS reference_weight_kg,
                        COALESCE(
                            CASE
                                WHEN LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                                     AND vls.current_weight_kg IS NOT NULL
                                    THEN vls.current_weight_kg
                                WHEN latest_incident.weight_impact_kg IS NOT NULL
                                    THEN GREATEST(0, COALESCE(dt.initial_reference_weight_kg, 0) + latest_incident.weight_impact_kg)
                                ELSE dt.initial_reference_weight_kg
                            END,
                            0
                        ) AS latest_weight_kg,
                        CASE
                            WHEN LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                                 AND vls.current_weight_kg IS NOT NULL
                                THEN 'live_state'
                            WHEN latest_incident.weight_impact_kg IS NOT NULL
                                THEN 'incident_estimate'
                            ELSE 'reference'
                        END AS weight_source,
                        CASE
                            WHEN LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                                 AND vls.current_weight_kg IS NOT NULL
                                THEN vls.last_ping_at
                            ELSE latest_incident.created_at
                        END AS latest_weight_recorded_at,
                        dt.started_at,
                        dt.completed_at,
                        CASE
                            WHEN dt.started_at IS NOT NULL
                             AND dt.completed_at IS NOT NULL
                             AND dt.completed_at >= dt.started_at
                            THEN EXTRACT(EPOCH FROM (dt.completed_at - dt.started_at)) / 60
                            ELSE NULL
                        END AS transit_minutes,
                        COALESCE(
                            NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
                            '-'
                        ) AS driver_name,
                        COUNT(i.id)::INT AS incident_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) = 'overload' THEN 1 ELSE 0 END), 0)::INT AS overload_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss') THEN 1 ELSE 0 END), 0)::INT AS loss_count
                    FROM dispatch_tasks dt
                    LEFT JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = dt.vehicle_id
                    LEFT JOIN incidents i ON i.task_id = dt.id
                    LEFT JOIN LATERAL (
                        SELECT
                            i2.weight_impact_kg,
                            i2.created_at
                        FROM incidents i2
                        WHERE i2.task_id = dt.id
                        ORDER BY i2.created_at DESC, i2.id DESC
                        LIMIT 1
                    ) latest_incident ON true
                                        WHERE dt.completed_at >= $1
                                            AND dt.completed_at < $2
                                            AND LOWER(COALESCE(dt.status, '')) = 'completed'
                    GROUP BY
                        dt.id,
                        v.plate_number,
                                                dt.pickup_lat,
                                                dt.pickup_lng,
                                                dt.destination_lat,
                                                dt.destination_lng,
                        dt.status,
                        dt.initial_reference_weight_kg,
                        vls.current_weight_kg,
                        vls.last_ping_at,
                        latest_incident.weight_impact_kg,
                        latest_incident.created_at,
                        dt.started_at,
                        dt.completed_at,
                        u.first_name,
                        u.last_name
                    ORDER BY dt.id DESC
                    LIMIT 1000
                `,
                [startDay, exclusiveEnd]
            );

            return res.status(200).json({
                range,
                period: {
                    start: startDay,
                    endExclusive: exclusiveEnd
                },
                generatedAt: new Date().toISOString(),
                rows: detailsResult.rows.map((row) => ({
                    taskId: toNumber(row.task_id, 0),
                    plateNumber: row.plate_number,
                    zoneLabel: row.zone_label,
                    taskStatus: row.task_status,
                    referenceWeightKg: Number(toNumber(row.reference_weight_kg, 0).toFixed(2)),
                    latestWeightKg: Number(toNumber(row.latest_weight_kg, 0).toFixed(2)),
                    weightSource: String(row.weight_source || 'reference'),
                    latestWeightRecordedAt: row.latest_weight_recorded_at,
                    startedAt: row.started_at,
                    completedAt: row.completed_at,
                    transitMinutes: row.transit_minutes === null ? null : Number(toNumber(row.transit_minutes, 0).toFixed(1)),
                    driverName: row.driver_name,
                    incidentCount: toNumber(row.incident_count, 0),
                    overloadCount: toNumber(row.overload_count, 0),
                    lossCount: toNumber(row.loss_count, 0)
                }))
            });
        } catch (error) {
            console.error('Failed to load report details:', error);
            return res.status(500).json({
                error: 'Failed to load report details.'
            });
        }
    }

    static async exportDatasetCsv(req, res) {
        try {
            const range = String(req.query.range || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
            const { startDay, exclusiveEnd } = buildRangeBounds(range);

            const datasetResult = await db.query(
                `
                    SELECT
                        dt.id AS task_id,
                        COALESCE(v.plate_number, '-') AS plate_number,
                        COALESCE(dt.status, '-') AS task_status,
                        COALESCE(
                            CONCAT(
                                ROUND(COALESCE(dt.pickup_lat, dt.destination_lat)::numeric, 4)::text,
                                ', ',
                                ROUND(COALESCE(dt.pickup_lng, dt.destination_lng)::numeric, 4)::text
                            ),
                            'Unknown Location'
                        ) AS location_label,
                        ROUND(COALESCE(dt.pickup_lat, dt.destination_lat)::numeric, 4) AS location_latitude,
                        ROUND(COALESCE(dt.pickup_lng, dt.destination_lng)::numeric, 4) AS location_longitude,
                        COALESCE(dt.initial_reference_weight_kg, 0) AS reference_weight_kg,
                        dt.started_at,
                        dt.completed_at,
                        COUNT(i.id)::INT AS incident_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) = 'overload' THEN 1 ELSE 0 END), 0)::INT AS overload_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss') THEN 1 ELSE 0 END), 0)::INT AS loss_count,
                        COALESCE(
                            CASE
                                WHEN LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                                     AND vls.current_weight_kg IS NOT NULL
                                    THEN vls.current_weight_kg
                                WHEN latest_incident.weight_impact_kg IS NOT NULL
                                    THEN GREATEST(0, COALESCE(dt.initial_reference_weight_kg, 0) + latest_incident.weight_impact_kg)
                                ELSE dt.initial_reference_weight_kg
                            END,
                            0
                        ) AS latest_weight_kg,
                        CASE
                            WHEN LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                                 AND vls.current_weight_kg IS NOT NULL
                                THEN 'live_state'
                            WHEN latest_incident.weight_impact_kg IS NOT NULL
                                THEN 'incident_estimate'
                            ELSE 'reference'
                        END AS weight_source
                    FROM dispatch_tasks dt
                    LEFT JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = dt.vehicle_id
                    LEFT JOIN incidents i ON i.task_id = dt.id
                    LEFT JOIN LATERAL (
                        SELECT weight_impact_kg
                        FROM incidents i2
                        WHERE i2.task_id = dt.id
                        ORDER BY i2.created_at DESC, i2.id DESC
                        LIMIT 1
                    ) latest_incident ON true
                                        WHERE dt.completed_at >= $1
                                            AND dt.completed_at < $2
                                            AND LOWER(COALESCE(dt.status, '')) = 'completed'
                                        GROUP BY dt.id, v.plate_number, dt.status, dt.initial_reference_weight_kg, dt.started_at, dt.completed_at, dt.pickup_lat, dt.pickup_lng, dt.destination_lat, dt.destination_lng, vls.current_weight_kg, latest_incident.weight_impact_kg
                    ORDER BY dt.id DESC
                `,
                [startDay, exclusiveEnd]
            );

            const csvHeaders = [
                'task_id',
                'plate_number',
                'task_status',
                'location_label',
                'reference_weight_kg',
                'latest_weight_kg',
                'weight_source',
                'started_at',
                'completed_at',
                'incident_count',
                'overload_count',
                'loss_count'
            ];

            const csvLines = [csvHeaders.join(',')];
            for (const row of datasetResult.rows) {
                const line = [
                    row.task_id,
                    row.plate_number,
                    row.task_status,
                    row.location_label,
                    Number(toNumber(row.reference_weight_kg, 0).toFixed(2)),
                    Number(toNumber(row.latest_weight_kg, 0).toFixed(2)),
                    String(row.weight_source || 'reference'),
                    row.started_at ? new Date(row.started_at).toISOString() : '',
                    row.completed_at ? new Date(row.completed_at).toISOString() : '',
                    toNumber(row.incident_count, 0),
                    toNumber(row.overload_count, 0),
                    toNumber(row.loss_count, 0)
                ].map(toCsvCell);

                csvLines.push(line.join(','));
            }

            const filename = `reports-dataset-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.status(200).send(csvLines.join('\n'));
        } catch (error) {
            console.error('Failed to export report CSV dataset:', error);
            return res.status(500).json({
                error: 'Failed to export CSV dataset.'
            });
        }
    }
}

export default AdminReportsController;