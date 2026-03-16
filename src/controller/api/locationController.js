// src/controller/api/locationController.js
import db from '../../database/db.js';

// Store WebSocket connections by user ID for broadcasting
let wsConnections = new Map();

/**
 * Set WebSocket connections map (called from app.js)
 */
export function setWsConnections(connections) {
    wsConnections = connections;
}

/**
 * Broadcast location update to all connected admin clients
 */
function broadcastLocationUpdate(locationData) {
    const message = JSON.stringify({
        type: 'location_update',
        data: locationData
    });
    
    wsConnections.forEach((ws, clientId) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(message);
        }
    });
}

const LocationController = {
    /**
     * POST /api/location
     * Receives GPS data from Arduino/ESP32 devices
     * Body: { userId, latitude, longitude, speed?, heading?, accuracy?, apiKey }
     * 
     * Flow:
     * 1. Check if user already has a row in users_locations
     * 2. If EXISTS → UPDATE that row (no new rows created)
     * 3. If NOT EXISTS → INSERT new row (only once per user)
     * 4. Broadcast via WebSocket to admin browsers
     */
    async receiveLocation(req, res) {
        try {
            const { userId, latitude, longitude, speed, heading, accuracy, apiKey } = req.body;
            
            // Validate API key (simple auth for Arduino devices)
            const expectedApiKey = process.env.DEVICE_API_KEY ;
            if (apiKey !== expectedApiKey) {
                return res.status(401).json({ error: 'Unauthorized device' });
            }
            
            // Validate required fields
            if (!userId || latitude === undefined || longitude === undefined) {
                return res.status(400).json({ error: 'Missing required fields: userId, latitude, longitude' });
            }
            
            // Check if user exists
            const userResult = await db.query(
                `SELECT id, full_name FROM users WHERE id = $1`,
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const user = userResult.rows[0];
            
            // Get active assignment for this user (if any)
            const assignmentResult = await db.query(
                `SELECT id FROM assignments 
                 WHERE driver_id = $1 AND status = 'active' 
                 LIMIT 1`,
                [userId]
            );
            const assignmentId = assignmentResult.rows[0]?.id || null;
            
            // Check if user already has a location row
            const existingLocation = await db.query(
                `SELECT id FROM users_locations WHERE user_id = $1 LIMIT 1`,
                [userId]
            );
            
            let locationResult;
            let isUpdate = false;
            
            if (existingLocation.rows.length > 0) {
                // UPDATE existing row (no new rows created!)
                locationResult = await db.query(
                    `UPDATE users_locations 
                     SET latitude = $1, 
                         longitude = $2, 
                         speed = $3, 
                         heading = $4, 
                         accuracy = $5, 
                         assignment_id = $6,
                         recorded_at = CURRENT_TIMESTAMP
                     WHERE user_id = $7
                     RETURNING id, recorded_at`,
                    [latitude, longitude, speed || null, heading || null, accuracy || null, assignmentId, userId]
                );
                isUpdate = true;
            } else {
                // INSERT new row (only happens once per user)
                locationResult = await db.query(
                    `INSERT INTO users_locations 
                     (user_id, assignment_id, latitude, longitude, speed, heading, accuracy)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     RETURNING id, recorded_at`,
                    [userId, assignmentId, latitude, longitude, speed || null, heading || null, accuracy || null]
                );
            }
            
            // Prepare location data for WebSocket broadcast
            const locationData = {
                userId: parseInt(userId),
                fullName: user.full_name,
                assignmentId,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                speed: speed ? parseFloat(speed) : null,
                heading: heading ? parseFloat(heading) : null,
                accuracy: accuracy ? parseFloat(accuracy) : null,
                recordedAt: locationResult.rows[0].recorded_at
            };
            
            // Broadcast to all connected admin clients via WebSocket
            broadcastLocationUpdate(locationData);
            
            res.json({ 
                success: true, 
                message: isUpdate ? 'Location updated' : 'Location created',
                locationId: locationResult.rows[0].id,
                timestamp: locationResult.rows[0].recorded_at
            });
            
        } catch (error) {
            console.error('Error receiving location:', error);
            res.status(500).json({ error: 'Failed to save location' });
        }
    },
    
    /**
     * GET /api/locations/active
     * Returns current location of all active drivers (for polling fallback)
     */
    async getActiveLocations(req, res) {
        try {
            const result = await db.query(`
                SELECT DISTINCT ON (dl.user_id)
                    dl.user_id,
                    u.full_name,
                    dl.latitude,
                    dl.longitude,
                    dl.speed,
                    dl.heading,
                    dl.recorded_at,
                    a.id as assignment_id,
                    a.vehicle_number,
                    a.status as assignment_status,
                    a.pickup_lat,
                    a.pickup_lng,
                    a.dest_lat,
                    a.dest_lng,
                    a.distance_km,
                    a.est_duration_min
                FROM users_locations dl
                JOIN users u ON dl.user_id = u.id
                LEFT JOIN assignments a ON dl.assignment_id = a.id
                WHERE dl.recorded_at > NOW() - INTERVAL '5 minutes'
                ORDER BY dl.user_id, dl.recorded_at DESC
            `);
            
            res.json({ drivers: result.rows });
            
        } catch (error) {
            console.error('Error fetching active locations:', error);
            res.status(500).json({ error: 'Failed to fetch locations' });
        }
    },
    
    /**
     * GET /api/locations/user/:userId
     * Returns location history for a specific user
     */
    async getUserLocationHistory(req, res) {
        try {
            const { userId } = req.params;
            const { limit = 100, assignmentId } = req.query;
            
            let query = `
                SELECT latitude, longitude, speed, heading, accuracy, recorded_at
                FROM users_locations
                WHERE user_id = $1
            `;
            const params = [userId];
            
            if (assignmentId) {
                query += ` AND assignment_id = $2`;
                params.push(assignmentId);
            }
            
            query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
            params.push(parseInt(limit));
            
            const result = await db.query(query, params);
            
            res.json({ 
                userId: parseInt(userId),
                locations: result.rows 
            });
            
        } catch (error) {
            console.error('Error fetching user location history:', error);
            res.status(500).json({ error: 'Failed to fetch location history' });
        }
    },
    
    /**
     * GET /api/locations/assignment/:assignmentId
     * Returns all location points for a specific assignment (route playback)
     */
    async getAssignmentRoute(req, res) {
        try {
            const { assignmentId } = req.params;
            
            const result = await db.query(`
                SELECT 
                    dl.latitude, 
                    dl.longitude, 
                    dl.speed, 
                    dl.heading, 
                    dl.recorded_at,
                    u.full_name
                FROM users_locations dl
                JOIN users u ON dl.user_id = u.id
                WHERE dl.assignment_id = $1
                ORDER BY dl.recorded_at ASC
            `, [assignmentId]);
            
            res.json({ 
                assignmentId: parseInt(assignmentId),
                points: result.rows,
                totalPoints: result.rows.length
            });
            
        } catch (error) {
            console.error('Error fetching assignment route:', error);
            res.status(500).json({ error: 'Failed to fetch assignment route' });
        }
    }
};

export default LocationController;
