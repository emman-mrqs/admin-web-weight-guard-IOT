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
                                WHEN LOWER(COALESCE(pt.status, '')) IN ('cancelled', 'canceled') THEN 0
                                ELSE COALESCE(pt.initial_reference_weight_kg, 0)
                            END
                        ), 0) AS total_cargo_kg,
                        COALESCE(AVG(
                            CASE
                                WHEN pt.started_at IS NOT NULL
                                  AND pt.completed_at IS NOT NULL
                                  AND pt.completed_at >= pt.started_at
                                THEN EXTRACT(EPOCH FROM (pt.completed_at - pt.started_at)) / 60
                                ELSE NULL
                            END
                        ), 0) AS avg_transit_mins,
                        COUNT(*)::INT AS total_tasks,
                        COALESCE(SUM(CASE WHEN tif.has_weight_incident THEN 1 ELSE 0 END), 0)::INT AS tasks_with_weight_incidents
                    FROM period_tasks pt
                    LEFT JOIN task_incident_flags tif ON tif.id = pt.id
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
                `,
                [ACTIVE_ALERT_STATUSES]
            );

            const trendResult = await db.query(
                `
                    WITH day_series AS (
                        SELECT GENERATE_SERIES($1::timestamptz, $2::timestamptz - INTERVAL '1 day', INTERVAL '1 day') AS day_start
                    ),
                    daily_weights AS (
                        SELECT
                            DATE_TRUNC('day', COALESCE(started_at, created_at)) AS day_start,
                            SUM(COALESCE(initial_reference_weight_kg, 0)) AS actual_weight_kg
                        FROM dispatch_tasks
                        WHERE COALESCE(started_at, created_at) >= $1
                          AND COALESCE(started_at, created_at) < $2
                          AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
                        GROUP BY DATE_TRUNC('day', COALESCE(started_at, created_at))
                    )
                    SELECT
                        ds.day_start::date AS day_date,
                        COALESCE(dw.actual_weight_kg, 0) AS actual_weight_kg
                    FROM day_series ds
                    LEFT JOIN daily_weights dw ON dw.day_start = ds.day_start
                    ORDER BY ds.day_start ASC
                `,
                [startDay, exclusiveEnd]
            );

            const trendRows = trendResult.rows || [];
            const actualWeights = trendRows.map((row) => Number(toNumber(row.actual_weight_kg, 0).toFixed(2)));
            const totalActualWeight = actualWeights.reduce((sum, value) => sum + value, 0);
            const averageTarget = actualWeights.length > 0 ? totalActualWeight / actualWeights.length : 0;

            const incidentDistResult = await db.query(
                `
                    SELECT
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(incident_type, '')) = 'overload' THEN 1 ELSE 0 END), 0)::INT AS overload_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(incident_type, '')) IN ('loss', 'cargo_loss') THEN 1 ELSE 0 END), 0)::INT AS loss_count
                    FROM incidents
                    WHERE created_at >= $1
                      AND created_at < $2
                `,
                [startDay, exclusiveEnd]
            );

            const incidentRow = incidentDistResult.rows[0] || {};
            const overloadCount = toNumber(incidentRow.overload_count, 0);
            const lossCount = toNumber(incidentRow.loss_count, 0);
            const normalCount = Math.max(totalTasks - overloadCount - lossCount, 0);

            const zoneResult = await db.query(
                `
                    WITH zone_tasks AS (
                        SELECT
                            dt.id,
                            COALESCE(NULLIF(TRIM(v.current_state), ''), 'Unknown Zone') AS zone_label
                        FROM dispatch_tasks dt
                        LEFT JOIN vehicles v ON v.id = dt.vehicle_id
                        WHERE COALESCE(dt.started_at, dt.created_at) >= $1
                          AND COALESCE(dt.started_at, dt.created_at) < $2
                          AND LOWER(COALESCE(dt.status, '')) NOT IN ('cancelled', 'canceled')
                    ),
                    zone_incident_flags AS (
                        SELECT
                            zt.zone_label,
                            zt.id,
                            BOOL_OR(LOWER(COALESCE(i.incident_type, '')) IN ('overload', 'loss', 'cargo_loss')) AS has_weight_incident
                        FROM zone_tasks zt
                        LEFT JOIN incidents i ON i.task_id = zt.id
                        GROUP BY zt.zone_label, zt.id
                    )
                    SELECT
                        zone_label,
                        COUNT(*)::INT AS total_tasks,
                        COALESCE(SUM(CASE WHEN has_weight_incident THEN 1 ELSE 0 END), 0)::INT AS incident_tasks
                    FROM zone_incident_flags
                    GROUP BY zone_label
                    ORDER BY total_tasks DESC, zone_label ASC
                    LIMIT 8
                `,
                [startDay, exclusiveEnd]
            );

            const zoneRows = zoneResult.rows || [];
            const zoneLabels = zoneRows.length > 0
                ? zoneRows.map((row) => row.zone_label)
                : ['Unknown Zone'];

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

            const speedResult = await db.query(
                `
                    SELECT
                        COUNT(*)::INT AS telemetry_count,
                        COALESCE(AVG(speed_kmh), 0) AS avg_speed_kmh
                    FROM telemetry_logs
                    WHERE recorded_at >= $1
                      AND recorded_at < $2
                      AND speed_kmh IS NOT NULL
                `,
                [startDay, exclusiveEnd]
            );

            const telemetryCount = toNumber(speedResult.rows?.[0]?.telemetry_count, 0);
            const hasTelemetryData = telemetryCount > 0;
            const avgSpeedKmh = hasTelemetryData
                ? toNumber(speedResult.rows?.[0]?.avg_speed_kmh, 0)
                : null;

            const speedScore = hasTelemetryData
                ? clampScore(100 - (Math.abs(avgSpeedKmh - 55) * 2))
                : null;
            const hasTransitData = avgTransitMins > 0;
            const deliverySpeedScore = hasTransitData ? clampScore((60 / avgTransitMins) * 100) : 0;
            const fuelEfficiencyScore = hasTelemetryData
                ? clampScore((speedScore * 0.6) + (avgEfficiencyPct * 0.4))
                : clampScore(avgEfficiencyPct);
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
                        actualWeight: actualWeights,
                        targetWeight: trendRows.map(() => Number(averageTarget.toFixed(2)))
                    },
                    incidentDistribution: {
                        labels: ['Normal', 'Overload', 'Loss'],
                        values: [normalCount, overloadCount, lossCount]
                    },
                    zoneEfficiency: {
                        labels: zoneLabels,
                        values: zoneEfficiency
                    }
                },
                performance: {
                    safetyScore: Number(safetyScore.toFixed(0)),
                    deliverySpeedPct: Number(deliverySpeedScore.toFixed(0)),
                    fuelEfficiencyPct: Number(fuelEfficiencyScore.toFixed(0))
                },
                dataQuality: {
                    hasTelemetryData,
                    hasTransitData,
                    totalTasks,
                    telemetryCount,
                    avgSpeedKmh: hasTelemetryData ? Number(avgSpeedKmh.toFixed(2)) : null
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
                        COALESCE(NULLIF(TRIM(v.current_state), ''), 'Unknown Zone') AS zone_label,
                        COALESCE(dt.status, '-') AS task_status,
                        COALESCE(dt.initial_reference_weight_kg, 0) AS reference_weight_kg,
                        COALESCE(latest_tl.current_weight_kg, 0) AS latest_weight_kg,
                        latest_tl.recorded_at AS latest_weight_recorded_at,
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
                    LEFT JOIN incidents i ON i.task_id = dt.id
                    LEFT JOIN LATERAL (
                        SELECT
                            current_weight_kg,
                            recorded_at
                        FROM telemetry_logs
                        WHERE task_id = dt.id
                        ORDER BY recorded_at DESC, id DESC
                        LIMIT 1
                    ) latest_tl ON true
                    WHERE COALESCE(dt.started_at, dt.created_at) >= $1
                      AND COALESCE(dt.started_at, dt.created_at) < $2
                    GROUP BY
                        dt.id,
                        v.plate_number,
                        v.current_state,
                        dt.status,
                        dt.initial_reference_weight_kg,
                        latest_tl.current_weight_kg,
                        latest_tl.recorded_at,
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
                        COALESCE(dt.initial_reference_weight_kg, 0) AS reference_weight_kg,
                        dt.started_at,
                        dt.completed_at,
                        COUNT(i.id)::INT AS incident_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) = 'overload' THEN 1 ELSE 0 END), 0)::INT AS overload_count,
                        COALESCE(SUM(CASE WHEN LOWER(COALESCE(i.incident_type, '')) IN ('loss', 'cargo_loss') THEN 1 ELSE 0 END), 0)::INT AS loss_count,
                        COALESCE(MAX(tl.current_weight_kg), 0) AS latest_weight_kg
                    FROM dispatch_tasks dt
                    LEFT JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN incidents i ON i.task_id = dt.id
                    LEFT JOIN LATERAL (
                        SELECT current_weight_kg
                        FROM telemetry_logs
                        WHERE task_id = dt.id
                        ORDER BY recorded_at DESC, id DESC
                        LIMIT 1
                    ) tl ON true
                    WHERE COALESCE(dt.started_at, dt.created_at) >= $1
                      AND COALESCE(dt.started_at, dt.created_at) < $2
                    GROUP BY dt.id, v.plate_number, dt.status, dt.initial_reference_weight_kg, dt.started_at, dt.completed_at, tl.current_weight_kg
                    ORDER BY dt.id DESC
                `,
                [startDay, exclusiveEnd]
            );

            const csvHeaders = [
                'task_id',
                'plate_number',
                'task_status',
                'reference_weight_kg',
                'latest_weight_kg',
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
                    Number(toNumber(row.reference_weight_kg, 0).toFixed(2)),
                    Number(toNumber(row.latest_weight_kg, 0).toFixed(2)),
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