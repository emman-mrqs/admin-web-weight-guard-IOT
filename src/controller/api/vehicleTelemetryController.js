import { ingestTelemetry } from '../../realtime/trackingIngestService.js';

const ESP32_SHARED_KEY = String(process.env.ESP32_SHARED_KEY || '').trim();

function hasValidDeviceKey(req) {
    if (!ESP32_SHARED_KEY) {
        return true;
    }

    const incoming = String(req.headers['x-esp32-key'] || '').trim();
    return incoming.length > 0 && incoming === ESP32_SHARED_KEY;
}

class VehicleTelemetryController {
    static async ingestFromEsp32(req, res) {
        try {
            if (!hasValidDeviceKey(req)) {
                return res.status(401).json({
                    error: 'Unauthorized device key.'
                });
            }

            const result = await ingestTelemetry(req.body, { source: 'esp32' });
            if (!result.ok) {
                return res.status(result.statusCode).json({
                    error: result.error,
                    fieldErrors: result.fieldErrors
                });
            }

            return res.status(200).json({
                message: 'Tracking data accepted.',
                stateUpdated: result.stateUpdated,
                movementMeters: result.movementMeters,
                headingDeltaDegrees: result.headingDeltaDegrees,
                speedDeltaKmh: result.speedDeltaKmh,
                weightDeltaKg: result.weightDeltaKg,
                data: result.data
            });
        } catch (error) {
            console.error('[VehicleTelemetryController] ingestFromEsp32 error:', error);
            return res.status(500).json({
                error: 'An error occurred while ingesting tracking data.'
            });
        }
    }

    static async ingestMock(req, res) {
        try {
            const result = await ingestTelemetry(req.body, { source: 'mock-script' });
            if (!result.ok) {
                return res.status(result.statusCode).json({
                    error: result.error,
                    fieldErrors: result.fieldErrors
                });
            }

            return res.status(200).json({
                message: 'Mock tracking data accepted.',
                stateUpdated: result.stateUpdated,
                data: result.data
            });
        } catch (error) {
            console.error('[VehicleTelemetryController] ingestMock error:', error);
            return res.status(500).json({
                error: 'An error occurred while ingesting mock tracking data.'
            });
        }
    }
}

export default VehicleTelemetryController;
