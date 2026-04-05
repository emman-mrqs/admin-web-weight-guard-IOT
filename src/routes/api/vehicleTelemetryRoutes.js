import express from 'express';
import VehicleTelemetryController from '../../controller/api/vehicleTelemetryController.js';

const router = express.Router();

router.get('/esp32/health', async (req, res) => {
    return res.status(200).json({
        ok: true,
        message: 'ESP32 tracking endpoint ready.',
        websocket: '/ws/tracking'
    });
});

// Preferred tracking endpoints
router.post('/esp32/tracking', VehicleTelemetryController.ingestFromEsp32);
router.post('/mock/tracking', VehicleTelemetryController.ingestMock);

// Backward-compatible aliases
router.post('/esp32/telemetry', VehicleTelemetryController.ingestFromEsp32);
router.post('/mock/telemetry', VehicleTelemetryController.ingestMock);

export default router;
