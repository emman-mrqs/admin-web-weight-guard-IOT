/**
 * Admin Incidents Management
 * Real-time incident tracking with OpenStreetMap and WebSocket
 */

// ============================================
// CONFIGURATION
// ============================================
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
};

const DEFAULT_CENTER = [14.5995, 120.9842]; // Manila
const DEFAULT_ZOOM = 12;
const REFRESH_INTERVAL = 30000; // 30 seconds

// ============================================
// STATE
// ============================================
let incidentMap = null;
let modalMap = null;
let incidentMarkers = new Map();
let allIncidents = [];
let currentIncidentId = null;
let weightChart = null;
let wsConnection = null;
let currentView = 'active'; // 'active' or 'history'

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initWebSocket();
    loadIncidents();
    loadStats();
    setupEventListeners();
    
    // Auto-refresh
    setInterval(() => {
        loadIncidents();
        loadStats();
    }, REFRESH_INTERVAL);
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

    // Fix sizing
    setTimeout(() => incidentMap.invalidateSize(), 100);
}

/**
 * Initialize WebSocket for real-time incident alerts
 */
function initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/tracking`;

    try {
        wsConnection = new WebSocket(wsUrl);

        wsConnection.onopen = () => {
            console.log('[WebSocket] Connected for incident alerts');
        };

        wsConnection.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'incident_alert') {
                handleNewIncident(data.data);
            }
        };

        wsConnection.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };

        wsConnection.onclose = () => {
            console.log('[WebSocket] Disconnected. Reconnecting in 5s...');
            setTimeout(initWebSocket, 5000);
        };
    } catch (error) {
        console.error('[WebSocket] Failed to connect:', error);
    }
}

/**
 * Handle new incident from WebSocket
 */
function handleNewIncident(incident) {
    // Add to top of list
    allIncidents.unshift(incident);
    
    // Update UI
    renderIncidentTable();
    renderAlertCards();
    addIncidentMarker(incident);
    loadStats();
    
    // Show notification
    showNotification(incident);
}

/**
 * Show browser notification for new incident
 */
function showNotification(incident) {
    const typeLabels = {
        'cargo_loss': 'Cargo Loss Detected!',
        'overload': 'Overload Alert!',
        'route_deviation': 'Route Deviation!',
        'unauthorized_stop': 'Unauthorized Stop!'
    };

    // Update badge count
    const badge = document.getElementById('activeIncidentCount');
    badge.textContent = parseInt(badge.textContent) + 1;

    // Flash the badge
    badge.classList.add('animate-bounce');
    setTimeout(() => badge.classList.remove('animate-bounce'), 1000);

    // Browser notification if permitted
    if (Notification.permission === 'granted') {
        new Notification(typeLabels[incident.incident_type] || 'New Incident', {
            body: `Vehicle ${incident.vehicle_number}: ${incident.description}`,
            icon: '/img/alert-icon.png'
        });
    }
}

// ============================================
// DATA LOADING
// ============================================

/**
 * Load incidents from server
 */
async function loadIncidents() {
    try {
        const filterType = document.getElementById('filterType')?.value || '';
        const filterStatus = document.getElementById('filterStatus')?.value || '';
        
        let url = '/admin/incidents/fetch?';
        if (filterType) url += `type=${filterType}&`;
        if (filterStatus) url += `status=${filterStatus}&`;
        if (currentView === 'active') url += 'status=open&';

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            allIncidents = data.incidents;
            renderIncidentTable();
            renderAlertCards();
            renderIncidentMarkers();
        }
    } catch (error) {
        console.error('[Incidents] Failed to load:', error);
    }
}

/**
 * Load incident statistics
 */
async function loadStats() {
    try {
        const response = await fetch('/admin/incidents/stats');
        const data = await response.json();

        if (data.success) {
            const stats = data.stats;

            // Update stat cards
            const criticalCount = stats.bySeverity.find(s => s.severity === 'critical')?.count || 0;
            const warningCount = stats.bySeverity.find(s => s.severity === 'warning')?.count || 0;
            const openCount = stats.byStatus.find(s => s.status === 'open')?.count || 0;

            document.getElementById('statCritical').textContent = criticalCount;
            document.getElementById('statWarning').textContent = warningCount;
            document.getElementById('statOpen').textContent = openCount;
            document.getElementById('statRecent').textContent = stats.last24Hours;
            document.getElementById('activeIncidentCount').textContent = openCount;
        }
    } catch (error) {
        console.error('[Incidents] Failed to load stats:', error);
    }
}

// ============================================
// RENDERING
// ============================================

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
 */
function renderAlertCards() {
    const container = document.getElementById('alertCardsContainer');
    
    // Get top 3 open incidents sorted by severity
    const topIncidents = allIncidents
        .filter(i => ['open', 'acknowledged', 'investigating'].includes(i.status))
        .sort((a, b) => {
            const severityOrder = { 'critical': 0, 'warning': 1, 'info': 2 };
            return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
        })
        .slice(0, 3);

    if (topIncidents.length === 0) {
        container.innerHTML = `
            <div class="card-bg p-6 rounded-xl flex items-center justify-center col-span-3 min-h-[200px]">
                <div class="text-center">
                    <svg class="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p class="text-gray-400">No active incidents</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = topIncidents.map(incident => {
        const severityConfig = {
            'critical': { color: 'red', bg: 'bg-red-900/5', label: 'Critical Threat' },
            'warning': { color: 'orange', bg: 'bg-orange-900/5', label: 'Warning' },
            'info': { color: 'blue', bg: 'bg-blue-900/5', label: 'Info Alert' }
        };
        const config = severityConfig[incident.severity] || severityConfig.info;
        const timeAgo = formatTimeAgo(incident.created_at);

        return `
            <div class="card-bg p-6 rounded-xl severity-${incident.severity} ${config.bg}">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-[10px] font-bold text-${config.color}-500 uppercase tracking-widest">${config.label}</span>
                    <span class="text-xs text-gray-500">${timeAgo}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">${formatIncidentType(incident.incident_type)}</h3>
                <p class="text-sm text-gray-400 mb-4">
                    Vehicle <span class="text-white font-medium">${incident.vehicle_number || '-'}</span>
                    ${incident.weight_difference_kg ? ` lost ${parseFloat(incident.weight_difference_kg).toFixed(1)}kg` : ''}
                </p>
                <div class="flex gap-2">
                    <button onclick="openIncidentDetail(${incident.id})" class="flex-1 py-2 border border-gray-700 text-white text-xs font-bold rounded hover:bg-gray-800 transition">VIEW DETAILS</button>
                    <button onclick="focusOnIncident(${incident.id})" class="flex-1 py-2 border border-gray-700 text-white text-xs font-bold rounded hover:bg-gray-800 transition">TRACK GPS</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render incident table
 */
function renderIncidentTable() {
    const tbody = document.getElementById('incidentTableBody');

    if (allIncidents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">No incidents found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allIncidents.map(incident => {
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

// ============================================
// INCIDENT DETAIL MODAL
// ============================================

/**
 * Open incident detail modal
 */
async function openIncidentDetail(id) {
    currentIncidentId = id;
    const modal = document.getElementById('incidentDetailModal');

    try {
        const response = await fetch(`/admin/incidents/${id}`);
        const data = await response.json();

        if (!data.success) {
            alert('Failed to load incident details');
            return;
        }

        const incident = data.incident;
        const timeline = data.weightTimeline || [];

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

        // Render weight chart
        renderWeightChart(timeline, incident.initial_weight_kg);

    } catch (error) {
        console.error('[Incidents] Failed to load detail:', error);
        alert('Failed to load incident details');
    }
}

/**
 * Render weight timeline chart
 */
function renderWeightChart(timeline, initialWeight) {
    const ctx = document.getElementById('weightChart');
    
    if (weightChart) {
        weightChart.destroy();
    }

    if (!timeline || timeline.length === 0) {
        document.getElementById('weightChartContainer').innerHTML = '<p class="text-gray-500 text-sm">No weight data available</p>';
        return;
    }

    document.getElementById('weightChartContainer').innerHTML = '<canvas id="weightChart"></canvas>';
    const newCtx = document.getElementById('weightChart');

    const labels = timeline.map(t => formatTime(t.recorded_at));
    const weights = timeline.map(t => parseFloat(t.weight_kg));

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
                    data: Array(weights.length).fill(parseFloat(initialWeight)),
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
 * Update incident status
 */
async function updateIncidentStatus(status) {
    if (!currentIncidentId) return;

    const notes = document.getElementById('resolutionNotes').value;

    try {
        const response = await fetch(`/admin/incidents/${currentIncidentId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, resolution_notes: notes })
        });

        const data = await response.json();

        if (data.success) {
            // Close modal and refresh
            closeModal();
            loadIncidents();
            loadStats();
        } else {
            alert(data.error || 'Failed to update status');
        }
    } catch (error) {
        console.error('[Incidents] Failed to update status:', error);
        alert('Failed to update status');
    }
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('incidentDetailModal').classList.add('hidden');
    document.getElementById('resolutionNotes').value = '';
    currentIncidentId = null;
    if (modalMap) {
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

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Close modal
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('incidentDetailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Status update buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            updateIncidentStatus(btn.dataset.status);
        });
    });

    // Filters
    document.getElementById('filterType')?.addEventListener('change', loadIncidents);
    document.getElementById('filterStatus')?.addEventListener('change', loadIncidents);

    // View toggle
    document.getElementById('btnActiveView')?.addEventListener('click', () => {
        currentView = 'active';
        document.getElementById('btnActiveView').classList.add('bg-[#1E293B]', 'text-white');
        document.getElementById('btnActiveView').classList.remove('text-gray-500');
        document.getElementById('btnHistoryView').classList.remove('bg-[#1E293B]', 'text-white');
        document.getElementById('btnHistoryView').classList.add('text-gray-500');
        loadIncidents();
    });

    document.getElementById('btnHistoryView')?.addEventListener('click', () => {
        currentView = 'history';
        document.getElementById('btnHistoryView').classList.add('bg-[#1E293B]', 'text-white');
        document.getElementById('btnHistoryView').classList.remove('text-gray-500');
        document.getElementById('btnActiveView').classList.remove('bg-[#1E293B]', 'text-white');
        document.getElementById('btnActiveView').classList.add('text-gray-500');
        document.getElementById('filterStatus').value = '';
        loadIncidents();
    });

    // Refresh button
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        loadIncidents();
        loadStats();
    });

    // Export button
    document.getElementById('btnExport')?.addEventListener('click', exportIncidents);

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

/**
 * Export incidents to CSV
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

// ============================================
// UTILITY FUNCTIONS
// ============================================

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

// Make functions globally accessible for onclick handlers
window.openIncidentDetail = openIncidentDetail;
window.focusOnIncident = focusOnIncident;