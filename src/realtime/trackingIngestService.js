import db from '../database/db.js';
import { broadcastTrackingUpdate } from './trackingWebSocket.js';

function readThreshold(name, fallback) {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Default thresholds are tuned for visibly smooth map movement with mock ESP32 updates.
const MOVEMENT_THRESHOLD_METERS = readThreshold('TRACKING_MOVEMENT_THRESHOLD_METERS', 30);
const HEADING_THRESHOLD_DEGREES = readThreshold('TRACKING_HEADING_THRESHOLD_DEGREES', 10);
const SPEED_THRESHOLD_KMH = readThreshold('TRACKING_SPEED_THRESHOLD_KMH', 1);
const WEIGHT_THRESHOLD_KG = readThreshold('TRACKING_WEIGHT_THRESHOLD_KG', 0.5);

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

function headingDeltaDegrees(previousHeading, nextHeading) {
    if (previousHeading === null || nextHeading === null) {
        return null;
    }

    const rawDelta = Math.abs(nextHeading - previousHeading) % 360;
    return Math.min(rawDelta, 360 - rawDelta);
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
                    v.current_state,
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
                                SELECT id, LOWER(COALESCE(status, 'pending')) AS status
                FROM dispatch_tasks
                WHERE vehicle_id = $1
                  AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'in_transit')
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `,
            [vehicleId]
        );

        const taskId = activeTaskResult.rows[0]?.id ?? null;
        const dispatchTaskStatus = String(activeTaskResult.rows[0]?.status || 'unassigned').toLowerCase();
        const normalizedDispatchTaskStatus = ['pending', 'active', 'in_transit'].includes(dispatchTaskStatus)
            ? dispatchTaskStatus
            : 'unassigned';

        const previousLiveStateResult = await client.query(
            `
                SELECT
                    current_latitude,
                    current_longitude,
                    current_speed_kmh,
                    current_heading,
                    current_weight_kg
                FROM vehicle_live_state
                WHERE vehicle_id = $1
                LIMIT 1
            `,
            [vehicleId]
        );

        const previousState = previousLiveStateResult.rows[0] || null;
        const previousLatitude = toFiniteNumber(previousState?.current_latitude);
        const previousLongitude = toFiniteNumber(previousState?.current_longitude);
        const previousSpeedKmh = toFiniteNumber(previousState?.current_speed_kmh);
        const previousHeading = toFiniteNumber(previousState?.current_heading);
        const previousWeightKg = toFiniteNumber(previousState?.current_weight_kg);

        const movementMeters = previousLatitude !== null && previousLongitude !== null
            ? distanceMeters(previousLatitude, previousLongitude, latitude, longitude)
            : null;

        const speedDeltaKmh = previousSpeedKmh === null ? null : Math.abs(speedKmh - previousSpeedKmh);
        const headingDelta = headingDeltaDegrees(previousHeading, heading);
        const weightDeltaKg = previousWeightKg === null || currentWeightKg === null
            ? null
            : Math.abs(currentWeightKg - previousWeightKg);

        const shouldUpdateLocation = previousState === null
            || movementMeters === null
            || movementMeters >= MOVEMENT_THRESHOLD_METERS
            || (headingDelta !== null && headingDelta >= HEADING_THRESHOLD_DEGREES);
        const shouldUpdateSpeed = previousState === null
            || speedDeltaKmh === null
            || speedDeltaKmh >= SPEED_THRESHOLD_KMH;
        const shouldUpdateHeading = heading !== null && (
            previousState === null
            || previousHeading === null
            || headingDelta === null
            || headingDelta >= HEADING_THRESHOLD_DEGREES
        );
        const shouldUpdateWeight = currentWeightKg !== null && (
            previousState === null
            || previousWeightKg === null
            || weightDeltaKg === null
            || weightDeltaKg >= WEIGHT_THRESHOLD_KG
        );

        const shouldUpdateLiveState = shouldUpdateLocation || shouldUpdateSpeed || shouldUpdateHeading || shouldUpdateWeight;

        const nextLatitude = previousState === null || shouldUpdateLocation ? latitude : previousLatitude;
        const nextLongitude = previousState === null || shouldUpdateLocation ? longitude : previousLongitude;
        const nextSpeedKmh = Math.round(speedKmh);
        const nextHeading = heading === null
            ? (previousHeading === null ? null : Math.round(previousHeading))
            : Math.round(heading);
        const nextWeightKg = currentWeightKg !== null
            ? currentWeightKg
            : previousWeightKg;

        const maxCapacity = toFiniteNumber(vehicle.max_capacity_kg);

        const nextLoadStatus = nextWeightKg !== null && maxCapacity !== null && nextWeightKg > maxCapacity
            ? 'overload'
            : (vehicle.current_load_status || 'normal');

        const nextCurrentState = speedKmh > 0 || (movementMeters !== null && movementMeters >= MOVEMENT_THRESHOLD_METERS)
            ? 'in_transit'
            : 'idle';

        if (shouldUpdateLiveState) {
            await client.query(
                `
                    INSERT INTO vehicle_live_state (
                        vehicle_id,
                        current_latitude,
                        current_longitude,
                        current_speed_kmh,
                        current_heading,
                        current_weight_kg,
                        last_ping_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (vehicle_id)
                    DO UPDATE SET
                        current_latitude = EXCLUDED.current_latitude,
                        current_longitude = EXCLUDED.current_longitude,
                        current_speed_kmh = EXCLUDED.current_speed_kmh,
                        current_heading = EXCLUDED.current_heading,
                        current_weight_kg = EXCLUDED.current_weight_kg,
                        last_ping_at = NOW()
                `,
                [vehicleId, nextLatitude, nextLongitude, nextSpeedKmh, nextHeading, nextWeightKg]
            );

            await client.query(
                `
                    UPDATE vehicles
                    SET
                        current_state = $2,
                        current_load_status = $3
                    WHERE id = $1
                `,
                [vehicleId, nextCurrentState, nextLoadStatus]
            );
        }

        await client.query('COMMIT');

        const resolvedLatitude = shouldUpdateLiveState ? nextLatitude : previousLatitude;
        const resolvedLongitude = shouldUpdateLiveState ? nextLongitude : previousLongitude;
        const resolvedSpeedKmh = shouldUpdateLiveState ? nextSpeedKmh : (previousSpeedKmh ?? 0);
        const resolvedHeading = shouldUpdateLiveState ? nextHeading : previousHeading;
        const resolvedWeightKg = shouldUpdateLiveState ? nextWeightKg : previousWeightKg;
        const resolvedCurrentState = shouldUpdateLiveState ? nextCurrentState : String(vehicle.current_state || 'idle');
        const resolvedLoadStatus = shouldUpdateLiveState ? nextLoadStatus : String(vehicle.current_load_status || 'normal');

        const updatePayload = {
            type: 'tracking:update',
            source,
            timestamp: new Date().toISOString(),
            data: {
                vehicleId,
                plateNumber: String(vehicle.plate_number || `V-${vehicleId}`),
                driverName: String(vehicle.driver_name || 'Unassigned'),
                vehicleType: String(vehicle.vehicle_type || 'Vehicle'),
                status: normalizedDispatchTaskStatus,
                currentState: String(resolvedLoadStatus || 'normal').toLowerCase(),
                movementState: String(resolvedCurrentState || 'idle').toLowerCase(),
                latitude: resolvedLatitude,
                longitude: resolvedLongitude,
                speedKmh: resolvedSpeedKmh,
                heading: resolvedHeading,
                currentWeightKg: resolvedWeightKg,
                stateUpdated: shouldUpdateLiveState
            }
        };

        if (shouldUpdateLiveState) {
            broadcastTrackingUpdate(updatePayload);
        }

        return {
            ok: true,
            statusCode: 200,
            data: updatePayload.data,
            stateUpdated: shouldUpdateLiveState,
            movementMeters: movementMeters === null ? null : Number(movementMeters.toFixed(2)),
            headingDeltaDegrees: headingDelta === null ? null : Number(headingDelta.toFixed(2)),
            speedDeltaKmh: speedDeltaKmh === null ? null : Number(speedDeltaKmh.toFixed(2)),
            weightDeltaKg: weightDeltaKg === null ? null : Number(weightDeltaKg.toFixed(2))
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
