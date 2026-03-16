// src/controller/api/incidentController.js
// API Controller for receiving weight data from Arduino and auto-detecting incidents
import db from '../../database/db.js';

// Store WebSocket connections for real-time incident alerts
let wsConnections = new Map();

/**
 * Set WebSocket connections map (called from app.js)
 */
export function setIncidentWsConnections(connections) {
    wsConnections = connections;
}

/**
 * Broadcast incident alert to all connected admin clients
 */
function broadcastIncidentAlert(incidentData) {
    const message = JSON.stringify({
        type: 'incident_alert',
        data: incidentData
    });

    wsConnections.forEach((ws, clientId) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(message);
        }
    });
}

/**
 * Weight loss threshold in kg to trigger cargo_loss incident
 * Can be configured via environment variable
 */
const CARGO_LOSS_THRESHOLD = parseFloat(process.env.CARGO_LOSS_THRESHOLD) || 5.0;

const IncidentApiController = {
    /**
     * POST /api/weight
     * Receives weight data from Arduino scale sensors
     * Auto-detects cargo loss if weight drops below threshold
     * 
     * Body: { userId, assignmentId, weight_kg, latitude, longitude, apiKey }
     */
    async receiveWeightReading(req, res) {
        try {
            const { userId, assignmentId, weight_kg, latitude, longitude, apiKey } = req.body;

            // Validate API key
            const expectedApiKey = process.env.DEVICE_API_KEY || 'weighguard-device-key';
            if (apiKey !== expectedApiKey) {
                return res.status(401).json({ success: false, error: 'Unauthorized device' });
            }

            // Validate required fields
            if (!userId || !assignmentId || weight_kg === undefined || !latitude || !longitude) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: userId, assignmentId, weight_kg, latitude, longitude'
                });
            }

            // Insert weight reading
            const weightResult = await db.query(
                `INSERT INTO weight_readings (assignment_id, user_id, weight_kg, latitude, longitude)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, recorded_at`,
                [assignmentId, userId, weight_kg, latitude, longitude]
            );

            // Get cargo manifest for this assignment to check for cargo loss
            const manifestResult = await db.query(
                `SELECT initial_weight_kg, max_allowed_kg, cargo_description
                 FROM cargo_manifest
                 WHERE assignment_id = $1`,
                [assignmentId]
            );

            let incident = null;

            if (manifestResult.rows.length > 0) {
                const manifest = manifestResult.rows[0];
                const initialWeight = parseFloat(manifest.initial_weight_kg);
                const currentWeight = parseFloat(weight_kg);
                const weightDifference = initialWeight - currentWeight;

                // Check for cargo loss (weight dropped more than threshold)
                if (weightDifference >= CARGO_LOSS_THRESHOLD) {
                    // Determine severity based on weight loss percentage
                    const lossPercentage = (weightDifference / initialWeight) * 100;
                    let severity = 'warning';
                    if (lossPercentage >= 20) severity = 'critical';
                    else if (lossPercentage >= 10) severity = 'warning';
                    else severity = 'info';

                    // Check if there's already an open cargo_loss incident for this assignment
                    const existingIncident = await db.query(
                        `SELECT id FROM incidents 
                         WHERE assignment_id = $1 AND incident_type = 'cargo_loss' AND status = 'open'
                         LIMIT 1`,
                        [assignmentId]
                    );

                    if (existingIncident.rows.length === 0) {
                        // Create new incident
                        const incidentResult = await db.query(
                            `INSERT INTO incidents (
                                assignment_id, user_id, incident_type, severity,
                                description, initial_weight_kg, current_weight_kg, weight_difference_kg,
                                latitude, longitude
                            ) VALUES ($1, $2, 'cargo_loss', $3, $4, $5, $6, $7, $8, $9)
                            RETURNING *`,
                            [
                                assignmentId, userId, severity,
                                `Cargo weight dropped by ${weightDifference.toFixed(2)}kg (${lossPercentage.toFixed(1)}% loss). ${manifest.cargo_description || ''}`,
                                initialWeight, currentWeight, weightDifference,
                                latitude, longitude
                            ]
                        );

                        incident = incidentResult.rows[0];

                        // Get driver and vehicle info for broadcast
                        const assignmentInfo = await db.query(
                            `SELECT a.vehicle_number, u.full_name as driver_name
                             FROM assignments a
                             JOIN users u ON a.driver_id = u.id
                             WHERE a.id = $1`,
                            [assignmentId]
                        );

                        // Broadcast real-time alert
                        broadcastIncidentAlert({
                            ...incident,
                            vehicle_number: assignmentInfo.rows[0]?.vehicle_number,
                            driver_name: assignmentInfo.rows[0]?.driver_name
                        });
                    } else {
                        // Update existing incident with new weight data
                        await db.query(
                            `UPDATE incidents 
                             SET current_weight_kg = $1, weight_difference_kg = $2,
                                 latitude = $3, longitude = $4, severity = $5
                             WHERE id = $6`,
                            [currentWeight, weightDifference, latitude, longitude, severity, existingIncident.rows[0].id]
                        );
                    }
                }
            }

            res.json({
                success: true,
                message: 'Weight reading recorded',
                data: {
                    id: weightResult.rows[0].id,
                    recorded_at: weightResult.rows[0].recorded_at,
                    incident_detected: incident !== null,
                    incident_id: incident?.id || null
                }
            });
        } catch (error) {
            console.error('[IncidentApiController] receiveWeightReading error:', error);
            res.status(500).json({ success: false, error: 'Failed to record weight reading' });
        }
    },

    /**
     * POST /api/cargo-manifest
     * Records initial cargo weight at pickup point
     * Also checks for overload at the time of loading
     * 
     * Body: { assignmentId, initial_weight_kg, cargo_description?, item_count?, 
     *         weight_per_item_kg?, max_allowed_kg?, latitude?, longitude?, apiKey }
     */
    async createCargoManifest(req, res) {
        try {
            const {
                assignmentId, initial_weight_kg, cargo_description, item_count,
                weight_per_item_kg, max_allowed_kg, latitude, longitude, apiKey
            } = req.body;

            // Validate API key
            const expectedApiKey = process.env.DEVICE_API_KEY || 'weighguard-device-key';
            if (apiKey !== expectedApiKey) {
                return res.status(401).json({ success: false, error: 'Unauthorized device' });
            }

            // Validate required fields
            if (!assignmentId || initial_weight_kg === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: assignmentId, initial_weight_kg'
                });
            }

            // Get assignment info
            const assignmentResult = await db.query(
                `SELECT a.id, a.driver_id, a.vehicle_number, a.pickup_lat, a.pickup_lng, u.full_name
                 FROM assignments a
                 JOIN users u ON a.driver_id = u.id
                 WHERE a.id = $1`,
                [assignmentId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Assignment not found' });
            }

            const assignment = assignmentResult.rows[0];

            // Use assignment pickup location if not provided
            const pickupLat = latitude || assignment.pickup_lat;
            const pickupLng = longitude || assignment.pickup_lng;

            // Insert cargo manifest (upsert to allow updates)
            const manifestResult = await db.query(
                `INSERT INTO cargo_manifest (
                    assignment_id, initial_weight_kg, cargo_description, item_count,
                    weight_per_item_kg, max_allowed_kg, pickup_lat, pickup_lng
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (assignment_id) DO UPDATE SET
                    initial_weight_kg = EXCLUDED.initial_weight_kg,
                    cargo_description = EXCLUDED.cargo_description,
                    item_count = EXCLUDED.item_count,
                    weight_per_item_kg = EXCLUDED.weight_per_item_kg,
                    max_allowed_kg = EXCLUDED.max_allowed_kg,
                    loaded_at = CURRENT_TIMESTAMP
                RETURNING *`,
                [
                    assignmentId, initial_weight_kg, cargo_description || null,
                    item_count || null, weight_per_item_kg || null,
                    max_allowed_kg || null, pickupLat, pickupLng
                ]
            );

            const manifest = manifestResult.rows[0];
            let incident = null;

            // Check for overload
            if (max_allowed_kg && parseFloat(initial_weight_kg) > parseFloat(max_allowed_kg)) {
                const overloadAmount = parseFloat(initial_weight_kg) - parseFloat(max_allowed_kg);
                const overloadPercentage = (overloadAmount / parseFloat(max_allowed_kg)) * 100;

                let severity = 'warning';
                if (overloadPercentage >= 25) severity = 'critical';
                else if (overloadPercentage >= 10) severity = 'warning';

                const incidentResult = await db.query(
                    `INSERT INTO incidents (
                        assignment_id, user_id, incident_type, severity,
                        description, initial_weight_kg, current_weight_kg, weight_difference_kg,
                        latitude, longitude
                    ) VALUES ($1, $2, 'overload', $3, $4, $5, $5, $6, $7, $8)
                    RETURNING *`,
                    [
                        assignmentId, assignment.driver_id, severity,
                        `Vehicle ${assignment.vehicle_number} is overloaded by ${overloadAmount.toFixed(2)}kg (${overloadPercentage.toFixed(1)}% over limit)`,
                        initial_weight_kg, overloadAmount, pickupLat, pickupLng
                    ]
                );

                incident = incidentResult.rows[0];

                // Broadcast overload alert
                broadcastIncidentAlert({
                    ...incident,
                    vehicle_number: assignment.vehicle_number,
                    driver_name: assignment.full_name
                });
            }

            // Also record initial weight reading
            await db.query(
                `INSERT INTO weight_readings (assignment_id, user_id, weight_kg, latitude, longitude)
                 VALUES ($1, $2, $3, $4, $5)`,
                [assignmentId, assignment.driver_id, initial_weight_kg, pickupLat, pickupLng]
            );

            res.json({
                success: true,
                message: 'Cargo manifest created',
                data: {
                    manifest_id: manifest.id,
                    overload_detected: incident !== null,
                    incident_id: incident?.id || null
                }
            });
        } catch (error) {
            console.error('[IncidentApiController] createCargoManifest error:', error);
            res.status(500).json({ success: false, error: 'Failed to create cargo manifest' });
        }
    },

    /**
     * GET /api/weight-readings/:assignmentId
     * Get weight history for an assignment (for timeline/chart)
     */
    async getWeightReadings(req, res) {
        try {
            const { assignmentId } = req.params;

            const result = await db.query(
                `SELECT wr.*, cm.initial_weight_kg
                 FROM weight_readings wr
                 LEFT JOIN cargo_manifest cm ON wr.assignment_id = cm.assignment_id
                 WHERE wr.assignment_id = $1
                 ORDER BY wr.recorded_at ASC`,
                [assignmentId]
            );

            res.json({
                success: true,
                count: result.rows.length,
                readings: result.rows
            });
        } catch (error) {
            console.error('[IncidentApiController] getWeightReadings error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch weight readings' });
        }
    }
};

export default IncidentApiController;
