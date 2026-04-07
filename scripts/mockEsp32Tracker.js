import db from '../src/database/db.js';

const baseUrl = process.env.MOCK_TRACKING_BASE_URL || 'http://localhost:3000';
const vehicleId = Number(process.env.MOCK_VEHICLE_ID || 1);
const intervalMs = Number(process.env.MOCK_TRACKING_INTERVAL_MS || 300);
const stepMeters = Number(process.env.MOCK_ROUTE_STEP_METERS || 20);
const weightStartKg = Number(process.env.MOCK_START_WEIGHT_KG || 920);
const routeServiceUrl = process.env.MOCK_ROUTE_SERVICE_URL || 'https://router.project-osrm.org/route/v1/driving';
const explicitStartLat = Number(process.env.MOCK_START_LAT);
const explicitStartLng = Number(process.env.MOCK_START_LNG);
const trackOffsetMeters = Number(process.env.MOCK_TRACK_OFFSET_METERS || 0);
const detourMeters = Number(process.env.MOCK_ROUTE_DETOUR_METERS || 0);
const detourRatio = Number(process.env.MOCK_ROUTE_DETOUR_RATIO || 0.55);
const detourMode = String(process.env.MOCK_ROUTE_DETOUR_MODE || 'routed').trim().toLowerCase();
const pickupGatePollMs = Number(process.env.MOCK_PICKUP_GATE_POLL_MS || 1000);
const pickupGateTimeoutMs = Number(process.env.MOCK_PICKUP_GATE_TIMEOUT_MS || 0);
const stagedWeightProfileEnabled = String(process.env.MOCK_STAGED_WEIGHT_PROFILE || 'true').trim().toLowerCase() !== 'false';

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function degToRad(value) {
    return (value * Math.PI) / 180;
}

function radToDeg(value) {
    return (value * 180) / Math.PI;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distanceMeters(from, to) {
    const earthRadius = 6371000;
    const dLat = degToRad(to.lat - from.lat);
    const dLng = degToRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(degToRad(from.lat))
        * Math.cos(degToRad(to.lat))
        * Math.sin(dLng / 2)
        * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
}

function headingDegrees(from, to) {
    const fromLat = degToRad(from.lat);
    const toLat = degToRad(to.lat);
    const dLng = degToRad(to.lng - from.lng);

    const y = Math.sin(dLng) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat)
        - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);

    const bearing = radToDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function offsetPointByBearing(point, distanceMeters, bearingDegrees) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(distanceMeters)) {
        return point;
    }

    const earthRadius = 6371000;
    const angularDistance = distanceMeters / earthRadius;
    const bearing = degToRad(bearingDegrees);
    const sourceLat = degToRad(lat);
    const sourceLng = degToRad(lng);

    const nextLat = Math.asin(
        Math.sin(sourceLat) * Math.cos(angularDistance)
        + Math.cos(sourceLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const nextLng = sourceLng + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(sourceLat),
        Math.cos(angularDistance) - Math.sin(sourceLat) * Math.sin(nextLat)
    );

    return {
        lat: radToDeg(nextLat),
        lng: radToDeg(nextLng)
    };
}

function interpolatePoint(from, to, ratio) {
    return {
        lat: from.lat + ((to.lat - from.lat) * ratio),
        lng: from.lng + ((to.lng - from.lng) * ratio)
    };
}

function buildDenseRoute(route, targetStepMeters) {
    if (!Array.isArray(route) || route.length < 2) {
        return Array.isArray(route) ? route : [];
    }

    const safeStep = Number.isFinite(targetStepMeters) && targetStepMeters > 0
        ? targetStepMeters
        : 20;

    const dense = [route[0]];

    for (let i = 0; i < route.length - 1; i += 1) {
        const from = route[i];
        const to = route[i + 1];
        const segmentDistance = distanceMeters(from, to);
        const segmentSteps = Math.max(1, Math.ceil(segmentDistance / safeStep));

        for (let step = 1; step <= segmentSteps; step += 1) {
            const ratio = step / segmentSteps;
            dense.push(interpolatePoint(from, to, ratio));
        }
    }

    return dense;
}

function offsetPointByMeters(point, northMeters, eastMeters) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return point;
    }

    const latOffset = northMeters / 111320;
    const lngOffset = eastMeters / (111320 * Math.cos((lat * Math.PI) / 180));

    return {
        lat: lat + latOffset,
        lng: lng + lngOffset
    };
}

function dedupeRoutePoints(route, minDistanceMeters = 0.8) {
    if (!Array.isArray(route) || route.length === 0) {
        return [];
    }

    const cleaned = [route[0]];
    for (let i = 1; i < route.length; i += 1) {
        const prev = cleaned[cleaned.length - 1];
        const current = route[i];
        if (distanceMeters(prev, current) < minDistanceMeters) {
            continue;
        }
        cleaned.push(current);
    }

    return cleaned;
}

function resolveStartPoint(pickupPoint) {
    if (Number.isFinite(explicitStartLat) && Number.isFinite(explicitStartLng)) {
        return {
            lat: explicitStartLat,
            lng: explicitStartLng
        };
    }

    // Default start offset so the mock run approaches pickup from another point.
    return {
        lat: pickupPoint.lat + 0.0032,
        lng: pickupPoint.lng - 0.0041
    };
}

function mergeRouteSegments(...segments) {
    const merged = [];

    segments.forEach((segment) => {
        if (!Array.isArray(segment) || segment.length === 0) {
            return;
        }

        segment.forEach((point, index) => {
            if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
                return;
            }

            if (merged.length === 0) {
                merged.push(point);
                return;
            }

            const last = merged[merged.length - 1];
            const isDuplicate = distanceMeters(last, point) < 0.8;

            if (index === 0 && isDuplicate) {
                return;
            }

            merged.push(point);
        });
    });

    return merged;
}

async function resolveRouteSegment(fromPoint, toPoint) {
    try {
        return await fetchRouteGeometry(fromPoint, toPoint);
    } catch (error) {
        console.warn('[MockESP32] Falling back to direct interpolation segment:', error.message);
        return [fromPoint, toPoint];
    }
}

async function injectDetourIfRequested(route) {
    if (!Number.isFinite(detourMeters) || detourMeters <= 0 || !Array.isArray(route) || route.length < 3) {
        return route;
    }

    const safeRatio = clamp(Number.isFinite(detourRatio) ? detourRatio : 0.55, 0.15, 0.85);
    const anchorIndex = clamp(Math.round((route.length - 1) * safeRatio), 1, route.length - 2);
    const anchorPoint = route[anchorIndex];
    const nextPoint = route[anchorIndex + 1];

    if (!anchorPoint || !nextPoint) {
        return route;
    }

    const routeHeading = headingDegrees(anchorPoint, nextPoint);
    const detourWaypoint = offsetPointByBearing(anchorPoint, detourMeters, routeHeading + 90);

    let detourOut;
    let detourBack;

    if (detourMode === 'direct') {
        // Direct mode guarantees a visible off-route jump for reroute testing.
        detourOut = [anchorPoint, detourWaypoint];
        detourBack = [detourWaypoint, nextPoint];
    } else {
        detourOut = await resolveRouteSegment(anchorPoint, detourWaypoint);
        detourBack = await resolveRouteSegment(detourWaypoint, nextPoint);
    }

    console.log(`[MockESP32] Detour enabled: ${Math.round(detourMeters)}m at ${Math.round(safeRatio * 100)}% of the route (mode: ${detourMode === 'direct' ? 'direct' : 'routed'}).`);

    return mergeRouteSegments(
        route.slice(0, anchorIndex + 1),
        detourOut.slice(1),
        detourBack.slice(1),
        route.slice(anchorIndex + 2)
    );
}

async function loadActiveTaskForVehicle(targetVehicleId) {
    const result = await db.query(
        `
            SELECT
                dt.id AS task_id,
                dt.pickup_lat,
                dt.pickup_lng,
                dt.destination_lat,
                dt.destination_lng,
                dt.initial_reference_weight_kg,
                dt.status,
                v.plate_number,
                v.vehicle_type,
                v.max_capacity_kg
            FROM dispatch_tasks dt
            INNER JOIN vehicles v ON v.id = dt.vehicle_id
            WHERE dt.vehicle_id = $1
              AND LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
            ORDER BY
                CASE LOWER(COALESCE(dt.status, ''))
                    WHEN 'active' THEN 0
                    WHEN 'in_transit' THEN 1
                    WHEN 'pending' THEN 2
                    ELSE 3
                END,
                dt.created_at DESC,
                dt.id DESC
            LIMIT 1
        `,
        [targetVehicleId]
    );

    return result.rows[0] || null;
}

function hasInitialReferenceWeight(task) {
    const value = Number(task?.initial_reference_weight_kg);
    return Number.isFinite(value) && value > 0;
}

function isPickupGateReady(task) {
    return hasInitialReferenceWeight(task);
}

function buildDispatchWeightProfile(task) {
    const initialReferenceWeightKg = Number(task?.initial_reference_weight_kg);
    const maxCapacityKg = Number(task?.max_capacity_kg);

    const safeInitialRef = Number.isFinite(initialReferenceWeightKg) && initialReferenceWeightKg > 0
        ? initialReferenceWeightKg
        : Math.max(1, weightStartKg);

    const overloadKg = Number.isFinite(maxCapacityKg) && maxCapacityKg > 0
        ? Math.max(maxCapacityKg + 35, safeInitialRef + 20)
        : Math.max(safeInitialRef * 1.2, safeInitialRef + 20);

    let aboveReferenceKg;
    if (Number.isFinite(maxCapacityKg) && maxCapacityKg > safeInitialRef) {
        aboveReferenceKg = Math.min(maxCapacityKg - 5, safeInitialRef + Math.max(10, safeInitialRef * 0.06));
    } else {
        aboveReferenceKg = safeInitialRef + Math.max(10, safeInitialRef * 0.06);
    }

    aboveReferenceKg = Math.max(safeInitialRef + 1, Math.min(aboveReferenceKg, overloadKg - 1));

    const lossKg = Math.max(0, Math.min(safeInitialRef * 0.85, safeInitialRef - 10));

    return {
        initialReferenceWeightKg: safeInitialRef,
        overloadKg,
        aboveReferenceKg,
        lossKg
    };
}

function resolveStagedWeightKg(index, totalPoints, profile) {
    if (!profile || totalPoints <= 0) {
        return Math.max(0, weightStartKg);
    }

    const progress = totalPoints <= 1 ? 1 : (index / (totalPoints - 1));

    if (progress < 0.34) {
        return profile.overloadKg;
    }

    if (progress < 0.67) {
        return profile.aboveReferenceKg;
    }

    return profile.lossKg;
}

async function waitForPickupGate(targetVehicleId, taskId) {
    let activeTaskId = Number(taskId);
    const startedAt = Date.now();

    while (true) {
        const latestTask = await loadActiveTaskForVehicle(targetVehicleId);

        if (!latestTask) {
            throw new Error(`No active dispatch task found while waiting at pickup for vehicle ${targetVehicleId}.`);
        }

        if (Number(latestTask.task_id) !== activeTaskId) {
            console.log(`[MockESP32] Active task changed from #${activeTaskId} to #${latestTask.task_id}. Switching pickup gate tracking to the latest task.`);
            activeTaskId = Number(latestTask.task_id);
        }

        if (isPickupGateReady(latestTask)) {
            console.log(`[MockESP32] Pickup gate cleared for task #${latestTask.task_id}. Initial reference weight is already set. Continuing to destination.`);
            return latestTask;
        }

        const latestStatus = String(latestTask.status || 'pending').toLowerCase();
        const latestInitialWeight = Number(latestTask.initial_reference_weight_kg);
        const weightText = Number.isFinite(latestInitialWeight)
            ? latestInitialWeight.toFixed(2)
            : 'not set';
        const waitSeconds = Math.max(1, Math.round(pickupGatePollMs / 1000));
        console.log(`[MockESP32] Holding at pickup for task #${activeTaskId}: waiting for initial_reference_weight_kg>0 (current status=${latestStatus}, weight=${weightText}). Rechecking in ${waitSeconds}s...`);

        if (pickupGateTimeoutMs > 0 && (Date.now() - startedAt) >= pickupGateTimeoutMs) {
            throw new Error(`Pickup gate timeout reached (${pickupGateTimeoutMs} ms) for task #${activeTaskId}.`);
        }

        await wait(Math.max(500, pickupGatePollMs));
    }
}

async function publishRoute(routePoints, phaseLabel, options = {}) {
    if (!Array.isArray(routePoints) || routePoints.length === 0) {
        return;
    }

    console.log(`[MockESP32] ${phaseLabel}: ${routePoints.length} points.`);

    for (let index = 0; index < routePoints.length; index += 1) {
        const point = routePoints[index];
        const nextPoint = index + 1 < routePoints.length ? routePoints[index + 1] : null;
        const resolvedWeightKg = Number.isFinite(options.fixedWeightKg)
            ? Number(options.fixedWeightKg)
            : (options.weightProfile
                ? resolveStagedWeightKg(index, routePoints.length, options.weightProfile)
                : Math.max(0, weightStartKg));

        await publishPoint(index, routePoints.length, point, nextPoint, resolvedWeightKg);
        await wait(intervalMs);
    }
}

async function fetchRouteGeometry(pickup, destination) {
    const url = `${routeServiceUrl}/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Route service failed (${response.status})`);
    }

    const payload = await response.json();
    const coordinates = payload?.routes?.[0]?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('Route service returned no usable coordinates.');
    }

    return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

async function publishPoint(index, totalPoints, point, nextPoint, currentWeightKg) {
    const speedKmh = index >= totalPoints - 1 ? 0 : 34;
    const heading = nextPoint ? headingDegrees(point, nextPoint) : 0;

    const payload = {
        vehicleId,
        latitude: point.lat,
        longitude: point.lng,
        speedKmh,
        heading,
        currentWeightKg
    };

    const response = await fetch(`${baseUrl}/api/realtime/mock/tracking`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(`Mock publish failed: ${response.status} ${JSON.stringify(result)}`);
    }

    console.log(`[MockESP32] Point ${index + 1}/${totalPoints} sent:`, result.data);
}

async function run() {
    let activeTask = await loadActiveTaskForVehicle(vehicleId);

    if (!activeTask) {
        throw new Error(`No active dispatch task found for vehicle ${vehicleId}.`);
    }

    const pickup = {
        lat: Number(activeTask.pickup_lat),
        lng: Number(activeTask.pickup_lng)
    };

    const destination = {
        lat: Number(activeTask.destination_lat),
        lng: Number(activeTask.destination_lng)
    };

    if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng) || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
        throw new Error(`Active task ${activeTask.task_id} is missing pickup/destination coordinates.`);
    }

    // Keep simulated path slightly off the exact task points to mimic real road offset and avoid static overlap.
    const simulatedPickup = offsetPointByMeters(pickup, -trackOffsetMeters, trackOffsetMeters * 0.35);
    let simulatedDestination = offsetPointByMeters(destination, trackOffsetMeters * 0.45, -trackOffsetMeters * 0.25);

    const startPoint = resolveStartPoint(simulatedPickup);
    const approachSegment = await resolveRouteSegment(startPoint, simulatedPickup);
    const pickupRoute = dedupeRoutePoints(buildDenseRoute(approachSegment, stepMeters));

    console.log(`[MockESP32] Starting route simulation for task #${activeTask.task_id}: ${String(activeTask.plate_number || `V-${vehicleId}`)} (${String(activeTask.vehicle_type || 'Vehicle')})`);
    console.log(`[MockESP32] Target vehicle ID: ${vehicleId}`);
    console.log(`[MockESP32] Task status: ${String(activeTask.status || 'pending')}`);
    console.log(`[MockESP32] Initial reference weight: ${activeTask.initial_reference_weight_kg == null ? 'not set' : `${Number(activeTask.initial_reference_weight_kg).toFixed(2)} kg`}`);
    console.log(`[MockESP32] Track offset: ${trackOffsetMeters}m`);
    console.log(`[MockESP32] Start: ${startPoint.lat.toFixed(8)}, ${startPoint.lng.toFixed(8)}`);
    console.log(`[MockESP32] Pickup (task): ${pickup.lat.toFixed(8)}, ${pickup.lng.toFixed(8)}`);
    console.log(`[MockESP32] Pickup (sim): ${simulatedPickup.lat.toFixed(8)}, ${simulatedPickup.lng.toFixed(8)}`);
    console.log(`[MockESP32] Interval: ${intervalMs}ms`);

    const pickupInitialReferenceWeightKg = Number(activeTask.initial_reference_weight_kg);
    const pickupPhaseWeightKg = Number.isFinite(pickupInitialReferenceWeightKg) && pickupInitialReferenceWeightKg > 0
        ? pickupInitialReferenceWeightKg
        : Math.max(0, weightStartKg);

    await publishRoute(pickupRoute, 'Phase 1/2 -> moving to pickup', {
        fixedWeightKg: pickupPhaseWeightKg
    });

    const latestTaskAtPickup = await loadActiveTaskForVehicle(vehicleId);
    if (!latestTaskAtPickup) {
        throw new Error(`No active dispatch task found after reaching pickup for vehicle ${vehicleId}.`);
    }
    activeTask = latestTaskAtPickup;

    console.log(`[MockESP32] At pickup check -> task #${activeTask.task_id}, status=${String(activeTask.status || 'pending')}, initial_reference_weight_kg=${activeTask.initial_reference_weight_kg == null ? 'not set' : Number(activeTask.initial_reference_weight_kg).toFixed(2)}`);

    activeTask = await waitForPickupGate(vehicleId, activeTask.task_id);

    const refreshedDestination = {
        lat: Number(activeTask.destination_lat),
        lng: Number(activeTask.destination_lng)
    };

    if (!Number.isFinite(refreshedDestination.lat) || !Number.isFinite(refreshedDestination.lng)) {
        throw new Error(`Task #${activeTask.task_id} has invalid destination after pickup gate check.`);
    }

    simulatedDestination = offsetPointByMeters(refreshedDestination, trackOffsetMeters * 0.45, -trackOffsetMeters * 0.25);
    console.log(`[MockESP32] Destination (task): ${refreshedDestination.lat.toFixed(8)}, ${refreshedDestination.lng.toFixed(8)}`);
    console.log(`[MockESP32] Destination (sim): ${simulatedDestination.lat.toFixed(8)}, ${simulatedDestination.lng.toFixed(8)}`);

    const stagedWeightProfile = buildDispatchWeightProfile(activeTask);
    if (stagedWeightProfileEnabled) {
        console.log('[MockESP32] Staged weight profile enabled (3 levels):');
        console.log(`  - overload: ${stagedWeightProfile.overloadKg.toFixed(2)} kg`);
        console.log(`  - above_reference: ${stagedWeightProfile.aboveReferenceKg.toFixed(2)} kg`);
        console.log(`  - loss: ${stagedWeightProfile.lossKg.toFixed(2)} kg`);
    }

    const taskSegment = await resolveRouteSegment(simulatedPickup, simulatedDestination);
    const destinationRouteBase = mergeRouteSegments([simulatedPickup], taskSegment);
    const destinationRouteWithDetour = await injectDetourIfRequested(destinationRouteBase);
    const destinationRoute = dedupeRoutePoints(buildDenseRoute(destinationRouteWithDetour, stepMeters));

    console.log(`[MockESP32] Detour: ${Number.isFinite(detourMeters) && detourMeters > 0 ? `${Math.round(detourMeters)}m (${detourMode === 'direct' ? 'direct' : 'routed'})` : 'disabled'}`);
    await publishRoute(destinationRoute, 'Phase 2/2 -> moving to destination', stagedWeightProfileEnabled
        ? { weightProfile: stagedWeightProfile }
        : { fixedWeightKg: Math.max(0, weightStartKg) });

    console.log('[MockESP32] Route simulation complete.');
}

run().catch((error) => {
    console.error('[MockESP32] Failed:', error.message);
    process.exit(1);
});
