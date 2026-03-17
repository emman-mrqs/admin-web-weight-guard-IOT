/* ==========================================================================
   LIVE COMMAND CENTER MAP LOGIC
   ========================================================================== */

let map;
let markerGroup;
let zoneLayerGroup;
let isDarkMap = true;
let showZones = true;

// Define Base Layers
const darkTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const satTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const darkLayer = L.tileLayer(darkTileUrl, { maxZoom: 19, subdomains: 'abcd' });
const satLayer = L.tileLayer(satTileUrl, { maxZoom: 19 });

// Sample highly-detailed vehicle data
const liveVehicles = [
    { 
        id: 'RC-8802', 
        driver: 'Marcus Lee',
        type: 'Trailer Truck', 
        pos: [14.7335, 121.1470], 
        status: 'in_transit',
        speed: '65 km/h',
        load: '920 kg / 1.2t',
        location: 'San Jose, Rodriguez',
        updated: 'Just now',
        image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80'
    },
    { 
        id: 'RC-0034', 
        driver: 'Sarah Connor',
        type: 'Reefer Truck', 
        pos: [14.7298, 121.1423], 
        status: 'loss', 
        speed: '0 km/h',
        load: '450 kg / 1.2t (-300kg)',
        location: 'San Rafael, Rodriguez',
        updated: '2 mins ago',
        image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=400&q=80'
    },
    { 
        id: 'RC-7721', 
        driver: 'John Doe',
        type: 'Trailer Truck', 
        pos: [14.7150, 121.1350], 
        status: 'overload', 
        speed: '45 km/h',
        load: '1.4t / 1.2t (+200kg)',
        location: 'Payatas Road',
        updated: '14 mins ago',
        image: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=400&q=80'
    },
    { 
        id: 'RC-9211', 
        driver: 'Alex Mercer',
        type: 'Small Truck', 
        pos: [14.7351, 121.1409], 
        status: 'in_transit',
        speed: '30 km/h',
        load: '200 kg / 0.5t',
        location: 'Manggahan, Rodriguez',
        updated: '1 min ago',
        image: 'https://images.unsplash.com/photo-1610495811776-880295368a52?auto=format&fit=crop&w=400&q=80'
    }
];

document.addEventListener('DOMContentLoaded', () => {

    // 1. INITIALIZE MAP (Centered on Rodriguez, Rizal)
    map = L.map('live-fleet-map', {
        zoomControl: false, 
        attributionControl: false
    }).setView([14.7298, 121.1423], 14);

    // Add Dark Mode Default
    darkLayer.addTo(map);

    // Groups for filtering
    markerGroup = L.layerGroup().addTo(map);
    zoneLayerGroup = L.layerGroup().addTo(map);

    // Render Initial Data
    drawZones();
    renderMarkers(liveVehicles);
    renderIncidentList(liveVehicles);

    // 2. EVENT LISTENERS
    document.getElementById('btnMapStyle').addEventListener('click', () => toggleMapStyle('dark'));
    document.getElementById('btnSatStyle').addEventListener('click', () => toggleMapStyle('sat'));

    // Filter Listeners
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('vehicleSearch').addEventListener('input', applyFilters);
});

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

function generateDetailedPopup(v) {
    let statusBadge = '';
    if (v.status === 'loss') statusBadge = '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest animate-pulse">Cargo Loss</span>';
    else if (v.status === 'overload') statusBadge = '<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">Overload</span>';
    else statusBadge = '<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">In Transit</span>';

    return `
        <div class="flex flex-col w-full h-full">
            <div class="h-32 w-full relative">
                <img src="${v.image}" class="w-full h-full object-cover" alt="Truck Image">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/50 to-transparent"></div>
                
                <div class="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                    <div>
                        <p class="text-[10px] font-bold text-slate-300 uppercase tracking-widest drop-shadow-md shadow-black">${v.type}</p>
                        <h2 class="text-xl font-extrabold text-white font-mono drop-shadow-md shadow-black">${v.id}</h2>
                    </div>
                    ${statusBadge}
                </div>
            </div>

            <div class="p-5 space-y-4">
                <div class="flex justify-between items-center pb-3 border-b border-slate-800">
                    <div>
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Assigned Driver</p>
                        <p class="text-sm font-bold text-slate-200">${v.driver}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Speed</p>
                        <p class="text-sm font-bold text-blue-400 font-mono">${v.speed}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 pb-3 border-b border-slate-800">
                    <div>
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Location</p>
                        <p class="text-xs font-bold text-slate-300 truncate" title="${v.location}">${v.location}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Last Update</p>
                        <p class="text-xs font-bold text-slate-400">${v.updated}</p>
                    </div>
                </div>

                <div>
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Load Status</p>
                    <p class="text-xs font-bold font-mono ${v.status === 'loss' ? 'text-rose-400' : v.status === 'overload' ? 'text-amber-400' : 'text-slate-300'}">${v.load}</p>
                </div>

                <div class="pt-2">
                    <button onclick="window.location.href='/admin/fleet'" class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-extrabold rounded-xl transition uppercase tracking-widest shadow-md">
                        View Full Telemetry
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderMarkers(dataToRender) {
    markerGroup.clearLayers();
    document.getElementById('activeUnitCount').textContent = dataToRender.length;

    dataToRender.forEach(v => {
        const marker = L.marker(v.pos, { icon: createLiveIcon(v.status) });
        marker.bindPopup(generateDetailedPopup(v));
        markerGroup.addLayer(marker);
    });
}

/* ==========================================================================
   FILTERING & UI LOGIC
   ========================================================================== */

function applyFilters() {
    const searchVal = document.getElementById('vehicleSearch').value.toLowerCase();
    const catVal = document.getElementById('categoryFilter').value;
    const statusVal = document.getElementById('statusFilter').value;

    const filtered = liveVehicles.filter(v => {
        const matchSearch = v.id.toLowerCase().includes(searchVal) || v.driver.toLowerCase().includes(searchVal);
        const matchCat = catVal === 'all' || v.type === catVal;
        const matchStatus = statusVal === 'all' || v.status === statusVal;
        return matchSearch && matchCat && matchStatus;
    });

    renderMarkers(filtered);
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
    if(vehicle) {
        map.setView(vehicle.pos, 16, { animate: true, duration: 1 });
        // Automatically open popup if possible (requires finding the specific marker in the layer group)
        markerGroup.eachLayer(layer => {
            const latlng = layer.getLatLng();
            if(latlng.lat === vehicle.pos[0] && latlng.lng === vehicle.pos[1]) {
                layer.openPopup();
            }
        });
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
        isDarkMap = false;
        
        btnSat.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow-sm transition";
        btnMap.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition";
    } else if (style === 'dark' && !isDarkMap) {
        map.removeLayer(satLayer);
        darkLayer.addTo(map);
        isDarkMap = true;

        btnMap.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest bg-slate-800 text-white rounded-lg shadow-sm transition";
        btnSat.className = "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition";
    }
}

/* ==========================================================================
   MAP OVERLAYS (ZONES)
   ========================================================================== */

function drawZones() {
    // Simulated GeoJSON for Rodriguez Boundaries (Visual flair to match Img 2)
    const zoneCoordinates = [
        [[14.75, 121.12], [14.75, 121.17], [14.71, 121.16], [14.71, 121.12], [14.75, 121.12]]
    ];

    L.polygon(zoneCoordinates, {
        color: '#8b5cf6', // Violet color to match reference
        weight: 2,
        opacity: 0.6,
        fillColor: '#8b5cf6',
        fillOpacity: 0.05,
        dashArray: '5, 5'
    }).addTo(zoneLayerGroup);
}

function toggleZones() {
    showZones = !showZones;
    if (showZones) {
        map.addLayer(zoneLayerGroup);
    } else {
        map.removeLayer(zoneLayerGroup);
    }
}