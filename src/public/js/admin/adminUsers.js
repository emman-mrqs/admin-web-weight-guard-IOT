// ===========================================
// UTILITY FUNCTIONS (Shared)
// ===========================================

// Shared constants
const DEFAULT_CENTER = [14.6091, 121.0223]; // Manila, Philippines
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
};
const OSRM_SERVICE_URL = 'https://router.project-osrm.org/route/v1';
const ROUTE_LINE_STYLE = [{ color: '#3B82F6', opacity: 0.8, weight: 6 }];

/**
 * Get user initials from full name
 */
function getInitials(fullName) {
    return fullName.split(" ").map(n => n[0]).join("").toUpperCase();
}

/**
 * Format seconds to human readable time
 */
function formatTime(seconds) {
    const m = Math.round(seconds / 60);
    if (m > 60) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h}h ${min}m`;
    }
    return `${m} min`;
}

/**
 * Format meters to human readable distance
 */
function formatDistance(meters) {
    if (meters > 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

/**
 * Get direction icon SVG based on turn type
 */
function getDirectionIcon(type, iconClass = 'w-4 h-4') {
    const icons = {
        'Left': `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>`,
        'Right': `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`,
        'SlightLeft': `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0v12"></path></svg>`,
        'SlightRight': `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 11l-5-5m0 0v12"></path></svg>`,
        'Straight': `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>`,
        'DestinationReached': `<svg class="${iconClass} text-[#2DD4BF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`
    };
    return icons[type] || `<svg class="${iconClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>`;
}

/**
 * Add dark tile layer to a map instance
 */
function addDarkTileLayer(mapInstance) {
    L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(mapInstance);
}

/**
 * Create OSRM routing control with standard options
 */
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
    })
    .on('routesfound', onRoutesFound)
    .addTo(mapInstance);
}

// ===========================================
// VIEW SWITCHING LOGIC
// ===========================================

function switchView(viewName) {
    const listView = document.getElementById('listView');
    const mapView = document.getElementById('mapView');
    const tabList = document.getElementById('tab-list');
    const tabMap = document.getElementById('tab-map');

    if (viewName === 'list') {
        listView.classList.remove('hidden');
        mapView.classList.add('hidden');
        
        tabList.classList.add('tab-active');
        tabList.classList.remove('tab-inactive');
        tabMap.classList.remove('tab-active');
        tabMap.classList.add('tab-inactive');
    } else {
        listView.classList.add('hidden');
        mapView.classList.remove('hidden');
        
        tabMap.classList.add('tab-active');
        tabMap.classList.remove('tab-inactive');
        tabList.classList.remove('tab-active');
        tabList.classList.add('tab-inactive');

        setTimeout(() => {
            initUsersMap();
            if (map) {
                map.invalidateSize();
                loadMapAssignments();
            }
        }, 100);
    }
}

// ===========================================
// MODAL LOGIC
// ===========================================

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

// ===========================================
// PASSWORD TOGGLE & GENERATOR
// ===========================================

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>`;
    } else {
        input.type = 'password';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>`;
    }
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < 12; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    
    const passwordField = document.getElementById('addPassword');
    const confirmField = document.getElementById('addConfirmPassword');
    
    if (passwordField) passwordField.value = password;
    if (confirmField) confirmField.value = password;
    
    passwordField.type = 'text';
    confirmField.type = 'text';
    
    const eyeOffSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>`;
    
    const icon1 = document.getElementById('toggleAddPasswordIcon');
    const icon2 = document.getElementById('toggleAddConfirmPasswordIcon');
    if (icon1) icon1.innerHTML = eyeOffSvg;
    if (icon2) icon2.innerHTML = eyeOffSvg;
}

// ===========================================
// SHARED MARKER ICONS
// ===========================================

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

// ===========================================
// ASSIGN TASK MODAL - MAP LOGIC
// ===========================================

let taskMap = null;
let pickupMarker = null;
let destMarker = null;
let routingControl = null;
let activeMode = 'pickup';
let taskMapInitialized = false;

function initTaskMap() {
    if (taskMapInitialized) return;
    
    // Initialize map centered on Manila/Philippines
    taskMap = L.map('taskMap').setView(DEFAULT_CENTER, 13);
    
    // Add dark tiles
    addDarkTileLayer(taskMap);

    // Click Handler
    taskMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        const coordString = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        if (activeMode === 'pickup') {
            if (pickupMarker) taskMap.removeLayer(pickupMarker);
            
            pickupMarker = L.marker([lat, lng], {icon: greenIcon}).addTo(taskMap)
                .bindPopup("<b>Pickup Location</b>").openPopup();
            
            document.getElementById('pickupInput').value = coordString;
            setTaskMode('dest');
        } else {
            if (destMarker) taskMap.removeLayer(destMarker);
            
            destMarker = L.marker([lat, lng], {icon: redIcon}).addTo(taskMap)
                .bindPopup("<b>Destination</b>").openPopup();
            
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
            
            // Populate route directions
            populateRouteDirections(instructions, summary);
        });
    }
}

function populateRouteDirections(instructions, summary) {
    const directionsPanel = document.getElementById('routeDirections');
    const directionsList = document.getElementById('directionsList');
    const summaryText = document.getElementById('routeSummaryText');
    
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
    const content = document.getElementById('directionsContent');
    const chevron = document.getElementById('directionsChevron');
    
    content.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
}

function setTaskMode(mode) {
    activeMode = mode;
    const modeText = document.getElementById('modeText');
    const modeDot = document.getElementById('modeDot');
    const pInput = document.getElementById('pickupInput');
    const dInput = document.getElementById('destInput');
    const mapContainer = document.getElementById('taskMap');
    const modalContent = document.querySelector('#assignTaskModal .modal-content');

    if (mode === 'pickup') {
        modeText.textContent = "Set Pickup Point";
        modeText.className = "text-xs font-bold text-[#2DD4BF]";
        modeDot.className = "w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse";
        
        pInput.parentElement.classList.add('ring-2', 'ring-[#2DD4BF]/50');
        pInput.classList.remove('border-gray-700');
        pInput.classList.add('border-[#2DD4BF]');
        
        dInput.parentElement.classList.remove('ring-2', 'ring-red-400/50');
        dInput.classList.add('border-gray-700');
        dInput.classList.remove('border-red-500');
        
        // Update cursor
        if (mapContainer) {
            mapContainer.classList.remove('cursor-dest');
            mapContainer.classList.add('cursor-pickup');
        }
        if (modalContent) {
            modalContent.classList.remove('dest-mode');
            modalContent.classList.add('pickup-mode');
        }
    } else {
        modeText.textContent = "Set Destination";
        modeText.className = "text-xs font-bold text-red-400";
        modeDot.className = "w-2 h-2 rounded-full bg-red-400 animate-pulse";
        
        dInput.parentElement.classList.add('ring-2', 'ring-red-400/50');
        dInput.classList.remove('border-gray-700');
        dInput.classList.add('border-red-500');

        pInput.parentElement.classList.remove('ring-2', 'ring-[#2DD4BF]/50');
        pInput.classList.add('border-gray-700');
        pInput.classList.remove('border-[#2DD4BF]');
        
        // Update cursor
        if (mapContainer) {
            mapContainer.classList.remove('cursor-pickup');
            mapContainer.classList.add('cursor-dest');
        }
        if (modalContent) {
            modalContent.classList.remove('pickup-mode');
            modalContent.classList.add('dest-mode');
        }
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
    document.getElementById('pickupInput').value = "";
    document.getElementById('destInput').value = "";
    document.getElementById('tripStats').classList.add('hidden');
    
    // Hide and reset route directions
    document.getElementById('routeDirections').classList.add('hidden');
    document.getElementById('directionsContent').classList.add('hidden');
    document.getElementById('directionsChevron').classList.remove('rotate-180');
    document.getElementById('directionsList').innerHTML = '';
    
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

    // Load available drivers
    loadAvailableDrivers();

    // Initialize Map after modal is visible
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

async function dispatchTask() {
    const errorEl = document.getElementById('taskFormError');
    const successEl = document.getElementById('taskFormSuccess');
    
    // Clear previous messages
    errorEl.textContent = '';
    successEl.textContent = '';
    
    const driverSelect = document.getElementById('taskDriverSelect');
    const driverId = driverSelect.value;
    const driverName = driverSelect.options[driverSelect.selectedIndex]?.text || '';
    const vehicle = document.getElementById('taskVehicleSelect').value;
    const pickup = document.getElementById('pickupInput').value;
    const dest = document.getElementById('destInput').value;
    const time = document.getElementById('timeVal').innerText;
    const dist = document.getElementById('distVal').innerText;
    
    if(!driverId || !pickup || !dest || !vehicle) {
        errorEl.textContent = 'Please fill in all fields (Driver, Vehicle, Pickup, Destination)';
        return;
    }

    // Parse coordinates from pickup and dest strings
    const pickupCoords = pickup.split(',').map(c => parseFloat(c.trim()));
    const destCoords = dest.split(',').map(c => parseFloat(c.trim()));

    // Parse distance and time
    let distanceKm = parseFloat(dist.replace(' km', '').replace(' m', ''));
    if (dist.includes(' m') && !dist.includes(' km')) {
        distanceKm = distanceKm / 1000; // Convert meters to km
    }
    
    let estDurationMin = parseInt(time.replace(' min', '').replace('h ', '*60+').replace('m', ''));
    if (time.includes('h')) {
        const parts = time.match(/(\d+)h\s*(\d+)m?/);
        if (parts) {
            estDurationMin = parseInt(parts[1]) * 60 + parseInt(parts[2] || 0);
        }
    }

    // Prepare payload
    const payload = {
        driverId: parseInt(driverId),
        vehicleNumber: `RC-${vehicle}`,
        pickupLat: pickupCoords[0],
        pickupLng: pickupCoords[1],
        destLat: destCoords[0],
        destLng: destCoords[1],
        distanceKm: distanceKm,
        estDurationMin: estDurationMin
    };

    try {
        const response = await fetch('/admin/assignments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            errorEl.textContent = data.error;
            return;
        }

        successEl.textContent = `Task dispatched successfully! Driver: ${driverName}, Vehicle: RC-${vehicle}`;
        
        // Close modal and reset after a short delay
        setTimeout(() => {
            closeAssignTaskModal();
            resetTaskMap();
            loadUsers(); // Refresh user list
            summaryStats(); // Refresh summary stats    
            // Clear messages for next time
            errorEl.textContent = '';
            successEl.textContent = '';
        }, 1500);

    } catch (error) {
        console.error('Error dispatching task:', error);
        errorEl.textContent = 'Failed to dispatch task. Please try again.';
    }
}

// Fetch available drivers for the dropdown
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
        console.error('Error loading available drivers:', error);
        const select = document.getElementById('taskDriverSelect');
        select.innerHTML = '<option value="">Error loading drivers</option>';
    }
}




// ===========================================
// MAP VIEW - DISPLAY USER ASSIGNMENTS
// ===========================================

let map = null;
let mapInitialized = false;
let mapMarkers = [];
let currentMapRoute = null;
let selectedAssignmentId = null;
let cachedAssignedUsers = []; // Cache for updating UI without refetch

/**
 * Initialize the users map view
 */
function initUsersMap() {
    if (mapInitialized) return;
    
    map = L.map('users-map', {
        zoomControl: true,
        attributionControl: false
    }).setView(DEFAULT_CENTER, 12);

    addDarkTileLayer(map);

    mapInitialized = true;
    loadMapAssignments();
}

/**
 * Clear markers only (preserves route)
 */
function clearMapMarkers() {
    mapMarkers.forEach(marker => {
        if (map && marker) map.removeLayer(marker);
    });
    mapMarkers = [];
}

/**
 * Clear route only
 */
function clearMapRoute() {
    if (currentMapRoute && map) {
        map.removeControl(currentMapRoute);
        currentMapRoute = null;
    }
}

/**
 * Load assignments and display on map
 */
async function loadMapAssignments() {
    const listContainer = document.getElementById('assignmentsList');
    
    try {
        const response = await fetch('/admin/users/fetch');
        const data = await response.json();
        
        // Filter users with active or pending assignments that have coordinates
        cachedAssignedUsers = data.users.filter(u => 
            u.assignment_id && 
            (u.assignment_status === 'active' || u.assignment_status === 'pending') &&
            u.pickup_lat && u.pickup_lng && u.dest_lat && u.dest_lng
        );
        
        // Clear existing markers and route
        clearMapMarkers();
        clearMapRoute();
        selectedAssignmentId = null;
        
        if (cachedAssignedUsers.length === 0) {
            listContainer.innerHTML = `
                <div class="p-4 text-center text-gray-500 text-xs">
                    <svg class="w-10 h-10 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>
                    </svg>
                    <p class="font-bold">No Active Assignments</p>
                    <p class="mt-1">Dispatch a task to see routes here</p>
                </div>
            `;
            hideTaskDetails();
            return;
        }
        
        // Build UI from cached data (no markers until user clicks)
        renderAssignmentsList();
        
    } catch (error) {
        console.error('Error loading map assignments:', error);
        listContainer.innerHTML = `
            <div class="p-4 text-center text-red-400 text-xs">
                <svg class="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="font-bold">Error Loading</p>
                <p class="mt-1">Failed to load assignments</p>
            </div>
        `;
    }
}

/**
 * Render assignments list from cache (no API call)
 */
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
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                    ${user.distance_km ? user.distance_km + ' km' : '--'}
                </span>
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${user.est_duration_min ? user.est_duration_min + ' min' : '--'}
                </span>
            </div>
        `;
        
        listContainer.appendChild(assignmentDiv);
    });
}

/**
 * Add pickup and destination markers for an assignment
 */
function addAssignmentMarkers(user) {
    const pickupMarkerObj = L.marker([user.pickup_lat, user.pickup_lng], { icon: greenIcon })
        .addTo(map)
        .bindPopup(`<b class="text-green-600">Pickup</b><br>${user.full_name}<br>${user.vehicle_number || ''}`);
    mapMarkers.push(pickupMarkerObj);
    
    const destMarkerObj = L.marker([user.dest_lat, user.dest_lng], { icon: redIcon })
        .addTo(map)
        .bindPopup(`<b class="text-red-600">Destination</b><br>${user.full_name}<br>${user.vehicle_number || ''}`);
    mapMarkers.push(destMarkerObj);
}

/**
 * Select an assignment and show its route
 */
function selectAssignment(user) {
    selectedAssignmentId = user.assignment_id;
    
    // Update list styling
    renderAssignmentsList();
    
    // Clear previous markers and add only for selected user
    clearMapMarkers();
    addAssignmentMarkers(user);
    
    // Show details and draw route
    showTaskDetails(user);
    drawAssignmentRoute(user);
}

/**
 * Show task details panel
 */
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
    
    const startTime = user.assigned_at 
        ? new Date(user.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : '--';
    document.getElementById('selectedStartTime').textContent = startTime;
}

/**
 * Hide task details panel
 */
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

/**
 * Draw route for selected assignment
 */
function drawAssignmentRoute(user) {
    // Clear any existing route first
    clearMapRoute();
    
    if (!user || !user.pickup_lat || !user.pickup_lng || !user.dest_lat || !user.dest_lng) return;
    
    currentMapRoute = createRoutingControl(
        map,
        { lat: user.pickup_lat, lng: user.pickup_lng },
        { lat: user.dest_lat, lng: user.dest_lng },
        function(e) {
            const { summary, instructions } = e.routes[0];
            
            document.getElementById('mapRouteDirections').classList.remove('hidden');
            document.getElementById('mapRouteSummary').textContent = 
                `• ${formatDistance(summary.totalDistance)} • ${formatTime(summary.totalTime)}`;
            
            populateMapDirections(instructions);
        }
    );
}

/**
 * Toggle map directions panel
 */
function toggleMapDirections() {
    const content = document.getElementById('mapDirectionsContent');
    const chevron = document.getElementById('mapDirectionsChevron');
    
    content.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
}

/**
 * Populate map directions list
 */
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

/**
 * Locate user on map from list view - switches to map and selects assignment
 */
function locateUserOnMap(assignmentId) {
    if (!assignmentId) return;
    
    // Switch to map view
    switchView('map');
    
    // Wait for map to initialize and data to load, then select the assignment
    setTimeout(() => {
        const user = cachedAssignedUsers.find(u => u.assignment_id == assignmentId);
        if (user) {
            selectAssignment(user);
        }
    }, 500);
}

// ========================
// ASSIGNMENT EDIT/DELETE FUNCTIONS
// ========================

let editAssignmentMap = null;
let editAssignmentMarkers = [];
let editMapMode = 'pickup';
let editPickupCoords = null;
let editDestCoords = null;
let editRoutingControl = null;

/**
 * Open edit assignment modal
 */
function openEditAssignmentModal() {
    if (!selectedAssignmentId) {
        console.error('No assignment selected');
        return;
    }
    
    // Use == for comparison to handle type coercion (number vs string)
    const user = cachedAssignedUsers.find(u => u.assignment_id == selectedAssignmentId);
    if (!user) {
        console.error('User not found for assignment:', selectedAssignmentId);
        return;
    }
    
    // Clear messages
    const errorEl = document.getElementById('editAssignmentError');
    const successEl = document.getElementById('editAssignmentSuccess');
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';
    
    // Populate form
    document.getElementById('editAssignmentId').value = user.assignment_id;
    document.getElementById('editAssignmentDriver').textContent = user.full_name;
    document.getElementById('editAssignmentVehicle').value = user.vehicle_number?.replace('RC-', '') || '0001';
    document.getElementById('editAssignmentStatus').value = user.assignment_status || 'active';
    
    // Store coordinates (parse as float in case they come as strings from DB)
    const pickupLat = parseFloat(user.pickup_lat);
    const pickupLng = parseFloat(user.pickup_lng);
    const destLat = parseFloat(user.dest_lat);
    const destLng = parseFloat(user.dest_lng);
    
    editPickupCoords = { lat: pickupLat, lng: pickupLng };
    editDestCoords = { lat: destLat, lng: destLng };
    
    // Update coordinate inputs
    document.getElementById('editPickupInput').value = `${pickupLat.toFixed(5)}, ${pickupLng.toFixed(5)}`;
    document.getElementById('editDestInput').value = `${destLat.toFixed(5)}, ${destLng.toFixed(5)}`;
    
    // Open modal
    openModal('editAssignmentModal');
    
    // Initialize map after modal opens
    setTimeout(() => {
        initEditAssignmentMap(user);
    }, 300);
}

/**
 * Initialize map for edit assignment modal
 */
function initEditAssignmentMap(user) {
    const mapContainer = document.getElementById('editAssignmentMap');
    if (!mapContainer) return;
    
    // Destroy existing map
    if (editAssignmentMap) {
        editAssignmentMap.remove();
        editAssignmentMap = null;
    }
    
    // Parse coordinates as floats
    const pickupLat = parseFloat(user.pickup_lat) || 14.6091;
    const pickupLng = parseFloat(user.pickup_lng) || 121.0223;
    const destLat = parseFloat(user.dest_lat);
    const destLng = parseFloat(user.dest_lng);
    
    // Create new map
    editAssignmentMap = L.map('editAssignmentMap', {
        center: [pickupLat, pickupLng],
        zoom: 14,
        zoomControl: true
    });
    
    addDarkTileLayer(editAssignmentMap);
    
    // Clear and add markers using shared icons
    editAssignmentMarkers = [];
    
    if (pickupLat && pickupLng) {
        const pickupMarker = L.marker([pickupLat, pickupLng], { icon: greenIcon }).addTo(editAssignmentMap);
        editAssignmentMarkers.push(pickupMarker);
    }
    
    if (destLat && destLng) {
        const destMarker = L.marker([destLat, destLng], { icon: redIcon }).addTo(editAssignmentMap);
        editAssignmentMarkers.push(destMarker);
    }
    
    // Fit bounds to show both markers
    if (pickupLat && destLat) {
        editAssignmentMap.fitBounds([
            [pickupLat, pickupLng],
            [destLat, destLng]
        ], { padding: [30, 30] });
    }
    
    // Set initial mode
    setEditMapMode('pickup');
    
    // Handle map clicks
    editAssignmentMap.on('click', handleEditMapClick);
    
    // Fix map rendering in modal - invalidate size after brief delay
    setTimeout(() => {
        editAssignmentMap.invalidateSize();
        // Calculate initial route
        updateEditRoute();
    }, 100);
}

/**
 * Set edit map mode with input highlighting
 */
function setEditMapMode(mode) {
    editMapMode = mode;
    const mapContainer = document.getElementById('editAssignmentMap');
    const modeDot = document.getElementById('editModeDot');
    const modeText = document.getElementById('editModeText');
    const pInput = document.getElementById('editPickupInput');
    const dInput = document.getElementById('editDestInput');
    const pWrapper = document.getElementById('editPickupInputWrapper');
    const dWrapper = document.getElementById('editDestInputWrapper');
    const modalContent = document.querySelector('#editAssignmentModal .modal-content');
    
    if (mode === 'pickup') {
        // Update mode indicator
        modeDot.classList.remove('bg-red-500');
        modeDot.classList.add('bg-[#2DD4BF]');
        modeText.textContent = 'Set Pickup Point';
        modeText.classList.remove('text-red-400');
        modeText.classList.add('text-[#2DD4BF]');
        
        // Highlight pickup input
        pWrapper.classList.add('ring-2', 'ring-[#2DD4BF]/50');
        pInput.classList.remove('border-gray-700');
        pInput.classList.add('border-[#2DD4BF]');
        
        // Remove highlight from destination input
        dWrapper.classList.remove('ring-2', 'ring-red-400/50');
        dInput.classList.add('border-gray-700');
        dInput.classList.remove('border-red-500');
        
        // Update cursor
        mapContainer.classList.remove('cursor-dest');
        mapContainer.classList.add('cursor-pickup');
        if (modalContent) {
            modalContent.classList.remove('dest-mode');
            modalContent.classList.add('pickup-mode');
        }
    } else {
        // Update mode indicator
        modeDot.classList.remove('bg-[#2DD4BF]');
        modeDot.classList.add('bg-red-500');
        modeText.textContent = 'Set Destination Point';
        modeText.classList.remove('text-[#2DD4BF]');
        modeText.classList.add('text-red-400');
        
        // Highlight destination input
        dWrapper.classList.add('ring-2', 'ring-red-400/50');
        dInput.classList.remove('border-gray-700');
        dInput.classList.add('border-red-500');
        
        // Remove highlight from pickup input
        pWrapper.classList.remove('ring-2', 'ring-[#2DD4BF]/50');
        pInput.classList.add('border-gray-700');
        pInput.classList.remove('border-[#2DD4BF]');
        
        // Update cursor
        mapContainer.classList.remove('cursor-pickup');
        mapContainer.classList.add('cursor-dest');
        if (modalContent) {
            modalContent.classList.remove('pickup-mode');
            modalContent.classList.add('dest-mode');
        }
    }
}

/**
 * Handle edit map click
 */
function handleEditMapClick(e) {
    const { lat, lng } = e.latlng;
    
    if (editMapMode === 'pickup') {
        editPickupCoords = { lat, lng };
        document.getElementById('editPickupInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        
        // Remove old pickup marker
        if (editAssignmentMarkers[0]) {
            editAssignmentMap.removeLayer(editAssignmentMarkers[0]);
        }
        
        // Add new pickup marker using shared icon
        editAssignmentMarkers[0] = L.marker([lat, lng], { icon: greenIcon }).addTo(editAssignmentMap);
        
        // Switch to destination mode
        setEditMapMode('dest');
        
    } else {
        editDestCoords = { lat, lng };
        document.getElementById('editDestInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        
        // Remove old destination marker
        if (editAssignmentMarkers[1]) {
            editAssignmentMap.removeLayer(editAssignmentMarkers[1]);
        }
        
        // Add new destination marker using shared icon
        editAssignmentMarkers[1] = L.marker([lat, lng], { icon: redIcon }).addTo(editAssignmentMap);
        
        // Switch back to pickup mode
        setEditMapMode('pickup');
    }
    
    // Calculate route if both points are set
    updateEditRoute();
}

/**
 * Update/calculate OSRM route for edit modal
 */
function updateEditRoute() {
    // Clear existing route
    if (editRoutingControl) {
        editAssignmentMap.removeControl(editRoutingControl);
        editRoutingControl = null;
    }
    
    // Hide trip stats
    document.getElementById('editTripStats').classList.add('hidden');
    
    // Only calculate if both points exist
    if (!editPickupCoords || !editDestCoords) return;
    
    editRoutingControl = createRoutingControl(
        editAssignmentMap,
        editPickupCoords,
        editDestCoords,
        function(e) {
            const summary = e.routes[0].summary;
            
            // Show trip stats
            document.getElementById('editTripStats').classList.remove('hidden');
            document.getElementById('editTimeVal').textContent = formatTime(summary.totalTime);
            document.getElementById('editDistVal').textContent = formatDistance(summary.totalDistance);
        }
    );
}

/**
 * Save assignment changes
 */
async function saveAssignmentChanges() {
    const assignmentId = document.getElementById('editAssignmentId').value;
    const vehicleInput = document.getElementById('editAssignmentVehicle').value.trim();
    const vehicleNumber = 'RC-' + (vehicleInput || '0001');
    const status = document.getElementById('editAssignmentStatus').value;
    
    const errorEl = document.getElementById('editAssignmentError');
    const successEl = document.getElementById('editAssignmentSuccess');
    
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';
    
    // Validate vehicle number
    if (!vehicleInput) {
        if (errorEl) errorEl.textContent = 'Please enter a vehicle number.';
        return;
    }
    
    if (!editPickupCoords || !editDestCoords) {
        if (errorEl) errorEl.textContent = 'Please set both pickup and destination points.';
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
            if (errorEl) errorEl.textContent = data.error || 'Update failed.';
            return;
        }
        
        if (successEl) successEl.textContent = 'Assignment updated successfully!';
        
        // Refresh and close
        setTimeout(() => {
            closeModal('editAssignmentModal');
            loadMapAssignments();
            hideTaskDetails();
        }, 800);
        
    } catch (err) {
        console.error('Error updating assignment:', err);
        if (errorEl) errorEl.textContent = 'Something went wrong. Please try again.';
    }
}

/**
 * Open delete assignment modal
 */
function openDeleteAssignmentModal() {
    if (!selectedAssignmentId) {
        console.error('No assignment selected');
        return;
    }
    
    const user = cachedAssignedUsers.find(u => u.assignment_id == selectedAssignmentId);
    if (!user) {
        console.error('User not found for assignment:', selectedAssignmentId);
        return;
    }
    
    // Clear messages
    const errorEl = document.getElementById('deleteAssignmentError');
    const successEl = document.getElementById('deleteAssignmentSuccess');
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';
    
    // Populate modal
    document.getElementById('deleteAssignmentId').value = user.assignment_id;
    document.getElementById('deleteAssignmentDriverName').textContent = user.full_name;
    document.getElementById('deleteAssignmentVehicle').textContent = `Vehicle: ${user.vehicle_number || 'Not assigned'}`;
    
    // Open modal
    openModal('deleteAssignmentModal');
}

/**
 * Confirm delete assignment
 */
async function confirmDeleteAssignment() {
    const assignmentId = document.getElementById('deleteAssignmentId').value;
    const errorEl = document.getElementById('deleteAssignmentError');
    const successEl = document.getElementById('deleteAssignmentSuccess');
    
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';
    
    try {
        const res = await fetch(`/admin/assignments/${assignmentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            if (errorEl) errorEl.textContent = data.error || 'Delete failed.';
            return;
        }
        
        if (successEl) successEl.textContent = 'Assignment cancelled successfully!';
        
        // Refresh and close
        setTimeout(() => {
            closeModal('deleteAssignmentModal');
            loadMapAssignments();
            hideTaskDetails();
            loadUsers(); // refresh user list
            summaryStats(); // refresh stats
        }, 800);
        
    } catch (err) {
        console.error('Error deleting assignment:', err);
        if (errorEl) errorEl.textContent = 'Something went wrong. Please try again.';
    }
}

// Summary Stats
async function summaryStats() {
    try {
        const res = await fetch("/admin/users/fetch");
        const data = await res.json();

        const activeUser = data.users.filter(u => u.status === 'active').length;
        const inTransitUser = data.users.filter(u => u.assignment_status === 'active').length;
        const unassignedUser = data.users.filter(u => !u.assignment_id).length;

        const div = document.getElementById("summaryStats");
        div.innerHTML = `
            <div class="card-bg p-4 rounded-xl">
                <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Total Users</p>
                <p class="text-2xl font-bold text-white">${data.users.length}</p>
            </div>
            <div class="card-bg p-4 rounded-xl border-l-4 border-[#2DD4BF]">
                <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Active Now</p>
                <p class="text-2xl font-bold text-white">${activeUser}</p>
            </div>
            <div class="card-bg p-4 rounded-xl">
                <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">In Transit</p>
                <p class="text-2xl font-bold text-white">${inTransitUser}</p>
            </div>
            <div class="card-bg p-4 rounded-xl">
                <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Unassigned</p>
                <p class="text-2xl font-bold text-white">${unassignedUser}</p>
            </div>
        `;
    } catch (err) {
        console.error("Error fetching summary stats:", err);
    }
}
// Call it after DOM loaded
document.addEventListener("DOMContentLoaded", summaryStats);


// Handle Add User Form Submission
document.getElementById("addUserForm").addEventListener("submit", async function(e) {
    e.preventDefault(); // stop page reload

    const form = e.target;

    // Create JSON payload from the form
    const payload = {
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        email: form.email.value,
        password: form.password.value,
        confirmPassword: form.confirmPassword.value,
    };

    const errorEl = document.getElementById("formError");
    const successEl = document.getElementById("formSuccess");

    errorEl.textContent = "";
    successEl.textContent = "";

    try {
        const res = await fetch("/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json" // important!
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error;
            return;
        }
        loadUsers(); // refresh user list
        summaryStats(); // refresh stats

        successEl.textContent = data.message;
        form.reset();

        // optional: close modal after success
        // setTimeout(() => closeModal("addUserModal"), 1500);

    } catch (err) {
        errorEl.textContent = "Something went wrong. Please try again.";
        console.error(err);
    }
});

// Fetch user list and populate table
async function loadUsers() {
    try {
        const res = await fetch("/admin/users/fetch"); // your route
        const data = await res.json();

        // console.log("Fetched users JSON:", data); // check what comes from server

        const tbody = document.getElementById("usersTableBody");
        tbody.innerHTML = "";

        data.users.forEach(user => {
            const initials = getInitials(user.full_name);

            // Check if user has an active assignment from database
            const hasAssignment = user.assignment_id && user.assignment_status;
            let assignment = "UNASSIGNED";
            let assignmentClass = "bg-gray-800 text-gray-400";
            let vehicleInfo = "";
            let tripInfo = "";
            
            if (hasAssignment) {
                if (user.assignment_status === 'active') {
                    assignment = "IN TRANSIT";
                    assignmentClass = "bg-[#2DD4BF]/10 text-[#2DD4BF]";
                } else if (user.assignment_status === 'pending') {
                    assignment = "PENDING";
                    assignmentClass = "bg-yellow-900/20 text-yellow-400";
                }
                vehicleInfo = user.vehicle_number || '';
                if (user.distance_km && user.est_duration_min) {
                    tripInfo = `${user.distance_km} km • ${user.est_duration_min} min`;
                }
            }

            const statusClass = user.status.toLowerCase() === "active"
                ? "bg-green-900/20 text-green-500"
                : "bg-orange-900/20 text-orange-400";

            const row = document.createElement("tr");
            
            row.className = "hover:bg-gray-800/30 transition group";
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">${initials}</div>
                        <div>
                            <p class="text-sm font-bold text-white">${user.full_name}</p>
                            <p class="text-xs text-gray-500">${user.email}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col">
                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${assignmentClass} text-[10px] font-bold w-fit mb-1 border ${hasAssignment ? 'border-current/20' : 'border-gray-700'}">
                            ${hasAssignment && user.assignment_status === 'active' ? '<span class="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-pulse"></span>' : ''}
                            ${hasAssignment && user.assignment_status === 'pending' ? '<span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>' : ''}
                            ${assignment}
                        </span>
                        ${vehicleInfo ? `<span class="text-xs text-gray-300 font-mono">${vehicleInfo}</span>` : ''}
                        ${tripInfo ? `<span class="text-[10px] text-gray-500">${tripInfo}</span>` : ''}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full ${statusClass} text-[10px] font-bold">${user.status.toUpperCase()}</span>
                </td>
                <td class="px-6 py-4 text-xs text-gray-400">${new Date(user.created_at).toLocaleDateString()}</td>
                <td class="px-6 py-4">
                    <div class="flex gap-2">
                        <button onclick="locateUserOnMap(${user.assignment_id})" 
                            class="p-2 transition rounded-lg border ${hasAssignment 
                                ? 'text-white hover:bg-gray-700 bg-gray-800 border-gray-600 cursor-pointer' 
                                : 'text-gray-600 bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50'}" 
                            title="${hasAssignment ? 'Locate on Map' : 'No active assignment'}" 
                            ${hasAssignment ? '' : 'disabled'}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                        </button>
                        <button onclick="openModal('historyModal')" class="p-2 text-[#2DD4BF] hover:text-teal-300 transition bg-teal-900/20 rounded-lg border border-teal-500/30 hover:border-teal-500/50" title="Cargo Integrity History">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                        </button>                 
                        <button onclick="openEditUserModal(${user.id})" class="p-2 text-blue-400 hover:text-blue-300 transition bg-blue-900/20 rounded-lg border border-blue-500/30" title="Edit User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button onclick="openDeleteUserModal(${user.id}, '${user.full_name.replace(/'/g, "\\'")}')"
                            class="p-2 text-red-500 hover:text-red-400 transition bg-red-900/20 rounded-lg border border-red-500/30" title="Delete User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            `;

            // Append row to table body
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error("Error loading users:", err);
    }
}
// Load users on page load (Add users Modal)
window.addEventListener("DOMContentLoaded", loadUsers);

// Handle Edit User Form Submission
async function openEditUserModal(userId) {
    try {
        // Fetch all users and find the one we need
        const res = await fetch("/admin/users/fetch");
        const data = await res.json();
        
        const user = data.users.find(u => u.id === userId);
        
        if (!user) {
            console.error("User not found");
            return;
        }

        // Split full_name into first and last name
        const nameParts = user.full_name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Populate form fields
        document.getElementById("editUserId").value = user.id;
        document.getElementById("editFirstName").value = firstName;
        document.getElementById("editLastName").value = lastName;
        document.getElementById("editEmail").value = user.email;
        document.getElementById("editStatus").value = user.status;

        // Clear any previous error/success messages
        const errorEl = document.getElementById("editFormError");
        const successEl = document.getElementById("editFormSuccess");
        if (errorEl) errorEl.textContent = "";
        if (successEl) successEl.textContent = "";

        // Open the modal
        openModal('editUserModal');

    } catch (err) {
        console.error("Error fetching user data:", err);
    }
}

// Handle AJAX form submission for editing user (PUT request)
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("editUserForm");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault(); // stop page reload

        const userId = document.getElementById("editUserId").value;

        // Build payload matching the controller's expected fields
        const payload = {
            firstName: document.getElementById("editFirstName").value,
            lastName: document.getElementById("editLastName").value,
            status: document.getElementById("editStatus").value
        };

        const errorEl = document.getElementById("editFormError");
        const successEl = document.getElementById("editFormSuccess");

        if (errorEl) errorEl.textContent = "";
        if (successEl) successEl.textContent = "";

        try {
            const res = await fetch(`/admin/users/${userId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                if (errorEl) errorEl.textContent = data.error || "Update failed.";
                return;
            }

            if (successEl) successEl.textContent = data.message || "User updated successfully.";

            loadUsers(); // refresh user list
            summaryStats(); // refresh stats

        } catch (err) {
            console.error("Error updating user:", err);
            if (errorEl) errorEl.textContent = "Something went wrong. Please try again.";
        }
    });
});

// --- Delete User Modal Functions ---
function openDeleteUserModal(userId, userName) {
    // Set user ID and name in the modal
    document.getElementById("deleteUserId").value = userId;
    document.getElementById("deleteUserName").textContent = userName;

    // Clear any previous messages
    const errorEl = document.getElementById("deleteFormError");
    const successEl = document.getElementById("deleteFormSuccess");
    if (errorEl) errorEl.textContent = "";
    if (successEl) successEl.textContent = "";

    // Open the modal
    openModal('deleteUserModal');
}

// Confirm and execute delete
async function confirmDeleteUser() {
    const userId = document.getElementById("deleteUserId").value;
    const errorEl = document.getElementById("deleteFormError");
    const successEl = document.getElementById("deleteFormSuccess");

    if (errorEl) errorEl.textContent = "";
    if (successEl) successEl.textContent = "";

    try {
        const res = await fetch(`/admin/users/${userId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const data = await res.json();

        if (!res.ok) {
            if (errorEl) errorEl.textContent = data.error || "Delete failed.";
            return;
        }

        if (successEl) successEl.textContent = data.message || "User deleted successfully.";

        // Refresh data and close modal after short delay
        setTimeout(() => {
            closeModal("deleteUserModal");
            loadUsers(); // refresh table
            summaryStats(); // refresh stats
        }, 800);

    } catch (err) {
        console.error("Error deleting user:", err);
        if (errorEl) errorEl.textContent = "Something went wrong. Please try again.";
    }
}


// ===========================================
// REAL-TIME GPS TRACKING (WebSocket + Polling Fallback)
// ===========================================

let trackingSocket = null;
let liveLocationMarkers = {};
let trackingInterval = null;
let isTrackingActive = false;

// Blue icon for live driver position
const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

/**
 * Initialize WebSocket connection for real-time tracking
 */
function initTrackingWebSocket() {
    if (trackingSocket && trackingSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tracking`;
    
    try {
        trackingSocket = new WebSocket(wsUrl);
        
        trackingSocket.onopen = () => {
            console.log('[GPS Tracking] WebSocket connected');
            // Clear polling fallback if WebSocket is working
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
                } else if (message.type === 'connected') {
                    console.log('[GPS Tracking]', message.message);
                }
            } catch (error) {
                console.error('[GPS Tracking] Error parsing message:', error);
            }
        };
        
        trackingSocket.onclose = () => {
            console.log('[GPS Tracking] WebSocket disconnected, falling back to polling');
            trackingSocket = null;
            // Fall back to polling if WebSocket disconnects
            if (isTrackingActive) {
                startPollingFallback();
            }
        };
        
        trackingSocket.onerror = (error) => {
            console.error('[GPS Tracking] WebSocket error:', error);
        };
        
    } catch (error) {
        console.error('[GPS Tracking] Failed to create WebSocket:', error);
        startPollingFallback();
    }
}

/**
 * Start polling as fallback when WebSocket is unavailable
 */
function startPollingFallback() {
    if (trackingInterval) return; // Already polling
    
    console.log('[GPS Tracking] Starting polling fallback (every 3s)');
    fetchLiveLocations(); // Initial fetch
    trackingInterval = setInterval(fetchLiveLocations, 3000);
}

/**
 * Fetch live locations via REST API (polling fallback)
 */
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
                    heading: driver.heading ? parseFloat(driver.heading) : null,
                    assignmentId: driver.assignment_id,
                    recordedAt: driver.recorded_at
                });
            });
        }
    } catch (error) {
        console.error('[GPS Tracking] Error fetching locations:', error);
    }
}

/**
 * Handle incoming live location update
 */
function handleLiveLocationUpdate(locationData) {
    if (!map || !mapInitialized) return;
    
    const { userId, fullName, latitude, longitude, speed, heading, recordedAt } = locationData;
    
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
        // Smoothly update existing marker position
        liveLocationMarkers[userId].setLatLng(position);
        liveLocationMarkers[userId].setPopupContent(popupContent);
    } else {
        // Create new marker for this driver
        liveLocationMarkers[userId] = L.marker(position, { icon: blueIcon })
            .addTo(map)
            .bindPopup(popupContent);
    }
    
    // Update live tracking panel if visible
    updateLiveTrackingPanel(locationData);
}

/**
 * Update the live tracking info panel (optional UI element)
 */
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

/**
 * Start real-time tracking
 */
function startLiveTracking() {
    if (isTrackingActive) return;
    
    isTrackingActive = true;
    console.log('[GPS Tracking] Starting live tracking...');
    
    // Try WebSocket first, fall back to polling
    initTrackingWebSocket();
    
    // If WebSocket doesn't connect in 2 seconds, start polling
    setTimeout(() => {
        if (!trackingSocket || trackingSocket.readyState !== WebSocket.OPEN) {
            startPollingFallback();
        }
    }, 2000);
}

/**
 * Stop real-time tracking
 */
function stopLiveTracking() {
    isTrackingActive = false;
    
    // Close WebSocket
    if (trackingSocket) {
        trackingSocket.close();
        trackingSocket = null;
    }
    
    // Stop polling
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    // Clear live markers
    Object.values(liveLocationMarkers).forEach(marker => {
        if (map) map.removeLayer(marker);
    });
    liveLocationMarkers = {};
    
    console.log('[GPS Tracking] Stopped live tracking');
}

/**
 * Clear all live location markers
 */
function clearLiveMarkers() {
    Object.values(liveLocationMarkers).forEach(marker => {
        if (map) map.removeLayer(marker);
    });
    liveLocationMarkers = {};
}

// Modify switchView to start/stop tracking when switching to/from map view
const originalSwitchViewFn = switchView;
switchView = function(viewName) {
    originalSwitchViewFn(viewName);
    
    if (viewName === 'map') {
        // Start live tracking when map view is active
        setTimeout(() => {
            startLiveTracking();
        }, 500);
    } else {
        // Stop tracking when leaving map view
        stopLiveTracking();
    }
};

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopLiveTracking();
});

