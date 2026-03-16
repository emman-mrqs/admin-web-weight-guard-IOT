// src/controller/api/driverController.js
import db from '../../database/db.js';

/**
 * Driver Mobile API Controller
 * Provides endpoints for mobile app to:
 * - Get current assignment (pickup, destination)
 * - Get turn-by-turn navigation routes
 * - Update driver location
 * - Update assignment status
 */

const DriverController = {
    /**
     * GET /api/driver/:driverId/assignment
     * Returns the driver's current active assignment with pickup and destination details
     * 
     * Response: {
     *   assignment: { id, vehicle_number, status, pickup, destination, distance_km, est_duration_min },
     *   currentLocation: { lat, lng, recorded_at } | null
     * }
     */
    async getCurrentAssignment(req, res) {
        try {
            const { driverId } = req.params;

            // Validate driver exists
            const userResult = await db.query(
                `SELECT id, full_name, email FROM users WHERE id = $1`,
                [driverId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Driver not found' 
                });
            }

            const driver = userResult.rows[0];

            // Get active assignment
            const assignmentResult = await db.query(
                `SELECT 
                    id,
                    vehicle_number,
                    pickup_lat,
                    pickup_lng,
                    pickup_address,
                    dest_lat,
                    dest_lng,
                    dest_address,
                    distance_km,
                    est_duration_min,
                    status,
                    created_at
                FROM assignments 
                WHERE driver_id = $1 AND status IN ('pending', 'active')
                ORDER BY 
                    CASE status 
                        WHEN 'active' THEN 1 
                        WHEN 'pending' THEN 2 
                    END,
                    created_at DESC
                LIMIT 1`,
                [driverId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.json({
                    success: true,
                    driver: {
                        id: driver.id,
                        name: driver.full_name
                    },
                    assignment: null,
                    message: 'No active assignment'
                });
            }

            const assignment = assignmentResult.rows[0];

            // Get driver's current location
            const locationResult = await db.query(
                `SELECT latitude, longitude, speed, heading, recorded_at
                FROM users_locations 
                WHERE user_id = $1 
                ORDER BY recorded_at DESC 
                LIMIT 1`,
                [driverId]
            );

            const currentLocation = locationResult.rows[0] ? {
                lat: parseFloat(locationResult.rows[0].latitude),
                lng: parseFloat(locationResult.rows[0].longitude),
                speed: locationResult.rows[0].speed ? parseFloat(locationResult.rows[0].speed) : null,
                heading: locationResult.rows[0].heading ? parseFloat(locationResult.rows[0].heading) : null,
                recorded_at: locationResult.rows[0].recorded_at
            } : null;

            res.json({
                success: true,
                driver: {
                    id: driver.id,
                    name: driver.full_name
                },
                assignment: {
                    id: assignment.id,
                    vehicle_number: assignment.vehicle_number,
                    status: assignment.status,
                    pickup: {
                        lat: parseFloat(assignment.pickup_lat),
                        lng: parseFloat(assignment.pickup_lng),
                        address: assignment.pickup_address
                    },
                    destination: {
                        lat: parseFloat(assignment.dest_lat),
                        lng: parseFloat(assignment.dest_lng),
                        address: assignment.dest_address
                    },
                    distance_km: assignment.distance_km ? parseFloat(assignment.distance_km) : null,
                    est_duration_min: assignment.est_duration_min,
                    created_at: assignment.created_at
                },
                currentLocation
            });
        } catch (error) {
            console.error('[DriverController] getCurrentAssignment error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch assignment' 
            });
        }
    },

    /**
     * GET /api/driver/:driverId/navigation
     * Returns turn-by-turn navigation route from current location to pickup, then to destination
     * Query params: ?currentLat=&currentLng= (driver's current position)
     * 
     * Response: {
     *   toPickup: { route, distance_km, duration_min, steps },
     *   toDestination: { route, distance_km, duration_min, steps },
     *   waypoints: [current, pickup, destination]
     * }
     */
    async getNavigationRoute(req, res) {
        try {
            const { driverId } = req.params;
            let { currentLat, currentLng } = req.query;

            // If no current location provided, get from database
            if (!currentLat || !currentLng) {
                const locationResult = await db.query(
                    `SELECT latitude, longitude FROM users_locations 
                    WHERE user_id = $1 
                    ORDER BY recorded_at DESC 
                    LIMIT 1`,
                    [driverId]
                );

                if (locationResult.rows.length > 0) {
                    currentLat = locationResult.rows[0].latitude;
                    currentLng = locationResult.rows[0].longitude;
                }
            }

            // Get active assignment
            const assignmentResult = await db.query(
                `SELECT 
                    id,
                    pickup_lat, pickup_lng, pickup_address,
                    dest_lat, dest_lng, dest_address,
                    status
                FROM assignments 
                WHERE driver_id = $1 AND status IN ('pending', 'active')
                ORDER BY 
                    CASE status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 END,
                    created_at DESC
                LIMIT 1`,
                [driverId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No active assignment found'
                });
            }

            const assignment = assignmentResult.rows[0];
            const pickup = {
                lat: parseFloat(assignment.pickup_lat),
                lng: parseFloat(assignment.pickup_lng),
                address: assignment.pickup_address
            };
            const destination = {
                lat: parseFloat(assignment.dest_lat),
                lng: parseFloat(assignment.dest_lng),
                address: assignment.dest_address
            };

            // Build response with waypoints
            const response = {
                success: true,
                assignmentId: assignment.id,
                status: assignment.status,
                waypoints: {
                    pickup,
                    destination
                },
                currentLocation: currentLat && currentLng ? {
                    lat: parseFloat(currentLat),
                    lng: parseFloat(currentLng)
                } : null,
                // OSRM URLs for mobile to call directly (more efficient)
                osrmUrls: {}
            };

            // Generate OSRM route URLs for mobile app to call
            const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

            if (currentLat && currentLng) {
                // Route from current location to pickup
                response.osrmUrls.toPickup = 
                    `${OSRM_BASE}/${currentLng},${currentLat};${pickup.lng},${pickup.lat}?overview=full&geometries=geojson&steps=true`;
            }

            // Route from pickup to destination (always included)
            response.osrmUrls.pickupToDestination = 
                `${OSRM_BASE}/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;

            // Full route: current → pickup → destination (if current location available)
            if (currentLat && currentLng) {
                response.osrmUrls.fullRoute = 
                    `${OSRM_BASE}/${currentLng},${currentLat};${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
            }

            res.json(response);
        } catch (error) {
            console.error('[DriverController] getNavigationRoute error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to generate navigation route' 
            });
        }
    },

    /**
     * GET /api/driver/:driverId/route-details
     * Fetches full OSRM route with turn-by-turn directions (server-side fetch)
     * Use this if mobile can't call OSRM directly
     */
    async getRouteDetails(req, res) {
        try {
            const { driverId } = req.params;
            let { currentLat, currentLng } = req.query;

            // If no current location provided, get from database
            if (!currentLat || !currentLng) {
                const locationResult = await db.query(
                    `SELECT latitude, longitude FROM users_locations 
                    WHERE user_id = $1 
                    ORDER BY recorded_at DESC 
                    LIMIT 1`,
                    [driverId]
                );

                if (locationResult.rows.length > 0) {
                    currentLat = locationResult.rows[0].latitude;
                    currentLng = locationResult.rows[0].longitude;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'No current location available. Provide currentLat and currentLng.'
                    });
                }
            }

            // Get active assignment
            const assignmentResult = await db.query(
                `SELECT 
                    id,
                    pickup_lat, pickup_lng, pickup_address,
                    dest_lat, dest_lng, dest_address
                FROM assignments 
                WHERE driver_id = $1 AND status IN ('pending', 'active')
                ORDER BY 
                    CASE status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 END,
                    created_at DESC
                LIMIT 1`,
                [driverId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No active assignment found'
                });
            }

            const assignment = assignmentResult.rows[0];

            // Fetch route from OSRM (server-side)
            const coordinates = `${currentLng},${currentLat};${assignment.pickup_lng},${assignment.pickup_lat};${assignment.dest_lng},${assignment.dest_lat}`;
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

            const osrmResponse = await fetch(osrmUrl);
            const osrmData = await osrmResponse.json();

            if (osrmData.code !== 'Ok') {
                return res.status(400).json({
                    success: false,
                    error: 'Could not calculate route',
                    osrmCode: osrmData.code
                });
            }

            const route = osrmData.routes[0];
            const legs = route.legs;

            // Parse turn-by-turn instructions for both legs
            const toPickupSteps = legs[0].steps.map(step => ({
                instruction: step.maneuver.instruction || `${step.maneuver.type} ${step.maneuver.modifier || ''}`.trim(),
                distance_m: step.distance,
                duration_s: step.duration,
                name: step.name || 'Unnamed road',
                maneuver: {
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    location: step.maneuver.location
                }
            }));

            const toDestinationSteps = legs[1].steps.map(step => ({
                instruction: step.maneuver.instruction || `${step.maneuver.type} ${step.maneuver.modifier || ''}`.trim(),
                distance_m: step.distance,
                duration_s: step.duration,
                name: step.name || 'Unnamed road',
                maneuver: {
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    location: step.maneuver.location
                }
            }));

            res.json({
                success: true,
                assignmentId: assignment.id,
                currentLocation: {
                    lat: parseFloat(currentLat),
                    lng: parseFloat(currentLng)
                },
                pickup: {
                    lat: parseFloat(assignment.pickup_lat),
                    lng: parseFloat(assignment.pickup_lng),
                    address: assignment.pickup_address
                },
                destination: {
                    lat: parseFloat(assignment.dest_lat),
                    lng: parseFloat(assignment.dest_lng),
                    address: assignment.dest_address
                },
                route: {
                    geometry: route.geometry, // GeoJSON LineString for map
                    total_distance_km: (route.distance / 1000).toFixed(2),
                    total_duration_min: Math.round(route.duration / 60)
                },
                toPickup: {
                    distance_km: (legs[0].distance / 1000).toFixed(2),
                    duration_min: Math.round(legs[0].duration / 60),
                    steps: toPickupSteps
                },
                toDestination: {
                    distance_km: (legs[1].distance / 1000).toFixed(2),
                    duration_min: Math.round(legs[1].duration / 60),
                    steps: toDestinationSteps
                }
            });
        } catch (error) {
            console.error('[DriverController] getRouteDetails error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch route details' 
            });
        }
    },

    /**
     * POST /api/driver/:driverId/location
     * Update driver's current location (from mobile app)
     * Body: { latitude, longitude, speed?, heading?, accuracy? }
     */
    async updateLocation(req, res) {
        try {
            const { driverId } = req.params;
            const { latitude, longitude, speed, heading, accuracy } = req.body;

            // Validate required fields
            if (latitude === undefined || longitude === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: latitude, longitude'
                });
            }

            // Validate driver exists
            const userResult = await db.query(
                `SELECT id FROM users WHERE id = $1`,
                [driverId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Driver not found'
                });
            }

            // Get active assignment
            const assignmentResult = await db.query(
                `SELECT id FROM assignments 
                WHERE driver_id = $1 AND status = 'active' 
                LIMIT 1`,
                [driverId]
            );
            const assignmentId = assignmentResult.rows[0]?.id || null;

            // Check if driver already has a location row
            const existingLocation = await db.query(
                `SELECT id FROM users_locations WHERE user_id = $1 LIMIT 1`,
                [driverId]
            );

            let locationResult;

            if (existingLocation.rows.length > 0) {
                // UPDATE existing row
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
                    [latitude, longitude, speed || null, heading || null, accuracy || null, assignmentId, driverId]
                );
            } else {
                // INSERT new row (first time only)
                locationResult = await db.query(
                    `INSERT INTO users_locations 
                        (user_id, assignment_id, latitude, longitude, speed, heading, accuracy)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id, recorded_at`,
                    [driverId, assignmentId, latitude, longitude, speed || null, heading || null, accuracy || null]
                );
            }

            res.json({
                success: true,
                message: 'Location updated',
                data: {
                    id: locationResult.rows[0].id,
                    latitude,
                    longitude,
                    recorded_at: locationResult.rows[0].recorded_at
                }
            });
        } catch (error) {
            console.error('[DriverController] updateLocation error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update location'
            });
        }
    },

    /**
     * PATCH /api/driver/:driverId/assignment/status
     * Update assignment status (pending → active → completed)
     * Body: { status: 'active' | 'completed' }
     */
    async updateAssignmentStatus(req, res) {
        try {
            const { driverId } = req.params;
            const { status } = req.body;

            const validStatuses = ['active', 'completed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            // Get current assignment
            const assignmentResult = await db.query(
                `SELECT id, status FROM assignments 
                WHERE driver_id = $1 AND status IN ('pending', 'active')
                ORDER BY 
                    CASE status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 END,
                    created_at DESC
                LIMIT 1`,
                [driverId]
            );

            if (assignmentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No active assignment found'
                });
            }

            const assignment = assignmentResult.rows[0];

            // Validate status transition
            if (assignment.status === 'pending' && status === 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot complete a pending assignment. Set to active first.'
                });
            }

            // Update status
            await db.query(
                `UPDATE assignments 
                SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [status, assignment.id]
            );

            res.json({
                success: true,
                message: `Assignment ${status === 'active' ? 'started' : 'completed'}`,
                assignmentId: assignment.id,
                previousStatus: assignment.status,
                newStatus: status
            });
        } catch (error) {
            console.error('[DriverController] updateAssignmentStatus error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update assignment status'
            });
        }
    },

    /**
     * GET /api/driver/:driverId/location
     * Get driver's current location
     */
    async getCurrentLocation(req, res) {
        try {
            const { driverId } = req.params;

            const locationResult = await db.query(
                `SELECT 
                    ul.latitude, ul.longitude, ul.speed, ul.heading, ul.accuracy, ul.recorded_at,
                    a.id as assignment_id, a.status as assignment_status
                FROM users_locations ul
                LEFT JOIN assignments a ON ul.assignment_id = a.id
                WHERE ul.user_id = $1 
                ORDER BY ul.recorded_at DESC 
                LIMIT 1`,
                [driverId]
            );

            if (locationResult.rows.length === 0) {
                return res.json({
                    success: true,
                    location: null,
                    message: 'No location data available'
                });
            }

            const loc = locationResult.rows[0];

            res.json({
                success: true,
                location: {
                    lat: parseFloat(loc.latitude),
                    lng: parseFloat(loc.longitude),
                    speed: loc.speed ? parseFloat(loc.speed) : null,
                    heading: loc.heading ? parseFloat(loc.heading) : null,
                    accuracy: loc.accuracy ? parseFloat(loc.accuracy) : null,
                    recorded_at: loc.recorded_at,
                    assignment_id: loc.assignment_id,
                    assignment_status: loc.assignment_status
                }
            });
        } catch (error) {
            console.error('[DriverController] getCurrentLocation error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch location'
            });
        }
    }
};

export default DriverController;
