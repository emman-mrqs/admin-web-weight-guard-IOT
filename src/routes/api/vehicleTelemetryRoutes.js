import express from 'express';
import VehicleTelemetryController from '../../controller/api/vehicleTelemetryController.js';

const router = express.Router();

router.get('/esp32/health', async (req, res) => {
    return res.status(200).json({
        ok: true,
        message: 'ESP32 telemetry endpoint ready.'
    });
});

router.post('/esp32/telemetry', VehicleTelemetryController.ingestFromEsp32);
router.post('/mock/telemetry', VehicleTelemetryController.ingestMock);

export default router;
