// src/routes/api/locationRoutes.js
import express from 'express';
import LocationController from '../../controller/api/locationController.js';

const router = express.Router();

// Arduino/ESP32 sends GPS data here
router.post('/location', LocationController.receiveLocation);

// Frontend fetches current driver locations (polling fallback)
router.get('/locations/active', LocationController.getActiveLocations);

// Get location history for a specific user
router.get('/locations/user/:userId', LocationController.getUserLocationHistory);

// Get route points for a specific assignment (for playback)
router.get('/locations/assignment/:assignmentId', LocationController.getAssignmentRoute);

export default router;
