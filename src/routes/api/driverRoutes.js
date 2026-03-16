// src/routes/api/driverRoutes.js
import express from 'express';
import DriverController from '../../controller/api/driverController.js';

const router = express.Router();

/**
 * Driver Mobile API Routes
 * Base path: /api/driver
 * 
 * These endpoints are designed for mobile app consumption.
 * All routes use :driverId to identify the driver.
 */

// ============================================
// ASSIGNMENT ROUTES
// ============================================

/**
 * GET /api/driver/:driverId/assignment
 * Get driver's current active assignment with pickup/destination details
 * Response includes: assignment details, pickup coords, destination coords, current location
 */
router.get('/:driverId/assignment', DriverController.getCurrentAssignment);

/**
 * PATCH /api/driver/:driverId/assignment/status
 * Update assignment status
 * Body: { status: 'active' | 'completed' }
 * 
 * Status flow: pending → active → completed
 */
router.patch('/:driverId/assignment/status', DriverController.updateAssignmentStatus);

// ============================================
// NAVIGATION ROUTES
// ============================================

/**
 * GET /api/driver/:driverId/navigation
 * Get OSRM route URLs for mobile to call directly (lightweight)
 * Query: ?currentLat=14.5995&currentLng=120.9842
 * 
 * Returns OSRM URLs that mobile can fetch directly:
 * - toPickup: current → pickup
 * - pickupToDestination: pickup → destination
 * - fullRoute: current → pickup → destination
 */
router.get('/:driverId/navigation', DriverController.getNavigationRoute);

/**
 * GET /api/driver/:driverId/route-details
 * Get full turn-by-turn route details (server fetches from OSRM)
 * Query: ?currentLat=14.5995&currentLng=120.9842
 * 
 * Returns complete route with:
 * - GeoJSON geometry for map drawing
 * - Turn-by-turn instructions for both legs
 * - Distance and duration for each leg
 * 
 * Use this if mobile can't call OSRM directly
 */
router.get('/:driverId/route-details', DriverController.getRouteDetails);

// ============================================
// LOCATION ROUTES
// ============================================

/**
 * GET /api/driver/:driverId/location
 * Get driver's current location from database
 */
router.get('/:driverId/location', DriverController.getCurrentLocation);

/**
 * POST /api/driver/:driverId/location
 * Update driver's current location (from mobile GPS)
 * Body: { latitude, longitude, speed?, heading?, accuracy? }
 * 
 * This is an alternative to the Arduino POST /api/location
 * Use this for mobile app location updates
 */
router.post('/:driverId/location', DriverController.updateLocation);

export default router;
