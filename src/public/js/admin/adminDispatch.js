const DEFAULT_CENTER = [14.6091, 121.0223];
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
};
const OSRM_SERVICE_URL = 'https://router.project-osrm.org/route/v1';
const ROUTE_LINE_STYLE = [{ color: '#3B82F6', opacity: 0.8, weight: 6 }];

function getInitials(fullName) {
    return fullName.split(' ').map(n => n[0]).join('').toUpperCase();
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
    const content = modal.querySelector('.modal-content');

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
    const content = modal.querySelector('.modal-content');

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

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
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

function initTaskMap() {
    if (taskMapInitialized) return;

    taskMap = L.map('taskMap').setView(DEFAULT_CENTER, 13);
    addDarkTileLayer(taskMap);

    taskMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        const coordString = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        if (activeMode === 'pickup') {
            if (pickupMarker) taskMap.removeLayer(pickupMarker);
            pickupMarker = L.marker([lat, lng], { icon: greenIcon }).addTo(taskMap).bindPopup('<b>Pickup Location</b>').openPopup();
            document.getElementById('pickupInput').value = coordString;
            setTaskMode('dest');
        } else {
            if (destMarker) taskMap.removeLayer(destMarker);
            destMarker = L.marker([lat, lng], { icon: redIcon }).addTo(taskMap).bindPopup('<b>Destination</b>').openPopup();
            document.getElementById('destInput').value = coordString;
        }

        updateTaskRoute();
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

function toggleDirections() {
    const content = document.getElementById('mapDirectionsContent');
    const chevron = document.getElementById('mapDirectionsChevron');
    if (!content || !chevron) return;
    content.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
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
    const directionsChevron = document.getElementById('mapDirectionsChevron');
    const directionsList = document.getElementById('mapDirectionsList');

    if (routeDirections) routeDirections.classList.add('hidden');
    if (directionsContent) directionsContent.classList.add('hidden');
    if (directionsChevron) directionsChevron.classList.remove('rotate-180');
    if (directionsList) directionsList.innerHTML = '';
    setTaskMode('pickup');
    taskMap.setView(DEFAULT_CENTER, 13);
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

    loadAvailableDrivers();

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

async function loadAvailableDrivers() {
    try {
        const response = await fetch('/admin/users/available-drivers');
        const data = await response.json();

        const select = document.getElementById('taskDriverSelect');
        select.innerHTML = '<option value="">Choose an available driver...</option>';

        if (data.drivers && data.drivers.length > 0) {
            data.drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = `${driver.full_name} (Available)`;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">No available drivers</option>';
        }
    } catch (error) {
        const select = document.getElementById('taskDriverSelect');
        select.innerHTML = '<option value="">Error loading drivers</option>';
    }
}

async function dispatchTask() {
    const errorEl = document.getElementById('taskFormError');
    const successEl = document.getElementById('taskFormSuccess');

    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    const driverSelect = document.getElementById('taskDriverSelect');
    const driverId = driverSelect.value;
    const driverName = driverSelect.options[driverSelect.selectedIndex]?.text || '';
    const vehicle = document.getElementById('taskVehicleSelect').value;
    const pickup = document.getElementById('pickupInput').value;
    const dest = document.getElementById('destInput').value;
    const time = document.getElementById('timeVal').innerText;
    const dist = document.getElementById('distVal').innerText;

    if (!driverId || !pickup || !dest || !vehicle) {
        showInlineMessage(errorEl, 'Please fill in all fields (Driver, Vehicle, Pickup, Destination)');
        return;
    }

    const pickupCoords = pickup.split(',').map(c => parseFloat(c.trim()));
    const destCoords = dest.split(',').map(c => parseFloat(c.trim()));

    let distanceKm = parseFloat(dist.replace(' km', '').replace(' m', ''));
    if (dist.includes(' m') && !dist.includes(' km')) {
        distanceKm = distanceKm / 1000;
    }

    let estDurationMin = parseInt(time.replace(' min', '').replace('h ', '*60+').replace('m', ''));
    if (time.includes('h')) {
        const parts = time.match(/(\d+)h\s*(\d+)m?/);
        if (parts) {
            estDurationMin = parseInt(parts[1]) * 60 + parseInt(parts[2] || 0);
        }
    }

    const payload = {
        driverId: parseInt(driverId),
        vehicleNumber: `RC-${vehicle}`,
        pickupLat: pickupCoords[0],
        pickupLng: pickupCoords[1],
        destLat: destCoords[0],
        destLng: destCoords[1],
        distanceKm,
        estDurationMin
    };

    try {
        const response = await fetch('/admin/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            showInlineMessage(errorEl, data.error);
            return;
        }

        showInlineMessage(successEl, `Task dispatched successfully! Driver: ${driverName}, Vehicle: RC-${vehicle}`);

        setTimeout(() => {
            closeAssignTaskModal();
            resetTaskMap();
            loadMapAssignments();
            clearInlineMessage(errorEl);
            clearInlineMessage(successEl);
        }, 1200);
    } catch (error) {
        showInlineMessage(errorEl, 'Failed to dispatch task. Please try again.');
    }
}

let map = null;
let mapInitialized = false;
let mapMarkers = [];
let currentMapRoute = null;
let selectedAssignmentId = null;
let cachedAssignedUsers = [];
let requestedAssignmentId = new URLSearchParams(window.location.search).get('assignmentId');

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

async function loadMapAssignments() {
    const listContainer = document.getElementById('assignmentsList');

    try {
        const response = await fetch('/admin/users/fetch');
        const data = await response.json();

        cachedAssignedUsers = data.users.filter(u =>
            u.assignment_id &&
            (u.assignment_status === 'active' || u.assignment_status === 'pending') &&
            u.pickup_lat && u.pickup_lng && u.dest_lat && u.dest_lng
        );

        clearMapMarkers();
        clearMapRoute();
        selectedAssignmentId = null;

        if (cachedAssignedUsers.length === 0) {
            listContainer.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs"><p class="font-bold">No Active Assignments</p><p class="mt-1">Dispatch a task to see routes here</p></div>';
            hideTaskDetails();
            return;
        }

        renderAssignmentsList();

        if (requestedAssignmentId) {
            const target = cachedAssignedUsers.find(u => String(u.assignment_id) === String(requestedAssignmentId));
            if (target) {
                selectAssignment(target);
            }
            requestedAssignmentId = null;
        }
    } catch (error) {
        listContainer.innerHTML = '<div class="p-4 text-center text-red-400 text-xs">Failed to load assignments</div>';
    }
}

function renderAssignmentsList() {
    const listContainer = document.getElementById('assignmentsList');
    listContainer.innerHTML = '';

    cachedAssignedUsers.forEach(user => {
        const initials = getInitials(user.full_name);
        const isSelected = selectedAssignmentId == user.assignment_id;
        const isActive = user.assignment_status === 'active';

        const assignmentDiv = document.createElement('div');
        assignmentDiv.className = `p-3 rounded-lg cursor-pointer border transition group ${
            isSelected
                ? 'bg-[#2DD4BF]/10 border-[#2DD4BF]/50'
                : 'bg-gray-800/50 hover:bg-[#2DD4BF]/10 border-transparent hover:border-[#2DD4BF]/30'
        }`;
        assignmentDiv.onclick = () => selectAssignment(user);

        assignmentDiv.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">${initials}</div>
                    <div>
                        <p class="text-sm font-bold ${isSelected ? 'text-[#2DD4BF]' : 'text-white group-hover:text-[#2DD4BF]'}">${user.full_name}</p>
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
}

function addAssignmentMarkers(user) {
    const pickupMarkerObj = L.marker([user.pickup_lat, user.pickup_lng], { icon: greenIcon }).addTo(map);
    mapMarkers.push(pickupMarkerObj);

    const destMarkerObj = L.marker([user.dest_lat, user.dest_lng], { icon: redIcon }).addTo(map);
    mapMarkers.push(destMarkerObj);
}

function selectAssignment(user) {
    selectedAssignmentId = user.assignment_id;
    renderAssignmentsList();
    clearMapMarkers();
    addAssignmentMarkers(user);
    showTaskDetails(user);
    drawAssignmentRoute(user);
}

function showTaskDetails(user) {
    const panel = document.getElementById('selectedTaskDetails');
    panel.classList.remove('hidden');

    document.getElementById('selectedDriverName').textContent = user.full_name;
    document.getElementById('selectedVehicle').textContent = user.vehicle_number || 'No Vehicle';
    document.getElementById('selectedDistance').textContent = user.distance_km ? `${user.distance_km} km` : '-- km';
    document.getElementById('selectedDuration').textContent = user.est_duration_min ? `${user.est_duration_min} min` : '-- min';

    const statusEl = document.getElementById('selectedStatus');
    const isActive = user.assignment_status === 'active';
    statusEl.textContent = isActive ? 'Active' : 'Pending';
    statusEl.className = `text-sm font-bold ${isActive ? 'text-[#2DD4BF]' : 'text-yellow-400'}`;

    const startTime = user.assigned_at ? new Date(user.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    document.getElementById('selectedStartTime').textContent = startTime;
}

function hideTaskDetails() {
    const panel = document.getElementById('selectedTaskDetails');
    const directions = document.getElementById('mapRouteDirections');
    const content = document.getElementById('mapDirectionsContent');

    if (panel) panel.classList.add('hidden');
    if (directions) directions.classList.add('hidden');
    if (content) content.classList.add('hidden');

    selectedAssignmentId = null;
    clearMapMarkers();
    clearMapRoute();
}

function drawAssignmentRoute(user) {
    clearMapRoute();
    if (!user || !user.pickup_lat || !user.pickup_lng || !user.dest_lat || !user.dest_lng) return;

    currentMapRoute = createRoutingControl(
        map,
        { lat: user.pickup_lat, lng: user.pickup_lng },
        { lat: user.dest_lat, lng: user.dest_lng },
        function(e) {
            const { summary, instructions } = e.routes[0];
            document.getElementById('mapRouteDirections').classList.remove('hidden');
            document.getElementById('mapRouteSummary').textContent = `• ${formatDistance(summary.totalDistance)} • ${formatTime(summary.totalTime)}`;
            populateMapDirections(instructions);
        }
    );
}

function toggleMapDirections() {
    const content = document.getElementById('mapDirectionsContent');
    const chevron = document.getElementById('mapDirectionsChevron');
    content.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
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

let editAssignmentMap = null;
let editAssignmentMarkers = [];
let editMapMode = 'pickup';
let editPickupCoords = null;
let editDestCoords = null;
let editRoutingControl = null;

function openEditAssignmentModal() {
    if (!selectedAssignmentId) return;

    const user = cachedAssignedUsers.find(u => u.assignment_id == selectedAssignmentId);
    if (!user) return;

    clearInlineMessage(document.getElementById('editAssignmentError'));
    clearInlineMessage(document.getElementById('editAssignmentSuccess'));
    document.getElementById('editAssignmentId').value = user.assignment_id;
    document.getElementById('editAssignmentDriver').textContent = user.full_name;
    document.getElementById('editAssignmentVehicle').value = user.vehicle_number?.replace('RC-', '') || '0001';
    document.getElementById('editAssignmentStatus').value = user.assignment_status || 'active';

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
        modeDot.classList.remove('bg-red-500');
        modeDot.classList.add('bg-[#2DD4BF]');
        modeText.textContent = 'Set Pickup Point';
        modeText.classList.remove('text-red-400');
        modeText.classList.add('text-[#2DD4BF]');
    } else {
        modeDot.classList.remove('bg-[#2DD4BF]');
        modeDot.classList.add('bg-red-500');
        modeText.textContent = 'Set Destination Point';
        modeText.classList.remove('text-[#2DD4BF]');
        modeText.classList.add('text-red-400');
    }
}

function handleEditMapClick(e) {
    const { lat, lng } = e.latlng;

    if (editMapMode === 'pickup') {
        editPickupCoords = { lat, lng };
        document.getElementById('editPickupInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        if (editAssignmentMarkers[0]) editAssignmentMap.removeLayer(editAssignmentMarkers[0]);
        editAssignmentMarkers[0] = L.marker([lat, lng], { icon: greenIcon }).addTo(editAssignmentMap);
        setEditMapMode('dest');
    } else {
        editDestCoords = { lat, lng };
        document.getElementById('editDestInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        if (editAssignmentMarkers[1]) editAssignmentMap.removeLayer(editAssignmentMarkers[1]);
        editAssignmentMarkers[1] = L.marker([lat, lng], { icon: redIcon }).addTo(editAssignmentMap);
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
    const assignmentId = document.getElementById('editAssignmentId').value;
    const vehicleInput = document.getElementById('editAssignmentVehicle').value.trim();
    const vehicleNumber = 'RC-' + (vehicleInput || '0001');
    const status = document.getElementById('editAssignmentStatus').value;

    const errorEl = document.getElementById('editAssignmentError');
    const successEl = document.getElementById('editAssignmentSuccess');
    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    if (!vehicleInput) {
        showInlineMessage(errorEl, 'Please enter a vehicle number.');
        return;
    }

    if (!editPickupCoords || !editDestCoords) {
        showInlineMessage(errorEl, 'Please set both pickup and destination points.');
        return;
    }

    try {
        const res = await fetch(`/admin/assignments/${assignmentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicle_number: vehicleNumber,
                status: status,
                pickup_lat: editPickupCoords.lat,
                pickup_lng: editPickupCoords.lng,
                dest_lat: editDestCoords.lat,
                dest_lng: editDestCoords.lng
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showInlineMessage(errorEl, data.error || 'Update failed.');
            return;
        }

        showInlineMessage(successEl, 'Assignment updated successfully!');

        setTimeout(() => {
            closeModal('editAssignmentModal');
            loadMapAssignments();
            hideTaskDetails();
        }, 800);
    } catch (err) {
        showInlineMessage(errorEl, 'Something went wrong. Please try again.');
    }
}

function openDeleteAssignmentModal() {
    if (!selectedAssignmentId) return;

    const user = cachedAssignedUsers.find(u => u.assignment_id == selectedAssignmentId);
    if (!user) return;

    clearInlineMessage(document.getElementById('deleteAssignmentError'));
    clearInlineMessage(document.getElementById('deleteAssignmentSuccess'));
    document.getElementById('deleteAssignmentId').value = user.assignment_id;
    document.getElementById('deleteAssignmentDriverName').textContent = user.full_name;
    document.getElementById('deleteAssignmentVehicle').textContent = `Vehicle: ${user.vehicle_number || 'Not assigned'}`;

    openModal('deleteAssignmentModal');
}

async function confirmDeleteAssignment() {
    const assignmentId = document.getElementById('deleteAssignmentId').value;
    const errorEl = document.getElementById('deleteAssignmentError');
    const successEl = document.getElementById('deleteAssignmentSuccess');

    clearInlineMessage(errorEl);
    clearInlineMessage(successEl);

    try {
        const res = await fetch(`/admin/assignments/${assignmentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (!res.ok) {
            showInlineMessage(errorEl, data.error || 'Delete failed.');
            return;
        }

        showInlineMessage(successEl, 'Assignment cancelled successfully!');

        setTimeout(() => {
            closeModal('deleteAssignmentModal');
            loadMapAssignments();
            hideTaskDetails();
        }, 800);
    } catch (err) {
        showInlineMessage(errorEl, 'Something went wrong. Please try again.');
    }
}

let trackingSocket = null;
let liveLocationMarkers = {};
let trackingInterval = null;
let isTrackingActive = false;

function initTrackingWebSocket() {
    if (trackingSocket && trackingSocket.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tracking`;

    try {
        trackingSocket = new WebSocket(wsUrl);

        trackingSocket.onopen = () => {
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
        };

        trackingSocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'location_update') {
                    handleLiveLocationUpdate(message.data);
                }
            } catch (error) {
                console.error('[GPS Tracking] Error parsing message:', error);
            }
        };

        trackingSocket.onclose = () => {
            trackingSocket = null;
            if (isTrackingActive) startPollingFallback();
        };
    } catch (error) {
        startPollingFallback();
    }
}

function startPollingFallback() {
    if (trackingInterval) return;
    fetchLiveLocations();
    trackingInterval = setInterval(fetchLiveLocations, 3000);
}

async function fetchLiveLocations() {
    if (!map || !mapInitialized) return;

    try {
        const response = await fetch('/api/locations/active');
        const data = await response.json();

        if (data.drivers) {
            data.drivers.forEach(driver => {
                handleLiveLocationUpdate({
                    userId: driver.user_id,
                    fullName: driver.full_name,
                    latitude: parseFloat(driver.latitude),
                    longitude: parseFloat(driver.longitude),
                    speed: driver.speed ? parseFloat(driver.speed) : null,
                    assignmentId: driver.assignment_id,
                    recordedAt: driver.recorded_at
                });
            });
        }
    } catch (error) {
        console.error('[GPS Tracking] Error fetching locations:', error);
    }
}

function handleLiveLocationUpdate(locationData) {
    if (!map || !mapInitialized) return;

    const { userId, fullName, latitude, longitude, speed, recordedAt } = locationData;
    if (!latitude || !longitude) return;

    const position = [latitude, longitude];
    const popupContent = `
        <div class="text-center">
            <b class="text-blue-600">${fullName}</b><br>
            <span class="text-xs text-gray-500">
                ${speed ? `Speed: ${speed.toFixed(1)} km/h` : 'Speed: --'}<br>
                Last update: ${new Date(recordedAt).toLocaleTimeString()}
            </span>
        </div>
    `;

    if (liveLocationMarkers[userId]) {
        liveLocationMarkers[userId].setLatLng(position);
        liveLocationMarkers[userId].setPopupContent(popupContent);
    } else {
        liveLocationMarkers[userId] = L.marker(position, { icon: blueIcon }).addTo(map).bindPopup(popupContent);
    }

    updateLiveTrackingPanel(locationData);
}

function updateLiveTrackingPanel(locationData) {
    const panel = document.getElementById('liveTrackingInfo');
    if (!panel) return;

    const { fullName, speed, recordedAt } = locationData;
    panel.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span class="text-xs text-gray-400">
                ${fullName} - ${speed ? speed.toFixed(1) + ' km/h' : 'Stationary'}
                (${new Date(recordedAt).toLocaleTimeString()})
            </span>
        </div>
    `;
}

function startLiveTracking() {
    if (isTrackingActive) return;
    isTrackingActive = true;
    initTrackingWebSocket();

    setTimeout(() => {
        if (!trackingSocket || trackingSocket.readyState !== WebSocket.OPEN) {
            startPollingFallback();
        }
    }, 2000);
}

function stopLiveTracking() {
    isTrackingActive = false;

    if (trackingSocket) {
        trackingSocket.close();
        trackingSocket = null;
    }

    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }

    Object.values(liveLocationMarkers).forEach(marker => {
        if (map) map.removeLayer(marker);
    });
    liveLocationMarkers = {};
}

document.addEventListener('DOMContentLoaded', () => {
    initUsersMap();
    loadMapAssignments();
    startLiveTracking();
});

window.addEventListener('beforeunload', () => {
    stopLiveTracking();
});
