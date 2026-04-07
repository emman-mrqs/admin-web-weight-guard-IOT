import db from '../../database/db.js';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function toTitleCaseStatus(status) {
  return normalizeStatus(status)
    .split('_')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ');
}

class UserMobileDashboardController {
  static async getDashboard(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const userQuery = `
        SELECT id, first_name, last_name, email, status, is_verified, deleted_at
        FROM users
        WHERE id = $1
        LIMIT 1;
      `;

      const { rows } = await db.query(userQuery, [userId]);
      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      const user = rows[0];
      if (user.deleted_at || !user.is_verified) {
        return res.status(403).json({
          success: false,
          message: 'Account is not allowed to access dashboard.'
        });
      }

      const [summaryResult, trendResult, assignedTaskResult, incidentsResult] = await Promise.all([
        db.query(
          `
            SELECT
              COUNT(*)::int AS total_tasks,
              COUNT(*) FILTER (WHERE LOWER(COALESCE(dt.status, '')) = 'completed')::int AS tasks_completed,
              COUNT(*) FILTER (WHERE LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit'))::int AS active_tasks,
              AVG(COALESCE(vls.current_weight_kg, dt.initial_reference_weight_kg)) AS avg_load_kg
            FROM dispatch_tasks dt
            INNER JOIN vehicles v ON v.id = dt.vehicle_id
            LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
            WHERE v.assigned_driver_id = $1;
          `,
          [userId]
        ),
        db.query(
          `
            SELECT
              dt.id,
              dt.created_at,
              COALESCE(vls.current_weight_kg, dt.initial_reference_weight_kg) AS trend_weight_kg
            FROM dispatch_tasks dt
            INNER JOIN vehicles v ON v.id = dt.vehicle_id
            LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
            WHERE v.assigned_driver_id = $1
              AND COALESCE(vls.current_weight_kg, dt.initial_reference_weight_kg) IS NOT NULL
            ORDER BY dt.created_at DESC, dt.id DESC
            LIMIT 8;
          `,
          [userId]
        ),
        db.query(
          `
            SELECT
              dt.id AS task_id,
              LOWER(COALESCE(dt.status, 'pending')) AS status,
              dt.pickup_lat,
              dt.pickup_lng,
              dt.destination_lat,
              dt.destination_lng,
              dt.initial_reference_weight_kg,
              dt.created_at,
              v.id AS vehicle_id,
              v.plate_number,
              v.vehicle_type,
              v.max_capacity_kg,
              vls.current_weight_kg,
              vls.current_speed_kmh,
              vls.last_ping_at
            FROM dispatch_tasks dt
            INNER JOIN vehicles v ON v.id = dt.vehicle_id
            LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
            WHERE v.assigned_driver_id = $1
              AND LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
            ORDER BY
              CASE LOWER(COALESCE(dt.status, ''))
                WHEN 'active' THEN 0
                WHEN 'in_transit' THEN 1
                WHEN 'pending' THEN 2
                ELSE 3
              END,
              dt.created_at DESC,
              dt.id DESC
            LIMIT 1;
          `,
          [userId]
        ),
        db.query(
          `
            SELECT
              i.id,
              i.task_id,
              i.vehicle_id,
              i.incident_type,
              i.severity,
              i.status,
              i.weight_impact_kg,
              i.description,
              i.created_at,
              dt.status AS task_status,
              v.plate_number,
              v.vehicle_type
            FROM incidents i
            LEFT JOIN dispatch_tasks dt ON dt.id = i.task_id
            LEFT JOIN vehicles v ON v.id = COALESCE(i.vehicle_id, dt.vehicle_id)
            WHERE i.driver_id = $1
               OR v.assigned_driver_id = $1
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT 5;
          `,
          [userId]
        )
      ]);

      const summaryRow = summaryResult.rows[0] || {};
      const totalTasks = toNumber(summaryRow.total_tasks, 0);
      const tasksCompleted = toNumber(summaryRow.tasks_completed, 0);
      const activeTasks = toNumber(summaryRow.active_tasks, 0);
      const avgLoadKg = Number(toNumber(summaryRow.avg_load_kg, 0).toFixed(2));
      const completionRate = totalTasks > 0
        ? Number((tasksCompleted / totalTasks).toFixed(4))
        : 0;

      const weightTrendKg = trendResult.rows
        .slice()
        .reverse()
        .map((row) => Number(toNumber(row.trend_weight_kg, 0).toFixed(2)));

      const assignedTaskRow = assignedTaskResult.rows[0] || null;
      const assignedTask = assignedTaskRow
        ? {
            id: toNumber(assignedTaskRow.task_id, 0),
            status: normalizeStatus(assignedTaskRow.status),
            statusLabel: toTitleCaseStatus(assignedTaskRow.status),
            vehicle: {
              id: toNumber(assignedTaskRow.vehicle_id, 0),
              plateNumber: String(assignedTaskRow.plate_number || '').trim(),
              type: String(assignedTaskRow.vehicle_type || '').trim(),
              maxCapacityKg: Number(toNumber(assignedTaskRow.max_capacity_kg, 0).toFixed(2))
            },
            route: {
              pickup: {
                lat: Number(toNumber(assignedTaskRow.pickup_lat, 0).toFixed(6)),
                lng: Number(toNumber(assignedTaskRow.pickup_lng, 0).toFixed(6))
              },
              destination: {
                lat: Number(toNumber(assignedTaskRow.destination_lat, 0).toFixed(6)),
                lng: Number(toNumber(assignedTaskRow.destination_lng, 0).toFixed(6))
              }
            },
            initialReferenceWeightKg: Number(toNumber(assignedTaskRow.initial_reference_weight_kg, 0).toFixed(2)),
            live: {
              currentWeightKg: Number(toNumber(assignedTaskRow.current_weight_kg, 0).toFixed(2)),
              speedKmh: Number(toNumber(assignedTaskRow.current_speed_kmh, 0).toFixed(2)),
              lastPingAt: assignedTaskRow.last_ping_at || null
            },
            createdAt: assignedTaskRow.created_at
          }
        : null;

      const recentIncidents = incidentsResult.rows.map((row) => ({
        id: toNumber(row.id, 0),
        taskId: toNumber(row.task_id, 0),
        vehicleId: toNumber(row.vehicle_id, 0),
        incidentType: String(row.incident_type || 'unknown').trim().toLowerCase(),
        severity: String(row.severity || 'warning').trim().toLowerCase(),
        status: String(row.status || 'open').trim().toLowerCase(),
        weightImpactKg: Number(toNumber(row.weight_impact_kg, 0).toFixed(2)),
        description: String(row.description || '').trim(),
        vehiclePlateNumber: String(row.plate_number || '').trim(),
        vehicleType: String(row.vehicle_type || '').trim(),
        taskStatus: normalizeStatus(row.task_status, 'unknown'),
        createdAt: row.created_at
      }));

      const openIncidents = recentIncidents.filter((incident) => incident.status !== 'resolved').length;
      const severeIncidents = recentIncidents.filter((incident) => ['high', 'critical'].includes(incident.severity)).length;

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            status: user.status
          },
          kpis: {
            avgLoadKg,
            tasksCompleted,
            totalTasks,
            activeTasks,
            completionRate
          },
          weightTrendKg,
          assignedTask,
          recentIncidents,
          insights: [
            { label: 'Open incidents', value: `${openIncidents}` },
            { label: 'High/Critical incidents', value: `${severeIncidents}` },
            { label: 'Current active tasks', value: `${activeTasks}` }
          ],
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error loading mobile dashboard:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while loading dashboard data.'
      });
    }
  }
}

export default UserMobileDashboardController;
