// ===========================================
// DISPATCH MANAGEMENT - CLEAN FRONTEND
// ===========================================
// File structure:
// 1. Shared constants, helpers, and API client
// 2. Assign Task modal (create assignment)
// 3. Main dispatch map, list, and pagination state
// 4. Edit Assignment modal (update flow)
// 5. Delete Assignment flow
// 6. Bootstrap, geocoding helpers, and global exports

// ===========================================
// SECTION 1: SHARED CONSTANTS & HELPERS
// ===========================================
const DEFAULT_CENTER = [14.6091, 121.0223];
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
};
const OSRM_SERVICE_URL = 'https://router.project-osrm.org/route/v1';
const ROUTE_LINE_STYLE = [{ color: '#3B82F6', opacity: 0.8, weight: 6 }];
const DISPATCH_API_BASE = '/api/admin/task-dispatch';

// -------------------------------------------
// Generic UI and Formatting Helpers
// -------------------------------------------
function getInitials(fullName) {
    const value = String(fullName || '').trim();
    if (!value) return 'NA';
    return value.split(/\s+/).map(n => n[0]).join('').toUpperCase();
}

function formatTime(seconds) {
    const m = Math.round(seconds / 60);
    if (m > 60) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h}h ${min}m`;
    }
    return `${m} min`;
}

function formatDistance(meters) {
    if (meters > 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

function getDirectionIcon(type, iconClass = 'w-4 h-4') {
    const icons = {
        Left: `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>`,
        Right: `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`,
        Straight: `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>`,
        DestinationReached: `<svg class="${iconClass} text-[#2DD4BF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`
    };
    return icons[type] || `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>`;
}

function addDarkTileLayer(mapInstance) {
    L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(mapInstance);
}

function createRoutingControl(mapInstance, pickupLatLng, destLatLng, onRoutesFound) {
    return L.Routing.control({
        waypoints: [
            L.latLng(pickupLatLng.lat, pickupLatLng.lng),
            L.latLng(destLatLng.lat, destLatLng.lng)
        ],
        router: L.Routing.osrmv1({ serviceUrl: OSRM_SERVICE_URL }),
        lineOptions: { styles: ROUTE_LINE_STYLE },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false
    }).on('routesfound', onRoutesFound).addTo(mapInstance);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('modal-enter');
        modal.classList.add('modal-enter-active');
        content.classList.remove('modal-content-enter');
        content.classList.add('modal-content-enter-active');
    }, 10);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;

    modal.classList.remove('modal-enter-active');
    modal.classList.add('modal-enter');
    content.classList.remove('modal-content-enter-active');
    content.classList.add('modal-content-enter');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function clearInlineMessage(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
}

function showInlineMessage(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

async function parseJsonResponse(response) {
    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok) {
        const error = new Error(payload?.error || 'Request failed.');
        error.payload = payload;
        throw error;
    }

    return payload;
}

async function fetchDispatchJson(endpoint, options = {}) {
    const response = await fetch(`${DISPATCH_API_BASE}${endpoint}`, options);
    return parseJsonResponse(response);
}

function normalizeDispatchTaskStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (['pending', 'active', 'in_transit', 'completed', 'cancelled'].includes(value)) {
        return value;
    }
    return 'pending';
}

function getDispatchTaskStatusHint(currentStatus) {
    const normalized = normalizeDispatchTaskStatus(currentStatus);

    if (normalized === 'active') {
        return 'Active assignments cannot be changed back to Pending.';
    }

    if (normalized === 'in_transit') {
        return 'In Transit assignments cannot be changed back to Pending or Active.';
    }

    if (normalized === 'completed') {
        return 'Completed routes are final and cannot be changed back to earlier statuses.';
    }

    if (normalized === 'cancelled') {
        return 'Cancelled assignments are final and cannot be changed to another status.';
    }

    return 'Pending can move forward to Active, In Transit, or Completed.';
}

function getAllowedDispatchTaskStatuses(currentStatus) {
    const normalized = normalizeDispatchTaskStatus(currentStatus);

    if (normalized === 'active') {
        return new Set(['active', 'in_transit', 'completed', 'cancelled']);
    }

    if (normalized === 'in_transit') {
        return new Set(['in_transit', 'completed', 'cancelled']);
    }

    if (normalized === 'completed') {
        return new Set(['completed']);
    }

    if (normalized === 'cancelled') {
        return new Set(['cancelled']);
    }

    return new Set(['pending', 'active', 'in_transit', 'completed', 'cancelled']);
}

function syncEditAssignmentStatusOptions(currentStatus) {
    const select = document.getElementById('editAssignmentStatus');
    const hint = document.getElementById('editAssignmentStatusHint');
    if (!select) return;

    const normalized = normalizeDispatchTaskStatus(currentStatus);
    const allowedStatuses = getAllowedDispatchTaskStatuses(normalized);

    Array.from(select.options).forEach((option) => {
        option.disabled = !allowedStatuses.has(option.value);
    });

    if (!allowedStatuses.has(select.value)) {
        select.value = normalized;
    }

    if (hint) {
        hint.textContent = getDispatchTaskStatusHint(normalized);
    }
}

// -------------------------------------------
// Dispatch API Client
// -------------------------------------------
const dispatchApi = {
    getAssignableVehicles(queryParams) {
        return fetchDispatchJson(`/vehicles?${queryParams.toString()}`, {
            headers: { Accept: 'application/json' }
        });
    },
    getAssignments({ page = 1, limit = 20, includeCompleted = false } = {}) {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        if (includeCompleted) params.set('includeCompleted', 'true');

        return fetchDispatchJson(`/assignments?${params.toString()}`, {
            headers: { Accept: 'application/json' }
        });
    },
    getAssignmentById(assignmentId) {
        return fetchDispatchJson(`/assignments/${assignmentId}`, {
            headers: { Accept: 'application/json' }
        });
    }
};

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

let taskMap = null;
let pickupMarker = null;
let destMarker = null;
let routingControl = null;
let activeMode = 'pickup';
let taskMapInitialized = false;

// ===========================================
// SECTION 2: ASSIGN TASK MODAL (CREATE FLOW)
// ===========================================

function initTaskMap() {
    if (taskMapInitialized) return;

    taskMap = L.map('taskMap').setView(DEFAULT_CENTER, 13);
    addDarkTileLayer(taskMap);

    taskMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        placeDraggableMarker(lat, lng, activeMode);
    });

    taskMapInitialized = true;
}

function updateTaskRoute() {
    if (routingControl) {
        taskMap.removeControl(routingControl);
        routingControl = null;
    }

    document.getElementById('tripStats').classList.add('hidden');

    if (pickupMarker && destMarker) {
        const pLatLng = pickupMarker.getLatLng();
        const dLatLng = destMarker.getLatLng();

        routingControl = createRoutingControl(taskMap, pLatLng, dLatLng, function(e) {
            const routes = e.routes;
            const summary = routes[0].summary;
            const instructions = routes[0].instructions;

            document.getElementById('timeVal').innerText = formatTime(summary.totalTime);
            document.getElementById('distVal').innerText = formatDistance(summary.totalDistance);
            document.getElementById('tripStats').classList.remove('hidden');
            populateRouteDirections(instructions, summary);
        });
    }
}

function populateRouteDirections(instructions, summary) {
    const directionsPanel = document.getElementById('mapRouteDirections');
    const directionsList = document.getElementById('mapDirectionsList');
    const summaryText = document.getElementById('mapRouteSummary');

    if (!directionsPanel || !directionsList || !summaryText) return;

    directionsPanel.classList.remove('hidden');
    summaryText.textContent = `${formatDistance(summary.totalDistance)} • ${formatTime(summary.totalTime)} • ${instructions.length} steps`;

    directionsList.innerHTML = instructions.map((inst, i) => `
        <li class="flex items-start gap-3 px-4 py-3 hover:bg-gray-700/30 transition">
            <div class="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300">${i + 1}</div>
            <div class="flex-1 min-w-0">
                <p class="text-sm text-white">${inst.text}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">${formatDistance(inst.distance)}</p>
            </div>
            <div class="flex-shrink-0 text-gray-500">${getDirectionIcon(inst.type)}</div>
        </li>
    `).join('');
}

function setTaskMode(mode) {
    activeMode = mode;
    const modeText = document.getElementById('modeText');
    const modeDot = document.getElementById('modeDot');

    if (mode === 'pickup') {
        modeText.textContent = 'Set Pickup Point';
        modeText.className = 'text-xs font-bold text-[#2DD4BF]';
        modeDot.className = 'w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse';
    } else {
        modeText.textContent = 'Set Destination';
        modeText.className = 'text-xs font-bold text-red-400';
        modeDot.className = 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
    }
}

function resetTaskMap() {
    if (pickupMarker) taskMap.removeLayer(pickupMarker);
    if (destMarker) taskMap.removeLayer(destMarker);
    if (routingControl) {
        taskMap.removeControl(routingControl);
        routingControl = null;
    }

    pickupMarker = null;
    destMarker = null;
    document.getElementById('pickupInput').value = '';
    document.getElementById('destInput').value = '';
    document.getElementById('tripStats').classList.add('hidden');
    const routeDirections = document.getElementById('mapRouteDirections');
    const directionsContent = document.getElementById('mapDirectionsContent');
    const directionsList = document.getElementById('mapDirectionsList');

    if (routeDirections) routeDirections.classList.add('hidden');
    if (directionsContent) directionsContent.classList.add('hidden');
    if (directionsList) directionsList.innerHTML = '';
    setTaskMode('pickup');
    if (taskMap) taskMap.setView(DEFAULT_CENTER, 13);
}

function openAssignTaskModal() {
    const modal = document.getElementById('assignTaskModal');
    const content = modal.querySelector('.modal-content');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('modal-enter');
        modal.classList.add('modal-enter-active');
        content.classList.remove('modal-content-enter');
        content.classList.add('modal-content-enter-active');
    }, 10);

    loadAssignableVehicles().catch(() => {
        showInlineMessage(document.getElementById('taskFormError'), 'Unable to load vehicle options.');
    });

    setTimeout(() => {
        initTaskMap();
        if (taskMap) taskMap.invalidateSize();
        setTaskMode('pickup');
    }, 300);
}

function closeAssignTaskModal() {
    const modal = document.getElementById('assignTaskModal');
    const content = modal.querySelector('.modal-content');

    modal.classList.remove('modal-enter-active');
    modal.classList.add('modal-enter');
    content.classList.remove('modal-content-enter-active');
    content.classList.add('modal-content-enter');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function extractFirstFieldError(fieldErrors) {
    if (!fieldErrors || typeof fieldErrors !== 'object') return null;
    const firstMessage = Object.values(fieldErrors).find(
        (value) => typeof value === 'string' && value.trim().length > 0
    );
    return firstMessage || null;
}

function displayErrorFromResponse(errorElement, responseData) {
    if (!errorElement || !responseData) return;
    
    // Priority: field errors first, then general error, then fallback
    const fieldErrorMsg = extractFirstFieldError(responseData.fieldErrors);
    const errorMsg = fieldErrorMsg || responseData.error || 'An unexpected error occurred. Please try again.';
    
    errorElement.textContent = errorMsg;
    errorElement.classList.remove('hidden');
}

function renderVehicleOptions(vehicles, targetSelectId = 'taskVehicleSelect', placeholder = 'Choose an available vehicle...') {
    const select = document.getElementById(targetSelectId);
    if (!select) return;

    select.innerHTML = `<option value="">${placeholder}</option>`;

    vehicles.forEach((vehicle) => {
        const option = document.createElement('option');
        option.value = vehicle.id;
        const assignedDriver = vehicle.first_name
            ? `${vehicle.first_name || ''} ${vehicle.last_name || ''}`.trim()
            : 'Unassigned';
        option.textContent = `${vehicle.plate_number} • ${vehicle.vehicle_type || 'Vehicle'} • ${assignedDriver}`;
        select.appendChild(option);
    });

    if (vehicles.length === 0) {
        select.innerHTML = '<option value="">No assignable vehicles</option>';
    }
}

async function loadAssignableVehicles(options = {}) {
    const {
        limit = 5,
        includeVehicleId = null,
        requireAssigned = false,
        targetSelectId = 'taskVehicleSelect',
        placeholder = 'Choose an available vehicle...'
    } = options;

    const select = document.getElementById(targetSelectId);
    if (!select) return;

    select.innerHTML = '<option value="">Loading vehicles...</option>';

    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (includeVehicleId) params.set('includeVehicleId', String(includeVehicleId));
    if (requireAssigned) params.set('requireAssigned', 'true');

    const payload = await dispatchApi.getAssignableVehicles(params);
    renderVehicleOptions(payload.data || [], targetSelectId, placeholder);
}

async function dispatchTask() {
    const errorEl = document.getElementById('taskFormError');
    const successEl = document.getElementById('taskFormSuccess');
    const submitBtn = document.querySelector('#assignTaskModal button[type="button"][onclick*="dispatchTask"]');

    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    const vehicle = document.getElementById('taskVehicleSelect')?.value;
    const pickup = pickupMarker?.getLatLng?.() || null;
    const dest = destMarker?.getLatLng?.() || null;

    // ─── SHOW LOADING STATE ───
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        // ─── SEND TO BACKEND: LET SERVER VALIDATE ALL BUSINESS RULES ───
        const response = await fetch(`${DISPATCH_API_BASE}/assignments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                vehicleId: vehicle ?? null,
                pickupLat: pickup?.lat ?? null,
                pickupLng: pickup?.lng ?? null,
                destLat: dest?.lat ?? null,
                destLng: dest?.lng ?? null
            })
        });

        const payload = await response.json();

        if (!response.ok) {
            // ─── WIRE SERVER VALIDATION ERROR ───
            displayErrorFromResponse(errorEl, payload);
            return;
        }

        // ─── SUCCESS: DISPLAY SERVER MESSAGE ───
        showInlineMessage(successEl, payload.message || 'Task dispatched successfully.');

        await Promise.all([loadMapAssignments(), loadAssignableVehicles()]);

        setTimeout(() => {
            closeAssignTaskModal();
            resetTaskMap();
            clearInlineMessage(successEl);
        }, 900);
    } catch (error) {
        console.error('Network or server error:', error);
        showInlineMessage(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        // ─── RESTORE BUTTON STATE ───
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

// ===========================================
// SECTION 3: MAIN DISPATCH MAP & LIST STATE
// ===========================================
let map = null;
let mapInitialized = false;
let mapMarkers = [];
let currentMapRoute = null;
let isDispatchMapVisible = true;
let selectedAssignmentId = null;
let selectedAssignment = null;
let sidebarAssignments = [];
const paginationState = {
    sidebarPage: 1,
    sidebarPageSize: 10,
    sidebarTotal: 0,
    sidebarTotalPages: 1
};

function renderPaginationControls(containerId, page, totalPages, scope) {
    const controls = document.getElementById(containerId);
    if (!controls) return;

    const makeArrowBtn = (targetPage, direction, disabled) => {
        const icon = direction === 'prev'
            ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>'
            : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';

        return `<button type="button" ${disabled ? 'disabled' : ''} onclick="goToAssignmentsPage('${scope}', ${targetPage})" class="p-2 rounded-lg border text-slate-400 transition ${disabled ? 'border-slate-700 opacity-50 cursor-not-allowed bg-slate-800/50' : 'border-slate-700 hover:bg-slate-800 hover:text-white'}">${icon}</button>`;
    };

    const makePageBtn = (targetPage, active) => {
        if (active) {
            return `<button type="button" class="w-8 h-8 flex items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold">${targetPage}</button>`;
        }
        return `<button type="button" onclick="goToAssignmentsPage('${scope}', ${targetPage})" class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-bold">${targetPage}</button>`;
    };

    let html = '';
    html += makeArrowBtn(page - 1, 'prev', page <= 1);

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    } else {
        pages.push(1);
        if (page > 3) pages.push('...');
        const start = Math.max(2, page - 1);
        const end = Math.min(totalPages - 1, page + 1);
        for (let i = start; i <= end; i += 1) pages.push(i);
        if (page < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach((entry) => {
        if (entry === '...') {
            html += '<span class="w-8 h-8 flex items-center justify-center text-slate-600 text-xs font-bold">...</span>';
        } else {
            html += makePageBtn(entry, entry === page);
        }
    });

    html += makeArrowBtn(page + 1, 'next', page >= totalPages);
    controls.innerHTML = html;
}

function renderPaginationInfo(infoId, page, limit, total, visibleRowsCount) {
    const infoEl = document.getElementById(infoId);
    if (!infoEl) return;

    if (!total) {
        infoEl.textContent = 'Showing 0 to 0 of 0';
        return;
    }

    const start = (page - 1) * limit + 1;
    const end = start + visibleRowsCount - 1;
    infoEl.textContent = `Showing ${start} to ${end} of ${total}`;
}

function getAssignmentById(assignmentId) {
    const inSidebar = sidebarAssignments.find((entry) => Number(entry.assignment_id) === Number(assignmentId));
    if (inSidebar) return inSidebar;

    if (selectedAssignment && Number(selectedAssignment.assignment_id) === Number(assignmentId)) {
        return selectedAssignment;
    }

    return null;
}

async function goToAssignmentsPage(scope, page) {
    if (scope === 'sidebar') {
        const clampedPage = Math.min(Math.max(1, page), paginationState.sidebarTotalPages);
        await loadSidebarAssignments(clampedPage);
        renderAssignmentsList();
    }
}

async function loadSidebarAssignments(page = 1) {
    const payload = await dispatchApi.getAssignments({
        page,
        limit: paginationState.sidebarPageSize
    });

    sidebarAssignments = payload.data || [];
    const meta = payload.pagination || {};
    paginationState.sidebarPage = Number(meta.page || page);
    paginationState.sidebarTotal = Number(meta.total || 0);
    paginationState.sidebarTotalPages = Math.max(1, Number(meta.totalPages || 1));
}

async function refreshAssignmentsData({ resetPages = false } = {}) {
    const sidebarTargetPage = resetPages ? 1 : paginationState.sidebarPage;

    await loadSidebarAssignments(sidebarTargetPage);
}

function initUsersMap() {
    if (mapInitialized) return;

    map = L.map('users-map', {
        zoomControl: true,
        attributionControl: false
    }).setView(DEFAULT_CENTER, 12);

    addDarkTileLayer(map);
    mapInitialized = true;
}

function clearMapMarkers() {
    mapMarkers.forEach(marker => {
        if (map && marker) map.removeLayer(marker);
    });
    mapMarkers = [];
}

function clearMapRoute() {
    if (currentMapRoute && map) {
        map.removeControl(currentMapRoute);
        currentMapRoute = null;
    }
}

function setDispatchMapVisibility(visible) {
    const mapCard = document.getElementById('dispatchMapCard');
    const detailsCard = document.getElementById('selectedTaskDetails');
    if (!mapCard) return;

    // Prevent expensive DOM/layout work when target state is unchanged.
    if (visible === isDispatchMapVisible) return;

    isDispatchMapVisible = visible;

    mapCard.classList.toggle('hidden', !visible);

    if (detailsCard) {
        if (visible) {
            detailsCard.classList.remove('flex-1', 'min-h-0');
            detailsCard.classList.add('shrink-0');
        } else {
            detailsCard.classList.remove('shrink-0');
            detailsCard.classList.add('flex-1', 'min-h-0');
        }
    }

    if (visible && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 120);
    }
}

async function loadMapAssignments() {
    const listContainer = document.getElementById('assignmentsList');
    setDispatchMapVisibility(true);
    resetDispatchTaskTable();
    setDispatchTableVisibility(false);

    try {
        await refreshAssignmentsData({ resetPages: true });
    } catch (error) {
        sidebarAssignments = [];
        paginationState.sidebarTotal = 0;
        listContainer.innerHTML = '<div class="p-4 text-center text-rose-400 text-xs"><p class="font-bold">Failed to load assignments</p><p class="mt-1 text-slate-500">Please refresh and try again</p></div>';
        hideTaskDetails({ clearSelection: true });
        return;
    }

    clearMapMarkers();
    clearMapRoute();
    selectedAssignmentId = null;
    selectedAssignment = null;

    if (paginationState.sidebarTotal === 0) {
        listContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs"><p class="font-bold">No Active Assignments</p><p class="mt-1">Dispatch a task to see routes here</p></div>';
        renderPaginationInfo('assignmentsPaginationInfo', 1, paginationState.sidebarPageSize, 0, 0);
        renderPaginationControls('assignmentsPaginationControls', 1, 1, 'sidebar');
        hideTaskDetails({ clearSelection: true });
        return;
    }

    renderAssignmentsList();
}

function setDispatchTableVisibility(visible) {
    const tableCard = document.getElementById('dispatchTaskTableCard');
    if (!tableCard) return;
    tableCard.classList.toggle('hidden', !visible);
}

function resetDispatchTaskTable() {
    const tbody = document.getElementById('dispatchTaskTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="py-5 text-center text-slate-500 text-xs">Select an active assignment to view dispatch data.</td></tr>';
}

function renderDispatchTaskTable(items = []) {
    const tbody = document.getElementById('dispatchTaskTableBody');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-5 text-center text-slate-500 text-xs">No dispatch data found for this assignment.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((item) => {
        const status = String(item.assignment_status || 'pending').toLowerCase();
        const statusClass = status === 'active'
            ? 'text-emerald-400'
            : (status === 'in_transit'
                ? 'text-sky-400'
                : (status === 'pending' ? 'text-yellow-400' : 'text-slate-400'));
        const statusLabel = status.replace(/_/g, ' ');
        const createdByName = String(item.created_by_name || '').trim() || 'Unknown Admin';

        return `
            <tr class="hover:bg-slate-800/40 transition">
                <td class="py-3 pr-4 text-white font-semibold">${item.full_name || 'Unassigned Driver'}</td>
                <td class="py-3 pr-4">
                    <div class="text-slate-300 font-mono">${item.vehicle_number || '--'}</div>
                    <div class="text-[10px] text-slate-500 font-semibold mt-0.5">${item.vehicle_name || item.vehicle_type || 'Vehicle'}</div>
                </td>
                <td class="py-3 pr-4 ${statusClass} font-bold uppercase">${statusLabel}</td>
                <td class="py-3 pr-4 text-slate-300">${item.distance_km ? `${item.distance_km} km` : '--'}</td>
                <td class="py-3 pr-4 text-slate-300">${item.est_duration_min ? `${item.est_duration_min} min` : '--'}</td>
                <td class="py-3 pr-4 text-slate-300">${createdByName}</td>
                <td class="py-3 pr-0">
                    <button type="button" class="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition" onclick="selectAssignmentById(${item.assignment_id})">View</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadSelectedDispatchTable(assignmentId) {
    const parsedId = Number(assignmentId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
        setDispatchTableVisibility(false);
        resetDispatchTaskTable();
        return;
    }

    try {
        const payload = await dispatchApi.getAssignmentById(parsedId);
        const selectedRow = payload?.data ? [payload.data] : [];
        renderDispatchTaskTable(selectedRow);
        setDispatchTableVisibility(true);
    } catch (_) {
        renderDispatchTaskTable([]);
        setDispatchTableVisibility(true);
    }
}

function selectAssignmentById(assignmentId) {
    const user = getAssignmentById(assignmentId);
    if (!user) return;
    selectAssignment(user, { hideMap: true, showDetails: true }).catch((error) => {
        console.error('Error selecting assignment by id:', error);
    });
}

function renderAssignmentsList() {
    const listContainer = document.getElementById('assignmentsList');
    listContainer.innerHTML = '';

    sidebarAssignments.forEach(user => {
        const initials = getInitials(user.full_name || 'ND');
        const isSelected = selectedAssignmentId == user.assignment_id;
        const normalizedStatus = String(user.assignment_status || '').toLowerCase();
        const isActive = normalizedStatus === 'active' || normalizedStatus === 'in_transit';

        const assignmentDiv = document.createElement('div');
        assignmentDiv.className = `p-3 rounded-lg cursor-pointer border transition group ${
            isSelected
                ? 'bg-[#2DD4BF]/10 border-[#2DD4BF]/50'
                : 'bg-gray-800/50 hover:bg-[#2DD4BF]/10 border-transparent hover:border-[#2DD4BF]/30'
        }`;
        assignmentDiv.onclick = () => {
            selectAssignment(user, { hideMap: false, showDetails: false }).catch((error) => {
                console.error('Error selecting assignment:', error);
            });
        };

        assignmentDiv.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">${initials}</div>
                    <div>
                        <p class="text-sm font-bold ${isSelected ? 'text-[#2DD4BF]' : 'text-white group-hover:text-[#2DD4BF]'}">${user.full_name || 'Unassigned Driver'}</p>
                        <p class="text-[10px] text-gray-500">${user.vehicle_number || 'No Vehicle'}</p>
                    </div>
                </div>
                <span class="w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}"></span>
            </div>
            <div class="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                <span>${user.distance_km ? user.distance_km + ' km' : '--'}</span>
                <span>${user.est_duration_min ? user.est_duration_min + ' min' : '--'}</span>
            </div>
        `;

        listContainer.appendChild(assignmentDiv);
    });

    renderPaginationInfo(
        'assignmentsPaginationInfo',
        paginationState.sidebarPage,
        paginationState.sidebarPageSize,
        paginationState.sidebarTotal,
        sidebarAssignments.length
    );
    renderPaginationControls('assignmentsPaginationControls', paginationState.sidebarPage, paginationState.sidebarTotalPages, 'sidebar');
}

function addAssignmentMarkers(user) {
    const pickupMarkerObj = L.marker([user.pickup_lat, user.pickup_lng], { icon: greenIcon }).addTo(map);
    mapMarkers.push(pickupMarkerObj);

    const destMarkerObj = L.marker([user.dest_lat, user.dest_lng], { icon: redIcon }).addTo(map);
    mapMarkers.push(destMarkerObj);
}

function hideDetailsPanelContent() {
    const panel = document.getElementById('selectedTaskDetails');
    const directions = document.getElementById('mapRouteDirections');
    const directionsContent = document.getElementById('mapDirectionsContent');

    if (panel) panel.classList.add('hidden');
    if (directions) directions.classList.add('hidden');
    if (directionsContent) directionsContent.classList.add('hidden');
}

async function selectAssignment(user, options = {}) {
    const { hideMap = false, showDetails = false } = options;

    selectedAssignmentId = user.assignment_id;
    selectedAssignment = user;
    renderAssignmentsList();
    clearMapMarkers();
    addAssignmentMarkers(user);

    if (showDetails) {
        showTaskDetails(user);
    } else {
        hideDetailsPanelContent();
    }

    setDispatchMapVisibility(!hideMap);
    drawAssignmentRoute(user, { hideMap });
    await loadSelectedDispatchTable(user.assignment_id);
}

function showTaskDetails(user) {
    const panel = document.getElementById('selectedTaskDetails');
    panel.classList.remove('hidden');

    document.getElementById('selectedDriverName').textContent = user.full_name || 'Unassigned Driver';
    document.getElementById('selectedVehicle').textContent = user.vehicle_number || 'No Vehicle';
    document.getElementById('selectedDistance').textContent = user.distance_km ? `${user.distance_km} km` : '-- km';
    document.getElementById('selectedDuration').textContent = user.est_duration_min ? `${user.est_duration_min} min` : '-- min';

    const statusEl = document.getElementById('selectedStatus');
    const status = String(user.assignment_status || 'pending').toLowerCase();
    let statusClass = 'text-yellow-400';
    if (status === 'active') statusClass = 'text-[#2DD4BF]';
    if (status === 'in_transit') statusClass = 'text-sky-400';
    if (status === 'completed') statusClass = 'text-blue-400';
    if (status === 'cancelled') statusClass = 'text-rose-400';

    const statusLabel = status
        .split('_')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');

    statusEl.textContent = statusLabel;
    statusEl.className = `text-sm font-bold ${statusClass}`;

    const startTime = user.assigned_at ? new Date(user.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    document.getElementById('selectedStartTime').textContent = startTime;
}

function hideTaskDetails(options = {}) {
    const { clearSelection = false } = options;

    hideDetailsPanelContent();

    if (clearSelection) {
        selectedAssignmentId = null;
        selectedAssignment = null;
        clearMapMarkers();
        clearMapRoute();
        setDispatchTableVisibility(false);
        resetDispatchTaskTable();
    }

    setDispatchMapVisibility(true);
}

function drawAssignmentRoute(user, options = {}) {
    const { hideMap = false } = options;

    clearMapRoute();
    if (!user || user.pickup_lat == null || user.pickup_lng == null || user.dest_lat == null || user.dest_lng == null) return;

    currentMapRoute = createRoutingControl(
        map,
        { lat: user.pickup_lat, lng: user.pickup_lng },
        { lat: user.dest_lat, lng: user.dest_lng },
        function(e) {
            const { summary, instructions } = e.routes[0];
            document.getElementById('mapRouteDirections').classList.remove('hidden');
            document.getElementById('mapDirectionsContent')?.classList.remove('hidden');
            document.getElementById('mapRouteSummary').textContent = `• ${formatDistance(summary.totalDistance)} • ${formatTime(summary.totalTime)}`;
            populateMapDirections(instructions);
            setDispatchMapVisibility(!hideMap);
        }
    );
}

function populateMapDirections(instructions) {
    const list = document.getElementById('mapDirectionsList');
    list.innerHTML = instructions.map((inst, i) => `
        <li class="flex items-start gap-3 px-4 py-2 hover:bg-gray-700/30 transition">
            <div class="flex-shrink-0 w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-300">${i + 1}</div>
            <div class="flex-1 min-w-0">
                <p class="text-xs text-white">${inst.text}</p>
                <p class="text-[10px] text-gray-500">${formatDistance(inst.distance)}</p>
            </div>
            <div class="flex-shrink-0 text-gray-500">${getDirectionIcon(inst.type, 'w-3 h-3')}</div>
        </li>
    `).join('');
}

// ===========================================
// SECTION 4: EDIT ASSIGNMENT MODAL (UPDATE FLOW)
// ===========================================
let editAssignmentMap = null;
let editAssignmentMarkers = [];
let editMapMode = 'pickup';
let editPickupCoords = null;
let editDestCoords = null;
let editRoutingControl = null;

async function openEditAssignmentModal() {
    if (!selectedAssignmentId) return;

    const user = getAssignmentById(selectedAssignmentId);
    if (!user) return;

    clearInlineMessage(document.getElementById('editAssignmentError'));
    clearInlineMessage(document.getElementById('editAssignmentSuccess'));
    document.getElementById('editAssignmentId').value = user.assignment_id;
    document.getElementById('editAssignmentDriver').textContent = user.full_name || 'Unassigned Driver';
    document.getElementById('editAssignmentStatus').value = user.assignment_status || 'active';
    const editModal = document.getElementById('editAssignmentModal');
    if (editModal) {
        editModal.dataset.currentStatus = normalizeDispatchTaskStatus(user.assignment_status || 'pending');
    }
    syncEditAssignmentStatusOptions(user.assignment_status || 'pending');

    try {
        await loadAssignableVehicles({
            limit: 20,
            includeVehicleId: user.vehicle_id,
            requireAssigned: true,
            targetSelectId: 'editAssignmentVehicleSelect',
            placeholder: 'Choose vehicle for this assignment...'
        });
    } catch (_) {
        showInlineMessage(document.getElementById('editAssignmentError'), 'Unable to load assignable vehicles.');
    }

    const vehicleSelect = document.getElementById('editAssignmentVehicleSelect');
    if (vehicleSelect && user.vehicle_id) {
        vehicleSelect.value = String(user.vehicle_id);
    }

    const pickupLat = parseFloat(user.pickup_lat);
    const pickupLng = parseFloat(user.pickup_lng);
    const destLat = parseFloat(user.dest_lat);
    const destLng = parseFloat(user.dest_lng);

    editPickupCoords = { lat: pickupLat, lng: pickupLng };
    editDestCoords = { lat: destLat, lng: destLng };

    document.getElementById('editPickupInput').value = `${pickupLat.toFixed(5)}, ${pickupLng.toFixed(5)}`;
    document.getElementById('editDestInput').value = `${destLat.toFixed(5)}, ${destLng.toFixed(5)}`;

    openModal('editAssignmentModal');
    setTimeout(() => initEditAssignmentMap(user), 300);
}

function initEditAssignmentMap(user) {
    if (editAssignmentMap) {
        editAssignmentMap.remove();
        editAssignmentMap = null;
    }

    const pickupLat = parseFloat(user.pickup_lat) || 14.6091;
    const pickupLng = parseFloat(user.pickup_lng) || 121.0223;
    const destLat = parseFloat(user.dest_lat);
    const destLng = parseFloat(user.dest_lng);

    editAssignmentMap = L.map('editAssignmentMap', {
        center: [pickupLat, pickupLng],
        zoom: 14,
        zoomControl: true
    });

    addDarkTileLayer(editAssignmentMap);

    editAssignmentMarkers = [];

    if (pickupLat && pickupLng) {
        editAssignmentMarkers[0] = L.marker([pickupLat, pickupLng], { icon: greenIcon }).addTo(editAssignmentMap);
    }

    if (destLat && destLng) {
        editAssignmentMarkers[1] = L.marker([destLat, destLng], { icon: redIcon }).addTo(editAssignmentMap);
        editAssignmentMap.fitBounds([[pickupLat, pickupLng], [destLat, destLng]], { padding: [30, 30] });
    }

    setEditMapMode('pickup');
    editAssignmentMap.on('click', handleEditMapClick);

    setTimeout(() => {
        editAssignmentMap.invalidateSize();
        updateEditRoute();
    }, 100);
}

function setEditMapMode(mode) {
    editMapMode = mode;
    const modeDot = document.getElementById('editModeDot');
    const modeText = document.getElementById('editModeText');

    if (mode === 'pickup') {
        modeDot.className = 'w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse';
        modeText.className = 'text-[10px] font-bold text-[#2DD4BF] uppercase tracking-widest';
        modeText.textContent = 'Set Pickup Point';
    } else {
        modeDot.className = 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
        modeText.className = 'text-[10px] font-bold text-red-400 uppercase tracking-widest';
        modeText.textContent = 'Set Destination Point';
    }
}

function handleEditMapClick(e, overrideAddress = null) {
    const { lat, lng } = e.latlng || e;
    const coordString = overrideAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    if (editMapMode === 'pickup') {
        editPickupCoords = { lat, lng };
        document.getElementById('editPickupInput').value = coordString;
        if (editAssignmentMarkers[0]) editAssignmentMap.removeLayer(editAssignmentMarkers[0]);
        
        // Make draggable
        editAssignmentMarkers[0] = L.marker([lat, lng], { icon: greenIcon, draggable: true }).addTo(editAssignmentMap)
            .bindPopup('<b class="text-slate-900">Pickup</b>').openPopup();
        
        editAssignmentMarkers[0].on('dragend', function(ev) {
            const pos = ev.target.getLatLng();
            editPickupCoords = { lat: pos.lat, lng: pos.lng };
            document.getElementById('editPickupInput').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
            updateEditRoute();
        });
        
        setEditMapMode('dest');
    } else {
        editDestCoords = { lat, lng };
        document.getElementById('editDestInput').value = coordString;
        if (editAssignmentMarkers[1]) editAssignmentMap.removeLayer(editAssignmentMarkers[1]);
        
        // Make draggable
        editAssignmentMarkers[1] = L.marker([lat, lng], { icon: redIcon, draggable: true }).addTo(editAssignmentMap)
            .bindPopup('<b class="text-slate-900">Destination</b>').openPopup();
        
        editAssignmentMarkers[1].on('dragend', function(ev) {
            const pos = ev.target.getLatLng();
            editDestCoords = { lat: pos.lat, lng: pos.lng };
            document.getElementById('editDestInput').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
            updateEditRoute();
        });

        setEditMapMode('pickup');
    }

    updateEditRoute();
}

function updateEditRoute() {
    if (editRoutingControl) {
        editAssignmentMap.removeControl(editRoutingControl);
        editRoutingControl = null;
    }

    document.getElementById('editTripStats').classList.add('hidden');
    if (!editPickupCoords || !editDestCoords) return;

    editRoutingControl = createRoutingControl(editAssignmentMap, editPickupCoords, editDestCoords, function(e) {
        const summary = e.routes[0].summary;
        document.getElementById('editTripStats').classList.remove('hidden');
        document.getElementById('editTimeVal').textContent = formatTime(summary.totalTime);
        document.getElementById('editDistVal').textContent = formatDistance(summary.totalDistance);
    });
}

async function saveAssignmentChanges() {
    const vehicleInput = document.getElementById('editAssignmentVehicleSelect').value;
    const assignmentId = document.getElementById('editAssignmentId').value;
    const errorEl = document.getElementById('editAssignmentError');
    const successEl = document.getElementById('editAssignmentSuccess');
    const currentStatus = document.getElementById('editAssignmentModal')?.dataset.currentStatus || 'pending';
    const nextStatus = document.getElementById('editAssignmentStatus').value;
    const submitBtn = document.querySelector('#editAssignmentModal button[type="button"][onclick*="saveAssignmentChanges"]');
    
    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    if (!getAllowedDispatchTaskStatuses(currentStatus).has(nextStatus)) {
        showInlineMessage(errorEl, getDispatchTaskStatusHint(currentStatus));
        return;
    }

    // ─── SHOW LOADING STATE ───
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        // ─── SEND TO BACKEND: LET SERVER VALIDATE ALL BUSINESS RULES ───
        const response = await fetch(`${DISPATCH_API_BASE}/assignments/${assignmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                vehicleId: vehicleInput ?? null,
                pickupLat: editPickupCoords?.lat ?? null,
                pickupLng: editPickupCoords?.lng ?? null,
                destLat: editDestCoords?.lat ?? null,
                destLng: editDestCoords?.lng ?? null,
                status: nextStatus
            })
        });

        const payload = await response.json();

        if (!response.ok) {
            // ─── WIRE SERVER VALIDATION ERROR ───
            displayErrorFromResponse(errorEl, payload);
            return;
        }

        // ─── SUCCESS: DISPLAY SERVER MESSAGE ───
        showInlineMessage(successEl, payload.message || 'Assignment updated successfully.');

        await loadMapAssignments();
        hideTaskDetails({ clearSelection: true });

        setTimeout(() => {
            closeModal('editAssignmentModal');
        }, 700);
    } catch (error) {
        console.error('Network or server error:', error);
        showInlineMessage(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        // ─── RESTORE BUTTON STATE ───
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

// ===========================================
// SECTION 5: DELETE ASSIGNMENT FLOW
// ===========================================

function openDeleteAssignmentModal() {
    if (!selectedAssignmentId) return;

    const user = getAssignmentById(selectedAssignmentId);
    if (!user) return;

    clearInlineMessage(document.getElementById('deleteAssignmentError'));
    clearInlineMessage(document.getElementById('deleteAssignmentSuccess'));
    document.getElementById('deleteAssignmentId').value = user.assignment_id;
    document.getElementById('deleteAssignmentDriverName').textContent = user.full_name || 'Unassigned Driver';
    document.getElementById('deleteAssignmentVehicle').textContent = `Vehicle: ${user.vehicle_number || 'Not assigned'}`;

    openModal('deleteAssignmentModal');
}

async function confirmDeleteAssignment() {
    const errorEl = document.getElementById('deleteAssignmentError');
    const successEl = document.getElementById('deleteAssignmentSuccess');
    const assignmentId = document.getElementById('deleteAssignmentId').value;
    const confirmBtn = document.querySelector('#deleteAssignmentModal button[type="button"][onclick*="confirmDeleteAssignment"]');

    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    // ─── SHOW LOADING STATE ───
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        // ─── SEND DELETE REQUEST TO BACKEND ───
        const response = await fetch(`${DISPATCH_API_BASE}/assignments/${assignmentId}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' }
        });

        const payload = await response.json();

        if (!response.ok) {
            // ─── WIRE SERVER ERROR ───
            displayErrorFromResponse(errorEl, payload);
            return;
        }

        // ─── SUCCESS: DISPLAY SERVER MESSAGE ───
        showInlineMessage(successEl, payload.message || 'Assignment cancelled successfully.');

        await Promise.all([loadMapAssignments(), loadAssignableVehicles()]);
        hideTaskDetails({ clearSelection: true });

        setTimeout(() => {
            closeModal('deleteAssignmentModal');
        }, 700);
    } catch (error) {
        console.error('Network or server error:', error);
        showInlineMessage(errorEl, 'Connection error. Please check your network and try again.');
    } finally {
        // ─── RESTORE BUTTON STATE ───
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

// ===========================================
// SECTION 6: PAGE BOOTSTRAPPING
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    initUsersMap();
    loadMapAssignments();
});


// ===========================================
// SECTION 7: GEOCODING & DRAGGABLE MARKERS
// ===========================================
async function geocodeAddress(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error("Geocoding failed:", error);
        return null;
    }
}

async function handleMapSearch(event, mode, context) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    
    const inputElement = event.target;
    const query = inputElement.value;
    if (!query) return;

    const originalPlaceholder = inputElement.placeholder;
    inputElement.placeholder = "Searching...";
    inputElement.value = "";

    const result = await geocodeAddress(query);
    
    if (result) {
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        // Clean up the long OSM address
        const cleanAddress = result.display_name.split(',').slice(0, 3).join(', '); 
        
        if (context === 'assign') {
            if (!taskMap) return;
            taskMap.flyTo([lat, lng], 15, { animate: true });
            placeDraggableMarker(lat, lng, mode, cleanAddress);
        } else if (context === 'edit') {
            if (!editAssignmentMap) return;
            editAssignmentMap.flyTo([lat, lng], 15, { animate: true });
            if (mode === 'pickup') setEditMapMode('pickup');
            else setEditMapMode('dest');
            
            handleEditMapClick({ latlng: { lat, lng } }, cleanAddress);
        }
    } else {
        alert("Address not found. Please try a different search term.");
        inputElement.value = query;
    }
    inputElement.placeholder = originalPlaceholder;
}

function placeDraggableMarker(lat, lng, mode, overrideAddress = null) {
    const coordString = overrideAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    if (mode === 'pickup') {
        if (pickupMarker) taskMap.removeLayer(pickupMarker);
        
        pickupMarker = L.marker([lat, lng], { icon: greenIcon, draggable: true }).addTo(taskMap)
            .bindPopup('<b class="text-slate-900">Pickup</b><br><span class="text-xs text-slate-600">Drag to adjust</span>').openPopup();
        
        document.getElementById('pickupInput').value = coordString;
        
        pickupMarker.on('dragend', function(e) {
            const pos = e.target.getLatLng();
            document.getElementById('pickupInput').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
            updateTaskRoute();
        });

        setTaskMode('dest');
    } else {
        if (destMarker) taskMap.removeLayer(destMarker);
        
        destMarker = L.marker([lat, lng], { icon: redIcon, draggable: true }).addTo(taskMap)
            .bindPopup('<b class="text-slate-900">Destination</b><br><span class="text-xs text-slate-600">Drag to adjust</span>').openPopup();
        
        document.getElementById('destInput').value = coordString;
        
        destMarker.on('dragend', function(e) {
            const pos = e.target.getLatLng();
            document.getElementById('destInput').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
            updateTaskRoute();
        });
    }

    updateTaskRoute();
}

// ===========================================
// SECTION 8: GLOBAL EXPORTS
// ===========================================
window.goToAssignmentsPage = goToAssignmentsPage;
