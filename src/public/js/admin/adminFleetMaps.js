/* ==========================================================================
   LIVE COMMAND CENTER MAP LOGIC
   ========================================================================== */

let map;
let markerGroup;
let zoneLayerGroup;
let isDarkMap = true;
let showZones = false;
let wsClient = null;
let reconnectTimer = null;
let liveVehicles = [];
let activePopupVehicleId = null;
let isRefreshingMarkers = false;
let currentRouteControl = null;
let routeMarkerGroup = null;
let routeProgressLayerGroup = null;
let assignedTaskOptions = [];
const assignedTaskOptionsCache = new Map();
const vehicleMarkerRegistry = new Map();
let activeNavigationTask = null;
let activeNavigationRouteCoordinates = [];
let activeNavigationDestination = null;
let lastNavigationRerouteAt = 0;
let activeNavigationRerouteCount = 0;
let activeNavigationLastDeviationMeters = null;

const taskStatusLabels = {
    active: 'Active',
    in_transit: 'In Transit',
    pending: 'Pending'
};

const DEFAULT_CENTER = [14.7298, 121.1423];
const OSRM_SERVICE_URL = 'https://router.project-osrm.org/route/v1';
const MARKER_ANIMATION_MIN_MS = 450;
const MARKER_ANIMATION_MAX_MS = 1400;
const MARKER_ANIMATION_MS_PER_METER = 18;
const MARKER_MIN_JITTER_METERS = 0.9;
const ROUTE_DONE_COLOR = '#10b981';
const ROUTE_REMAINING_COLOR = '#22d3ee';
const DESTINATION_REACHED_THRESHOLD_METERS = 20;
const ROUTE_SNAP_THRESHOLD_METERS = 45;
const ROUTE_REROUTE_THRESHOLD_METERS = 120;
const ROUTE_REROUTE_COOLDOWN_MS = 15000;
const ENABLE_ROUTE_SNAP = false;

const pickupPointIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const destinationPointIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Define Base Layers
const darkTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const satTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const satLabelTileUrl = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';

const MAP_MAX_ZOOM = 22;
const BASE_LAYER_MAX_NATIVE_ZOOM = 19;
const LABEL_LAYER_MAX_NATIVE_ZOOM = 20;

const darkLayer = L.tileLayer(darkTileUrl, {
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: BASE_LAYER_MAX_NATIVE_ZOOM,
    subdomains: 'abcd'
});
const satLayer = L.tileLayer(satTileUrl, {
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: BASE_LAYER_MAX_NATIVE_ZOOM
});
const satLabelLayer = L.tileLayer(satLabelTileUrl, {
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: LABEL_LAYER_MAX_NATIVE_ZOOM,
    subdomains: 'abcd',
    opacity: 0.9
});

const DEFAULT_VEHICLE_IMAGE = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80';

document.addEventListener('DOMContentLoaded', async () => {

    // 1. INITIALIZE MAP (Centered on Rodriguez, Rizal)
    map = L.map('live-fleet-map', {
        zoomControl: false, 
        attributionControl: false,
        maxZoom: MAP_MAX_ZOOM
    }).setView(DEFAULT_CENTER, 14);

    // Add dark map default
    darkLayer.addTo(map);

    // Groups for filtering
    markerGroup = L.layerGroup().addTo(map);
    zoneLayerGroup = L.layerGroup();
    if (showZones) {
        zoneLayerGroup.addTo(map);
    }
    routeMarkerGroup = L.layerGroup().addTo(map);
    routeProgressLayerGroup = L.layerGroup().addTo(map);

    // Render initial overlays
    drawZones();

    // 2. EVENT LISTENERS
    document.getElementById('btnMapStyle').addEventListener('click', () => toggleMapStyle('dark'));
    document.getElementById('btnSatStyle').addEventListener('click', () => toggleMapStyle('sat'));

    // Filter Listeners
    document.getElementById('truckClassFilter').addEventListener('change', handleTruckClassChange);
    document.getElementById('assignedTaskFilter').addEventListener('change', handleAssignedTaskChange);
    document.getElementById('vehicleSearch').addEventListener('input', applyFilters);

    await loadLiveFleetBootstrap();
    connectTrackingWebSocket();
    await handleTruckClassChange();
});

function toRelativeTime(value) {
    if (!value) {
        return 'Just now';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Just now';
    }

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 5000) {
        return 'Just now';
    }

    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) {
        return 'A few seconds ago';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours} hr ago`;
}

function asVehicleViewModel(row) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const speedKmh = Number(row.speedKmh ?? 0);
    const status = String(row.status || 'in_transit').toLowerCase();

    return {
        vehicleId: Number(row.vehicleId),
        id: String(row.plateNumber || `V-${row.vehicleId}`),
        driver: String(row.driverName || 'Unassigned'),
        type: String(row.vehicleType || 'Vehicle'),
        pos: [lat, lng],
        status,
        speed: `${speedKmh} km/h`,
        load: row.currentWeightKg == null ? '--' : `${Number(row.currentWeightKg).toFixed(1)} kg`,
        location: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        updated: toRelativeTime(row.lastPingAt || row.timestamp),
        image: DEFAULT_VEHICLE_IMAGE
    };
}

function upsertVehicle(row) {
    if (!row || row.latitude == null || row.longitude == null) {
        return;
    }

    const normalized = asVehicleViewModel(row);
    const existingIndex = liveVehicles.findIndex((item) => item.vehicleId === normalized.vehicleId);

    if (existingIndex >= 0) {
        liveVehicles[existingIndex] = normalized;
    } else {
        liveVehicles.push(normalized);
    }

}

function getTruckClassFilterValue() {
    return document.getElementById('truckClassFilter')?.value || '';
}

function getAssignedTaskFilterValue() {
    return document.getElementById('assignedTaskFilter')?.value || '';
}

function renderTaskDetail(task) {
    const detailCard = document.getElementById('taskDetailCard');
    const plateLabel = document.getElementById('taskPlateLabel');
    const statusLabel = document.getElementById('taskStatusLabel');
    const driverLabel = document.getElementById('taskDriverLabel');
    const pickupLabel = document.getElementById('taskPickupLabel');
    const destinationLabel = document.getElementById('taskDestinationLabel');

    if (!detailCard || !plateLabel || !statusLabel || !driverLabel || !pickupLabel || !destinationLabel) {
        return;
    }

    if (!task) {
        detailCard.classList.add('hidden');
        plateLabel.textContent = '--';
        statusLabel.textContent = '--';
        driverLabel.textContent = '--';
        pickupLabel.textContent = '--';
        destinationLabel.textContent = '--';
        clearTaskNavigation();
        return;
    }

    detailCard.classList.remove('hidden');
    plateLabel.textContent = `${task.plateNumber} · ${task.vehicleType}`;
    statusLabel.textContent = taskStatusLabels[task.assignmentStatus] || task.assignmentStatus;
    driverLabel.textContent = task.driverName;
    pickupLabel.textContent = [task.pickupLatitude, task.pickupLongitude].every((value) => value !== null)
        ? `${Number(task.pickupLatitude).toFixed(8)}, ${Number(task.pickupLongitude).toFixed(8)}`
        : task.pickupLabel || 'Pickup not set';
    destinationLabel.textContent = [task.destinationLatitude, task.destinationLongitude].every((value) => value !== null)
        ? `${Number(task.destinationLatitude).toFixed(8)}, ${Number(task.destinationLongitude).toFixed(8)}`
        : task.destinationLabel || 'Destination not set';
    renderTaskNavigation(task);
}

function clearTaskNavigation() {
    if (currentRouteControl && map) {
        map.removeControl(currentRouteControl);
        currentRouteControl = null;
    }

    if (routeMarkerGroup) {
        routeMarkerGroup.clearLayers();
    }

    if (routeProgressLayerGroup) {
        routeProgressLayerGroup.clearLayers();
    }

    activeNavigationTask = null;
    activeNavigationRouteCoordinates = [];
    activeNavigationDestination = null;
    lastNavigationRerouteAt = 0;
    activeNavigationRerouteCount = 0;
    activeNavigationLastDeviationMeters = null;
    renderRerouteStatus('Waiting for task');
    drawZones();
}

function renderRerouteStatus(text) {
    const badge = document.getElementById('routeRerouteStatus');
    if (!badge) {
        return;
    }

    badge.textContent = text;
}

function haversineMeters(from, to) {
    const earthRadius = 6371000;
    const lat1 = (Number(from.lat) * Math.PI) / 180;
    const lng1 = (Number(from.lng) * Math.PI) / 180;
    const lat2 = (Number(to.lat) * Math.PI) / 180;
    const lng2 = (Number(to.lng) * Math.PI) / 180;

    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
}

function findNearestRouteIndex(routePoints, currentPoint) {
    if (!Array.isArray(routePoints) || routePoints.length === 0 || !currentPoint) {
        return -1;
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < routePoints.length; i += 1) {
        const point = routePoints[i];
        const distance = haversineMeters(point, currentPoint);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}

function findNearestRoutePoint(routePoints, currentPoint) {
    const nearestIndex = findNearestRouteIndex(routePoints, currentPoint);
    if (nearestIndex < 0) {
        return null;
    }

    return routePoints[nearestIndex] || null;
}

function shouldSnapToRoute(routePoint, currentPoint) {
    if (!ENABLE_ROUTE_SNAP) {
        return false;
    }

    if (!routePoint || !currentPoint) {
        return false;
    }

    return haversineMeters(routePoint, currentPoint) <= ROUTE_SNAP_THRESHOLD_METERS;
}

function handleNavigationRouteFound(task, startPoint, destinationPoint, event, fitRoute = true) {
    const route = event.routes?.[0];
    if (!route) {
        return;
    }

    activeNavigationRouteCoordinates = Array.isArray(route.coordinates)
        ? route.coordinates.map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
        : [];

    drawZones();

    const currentVehicle = liveVehicles.find((item) => item.vehicleId === Number(task.vehicleId));
    if (currentVehicle) {
        renderNavigationProgress({ lat: currentVehicle.pos[0], lng: currentVehicle.pos[1] });
    } else {
        renderNavigationProgress(startPoint);
    }

    if (fitRoute) {
        map.fitBounds(route.coordinates, {
            padding: [40, 40],
            maxZoom: 16
        });
    }
}

function attachNavigationRoute(task, startPoint, destinationPoint, fitRoute = true) {
    if (currentRouteControl && map) {
        map.removeControl(currentRouteControl);
        currentRouteControl = null;
    }

    currentRouteControl = createRoutingControl(
        map,
        startPoint,
        destinationPoint,
        (event) => handleNavigationRouteFound(task, startPoint, destinationPoint, event, fitRoute)
    );
}

function maybeRerouteNavigation(vehiclePosition) {
    if (!activeNavigationTask || !activeNavigationDestination || !vehiclePosition || activeNavigationRouteCoordinates.length < 2) {
        return;
    }

    const now = Date.now();
    if (now - lastNavigationRerouteAt < ROUTE_REROUTE_COOLDOWN_MS) {
        return;
    }

    const nearestPoint = findNearestRoutePoint(activeNavigationRouteCoordinates, vehiclePosition);
    if (!nearestPoint) {
        return;
    }

    const deviationMeters = haversineMeters(vehiclePosition, nearestPoint);
    activeNavigationLastDeviationMeters = deviationMeters;

    if (deviationMeters > ROUTE_SNAP_THRESHOLD_METERS && deviationMeters <= ROUTE_REROUTE_THRESHOLD_METERS) {
        renderRerouteStatus(`Off-route ${Math.round(deviationMeters)}m`);
    }

    if (deviationMeters <= ROUTE_REROUTE_THRESHOLD_METERS) {
        return;
    }

    lastNavigationRerouteAt = now;
    activeNavigationRerouteCount += 1;
    activeNavigationRouteCoordinates = [];
    routeProgressLayerGroup.clearLayers();
    attachNavigationRoute(activeNavigationTask, vehiclePosition, activeNavigationDestination, false);
    renderRerouteStatus(`Rerouted x${activeNavigationRerouteCount} (${Math.round(deviationMeters)}m)`);
    console.log(`[FleetMap] Rerouting ${String(activeNavigationTask.plateNumber || `V-${activeNavigationTask.vehicleId}`)} from live position after ${Math.round(deviationMeters)}m drift.`);
}

function renderNavigationProgress(vehiclePosition) {
    if (!routeProgressLayerGroup) {
        return;
    }

    routeProgressLayerGroup.clearLayers();

    if (!activeNavigationTask || activeNavigationRouteCoordinates.length < 2 || !vehiclePosition) {
        return;
    }

    const route = activeNavigationRouteCoordinates;
    const nearestIndex = findNearestRouteIndex(route, vehiclePosition);

    if (nearestIndex < 0) {
        return;
    }

    const completedPath = route.slice(0, Math.max(2, nearestIndex + 1));
    const remainingPath = route.slice(Math.max(0, nearestIndex));
    const destinationPoint = route[route.length - 1];
    const distanceToDestination = haversineMeters(vehiclePosition, destinationPoint);

    if (completedPath.length >= 2) {
        L.polyline(completedPath, {
            color: ROUTE_DONE_COLOR,
            weight: 6,
            opacity: 0.95
        }).addTo(routeProgressLayerGroup);
    }

    if (distanceToDestination > DESTINATION_REACHED_THRESHOLD_METERS && remainingPath.length >= 2) {
        L.polyline(remainingPath, {
            color: ROUTE_REMAINING_COLOR,
            weight: 6,
            opacity: 0.9,
            dashArray: '10 10'
        }).addTo(routeProgressLayerGroup);
    }
}

function createRoutingControl(mapInstance, pickupLatLng, destLatLng, onRoutesFound) {
    return L.Routing.control({
        waypoints: [
            L.latLng(pickupLatLng.lat, pickupLatLng.lng),
            L.latLng(destLatLng.lat, destLatLng.lng)
        ],
        router: L.Routing.osrmv1({ serviceUrl: OSRM_SERVICE_URL }),
        lineOptions: { styles: [{ color: 'transparent', opacity: 0, weight: 0 }] },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false
    }).on('routesfound', onRoutesFound).addTo(mapInstance);
}

function renderTaskNavigation(task) {
    clearTaskNavigation();

    if (!task) {
        return;
    }

    const pickupReady = task.pickupLatitude !== null && task.pickupLongitude !== null;
    const destinationReady = task.destinationLatitude !== null && task.destinationLongitude !== null;

    if (!pickupReady || !destinationReady) {
        return;
    }

    const pickupPoint = { lat: Number(task.pickupLatitude), lng: Number(task.pickupLongitude) };
    const destinationPoint = { lat: Number(task.destinationLatitude), lng: Number(task.destinationLongitude) };
    activeNavigationTask = task;
    activeNavigationDestination = destinationPoint;
    activeNavigationRerouteCount = 0;
    activeNavigationLastDeviationMeters = null;
    renderRerouteStatus('On planned route');

    attachNavigationRoute(task, pickupPoint, destinationPoint, true);

    L.marker([pickupPoint.lat, pickupPoint.lng], { icon: pickupPointIcon })
        .bindTooltip('Pickup Point', { direction: 'top', offset: [0, -18], opacity: 0.95 })
        .addTo(routeMarkerGroup);

    L.marker([destinationPoint.lat, destinationPoint.lng], { icon: destinationPointIcon })
        .bindTooltip('Destination Point', { direction: 'top', offset: [0, -18], opacity: 0.95 })
        .addTo(routeMarkerGroup);

    map.fitBounds([
        [pickupPoint.lat, pickupPoint.lng],
        [destinationPoint.lat, destinationPoint.lng]
    ], {
        padding: [40, 40],
        maxZoom: 16
    });
}

function renderAssignedTaskOptions(vehicleType, tasks) {
    const select = document.getElementById('assignedTaskFilter');
    assignedTaskOptions = tasks;

    if (!select) {
        return;
    }

    if (!vehicleType) {
        select.innerHTML = '<option value="">Select a truck class first</option>';
        select.disabled = true;
        renderTaskDetail(null);
        return;
    }

    if (tasks.length === 0) {
        select.innerHTML = '<option value="">No assigned tasks for this class</option>';
        select.disabled = true;
        renderTaskDetail(null);
        return;
    }

    select.disabled = false;
    select.innerHTML = [`<option value="">All assigned tasks for ${escapeHtml(vehicleType)}</option>`]
        .concat(tasks.map((task) => {
            const statusText = taskStatusLabels[task.assignmentStatus] || task.assignmentStatus;
            return `<option value="${task.assignmentId}" data-vehicle-id="${task.vehicleId}">${escapeHtml(task.plateNumber)} · ${escapeHtml(statusText)}</option>`;
        }))
        .join('');
    select.value = '';
    renderTaskDetail(null);
}

async function loadAssignedTasks(vehicleType) {
    if (!vehicleType) {
        renderAssignedTaskOptions(vehicleType, []);
        applyFilters();
        return;
    }

    if (assignedTaskOptionsCache.has(vehicleType)) {
        renderAssignedTaskOptions(vehicleType, assignedTaskOptionsCache.get(vehicleType));
        applyFilters();
        return;
    }

    const select = document.getElementById('assignedTaskFilter');
    if (select) {
        select.disabled = true;
        select.innerHTML = '<option value="">Loading assigned tasks...</option>';
    }

    try {
        const response = await fetch(`/api/admin/fleet-maps/tasks?vehicleType=${encodeURIComponent(vehicleType)}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch assigned tasks (${response.status})`);
        }

        const payload = await response.json();
        const tasks = Array.isArray(payload.data) ? payload.data : [];
        assignedTaskOptionsCache.set(vehicleType, tasks);
        renderAssignedTaskOptions(vehicleType, tasks);
    } catch (error) {
        console.error('[FleetMap] Failed to load assigned tasks:', error);
        if (select) {
            select.innerHTML = '<option value="">Unable to load assigned tasks</option>';
            select.disabled = true;
        }
        renderTaskDetail(null);
    }

    applyFilters();
}

async function handleTruckClassChange() {
    const vehicleType = getTruckClassFilterValue();
    await loadAssignedTasks(vehicleType);
}

function handleAssignedTaskChange() {
    const taskValue = getAssignedTaskFilterValue();
    const selectedTask = assignedTaskOptions.find((item) => String(item.assignmentId) === String(taskValue)) || null;

    renderTaskDetail(selectedTask);
    applyFilters();

    if (selectedTask) {
        focusVehicleById(selectedTask.vehicleId);
    }
}

async function loadLiveFleetBootstrap() {
    try {
        const response = await fetch('/api/admin/fleet-maps/live', {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch live fleet data (${response.status})`);
        }

        const payload = await response.json();
        liveVehicles = [];

        const rows = Array.isArray(payload.data) ? payload.data : [];
        rows.forEach(upsertVehicle);

        applyFilters();
    } catch (error) {
        console.error('[FleetMap] Failed to load live bootstrap:', error);
        renderMarkers([]);
        renderIncidentList([]);
    }
}

function connectTrackingWebSocket() {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${scheme}://${window.location.host}/ws/tracking`;

    wsClient = new WebSocket(wsUrl);

    wsClient.addEventListener('message', (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload?.type !== 'tracking:update' || !payload.data) {
                return;
            }

            upsertVehicle(payload.data);
            applyFilters();
        } catch (error) {
            console.error('[FleetMap] Invalid websocket payload:', error);
        }
    });

    wsClient.addEventListener('close', () => {
        if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
        }

        reconnectTimer = window.setTimeout(() => {
            connectTrackingWebSocket();
        }, 3000);
    });
}

/* ==========================================================================
   MARKER & POPUP GENERATION (DETAILED VIEW)
   ========================================================================== */

function createLiveIcon(status) {
    let colorClass, shadowClass;
    
    if (status === 'loss') {
        colorClass = 'bg-rose-500'; shadowClass = 'shadow-[0_0_10px_rgba(244,63,94,0.8)]';
    } else if (status === 'overload') {
        colorClass = 'bg-amber-400'; shadowClass = 'shadow-[0_0_10px_rgba(251,191,36,0.8)]';
    } else {
        colorClass = 'bg-emerald-400'; shadowClass = 'shadow-[0_0_10px_rgba(52,211,153,0.8)]';
    }

    const ping = status !== 'in_transit' ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-75"></span>` : '';
    
    return L.divIcon({
        className: 'custom-live-marker',
        html: `
            <div class="relative flex h-4 w-4">
                ${ping}
                <span class="relative inline-flex rounded-full h-4 w-4 ${colorClass} border-[3px] border-slate-900 ${shadowClass}"></span>
            </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generateDetailedPopup(v) {
    const normalizedStatus = String(v.status || '').toLowerCase();
    const speedValue = Number.parseFloat(String(v.speed || '0').replace(/[^0-9.]/g, '')) || 0;
    const speedPercent = Math.max(0, Math.min(100, Math.round((speedValue / 90) * 100)));

    let statusLabel = 'In Transit';
    let statusClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    let statusDot = 'bg-emerald-400';

    if (normalizedStatus === 'loss') {
        statusLabel = 'Cargo Loss';
        statusClass = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
        statusDot = 'bg-rose-400';
    } else if (normalizedStatus === 'overload') {
        statusLabel = 'Overload';
        statusClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
        statusDot = 'bg-amber-300';
    }

    const [latValue = '--', lngValue = '--'] = String(v.location || '--').split(',').map((item) => item.trim());
    const safeVehicleType = escapeHtml(v.type);
    const safePlate = escapeHtml(v.id);
    const safeDriver = escapeHtml(v.driver);
    const safeUpdated = escapeHtml(v.updated);
    const safeSpeed = escapeHtml(v.speed);
    const safeLoad = escapeHtml(v.load);

    return `
        <div class="w-full bg-slate-950 text-slate-200">
            <div class="px-4 pt-4 pb-3 border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(30,64,175,0.3),transparent_55%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_45%)]">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-[10px] text-slate-400 uppercase tracking-[0.18em] font-bold">${safeVehicleType}</p>
                        <h3 class="mt-1 text-lg text-white font-extrabold font-mono leading-none">${safePlate}</h3>
                    </div>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-widest ${statusClass}">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
                        ${statusLabel}
                    </span>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2">
                    <div class="rounded-lg border border-slate-700 bg-slate-900/70 p-2.5">
                        <p class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Driver</p>
                        <p class="mt-1 text-xs text-slate-100 font-semibold truncate" title="${safeDriver}">${safeDriver}</p>
                    </div>
                    <div class="rounded-lg border border-slate-700 bg-slate-900/70 p-2.5">
                        <p class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Last update</p>
                        <p class="mt-1 text-xs text-slate-100 font-semibold">${safeUpdated}</p>
                    </div>
                </div>
            </div>

            <div class="p-4 space-y-3">
                <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div class="flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                        <span>Speed</span>
                        <span class="text-blue-300 font-mono">${safeSpeed}</span>
                    </div>
                    <div class="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400" style="width: ${speedPercent}%"></div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Latitude</p>
                        <p class="mt-1 text-xs text-slate-200 font-mono">${latValue}</p>
                    </div>
                    <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Longitude</p>
                        <p class="mt-1 text-xs text-slate-200 font-mono">${lngValue}</p>
                    </div>
                </div>

                <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                    <p class="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Load</p>
                    <p class="mt-1 text-xs font-bold font-mono ${normalizedStatus === 'loss' ? 'text-rose-300' : normalizedStatus === 'overload' ? 'text-amber-300' : 'text-slate-200'}">${safeLoad}</p>
                </div>

                <button onclick="window.location.href='/admin/fleet'" class="w-full mt-1 rounded-lg border border-blue-500/40 bg-blue-500/20 py-2 text-[10px] font-extrabold uppercase tracking-widest text-blue-100 hover:bg-blue-500/30 transition">
                    Open Fleet Telemetry
                </button>
            </div>
        </div>
    `;
}

function easeInOut(t) {
    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function stopMarkerAnimation(entry) {
    if (!entry?.animationFrame) {
        return;
    }

    window.cancelAnimationFrame(entry.animationFrame);
    entry.animationFrame = null;
    entry.motion = null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function computeMarkerAnimationDurationMeters(distanceMeters) {
    return clamp(
        Math.round(distanceMeters * MARKER_ANIMATION_MS_PER_METER),
        MARKER_ANIMATION_MIN_MS,
        MARKER_ANIMATION_MAX_MS
    );
}

function tickMarkerMotion(entry, now) {
    const motion = entry?.motion;
    if (!entry?.marker || !motion) {
        entry.animationFrame = null;
        return;
    }

    const elapsed = now - motion.startTime;
    const progress = Math.min(1, elapsed / motion.durationMs);
    const eased = easeInOut(progress);

    const nextLat = motion.from.lat + ((motion.to.lat - motion.from.lat) * eased);
    const nextLng = motion.from.lng + ((motion.to.lng - motion.from.lng) * eased);
    entry.marker.setLatLng([nextLat, nextLng]);

    if (progress < 1) {
        entry.animationFrame = window.requestAnimationFrame((frameNow) => tickMarkerMotion(entry, frameNow));
        return;
    }

    entry.motion = null;
    entry.animationFrame = null;
}

function animateMarkerTo(entry, lat, lng) {
    if (!entry?.marker) {
        return;
    }

    const from = entry.marker.getLatLng();
    const to = L.latLng(lat, lng);
    const distance = haversineMeters(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng }
    );

    if (!Number.isFinite(distance) || distance < MARKER_MIN_JITTER_METERS) {
        return;
    }

    entry.motion = {
        from,
        to,
        startTime: performance.now(),
        durationMs: computeMarkerAnimationDurationMeters(distance)
    };

    if (!entry.animationFrame) {
        entry.animationFrame = window.requestAnimationFrame((frameNow) => tickMarkerMotion(entry, frameNow));
    }
}

function renderMarkers(dataToRender) {
    isRefreshingMarkers = true;
    document.getElementById('activeUnitCount').textContent = dataToRender.length;

    const nextIds = new Set(dataToRender.map((v) => v.vehicleId));

    for (const [vehicleId, entry] of vehicleMarkerRegistry.entries()) {
        if (nextIds.has(vehicleId)) {
            continue;
        }

        stopMarkerAnimation(entry);
        markerGroup.removeLayer(entry.marker);
        vehicleMarkerRegistry.delete(vehicleId);

        if (activePopupVehicleId === vehicleId) {
            activePopupVehicleId = null;
        }
    }

    dataToRender.forEach((v) => {
        let targetLat = v.pos[0];
        let targetLng = v.pos[1];

        if (activeNavigationTask && Number(activeNavigationTask.vehicleId) === Number(v.vehicleId) && activeNavigationRouteCoordinates.length > 0) {
            const currentPoint = { lat: targetLat, lng: targetLng };
            const snappedPoint = findNearestRoutePoint(activeNavigationRouteCoordinates, currentPoint);
            if (shouldSnapToRoute(snappedPoint, currentPoint)) {
                targetLat = Number(snappedPoint.lat);
                targetLng = Number(snappedPoint.lng);
            }
        }

        if (activeNavigationTask && Number(activeNavigationTask.vehicleId) === Number(v.vehicleId)) {
            maybeRerouteNavigation({ lat: targetLat, lng: targetLng });

            if (activeNavigationRouteCoordinates.length > 1) {
                const nearestPoint = findNearestRoutePoint(activeNavigationRouteCoordinates, { lat: targetLat, lng: targetLng });
                if (nearestPoint) {
                    const deviationMeters = haversineMeters({ lat: targetLat, lng: targetLng }, nearestPoint);
                    if (deviationMeters <= ROUTE_SNAP_THRESHOLD_METERS) {
                        renderRerouteStatus(`On route (${Math.round(deviationMeters)}m)`);
                    }
                }
            }
        }

        const existing = vehicleMarkerRegistry.get(v.vehicleId);

        if (!existing) {
            const marker = L.marker([targetLat, targetLng], { icon: createLiveIcon(v.status) });
            marker.bindPopup(generateDetailedPopup(v));
            marker.on('popupopen', () => {
                activePopupVehicleId = v.vehicleId;
            });
            marker.on('popupclose', () => {
                if (!isRefreshingMarkers && activePopupVehicleId === v.vehicleId) {
                    activePopupVehicleId = null;
                }
            });
            markerGroup.addLayer(marker);

            vehicleMarkerRegistry.set(v.vehicleId, {
                marker,
                animationFrame: null
            });

            return;
        }

        existing.marker.setIcon(createLiveIcon(v.status));
        existing.marker.setPopupContent(generateDetailedPopup(v));
    animateMarkerTo(existing, targetLat, targetLng);

        if (activePopupVehicleId === v.vehicleId) {
            existing.marker.openPopup();
        }
    });

    if (dataToRender.length === 0) {
        for (const entry of vehicleMarkerRegistry.values()) {
            stopMarkerAnimation(entry);
            markerGroup.removeLayer(entry.marker);
        }
        vehicleMarkerRegistry.clear();
    }

    if (activeNavigationTask) {
        const activeVehicleId = Number(activeNavigationTask.vehicleId);
        const activeEntry = vehicleMarkerRegistry.get(activeVehicleId);
        if (activeEntry?.marker) {
            const markerPosition = activeEntry.marker.getLatLng();
            renderNavigationProgress({ lat: markerPosition.lat, lng: markerPosition.lng });
        } else {
            const activeVehicle = liveVehicles.find((item) => item.vehicleId === activeVehicleId);
            if (activeVehicle) {
                renderNavigationProgress({ lat: activeVehicle.pos[0], lng: activeVehicle.pos[1] });
            }
        }
    }

    drawZones(dataToRender);

    isRefreshingMarkers = false;
}

/* ==========================================================================
   FILTERING & UI LOGIC
   ========================================================================== */

function applyFilters() {
    const searchVal = document.getElementById('vehicleSearch').value.toLowerCase();
    const classVal = getTruckClassFilterValue();
    const taskValue = getAssignedTaskFilterValue();
    const selectedTask = assignedTaskOptions.find((item) => String(item.assignmentId) === String(taskValue)) || null;
    const selectedVehicleId = selectedTask ? selectedTask.vehicleId : null;

    const filtered = liveVehicles.filter(v => {
        const matchSearch = v.id.toLowerCase().includes(searchVal) || v.driver.toLowerCase().includes(searchVal);
        const matchClass = !classVal || v.type === classVal;
        const matchTask = !selectedVehicleId || v.vehicleId === selectedVehicleId;
        return matchSearch && matchClass && matchTask;
    });

    renderMarkers(filtered);
    renderIncidentList(filtered);
}

function renderIncidentList(data) {
    const list = document.getElementById('incidentList');
    const incidents = data.filter(v => v.status !== 'in_transit');

    if (incidents.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-500 text-center py-4 font-bold uppercase tracking-widest">No active incidents</p>';
        return;
    }

    list.innerHTML = incidents.map(v => {
        const isLoss = v.status === 'loss';
        const colorBorder = isLoss ? 'border-rose-500' : 'border-amber-500';
        const colorText = isLoss ? 'text-rose-400' : 'text-amber-400';
        const typeText = isLoss ? 'Cargo Loss' : 'Overload';

        return `
            <div class="flex gap-3 border-l-2 ${colorBorder} pl-4 py-2 cursor-pointer bg-slate-900/80 border border-slate-800 rounded-r-xl hover:bg-slate-800 transition shadow-md" onclick="focusVehicle('${v.id}')">
                <div class="w-full">
                    <div class="flex justify-between items-center w-full mb-1">
                        <p class="text-sm font-extrabold text-white font-mono">${v.id}</p>
                        <span class="text-[10px] font-bold ${colorText} uppercase tracking-widest bg-slate-950 px-2 py-0.5 rounded">${typeText}</span>
                    </div>
                    <p class="text-xs text-slate-400 truncate">${v.location}</p>
                    <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">${v.updated}</p>
                </div>
            </div>
        `;
    }).join('');
}

function focusVehicle(id) {
    const vehicle = liveVehicles.find(v => v.id === id);
    if (vehicle) {
        const entry = vehicleMarkerRegistry.get(vehicle.vehicleId);
        const marker = entry?.marker;
        const target = marker ? marker.getLatLng() : { lat: vehicle.pos[0], lng: vehicle.pos[1] };

        map.setView([target.lat, target.lng], 16, { animate: true, duration: 1 });
        if (marker) {
            marker.openPopup();
        }
    }
}


function focusVehicleById(vehicleId) {
    const normalizedVehicleId = Number(vehicleId);
    const vehicle = liveVehicles.find((item) => item.vehicleId === normalizedVehicleId);
    const entry = vehicleMarkerRegistry.get(normalizedVehicleId);
    const marker = entry?.marker;

    if (!vehicle && !marker) {
        return;
    }

    const target = marker ? marker.getLatLng() : { lat: vehicle.pos[0], lng: vehicle.pos[1] };
    map.setView([target.lat, target.lng], 16, { animate: true, duration: 1 });

    if (marker) {
        marker.openPopup();
    }
}
function recenterMap() {
    map.setView([14.7298, 121.1423], 14, { animate: true });
}

function toggleMapStyle(style) {
    const btnMap = document.getElementById('btnMapStyle');
    const btnSat = document.getElementById('btnSatStyle');

    if (style === 'sat' && isDarkMap) {
        map.removeLayer(darkLayer);
        satLayer.addTo(map);
        satLabelLayer.addTo(map);
        isDarkMap = false;
        
        btnSat.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow-sm transition";
        btnMap.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition";
    } else if (style === 'dark' && !isDarkMap) {
        map.removeLayer(satLayer);
        map.removeLayer(satLabelLayer);
        darkLayer.addTo(map);
        isDarkMap = true;

        btnMap.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow-sm transition";
        btnSat.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition";
    }
}

/* ==========================================================================
   MAP OVERLAYS (ZONES)
   ========================================================================== */

function drawZones(vehicles = liveVehicles) {
    zoneLayerGroup.clearLayers();

    const points = [];

    const sourceVehicles = Array.isArray(vehicles) ? vehicles : [];
    sourceVehicles.forEach((vehicle) => {
        if (!Array.isArray(vehicle?.pos) || vehicle.pos.length < 2) {
            return;
        }

        const lat = Number(vehicle.pos[0]);
        const lng = Number(vehicle.pos[1]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
        }

        points.push({ lat, lng });
    });

    if (activeNavigationRouteCoordinates.length > 0) {
        activeNavigationRouteCoordinates.forEach((routePoint) => {
            const lat = Number(routePoint?.lat);
            const lng = Number(routePoint?.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                points.push({ lat, lng });
            }
        });
    }

    if (points.length === 0) {
        return;
    }

    const latitudes = points.map((point) => point.lat);
    const longitudes = points.map((point) => point.lng);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latSpan = Math.max(0.004, maxLat - minLat);
    const lngSpan = Math.max(0.004, maxLng - minLng);

    const latPadding = latSpan * 0.2;
    const lngPadding = lngSpan * 0.2;

    const polygon = [
        [maxLat + latPadding, minLng - lngPadding],
        [maxLat + latPadding, maxLng + lngPadding],
        [minLat - latPadding, maxLng + lngPadding],
        [minLat - latPadding, minLng - lngPadding]
    ];

    L.polygon(polygon, {
        color: '#60a5fa',
        weight: 2,
        opacity: 0.7,
        fillColor: '#60a5fa',
        fillOpacity: 0.06,
        dashArray: '6, 6'
    })
        .bindTooltip('Operational boundary', { sticky: true, opacity: 0.9 })
        .addTo(zoneLayerGroup);

    if (showZones && !map.hasLayer(zoneLayerGroup)) {
        map.addLayer(zoneLayerGroup);
    }
}

function toggleZones() {
    showZones = !showZones;
    if (showZones) {
        map.addLayer(zoneLayerGroup);
    } else {
        map.removeLayer(zoneLayerGroup);
    }
}