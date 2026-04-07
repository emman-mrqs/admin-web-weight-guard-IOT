import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PICKUP_GATE_RADIUS_METERS = 80;

// Map to track running mock tracker processes by vehicle ID
const runningProcesses = new Map();

function toFinite(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function degToRad(value) {
    return (value * Math.PI) / 180;
}

function distanceMeters(from, to) {
    const earthRadius = 6371000;
    const dLat = degToRad(to.lat - from.lat);
    const dLng = degToRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(degToRad(from.lat))
        * Math.cos(degToRad(to.lat))
        * Math.sin(dLng / 2)
        * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
}

async function loadVehicleTaskContext(vehicleId) {
    const result = await db.query(
        `
            SELECT
                dt.id AS task_id,
                dt.status,
                dt.pickup_lat,
                dt.pickup_lng,
                dt.destination_lat,
                dt.destination_lng,
                dt.initial_reference_weight_kg,
                dt.started_at,
                dt.completed_at,
                v.id AS vehicle_id,
                v.plate_number,
                v.vehicle_type,
                vls.current_latitude,
                vls.current_longitude,
                vls.current_weight_kg,
                vls.last_ping_at
            FROM dispatch_tasks dt
            INNER JOIN vehicles v ON v.id = dt.vehicle_id
            LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
            WHERE dt.vehicle_id = $1
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
            LIMIT 1
        `,
        [vehicleId]
    );

    const row = result.rows?.[0];
    if (!row) {
        return null;
    }

    const pickup = {
        lat: toFinite(row.pickup_lat),
        lng: toFinite(row.pickup_lng)
    };

    const live = {
        lat: toFinite(row.current_latitude),
        lng: toFinite(row.current_longitude),
        weightKg: toFinite(row.current_weight_kg),
        lastPingAt: row.last_ping_at || null
    };

    const canMeasureDistance = pickup.lat != null && pickup.lng != null && live.lat != null && live.lng != null;
    const pickupDistanceMeters = canMeasureDistance
        ? distanceMeters({ lat: live.lat, lng: live.lng }, { lat: pickup.lat, lng: pickup.lng })
        : null;

    const status = String(row.status || 'pending').toLowerCase();
    const hasInitialWeight = toFinite(row.initial_reference_weight_kg) != null && Number(row.initial_reference_weight_kg) > 0;
    const isAtPickup = pickupDistanceMeters != null && pickupDistanceMeters <= PICKUP_GATE_RADIUS_METERS;
    const requiresInitialWeightPrompt = isAtPickup && (!hasInitialWeight || status !== 'in_transit');

    return {
        taskId: Number(row.task_id),
        vehicleId: Number(row.vehicle_id),
        status,
        pickup,
        destination: {
            lat: toFinite(row.destination_lat),
            lng: toFinite(row.destination_lng)
        },
        hasInitialWeight,
        initialReferenceWeightKg: toFinite(row.initial_reference_weight_kg),
        pickupDistanceMeters,
        isAtPickup,
        requiresInitialWeightPrompt,
        vehicle: {
            plateNumber: String(row.plate_number || ''),
            vehicleType: String(row.vehicle_type || '')
        },
        live
    };
}

class MockTrackerController {
    static async precheckMockTracker(req, res) {
        try {
            const vehicleId = Number(req.query.vehicleId ?? req.body?.vehicleId);
            if (!Number.isFinite(vehicleId) || vehicleId < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid Vehicle ID is required (min 1).'
                });
            }

            const context = await loadVehicleTaskContext(vehicleId);
            if (!context) {
                return res.status(404).json({
                    success: false,
                    message: `Vehicle ID ${vehicleId} has no active task. Assign a task first.`,
                    canStart: false,
                    reason: 'no_task'
                });
            }

            return res.status(200).json({
                success: true,
                canStart: true,
                message: 'Task validation passed.',
                task: context
            });
        } catch (error) {
            console.error('Error prechecking mock tracker:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to validate task for mock tracker.',
                error: error.message
            });
        }
    }

    /**
     * Start mock GPS tracker for a vehicle
     * POST /api/admin/mock-tracker/start
     */
    static async startMockTracker(req, res) {
        try {
            const rawVehicleId = Number(req.body?.vehicleId);
            const useStagedProfile = req.body?.useStagedProfile === true;
            const vehicleId = rawVehicleId;

            if (!Number.isFinite(vehicleId) || vehicleId < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid Vehicle ID is required (min 1)'
                });
            }

            const context = await loadVehicleTaskContext(vehicleId);
            if (!context) {
                return res.status(409).json({
                    success: false,
                    message: `Vehicle ID ${vehicleId} has no active task. Assign a task first.`
                });
            }

            // Check if tracker already running for this vehicle
            if (runningProcesses.has(vehicleId)) {
                return res.status(409).json({
                    success: false,
                    message: `Mock tracker already running for Vehicle ID ${vehicleId}`
                });
            }

            // Construct mock tracker script path
            const mockScriptPath = path.join(__dirname, '../../../scripts/mockEsp32Tracker.js');

            // Build environment variables
            const env = {
                ...process.env,
                MOCK_VEHICLE_ID: String(vehicleId),
                MOCK_STAGED_WEIGHT_PROFILE: useStagedProfile ? 'true' : 'false'
            };

            // Spawn mock tracker process
            const childProcess = spawn('node', [mockScriptPath], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin, pipe stdout/stderr
                detached: false
            });

            const pid = childProcess.pid;

            // Store process reference
            runningProcesses.set(vehicleId, {
                pid,
                process: childProcess,
                startedAt: new Date(),
                useStagedProfile,
                taskId: context.taskId
            });

            // Handle process exit
            childProcess.on('exit', (code, signal) => {
                console.log(`Mock tracker process (PID ${pid}) for Vehicle ${vehicleId} exited with code ${code}, signal ${signal}`);
                runningProcesses.delete(vehicleId);
            });

            // Handle process errors
            childProcess.on('error', (error) => {
                console.error(`Error in mock tracker process (PID ${pid}) for Vehicle ${vehicleId}:`, error);
                runningProcesses.delete(vehicleId);
            });

            // Log stdout
            childProcess.stdout.on('data', (data) => {
                console.log(`[Mock Tracker V${vehicleId}] ${data.toString().trim()}`);
            });

            // Log stderr
            childProcess.stderr.on('data', (data) => {
                console.warn(`[Mock Tracker V${vehicleId}] ERROR: ${data.toString().trim()}`);
            });

            return res.status(200).json({
                success: true,
                message: `Mock tracker started for Vehicle ID ${vehicleId}`,
                processId: pid,
                vehicleId,
                useStagedProfile,
                task: context,
                startedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error starting mock tracker:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to start mock tracker',
                error: error.message
            });
        }
    }

    /**
     * Stop mock GPS tracker for a vehicle
     * POST /api/admin/mock-tracker/stop
     */
    static async stopMockTracker(req, res) {
        try {
            const { vehicleId, processId } = req.body;
            const parsedProcessId = Number(processId);

            // Try to find by vehicleId first, then by processId
            let processInfo = null;
            let targetVehicleId = vehicleId;

            if (vehicleId) {
                processInfo = runningProcesses.get(vehicleId);
            } else if (Number.isFinite(parsedProcessId)) {
                // Find by process ID
                for (const [vid, info] of runningProcesses.entries()) {
                    if (Number(info.pid) === parsedProcessId) {
                        processInfo = info;
                        targetVehicleId = vid;
                        break;
                    }
                }
            }

            if (!processInfo) {
                return res.status(404).json({
                    success: false,
                    message: vehicleId
                        ? `No mock tracker running for Vehicle ID ${vehicleId}`
                        : `No mock tracker found with Process ID ${parsedProcessId || processId}`
                });
            }

            // Kill the process
            try {
                process.kill(processInfo.pid, 'SIGTERM');
                
                // Give it a moment to gracefully shut down, then force kill if needed
                setTimeout(() => {
                    try {
                        process.kill(processInfo.pid, 'SIGKILL');
                    } catch (e) {
                        // Process already killed
                    }
                }, 2000);
            } catch (error) {
                console.warn(`Error killing process ${processInfo.pid}:`, error.message);
            }

            // Remove from tracking map
            runningProcesses.delete(targetVehicleId);

            return res.status(200).json({
                success: true,
                message: `Mock tracker stopped for Vehicle ID ${targetVehicleId}`,
                vehicleId: targetVehicleId,
                stoppedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error stopping mock tracker:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to stop mock tracker',
                error: error.message
            });
        }
    }

    /**
     * Get status of all running mock trackers
     * GET /api/admin/mock-tracker/status
     */
    static async getMockTrackerStatus(req, res) {
        try {
            const targetVehicleId = Number(req.query.vehicleId);
            const trackers = [];
            for (const [vehicleId, info] of runningProcesses.entries()) {
                if (Number.isFinite(targetVehicleId) && targetVehicleId > 0 && Number(vehicleId) !== targetVehicleId) {
                    continue;
                }

                const task = await loadVehicleTaskContext(Number(vehicleId));
                trackers.push({
                    vehicleId,
                    processId: info.pid,
                    useStagedProfile: info.useStagedProfile,
                    startedAt: info.startedAt.toISOString(),
                    uptime: new Date() - info.startedAt,
                    task
                });
            }

            const taskContext = Number.isFinite(targetVehicleId) && targetVehicleId > 0
                ? await loadVehicleTaskContext(targetVehicleId)
                : null;

            return res.status(200).json({
                success: true,
                trackers,
                count: trackers.length,
                task: taskContext,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting mock tracker status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get mock tracker status',
                error: error.message
            });
        }
    }

    /**
     * Stop all running mock trackers
     * POST /api/admin/mock-tracker/stop-all
     */
    static async stopAllMockTrackers(req, res) {
        try {
            const stoppedTrackers = [];

            for (const [vehicleId, info] of runningProcesses.entries()) {
                try {
                    process.kill(info.pid, 'SIGTERM');
                    stoppedTrackers.push(vehicleId);
                } catch (error) {
                    console.warn(`Error killing process ${info.pid}:`, error.message);
                }
            }

            // Clear the map
            runningProcesses.clear();

            return res.status(200).json({
                success: true,
                message: `Stopped ${stoppedTrackers.length} mock tracker(s)`,
                stoppedVehicles: stoppedTrackers,
                stoppedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error stopping all mock trackers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to stop all mock trackers',
                error: error.message
            });
        }
    }

    static async submitInitialWeight(req, res) {
        try {
            const vehicleId = Number(req.body?.vehicleId);
            const typedCurrentWeightKg = toFinite(req.body?.typedCurrentWeightKg);

            if (!Number.isFinite(vehicleId) || vehicleId < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid Vehicle ID is required (min 1).'
                });
            }

            const context = await loadVehicleTaskContext(vehicleId);
            if (!context) {
                return res.status(404).json({
                    success: false,
                    message: `No active task found for Vehicle ID ${vehicleId}.`
                });
            }

            if (!context.isAtPickup) {
                return res.status(409).json({
                    success: false,
                    message: `Vehicle is not at pickup yet. Current distance: ${Math.round(context.pickupDistanceMeters || 0)}m.`
                });
            }

            let currentLiveWeightKg = typedCurrentWeightKg;

            if (currentLiveWeightKg != null && currentLiveWeightKg > 0) {
                await db.query(
                    `
                        INSERT INTO vehicle_live_state (vehicle_id, current_weight_kg, last_ping_at)
                        VALUES ($1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (vehicle_id)
                        DO UPDATE SET
                            current_weight_kg = EXCLUDED.current_weight_kg,
                            last_ping_at = CURRENT_TIMESTAMP
                    `,
                    [vehicleId, currentLiveWeightKg]
                );
            } else {
                currentLiveWeightKg = toFinite(context.live?.weightKg);
            }

            if (currentLiveWeightKg == null || currentLiveWeightKg <= 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Current vehicle_live_state weight is missing or invalid. Send live weight telemetry first.'
                });
            }

            const updateResult = await db.query(
                `
                    UPDATE dispatch_tasks
                    SET
                        initial_reference_weight_kg = $1,
                        status = 'in_transit',
                        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING id, status, initial_reference_weight_kg, started_at
                `,
                [currentLiveWeightKg, context.taskId]
            );

            const updatedTask = updateResult.rows?.[0] || null;

            return res.status(200).json({
                success: true,
                message: `Initial reference weight captured from live state (${currentLiveWeightKg.toFixed(2)} kg) for task #${context.taskId}. Vehicle can proceed to destination.`,
                capturedWeightKg: currentLiveWeightKg,
                task: updatedTask
            });
        } catch (error) {
            console.error('Error submitting initial weight:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to submit initial weight.',
                error: error.message
            });
        }
    }
}

export default MockTrackerController;
