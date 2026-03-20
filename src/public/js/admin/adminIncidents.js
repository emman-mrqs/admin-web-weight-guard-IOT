/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN INCIDENTS MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Real-time incident tracking with OpenStreetMap visualization
 * All data is currently static for UI/UX development
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ STATIC DATA - Sample Incidents for UI Development                        │
// │ Replace with backend API calls when ready for production                 │
// └──────────────────────────────────────────────────────────────────────────┘
const staticIncidents = [
    {
        id: 1,
        created_at: new Date(Date.now() - 5 * 60000).toISOString(),
        vehicle_number: 'VH-2024-001',
        driver_name: 'John Dela Cruz',
        incident_type: 'cargo_loss',
        severity: 'critical',
        status: 'open',
        weight_difference_kg: 15.5,
        description: 'Sudden 15.5kg weight loss detected on highway',
        latitude: 14.5995,
        longitude: 120.9842,
        location_address: 'EDSA, Manila',
        initial_weight_kg: 500
    },
    {
        id: 2,
        created_at: new Date(Date.now() - 25 * 60000).toISOString(),
        vehicle_number: 'VH-2024-005',
        driver_name: 'Maria Santos',
        incident_type: 'overload',
        severity: 'warning',
        status: 'acknowledged',
        weight_difference_kg: 30.2,
        description: 'Truck exceeding maximum weight limit',
        latitude: 14.6091,
        longitude: 120.9827,
        location_address: 'C5 Road, Quezon City',
        initial_weight_kg: 520
    },
    {
        id: 3,
        created_at: new Date(Date.now() - 1.5 * 3600000).toISOString(),
        vehicle_number: 'VH-2024-008',
        driver_name: 'Robert Chen',
        incident_type: 'route_deviation',
        severity: 'info',
        status: 'investigating',
        weight_difference_kg: 0,
        description: 'Vehicle deviated from planned route',
        latitude: 14.5780,
        longitude: 121.0037,
        location_address: 'Makati Avenue, Makati',
        initial_weight_kg: 480
    },
    {
        id: 4,
        created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
        vehicle_number: 'VH-2024-003',
        driver_name: 'Angela Rodriguez',
        incident_type: 'unauthorized_stop',
        severity: 'warning',
        status: 'resolved',
        weight_difference_kg: 0,
        description: 'Unscheduled stop outside delivery zone',
        latitude: 14.5546,
        longitude: 120.9931,
        location_address: 'Pasay City',
        initial_weight_kg: 490
    },
    {
        id: 5,
        created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
        vehicle_number: 'VH-2024-010',
        driver_name: 'James Mitchell',
        incident_type: 'cargo_loss',
        severity: 'critical',
        status: 'false_alarm',
        weight_difference_kg: 8.3,
        description: 'Weight sensor reading error - confirmed false alarm',
        latitude: 14.6348,
        longitude: 121.0048,
        location_address: 'BGC, Taguig',
        initial_weight_kg: 510
    }
];

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ APPLICATION STATE - Global Variables                                     │
// └──────────────────────────────────────────────────────────────────────────┘
let incidentMap = null;
let modalMap = null;
let incidentMarkers = new Map();
let allIncidents = staticIncidents;
let currentIncidentId = null;
let weightChart = null;
let currentView = 'active';

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
};
const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 12;

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ PAGE INITIALIZATION - Load when DOM is Ready                             │
// └──────────────────────────────────────────────────────────────────────────┘
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    renderIncidentTable();
    renderAlertCards();
    renderIncidentMarkers();
    loadStats();
    setupEventListeners();
});

/**
 * Initialize the main incident map
 */
function initMap() {
    incidentMap = L.map('incidentMap', {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true
    });

    L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(incidentMap);
    setTimeout(() => incidentMap.invalidateSize(), 100);
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DATA LOADING - Statistics from Static Data                              │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Load statistics from static data
 */
function loadStats() {
    const criticalCount = allIncidents.filter(i => i.severity === 'critical').length;
    const warningCount = allIncidents.filter(i => i.severity === 'warning').length;
    const openCount = allIncidents.filter(i => ['open', 'acknowledged', 'investigating'].includes(i.status)).length;

    document.getElementById('statCritical').textContent = criticalCount;
    document.getElementById('statWarning').textContent = warningCount;
    document.getElementById('statOpen').textContent = openCount;
    document.getElementById('statRecent').textContent = allIncidents.length;
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ RENDERING FUNCTIONS - Display Incidents & Map                           │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Render incident markers on map
 */
function renderIncidentMarkers() {
    // Clear existing markers
    incidentMarkers.forEach(marker => incidentMap.removeLayer(marker));
    incidentMarkers.clear();

    // Add markers for incidents with location
    allIncidents
        .filter(i => i.latitude && i.longitude && ['open', 'acknowledged', 'investigating'].includes(i.status))
        .forEach(incident => addIncidentMarker(incident));

    // Fit bounds if we have markers
    if (incidentMarkers.size > 0) {
        const group = new L.featureGroup(Array.from(incidentMarkers.values()));
        incidentMap.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Add single incident marker to map
 */
function addIncidentMarker(incident) {
    if (!incident.latitude || !incident.longitude) return;

    const colors = {
        'critical': '#EF4444',
        'warning': '#F59E0B',
        'info': '#3B82F6'
    };

    const color = colors[incident.severity] || colors.info;
    const isPulsing = incident.severity === 'critical' ? 'animate-pulse' : '';

    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg ${isPulsing}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([parseFloat(incident.latitude), parseFloat(incident.longitude)], { icon });

    const popupContent = `
        <div class="p-2 min-w-[200px]">
            <p class="font-bold text-sm" style="color:${color}">${formatIncidentType(incident.incident_type)}</p>
            <p class="text-xs text-gray-600 mb-2">${incident.vehicle_number || 'Unknown Vehicle'}</p>
            <p class="text-xs mb-2">${incident.description || '-'}</p>
            ${incident.weight_difference_kg ? `<p class="text-xs font-bold">Weight Lost: ${parseFloat(incident.weight_difference_kg).toFixed(2)} kg</p>` : ''}
            <button onclick="openIncidentDetail(${incident.id})" class="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">View Details</button>
        </div>
    `;

    marker.bindPopup(popupContent);
    marker.addTo(incidentMap);
    incidentMarkers.set(incident.id, marker);
}

/**
 * Render alert cards (top 3 most recent/critical)
 * Shows only the 3 highest-severity active incidents
 * Automatically hides cards if no incidents are present
 */
function renderAlertCards() {
    const container = document.getElementById('alertCardsContainer');
    
    // Get incidents based on current view
    let displayIncidents = allIncidents;
    if (currentView === 'active') {
        displayIncidents = allIncidents.filter(i => ['open', 'acknowledged', 'investigating'].includes(i.status));
    }

    // Get top 3 open incidents sorted by severity
    const topIncidents = displayIncidents
        .sort((a, b) => {
            const severityOrder = { 'critical': 0, 'warning': 1, 'info': 2 };
            return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
        })
        .slice(0, 3);

    if (topIncidents.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 shadow-lg p-8 rounded-2xl flex items-center justify-center col-span-full min-h-[220px]">
                <div class="text-center">
                    <svg class="w-12 h-12 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p class="text-slate-400 text-sm font-bold uppercase tracking-widest">No Active Incidents</p>
                    <p class="text-slate-500 text-xs mt-2">All systems operating normally</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = topIncidents.map(incident => {
        const severityConfig = {
            'critical': { 
                accentColor: 'rgb(239, 68, 68)',
                borderBg: 'rgba(239, 68, 68, 0.15)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                textColor: 'rgb(248, 113, 113)',
                lightBg: 'rgba(239, 68, 68, 0.1)',
                label: 'Critical Alert',
                icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            },
            'warning': { 
                accentColor: 'rgb(245, 158, 11)',
                borderBg: 'rgba(245, 158, 11, 0.15)',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                textColor: 'rgb(253, 185, 7)',
                lightBg: 'rgba(245, 158, 11, 0.1)',
                label: 'Warning Alert',
                icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            },
            'info': { 
                accentColor: 'rgb(59, 130, 246)',
                borderBg: 'rgba(59, 130, 246, 0.15)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                textColor: 'rgb(96, 165, 250)',
                lightBg: 'rgba(59, 130, 246, 0.1)',
                label: 'Info Alert',
                icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
            }
        };
        const config = severityConfig[incident.severity] || severityConfig.info;
        const timeAgo = formatTimeAgo(incident.created_at);

        return `
            <div class="bg-slate-900 border border-slate-800 shadow-lg p-6 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-all duration-200 flex flex-col h-full">
                <!-- Accent Bar -->
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background: linear-gradient(to bottom, ${config.accentColor}, rgba(${config.accentColor.match(/\d+/g).join(',')}, 0.6)); box-shadow: 0 0 15px ${config.accentColor}40;"></div>
                
                <!-- Header with Badge -->
                <div class="flex items-start justify-between gap-3 mb-4">
                    <div class="flex items-center gap-3 flex-1">
                        <div class="p-2.5 rounded-xl text-white shrink-0" style="background: ${config.lightBg}; border: 1px solid ${config.borderColor}; color: ${config.textColor};">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${config.icon}"></path></svg>
                        </div>
                        <span class="text-[9px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-lg" style="color: ${config.textColor}; background: ${config.lightBg}; border: 1px solid ${config.borderColor};">● ${config.label}</span>
                    </div>
                    <span class="text-[10px] text-slate-500 font-semibold whitespace-nowrap">${timeAgo}</span>
                </div>

                <!-- Title & Vehicle Info -->
                <h3 class="text-base font-extrabold text-white mb-3 tracking-tight">${formatIncidentType(incident.incident_type)}</h3>
                
                <div class="space-y-2 mb-5 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Vehicle</span>
                        <span class="font-bold text-white text-sm">${incident.vehicle_number || '-'}</span>
                    </div>
                    ${incident.driver_name ? `
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Driver</span>
                        <span class="text-slate-300 text-sm">${incident.driver_name}</span>
                    </div>
                    ` : ''}
                    ${incident.weight_difference_kg ? `
                    <div class="flex items-center gap-2 pt-1">
                        <span class="text-[10px] uppercase tracking-wider font-bold" style="color: ${config.textColor};">Impact</span>
                        <span class="font-bold text-sm" style="color: ${config.textColor};">-${parseFloat(incident.weight_difference_kg).toFixed(1)} kg</span>
                    </div>
                    ` : ''}
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 pt-4 border-t border-slate-800/50">
                    <button onclick="openIncidentDetail(${incident.id})" class="flex-1 py-2.5 px-3 text-[11px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200" style="color: ${config.textColor}; background: ${config.lightBg}; border: 1px solid ${config.borderColor};" onmouseover="this.style.background='${config.borderBg}'; this.style.borderColor='${config.accentColor}40';" onmouseout="this.style.background='${config.lightBg}'; this.style.borderColor='${config.borderColor}';">
                        Details
                    </button>
                    <button onclick="focusOnIncident(${incident.id})" class="flex-1 py-2.5 px-3 bg-slate-800/50 border border-slate-700/50 text-slate-300 text-[11px] font-extrabold uppercase tracking-widest rounded-xl hover:bg-slate-700 hover:border-slate-600 transition-all duration-200">
                        Locate
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render incident table
 * Displays all incidents in a sortable table with filters applied
 * Respects active/history view toggle
 */
function renderIncidentTable() {
    const tbody = document.getElementById('incidentTableBody');

    // Filter incidents based on current view
    let displayIncidents = allIncidents;
    if (currentView === 'active') {
        displayIncidents = allIncidents.filter(i => ['open', 'acknowledged', 'investigating'].includes(i.status));
    }

    if (displayIncidents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">No incidents found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = displayIncidents.map(incident => {
        const typeColors = {
            'cargo_loss': 'red',
            'overload': 'orange',
            'route_deviation': 'yellow',
            'unauthorized_stop': 'purple'
        };
        const typeColor = typeColors[incident.incident_type] || 'blue';

        const statusConfig = {
            'open': { color: 'red', icon: true },
            'acknowledged': { color: 'blue', icon: false },
            'investigating': { color: 'orange', icon: true },
            'resolved': { color: 'green', icon: false },
            'false_alarm': { color: 'gray', icon: false }
        };
        const statusCfg = statusConfig[incident.status] || statusConfig.open;

        const weightImpact = incident.weight_difference_kg 
            ? `${incident.incident_type === 'overload' ? '+' : '-'}${parseFloat(incident.weight_difference_kg).toFixed(1)} kg`
            : '-';

        return `
            <tr class="hover:bg-gray-800/30 transition cursor-pointer" onclick="openIncidentDetail(${incident.id})">
                <td class="px-6 py-4 text-xs font-mono text-gray-400">${formatTimestamp(incident.created_at)}</td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-white">${incident.vehicle_number || '-'}</div>
                    <div class="text-xs text-gray-500">${incident.driver_name || '-'}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full bg-${typeColor}-900/20 text-${typeColor}-500 text-[10px] font-bold">${formatIncidentType(incident.incident_type)}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full bg-${getSeverityColor(incident.severity)}-900/20 text-${getSeverityColor(incident.severity)}-500 text-[10px] font-bold uppercase">${incident.severity}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="flex items-center gap-2 text-[10px] text-${statusCfg.color}-400 font-bold uppercase ${statusCfg.icon ? 'animate-pulse' : ''}">
                        ${statusCfg.icon ? `<div class="w-1.5 h-1.5 rounded-full bg-${statusCfg.color}-500"></div>` : ''}
                        ${incident.status.replace('_', ' ')}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm font-medium text-white">${weightImpact}</td>
                <td class="px-6 py-4">
                    <button onclick="event.stopPropagation(); openIncidentDetail(${incident.id})" class="text-gray-500 hover:text-white transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ MODAL MANAGEMENT - Incident Detail View                                 │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Open incident detail modal
 */
function openIncidentDetail(id) {
    console.log('[DEBUG] openIncidentDetail() called with id:', id);
    
    currentIncidentId = id;
    const incident = allIncidents.find(i => i.id === id);
    
    if (!incident) {
        alert('Incident not found');
        return;
    }

    const modal = document.getElementById('incidentDetailModal');
    if (!modal) {
        console.error('[ERROR] Modal element not found!');
        return;
    }

    // Populate modal
    document.getElementById('modalTitle').textContent = formatIncidentType(incident.incident_type);
    document.getElementById('modalSubtitle').textContent = `${incident.vehicle_number || '-'} • ${incident.driver_name || '-'} • ${formatTimestamp(incident.created_at)}`;
    document.getElementById('modalType').textContent = formatIncidentType(incident.incident_type);
    
    const severityEl = document.getElementById('modalSeverity');
    severityEl.textContent = incident.severity.toUpperCase();
    severityEl.className = `text-sm font-bold text-${getSeverityColor(incident.severity)}-500`;

    document.getElementById('modalInitialWeight').textContent = incident.initial_weight_kg ? `${parseFloat(incident.initial_weight_kg).toFixed(2)} kg` : '-';
    document.getElementById('modalWeightDiff').textContent = incident.weight_difference_kg ? `${parseFloat(incident.weight_difference_kg).toFixed(2)} kg` : '-';
    document.getElementById('modalDescription').textContent = incident.description || 'No description';

    // Show modal
    console.log('[DEBUG] Removing hidden class from modal');
    modal.classList.remove('hidden');

    // Initialize modal map
    setTimeout(() => {
        if (modalMap) modalMap.remove();
        
        const lat = parseFloat(incident.latitude) || DEFAULT_CENTER[0];
        const lng = parseFloat(incident.longitude) || DEFAULT_CENTER[1];

        modalMap = L.map('modalMap').setView([lat, lng], 15);
        L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(modalMap);

        if (incident.latitude && incident.longitude) {
            const color = getSeverityColor(incident.severity) === 'red' ? '#EF4444' : 
                          getSeverityColor(incident.severity) === 'orange' ? '#F59E0B' : '#3B82F6';
            
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color:${color};" class="w-6 h-6 rounded-full border-2 border-white shadow-lg"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            L.marker([lat, lng], { icon }).addTo(modalMap)
                .bindPopup(`<b>Incident Location</b><br>${incident.location_address || 'Coordinates: ' + lat + ', ' + lng}`);
        }

        modalMap.invalidateSize();
    }, 100);

    // Render simple weight chart
    renderWeightChart(incident);
}

/**
 * Render weight timeline chart (simplified)
 */
function renderWeightChart(incident) {
    const ctx = document.getElementById('weightChart');
    
    if (weightChart) {
        weightChart.destroy();
    }

    // Generate sample timeline data
    const timeline = [];
    const baseWeight = parseFloat(incident.initial_weight_kg);
    for (let i = 0; i < 10; i++) {
        const weight = i < 5 ? baseWeight : baseWeight - parseFloat(incident.weight_difference_kg);
        timeline.push({
            recorded_at: new Date(new Date(incident.created_at).getTime() + i * 5 * 60000).toISOString(),
            weight_kg: weight
        });
    }

    document.getElementById('weightChartContainer').innerHTML = '<canvas id="weightChart"></canvas>';
    const newCtx = document.getElementById('weightChart');

    const labels = timeline.map(t => formatTime(t.recorded_at));
    const weights = timeline.map(t => t.weight_kg);

    weightChart = new Chart(newCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Weight (kg)',
                    data: weights,
                    borderColor: '#2DD4BF',
                    backgroundColor: 'rgba(45, 212, 191, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Initial Weight',
                    data: Array(weights.length).fill(parseFloat(incident.initial_weight_kg)),
                    borderColor: '#EF4444',
                    borderDash: [5, 5],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#9CA3AF' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#374151' }
                },
                y: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}

/**
 * Update incident status (simplified - static)
 */
function updateIncidentStatus(status) {
    if (!currentIncidentId) return;

    const incident = allIncidents.find(i => i.id === currentIncidentId);
    if (incident) {
        incident.status = status;
        renderIncidentTable();
        loadStats();
        closeModal();
        alert(`Incident status updated to: ${status}`);
    }
}

/**
 * Close modal
 * Properly removes modal from view and cleans up state
 */
function closeModal() {
    console.log('[DEBUG] closeModal() called');
    
    const modal = document.getElementById('incidentDetailModal');
    if (modal) {
        console.log('[DEBUG] Adding hidden class to modal');
        modal.classList.add('hidden');
    } else {
        console.warn('[WARNING] Could not find modal element in closeModal()');
    }
    
    const notesField = document.getElementById('resolutionNotes');
    if (notesField) {
        notesField.value = '';
    }
    
    currentIncidentId = null;
    
    if (modalMap) {
        console.log('[DEBUG] Removing modal map');
        modalMap.remove();
        modalMap = null;
    }
}

/**
 * Focus map on specific incident
 */
function focusOnIncident(id) {
    const marker = incidentMarkers.get(id);
    if (marker) {
        incidentMap.setView(marker.getLatLng(), 16);
        marker.openPopup();
    }
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ EVENT LISTENERS - User Interactions                                      │
// └──────────────────────────────────────────────────────────────────────────┘

function setupEventListeners() {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MODAL CLOSE - Multiple ways to close modal
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const btnCloseModal = document.getElementById('btnCloseModal');
    const modal = document.getElementById('incidentDetailModal');
    
    console.log('[DEBUG] Modal element:', modal);
    console.log('[DEBUG] Close button:', btnCloseModal);
    
    // Method 1: Close button click
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', function(e) {
            console.log('[DEBUG] Close button clicked');
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });
    } else {
        console.warn('[WARNING] btnCloseModal element not found!');
    }
    
    // Method 2: Click on backdrop (outside the modal box)
    if (modal) {
        modal.addEventListener('click', function(e) {
            console.log('[DEBUG] Modal clicked. Target:', e.target.id, 'CurrentTarget:', e.currentTarget.id);
            // Check if clicked on the backdrop (the outer container)
            if (e.target === modal) {
                console.log('[DEBUG] Backdrop clicked - closing modal');
                closeModal();
            }
        });
    } else {
        console.warn('[WARNING] incidentDetailModal element not found!');
    }
    
    // Method 3: Escape key to close modal (standard UX pattern)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modalVisible = modal && !modal.classList.contains('hidden');
            if (modalVisible) {
                console.log('[DEBUG] Escape key pressed - closing modal');
                closeModal();
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STATUS UPDATE BUTTONS - Change incident status
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            updateIncidentStatus(btn.dataset.status);
        });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // VIEW TOGGLE - Switch between Active/History views
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    document.getElementById('btnActiveView')?.addEventListener('click', () => {
        currentView = 'active';
        document.getElementById('btnActiveView').classList.add('bg-slate-800', 'text-white');
        document.getElementById('btnActiveView').classList.remove('text-slate-500');
        document.getElementById('btnHistoryView').classList.remove('bg-slate-800', 'text-white');
        document.getElementById('btnHistoryView').classList.add('text-slate-500');
        renderIncidentTable();
        renderAlertCards();
    });

    document.getElementById('btnHistoryView')?.addEventListener('click', () => {
        currentView = 'history';
        document.getElementById('btnHistoryView').classList.add('bg-slate-800', 'text-white');
        document.getElementById('btnHistoryView').classList.remove('text-slate-500');
        document.getElementById('btnActiveView').classList.remove('bg-slate-800', 'text-white');
        document.getElementById('btnActiveView').classList.add('text-slate-500');
        renderIncidentTable();
        renderAlertCards();
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // REFRESH & EXPORT BUTTONS - Data actions
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        renderIncidentTable();
        loadStats();
    });

    document.getElementById('btnExport')?.addEventListener('click', exportIncidents);
}

/**
 * Export incidents to CSV
 * Generates a downloadable CSV file with all current incident data
 * File name includes current date
 */
function exportIncidents() {
    if (allIncidents.length === 0) {
        alert('No incidents to export');
        return;
    }

    const headers = ['Timestamp', 'Vehicle', 'Driver', 'Type', 'Severity', 'Status', 'Weight Lost', 'Latitude', 'Longitude', 'Description'];
    const rows = allIncidents.map(i => [
        formatTimestamp(i.created_at),
        i.vehicle_number || '-',
        i.driver_name || '-',
        i.incident_type,
        i.severity,
        i.status,
        i.weight_difference_kg || '-',
        i.latitude || '-',
        i.longitude || '-',
        `"${(i.description || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidents_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ UTILITY FUNCTIONS - Formatting & Helpers                                │
// └──────────────────────────────────────────────────────────────────────────┘

function formatIncidentType(type) {
    const labels = {
        'cargo_loss': 'Cargo Loss',
        'overload': 'Overload',
        'route_deviation': 'Route Deviation',
        'unauthorized_stop': 'Unauthorized Stop'
    };
    return labels[type] || type;
}

function getSeverityColor(severity) {
    const colors = { 'critical': 'red', 'warning': 'orange', 'info': 'blue' };
    return colors[severity] || 'blue';
}

function formatTimestamp(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { 
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

function formatTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '-';
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n// \u2502 GLOBAL EXPORTS - Make functions accessible from HTML onclick handlers    \u2502\n// \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n\n// Make functions globally accessible for onclick handlers\nwindow.openIncidentDetail = openIncidentDetail;
window.focusOnIncident = focusOnIncident;
window.updateIncidentStatus = updateIncidentStatus;
window.closeModal = closeModal;