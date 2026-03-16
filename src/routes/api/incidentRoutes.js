// src/routes/api/incidentRoutes.js
// API Routes for weight readings and incident detection from Arduino devices
import express from 'express';
import IncidentApiController from '../../controller/api/incidentController.js';

const router = express.Router();

/**
 * Weight & Incident API Routes
 * Base path: /api
 * 
 * These endpoints receive data from Arduino devices
 */

// ============================================
// WEIGHT READING ROUTES (Arduino → Server)
// ============================================

/**
 * POST /api/weight
 * Receive weight reading from Arduino scale sensor
 * Auto-detects cargo loss and creates incident if threshold exceeded
 * 
 * Body: { userId, assignmentId, weight_kg, latitude, longitude, apiKey }
 */
router.post('/weight', IncidentApiController.receiveWeightReading);

/**
 * POST /api/cargo-manifest
 * Record initial cargo weight at pickup point
 * Auto-detects overload if weight exceeds max_allowed_kg
 * 
 * Body: { assignmentId, initial_weight_kg, cargo_description?, item_count?, 
 *         weight_per_item_kg?, max_allowed_kg?, latitude?, longitude?, apiKey }
 */
router.post('/cargo-manifest', IncidentApiController.createCargoManifest);

/**
 * GET /api/weight-readings/:assignmentId
 * Get weight history timeline for an assignment
 */
router.get('/weight-readings/:assignmentId', IncidentApiController.getWeightReadings);

export default router;
