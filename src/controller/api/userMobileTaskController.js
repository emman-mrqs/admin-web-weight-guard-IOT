import db from '../../database/db.js';

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatLabel(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildStageLabel(status) {
  switch (status) {
    case 'pending':
      return 'Assigned';
    case 'active':
      return 'Active';
    case 'in_transit':
      return 'In Transit';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Assigned';
  }
}

function buildCurrentLocationLabel(status) {
  switch (status) {
    case 'pending':
      return 'Pickup Point';
    case 'active':
      return 'At Pickup Point';
    case 'in_transit':
      return 'On Route';
    case 'completed':
      return 'Destination Point';
    case 'cancelled':
      return 'Cancelled Task';
    default:
      return 'Pickup Point';
  }
}

function buildTimeline(row) {
  const status = normalizeStatus(row.assignment_status);
  const maxCapacityKg = toNumber(row.max_capacity_kg);

  return [
    {
      key: 'pickup',
      title: 'Pickup',
      subtitle: `Proceed to ${formatLabel(row.pickup_name, 'the pickup point')} (${Number(row.pickup_lat).toFixed(4)}, ${Number(row.pickup_lng).toFixed(4)})`,
      isDone: status !== 'pending',
      isActive: status === 'pending'
    },
    {
      key: 'load',
      title: 'Load Cargo',
      subtitle: maxCapacityKg !== null
        ? `Load cargo within ${maxCapacityKg.toFixed(0)} kg maximum capacity.`
        : 'Load cargo within the assigned vehicle capacity.',
      isDone: status === 'completed',
      isActive: status === 'active'
    },
    {
      key: 'destination',
      title: 'Destination',
      subtitle: `Deliver to ${formatLabel(row.destination_name, 'the destination point')} (${Number(row.destination_lat).toFixed(4)}, ${Number(row.destination_lng).toFixed(4)})`,
      isDone: status === 'completed',
      isActive: status === 'in_transit'
    }
  ];
}

function buildInstructions(row) {
  const maxCapacityKg = toNumber(row.max_capacity_kg);

  return [
    {
      step: 1,
      title: 'Go to pickup point',
      detail: `Navigate to ${formatLabel(row.pickup_name, 'the pickup point')} and prepare the load.`
    },
    {
      step: 2,
      title: 'Load and verify cargo',
      detail: maxCapacityKg !== null
        ? `Ensure the vehicle load stays within ${maxCapacityKg.toFixed(0)} kg.`
        : 'Ensure the vehicle load stays within the assigned capacity.'
    },
    {
      step: 3,
      title: 'Proceed to destination',
      detail: `Deliver the cargo to ${formatLabel(row.destination_name, 'the destination point')} and complete the trip.`
    }
  ];
}

function buildTaskPayload(row, userId) {
  const status = normalizeStatus(row.assignment_status);
  const pickupLat = Number(row.pickup_lat);
  const pickupLng = Number(row.pickup_lng);
  const destinationLat = Number(row.destination_lat);
  const destinationLng = Number(row.destination_lng);
  const distanceKm = Number.isFinite(pickupLat) && Number.isFinite(pickupLng) && Number.isFinite(destinationLat) && Number.isFinite(destinationLng)
    ? Number((Math.hypot(destinationLat - pickupLat, destinationLng - pickupLng) * 111).toFixed(2))
    : null;
  const estDurationMin = distanceKm !== null
    ? Math.max(1, Math.round((distanceKm / 35) * 60))
    : null;

  return {
    assignmentId: Number(row.assignment_id),
    status,
    stageLabel: buildStageLabel(status),
    title: `Task #${row.assignment_id}`,
    currentLocationLabel: buildCurrentLocationLabel(status),
    vehicle: {
      id: Number(row.vehicle_id),
      plateNumber: formatLabel(row.plate_number, `#${row.vehicle_id}`),
      vehicleType: formatLabel(row.vehicle_type, 'Vehicle'),
      maxCapacityKg: toNumber(row.max_capacity_kg),
      currentState: formatLabel(row.current_state, null),
      currentLoadStatus: formatLabel(row.current_load_status, null)
    },
    driver: {
      id: row.driver_id ? Number(row.driver_id) : userId,
      name: formatLabel(row.driver_name, 'Driver')
    },
    route: {
      pickup: {
        lat: pickupLat,
        lng: pickupLng,
        label: 'Pickup Point'
      },
      destination: {
        lat: destinationLat,
        lng: destinationLng,
        label: 'Destination Point'
      },
      distanceKm,
      estDurationMin
    },
    timeline: buildTimeline(row),
    detailedInstructions: buildInstructions(row),
    timestamps: {
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    }
  };
}

async function loadCurrentTaskRow(userId, statuses = ['pending', 'active', 'in_transit']) {
  const statusList = statuses.map((status) => String(status).trim().toLowerCase());

  const { rows } = await db.query(
    `
      SELECT
        dt.id AS assignment_id,
        dt.pickup_lat,
        dt.pickup_lng,
        dt.destination_lat,
        dt.destination_lng,
        NULL::text AS pickup_name,
        NULL::text AS destination_name,
        dt.started_at,
        dt.completed_at,
        dt.created_at AS assigned_at,
        dt.updated_at,
        LOWER(COALESCE(dt.status, 'pending')) AS assignment_status,
        v.id AS vehicle_id,
        v.vehicle_type,
        v.plate_number,
        v.max_capacity_kg,
        v.current_state,
        v.current_load_status,
        u.id AS driver_id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS driver_name
      FROM dispatch_tasks dt
      INNER JOIN vehicles v ON v.id = dt.vehicle_id
      LEFT JOIN users u ON u.id = v.assigned_driver_id
      WHERE v.assigned_driver_id = $1
        AND LOWER(COALESCE(dt.status, '')) = ANY($2)
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
    [userId, statusList]
  );

  return rows[0] || null;
}

class UserMobileTaskController {
  static async getCurrentTask(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const row = await loadCurrentTaskRow(userId);

      if (!row) {
        return res.status(200).json({
          success: true,
          message: 'No active dispatch task assigned yet.',
          data: null
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Current dispatch task loaded successfully.',
        data: buildTaskPayload(row, userId)
      });
    } catch (error) {
      console.error('Error fetching mobile task:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to load current task.'
      });
    }
  }

  static async startCurrentTask(req, res) {
    const userId = Number(req.mobileAuth?.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.'
      });
    }

    try {
      const currentTask = await loadCurrentTaskRow(userId, ['pending']);

      if (!currentTask) {
        return res.status(404).json({
          success: false,
          message: 'No pending dispatch task found to start.'
        });
      }

      // Update the task status to 'active'
      const updateResult = await db.query(
        `
          UPDATE dispatch_tasks
          SET status = 'active',
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
            AND EXISTS (
              SELECT 1
              FROM vehicles v
              WHERE v.id = dispatch_tasks.vehicle_id
                AND v.assigned_driver_id = $2
            )
        `,
        [currentTask.assignment_id, userId]
      );

      // If update didn't affect any rows, return error
      if (updateResult.rowCount === 0) {
        console.error(`[startCurrentTask] Update failed: no rows affected for task ${currentTask.assignment_id}`);
        return res.status(404).json({
          success: false,
          message: 'Failed to update task status. Task or vehicle not found.'
        });
      }

      // Reload the updated task to get fresh data
      const refreshedTask = await loadCurrentTaskRow(userId, ['active', 'in_transit', 'pending']);

      if (!refreshedTask) {
        console.error(`[startCurrentTask] Refreshed task not found after update for userId=${userId}`);
        return res.status(500).json({
          success: false,
          message: 'Task updated but could not reload updated data.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Dispatch task started successfully.',
        data: buildTaskPayload(refreshedTask, userId)
      });
    } catch (error) {
      console.error('Error starting mobile task:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to start current task.'
      });
    }
  }
}

export default UserMobileTaskController;