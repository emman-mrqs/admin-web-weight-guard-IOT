import db from '../../database/db.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveCategory(taskStatus, incidentSeverity) {
  const status = normalize(taskStatus);
  const severity = normalize(incidentSeverity);

  if (severity === 'critical') return 'critical';
  if (severity === 'warning' || severity === 'high') return 'warning';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  return 'all';
}

function resolveTitle(category, incidentType, status) {
  const type = normalize(incidentType);
  const taskStatus = normalize(status);

  if (category === 'critical') {
    return type ? `${type.replace(/_/g, ' ')} detected` : 'Critical incident detected';
  }
  if (category === 'warning') {
    return type ? `${type.replace(/_/g, ' ')} warning` : 'Warning incident detected';
  }
  if (category === 'cancelled') {
    return 'Dispatch task cancelled';
  }
  if (category === 'completed') {
    return 'Trip completed';
  }
  if (taskStatus === 'in_transit') {
    return 'Trip in transit';
  }
  if (taskStatus === 'active') {
    return 'Task in progress';
  }
  return 'Dispatch task created';
}

function resolveSummary(category, row) {
  if (category === 'critical' || category === 'warning') {
    return 'Incident generated during dispatch monitoring for the assigned vehicle.';
  }
  if (category === 'cancelled') {
    return 'Task was cancelled before completion.';
  }
  if (category === 'completed') {
    return 'Task completed successfully for the assigned vehicle.';
  }

  return 'Task activity recorded for assigned dispatch workflow.';
}

function matchesFilter(category, filter) {
  if (filter === 'all') return true;
  return category === filter;
}

function buildTimeline(row) {
  return [
    `Assigned at ${new Date(row.assigned_at).toISOString()}`,
    row.started_at ? `Started at ${new Date(row.started_at).toISOString()}` : 'Not started yet',
    row.completed_at ? `Completed at ${new Date(row.completed_at).toISOString()}` : `Current status: ${normalize(row.task_status)}`
  ];
}

class UserMobileActivityController {
  static async getActivities(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const rawFilter = normalize(req.query.filter || 'all');
      const allowedFilters = new Set(['all', 'completed', 'cancelled', 'critical', 'warning']);
      const filter = allowedFilters.has(rawFilter) ? rawFilter : 'all';

      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(200, requestedLimit))
        : 100;

      const result = await db.query(
        `
          SELECT
            dt.id AS task_id,
            dt.status AS task_status,
            dt.started_at,
            dt.completed_at,
            dt.created_at AS assigned_at,
            dt.pickup_lat,
            dt.pickup_lng,
            dt.destination_lat,
            dt.destination_lng,
            dt.initial_reference_weight_kg,
            v.id AS vehicle_id,
            v.plate_number,
            v.vehicle_type,
            v.max_capacity_kg,
            vls.current_weight_kg AS latest_weight_kg,
            vls.last_ping_at AS latest_weight_recorded_at,
            latest_incident.id AS incident_id,
            latest_incident.incident_type,
            latest_incident.severity AS incident_severity,
            latest_incident.status AS incident_status,
            latest_incident.weight_impact_kg,
            latest_incident.created_at AS incident_created_at
          FROM dispatch_tasks dt
          INNER JOIN vehicles v ON v.id = dt.vehicle_id
          LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
          LEFT JOIN LATERAL (
            SELECT i.id, i.incident_type, i.severity, i.status, i.weight_impact_kg, i.created_at
            FROM incidents i
            WHERE i.task_id = dt.id
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT 1
          ) AS latest_incident ON TRUE
          WHERE v.assigned_driver_id = $1
          ORDER BY COALESCE(dt.updated_at, dt.created_at) DESC, dt.id DESC
          LIMIT $2
        `,
        [userId, limit]
      );

      const activities = result.rows
        .map((row) => {
          const category = resolveCategory(row.task_status, row.incident_severity);
          const beforeKg = toNumber(row.initial_reference_weight_kg);
          const afterKg = toNumber(row.latest_weight_kg, beforeKg);

          return {
            id: `ACT-${row.task_id}`,
            tripCode: `Task ${row.task_id}`,
            title: resolveTitle(category, row.incident_type, row.task_status),
            summary: resolveSummary(category, row),
            locationName: category === 'completed' || category === 'cancelled'
              ? 'Destination Point'
              : 'Pickup Point',
            startedAt: row.started_at,
            endedAt: row.completed_at,
            beforeKg,
            afterKg,
            deltaKg: Number((afterKg - beforeKg).toFixed(2)),
            severity: category,
            status: normalize(row.task_status),
            incident: row.incident_id
              ? {
                  id: Number(row.incident_id),
                  type: normalize(row.incident_type),
                  severity: normalize(row.incident_severity),
                  status: normalize(row.incident_status),
                  weightImpactKg: toNumber(row.weight_impact_kg)
                }
              : null,
            latestRecordedAt: row.latest_weight_recorded_at,
            vehicle: {
              id: Number(row.vehicle_id),
              plateNumber: String(row.plate_number || '').trim(),
              vehicleType: String(row.vehicle_type || '').trim(),
              maxCapacityKg: toNumber(row.max_capacity_kg)
            },
            coordinates: {
              pickup: {
                lat: toNumber(row.pickup_lat),
                lng: toNumber(row.pickup_lng)
              },
              destination: {
                lat: toNumber(row.destination_lat),
                lng: toNumber(row.destination_lng)
              }
            },
            timeline: buildTimeline(row)
          };
        })
        .filter((item) => matchesFilter(item.severity, filter));

      const counters = {
        all: activities.length,
        completed: activities.filter((item) => item.severity === 'completed').length,
        cancelled: activities.filter((item) => item.severity === 'cancelled').length,
        critical: activities.filter((item) => item.severity === 'critical').length,
        warning: activities.filter((item) => item.severity === 'warning').length
      };

      return res.status(200).json({
        success: true,
        data: activities,
        meta: {
          filter,
          counters,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error loading mobile activity records:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while loading activity records.'
      });
    }
  }
}

export default UserMobileActivityController;