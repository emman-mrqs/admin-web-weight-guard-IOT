import db from '../database/db.js';
import { broadcastTrackingUpdate } from './trackingWebSocket.js';

const MOVEMENT_THRESHOLD_METERS = 500;

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function degToRad(value) {
    return (value * Math.PI) / 180;
}

function distanceMeters(aLat, aLng, bLat, bLng) {
    const earthRadius = 6371000;
    const dLat = degToRad(bLat - aLat);
    const dLng = degToRad(bLng - aLng);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);

    const h = (sinLat * sinLat)
        + Math.cos(degToRad(aLat))
        * Math.cos(degToRad(bLat))
        * (sinLng * sinLng);

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return earthRadius * c;
}

export async function ingestTelemetry(inputPayload = {}, options = {}) {
    const source = String(options.source || 'esp32').trim().toLowerCase();

    const vehicleId = Number(inputPayload.vehicleId);
    const latitude = toFiniteNumber(inputPayload.latitude ?? inputPayload.lat);
    const longitude = toFiniteNumber(inputPayload.longitude ?? inputPayload.lng);
    const speedKmh = toFiniteNumber(inputPayload.speedKmh) ?? 0;
    const heading = toFiniteNumber(inputPayload.heading);
    const currentWeightKg = toFiniteNumber(inputPayload.currentWeightKg);

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Validation failed.',
            fieldErrors: {
                vehicleId: 'vehicleId must be a positive integer.'
            }
        };
    }

    if (latitude === null || latitude < -90 || latitude > 90) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Validation failed.',
            fieldErrors: {
                latitude: 'latitude must be a valid number between -90 and 90.'
            }
        };
    }

    if (longitude === null || longitude < -180 || longitude > 180) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Validation failed.',
            fieldErrors: {
                longitude: 'longitude must be a valid number between -180 and 180.'
            }
        };
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `
                SELECT
                    v.id,
                    v.plate_number,
                    v.vehicle_type,
                    v.max_capacity_kg,
                    v.current_load_status,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), 'Unassigned') AS driver_name
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.assigned_driver_id
                WHERE v.id = $1
                LIMIT 1
            `,
            [vehicleId]
        );

        if (vehicleResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                ok: false,
                statusCode: 404,
                error: 'Vehicle not found.'
            };
        }

        const vehicle = vehicleResult.rows[0];

        const activeTaskResult = await client.query(
            `
                SELECT id
                FROM dispatch_tasks
                WHERE vehicle_id = $1
                  AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'in_transit')
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `,
            [vehicleId]
        );

        const taskId = activeTaskResult.rows[0]?.id ?? null;

        const previousLogResult = await client.query(
            `
                SELECT latitude, longitude, current_weight_kg
                FROM telemetry_logs
                WHERE vehicle_id = $1
                ORDER BY recorded_at DESC, id DESC
                LIMIT 1
            `,
            [vehicleId]
        );

        await client.query(
            `
                INSERT INTO vehicle_live_state (
                    vehicle_id,
                    current_latitude,
                    current_longitude,
                    current_speed_kmh,
                    current_heading,
                    last_ping_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (vehicle_id)
                DO UPDATE SET
                    current_latitude = EXCLUDED.current_latitude,
                    current_longitude = EXCLUDED.current_longitude,
                    current_speed_kmh = EXCLUDED.current_speed_kmh,
                    current_heading = EXCLUDED.current_heading,
                    last_ping_at = NOW()
            `,
            [vehicleId, latitude, longitude, Math.round(speedKmh), heading === null ? null : Math.round(heading)]
        );

        const maxCapacity = toFiniteNumber(vehicle.max_capacity_kg);
        const nextLoadStatus = currentWeightKg !== null && maxCapacity !== null && currentWeightKg > maxCapacity
            ? 'overload'
            : (vehicle.current_load_status || 'normal');

        await client.query(
            `
                UPDATE vehicles
                SET
                    current_state = $2,
                    current_load_status = $3
                WHERE id = $1
            `,
            [vehicleId, speedKmh > 0 ? 'in_transit' : 'idle', nextLoadStatus]
        );

        const previous = previousLogResult.rows[0];
        const previousWeight = previous ? toFiniteNumber(previous.current_weight_kg) : null;
        const movedMeters = previous
            ? distanceMeters(
                Number(previous.latitude),
                Number(previous.longitude),
                latitude,
                longitude
            )
            : null;

        const weightDropKg = (previousWeight !== null && currentWeightKg !== null)
            ? previousWeight - currentWeightKg
            : 0;

        const shouldInsertTelemetry = !previous
            || (movedMeters !== null && movedMeters >= MOVEMENT_THRESHOLD_METERS)
            || weightDropKg > 0;

        if (shouldInsertTelemetry) {
            await client.query(
                `
                    INSERT INTO telemetry_logs (
                        vehicle_id,
                        task_id,
                        latitude,
                        longitude,
                        speed_kmh,
                        current_weight_kg,
                        recorded_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `,
                [vehicleId, taskId, latitude, longitude, Math.round(speedKmh), currentWeightKg]
            );
        }

        await client.query('COMMIT');

        const updatePayload = {
            type: 'tracking:update',
            source,
            timestamp: new Date().toISOString(),
            data: {
                vehicleId,
                plateNumber: String(vehicle.plate_number || `V-${vehicleId}`),
                driverName: String(vehicle.driver_name || 'Unassigned'),
                vehicleType: String(vehicle.vehicle_type || 'Vehicle'),
                status: String(nextLoadStatus || 'normal').toLowerCase() === 'overload' ? 'overload' : 'in_transit',
                latitude,
                longitude,
                speedKmh: Math.round(speedKmh),
                currentWeightKg,
                telemetryPersisted: shouldInsertTelemetry
            }
        };

        broadcastTrackingUpdate(updatePayload);

        return {
            ok: true,
            statusCode: 200,
            data: updatePayload.data,
            telemetryPersisted: shouldInsertTelemetry,
            movementMeters: movedMeters === null ? null : Number(movedMeters.toFixed(2)),
            weightDropKg: Number(weightDropKg.toFixed(2))
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
