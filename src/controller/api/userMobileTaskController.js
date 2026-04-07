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

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
  const initialReferenceWeightKg = toNumber(row.initial_reference_weight_kg);
  const pickupLat = Number(row.pickup_lat);
  const pickupLng = Number(row.pickup_lng);
  const destinationLat = Number(row.destination_lat);
  const destinationLng = Number(row.destination_lng);
  const liveLatitude = toNumber(row.live_latitude);
  const liveLongitude = toNumber(row.live_longitude);
  const liveSpeedKmh = toNumber(row.live_speed_kmh) ?? 0;
  const liveHeading = toNumber(row.live_heading);
  const liveCurrentWeightKg = toNumber(row.live_current_weight_kg);
  const liveLastPingAt = row.live_last_ping_at || null;
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
    initialReferenceWeightKg,
    currentLocationLabel: buildCurrentLocationLabel(status),
    vehicle: {
      id: Number(row.vehicle_id),
      plateNumber: formatLabel(row.plate_number, `#${row.vehicle_id}`),
      vehicleType: formatLabel(row.vehicle_type, 'Vehicle'),
      maxCapacityKg: toNumber(row.max_capacity_kg),
      currentState: formatLabel(row.current_state, null),
      currentLoadStatus: formatLabel(row.current_load_status, null),
      live: {
        latitude: liveLatitude,
        longitude: liveLongitude,
        speedKmh: liveSpeedKmh,
        heading: liveHeading,
        currentWeightKg: liveCurrentWeightKg,
        lastPingAt: liveLastPingAt
      },
      liveLatitude,
      liveLongitude,
      liveSpeedKmh,
      liveHeading,
      liveCurrentWeightKg,
      liveLastPingAt
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
        dt.initial_reference_weight_kg,
        LOWER(COALESCE(dt.status, 'pending')) AS assignment_status,
        v.id AS vehicle_id,
        v.vehicle_type,
        v.plate_number,
        v.max_capacity_kg,
        v.current_state,
        v.current_load_status,
        vls.current_latitude AS live_latitude,
        vls.current_longitude AS live_longitude,
        COALESCE(vls.current_speed_kmh, 0) AS live_speed_kmh,
        vls.current_heading AS live_heading,
        vls.current_weight_kg AS live_current_weight_kg,
        vls.last_ping_at AS live_last_ping_at,
        u.id AS driver_id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS driver_name
      FROM dispatch_tasks dt
      INNER JOIN vehicles v ON v.id = dt.vehicle_id
      LEFT JOIN users u ON u.id = v.assigned_driver_id
      LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
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
      const requestedInitialReferenceWeightKg = toPositiveNumber(
        req.body?.initialReferenceWeightKg
      );

      // If a weight is supplied, this call is a pickup-confirmation step.
      // Prioritize the currently active task so destination transition is deterministic.
      if (requestedInitialReferenceWeightKg !== null) {
        const activeTaskForConfirmation = await loadCurrentTaskRow(userId, ['active']);
        if (!activeTaskForConfirmation) {
          return res.status(404).json({
            success: false,
            message: 'No active pickup task found to confirm weight.'
          });
        }

        const maxCapacityKg = toNumber(activeTaskForConfirmation.max_capacity_kg);
        if (maxCapacityKg !== null && requestedInitialReferenceWeightKg > maxCapacityKg) {
          return res.status(400).json({
            success: false,
            message: `Initial reference weight exceeds max capacity (${maxCapacityKg.toFixed(0)} kg).`
          });
        }

        await db.query(
          `
            UPDATE dispatch_tasks
            SET status = 'in_transit',
                initial_reference_weight_kg = $3,
                updated_at = NOW()
            WHERE id = $1
              AND LOWER(COALESCE(status, '')) = 'active'
              AND EXISTS (
                SELECT 1
                FROM vehicles v
                WHERE v.id = dispatch_tasks.vehicle_id
                  AND v.assigned_driver_id = $2
              )
          `,
          [activeTaskForConfirmation.assignment_id, userId, requestedInitialReferenceWeightKg]
        );

        const refreshedTaskAfterConfirm = await loadCurrentTaskRow(userId, ['in_transit', 'active', 'pending']);

        return res.status(200).json({
          success: true,
          message: 'Cargo verified. Proceed to destination.',
          data: refreshedTaskAfterConfirm
            ? buildTaskPayload(refreshedTaskAfterConfirm, userId)
            : buildTaskPayload(activeTaskForConfirmation, userId)
        });
      }

      const currentTask = await loadCurrentTaskRow(userId, ['pending']);

      if (currentTask) {
        await db.query(
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

        const refreshedTask = await loadCurrentTaskRow(userId, ['active', 'in_transit', 'pending']);

        return res.status(200).json({
          success: true,
          message: 'Dispatch task started successfully.',
          data: refreshedTask ? buildTaskPayload(refreshedTask, userId) : buildTaskPayload(currentTask, userId)
        });
      }

      const activeTask = await loadCurrentTaskRow(userId, ['active']);
      if (!activeTask) {
        return res.status(404).json({
          success: false,
          message: 'No pending or active dispatch task found to continue.'
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Pickup stage is active. Proceed to pickup point.',
        data: buildTaskPayload(activeTask, userId)
      });
    } catch (error) {
      console.error('Error starting mobile task:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to start current task.'
      });
    }
  }

  static async completeCurrentTask(req, res) {
    const userId = Number(req.mobileAuth?.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.'
      });
    }

    try {
      const currentTask = await loadCurrentTaskRow(userId, ['in_transit']);

      if (!currentTask) {
        return res.status(404).json({
          success: false,
          message: 'No in-transit dispatch task found to complete.'
        });
      }

      await db.query(
        `
          UPDATE dispatch_tasks
          SET status = 'completed',
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
            AND LOWER(COALESCE(status, '')) = 'in_transit'
            AND EXISTS (
              SELECT 1
              FROM vehicles v
              WHERE v.id = dispatch_tasks.vehicle_id
                AND v.assigned_driver_id = $2
            )
        `,
        [currentTask.assignment_id, userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Dispatch task completed successfully.',
        data: null
      });
    } catch (error) {
      console.error('Error completing mobile task:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to complete current task.'
      });
    }
  }
}

export default UserMobileTaskController;