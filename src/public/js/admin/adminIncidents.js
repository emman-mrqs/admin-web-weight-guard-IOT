/**
 * Admin incidents module
 * Data rendering is fully API-driven and updates dynamically without page reloads.
 */

const API_BASE = '/api/admin/incidents';
const INCIDENT_ACTIVE_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];

let incidentMap = null;
let modalMap = null;
let incidentMarkers = new Map();
let allIncidents = [];
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

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    setupEventListeners();
    await refreshIncidents();
});

function initMap() {
    incidentMap = L.map('incidentMap', {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true
    });

    L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(incidentMap);
    setTimeout(() => incidentMap.invalidateSize(), 100);
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data?.error || 'Request failed.');
        error.status = response.status;
        error.fieldErrors = data?.fieldErrors || {};
        throw error;
    }

    return data;
}

async function refreshIncidents() {
    try {
        setIncidentTableError('');
        renderIncidentTableLoading();

        const params = new URLSearchParams();
        params.set('view', currentView);

        const typeFilter = String(document.getElementById('filterType')?.value || '').trim();
        const statusFilter = String(document.getElementById('filterStatus')?.value || '').trim();

        if (typeFilter) {
            params.set('type', typeFilter);
        }
        if (statusFilter) {
            params.set('status', statusFilter);
        }

        const result = await requestJson(`${API_BASE}?${params.toString()}`);
        allIncidents = Array.isArray(result.data) ? result.data : [];

        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
    } catch (error) {
        allIncidents = [];
        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
        setIncidentTableError(error.message || 'Failed to load incidents.');
    }
}

function renderStats() {
    const criticalCount = allIncidents.filter((item) => item.severity === 'critical').length;
    const warningCount = allIncidents.filter((item) => item.severity === 'warning').length;
    const openCount = allIncidents.filter((item) => INCIDENT_ACTIVE_STATUSES.includes(item.status)).length;

    document.getElementById('statCritical').textContent = String(criticalCount);
    document.getElementById('statWarning').textContent = String(warningCount);
    document.getElementById('statOpen').textContent = String(openCount);
    document.getElementById('statRecent').textContent = String(allIncidents.length);
}

function renderIncidentMarkers() {
    incidentMarkers.forEach((marker) => incidentMap.removeLayer(marker));
    incidentMarkers.clear();

    allIncidents
        .filter((item) => item.latitude && item.longitude && INCIDENT_ACTIVE_STATUSES.includes(item.status))
        .forEach((incident) => addIncidentMarker(incident));

    if (incidentMarkers.size > 0) {
        const group = new L.featureGroup(Array.from(incidentMarkers.values()));
        incidentMap.fitBounds(group.getBounds().pad(0.1));
    }
}

function addIncidentMarker(incident) {
    const lat = Number(incident.latitude);
    const lng = Number(incident.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
    }

    const colorMap = {
        critical: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6'
    };

    const color = colorMap[incident.severity] || colorMap.info;
    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg ${incident.severity === 'critical' ? 'animate-pulse' : ''}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([lat, lng], { icon });
    marker.bindPopup(`
        <div class="p-2 min-w-[220px]">
            <p class="font-bold text-sm" style="color:${color}">${formatIncidentType(incident.incident_type)}</p>
            <p class="text-xs text-gray-600 mb-1">${escapeHtml(incident.vehicle_number || 'Unknown Vehicle')}</p>
            <p class="text-xs mb-2">${escapeHtml(incident.description || 'No description')}</p>
            ${incident.weight_difference_kg ? `<p class="text-xs font-bold">Weight Impact: ${Number(incident.weight_difference_kg).toFixed(2)} kg</p>` : ''}
            <button onclick="openIncidentDetail(${incident.id})" class="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">View Details</button>
        </div>
    `);

    marker.addTo(incidentMap);
    incidentMarkers.set(incident.id, marker);
}

function renderIncidentTableLoading() {
    const tbody = document.getElementById('incidentTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-6 py-8 text-center text-slate-500 text-xs">Loading incidents...</td>
        </tr>
    `;
}

function renderIncidentTable() {
    const tbody = document.getElementById('incidentTableBody');

    if (allIncidents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-8 text-center text-slate-500 text-xs">No incidents found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allIncidents.map((incident) => {
        const taskLabel = incident.task_id ? `#${incident.task_id}` : '-';
        const dispatchMeta = incident.pickup_lat && incident.pickup_lng && incident.destination_lat && incident.destination_lng
            ? `${Number(incident.pickup_lat).toFixed(4)}, ${Number(incident.pickup_lng).toFixed(4)} -> ${Number(incident.destination_lat).toFixed(4)}, ${Number(incident.destination_lng).toFixed(4)}`
            : 'No route data';
        const weightImpact = incident.weight_difference_kg !== null && incident.weight_difference_kg !== undefined
            ? `${incident.incident_type === 'overload' ? '+' : '-'}${Number(incident.weight_difference_kg).toFixed(2)} kg`
            : '-';

        return `
            <tr class="hover:bg-slate-800/40 transition-colors" data-incident-id="${incident.id}">
                <td class="px-6 py-4 text-xs font-mono text-slate-400">${formatTimestamp(incident.created_at)}</td>
                <td class="px-6 py-4">
                    <span class="${getIncidentTypeBadgeClass(incident.incident_type)}">${formatIncidentType(incident.incident_type)}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="${getSeverityBadgeClass(incident.severity)}">${String(incident.severity || 'info').toUpperCase()}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="${getStatusBadgeClass(incident.status)}">${formatStatus(incident.status)}</span>
                </td>
                <td class="px-6 py-4 text-xs text-slate-300">
                    <div class="font-bold text-slate-200">${taskLabel}</div>
                    <div class="text-[10px] text-slate-500 mt-1">${dispatchMeta}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-white">${escapeHtml(incident.vehicle_number || '-')}</div>
                    <div class="text-xs text-slate-500">${escapeHtml((incident.driver_name || '').trim() || '-')}</div>
                </td>
                <td class="px-6 py-4 text-sm font-semibold text-slate-200">${weightImpact}</td>
                <td class="px-6 py-4 text-right">
                    <button data-action="view-details" data-incident-id="${incident.id}" class="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition">Details</button>
                </td>
            </tr>
        `;
    }).join('');
}

function setupEventListeners() {
    document.getElementById('btnActiveView')?.addEventListener('click', async () => {
        currentView = 'active';
        setViewButtons();
        await refreshIncidents();
    });

    document.getElementById('btnHistoryView')?.addEventListener('click', async () => {
        currentView = 'history';
        setViewButtons();
        await refreshIncidents();
    });

    document.getElementById('btnRefresh')?.addEventListener('click', async () => {
        await refreshIncidents();
    });

    document.getElementById('filterType')?.addEventListener('change', async () => {
        await refreshIncidents();
    });

    document.getElementById('filterStatus')?.addEventListener('change', async () => {
        await refreshIncidents();
    });

    document.getElementById('btnExport')?.addEventListener('click', exportIncidents);

    document.getElementById('incidentTableBody')?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action="view-details"]');
        if (!button) {
            return;
        }

        const incidentId = Number(button.dataset.incidentId);
        if (Number.isFinite(incidentId)) {
            openIncidentDetail(incidentId);
        }
    });

    const modal = document.getElementById('incidentDetailModal');
    const closeButton = document.getElementById('btnCloseModal');
    closeButton?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    document.querySelectorAll('.status-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            await handleStatusUpdate(button.dataset.status);
        });
    });

    setViewButtons();
}

function setViewButtons() {
    const active = document.getElementById('btnActiveView');
    const history = document.getElementById('btnHistoryView');

    if (!active || !history) {
        return;
    }

    if (currentView === 'active') {
        active.classList.add('bg-slate-800', 'text-white');
        active.classList.remove('text-slate-500');
        history.classList.remove('bg-slate-800', 'text-white');
        history.classList.add('text-slate-500');
        return;
    }

    history.classList.add('bg-slate-800', 'text-white');
    history.classList.remove('text-slate-500');
    active.classList.remove('bg-slate-800', 'text-white');
    active.classList.add('text-slate-500');
}

function openIncidentDetail(id) {
    currentIncidentId = id;
    const incident = allIncidents.find((item) => item.id === id);

    if (!incident) {
        setStatusUpdateError('Incident not found in the current list.');
        return;
    }

    clearStatusUpdateErrors();

    document.getElementById('modalTitle').textContent = formatIncidentType(incident.incident_type);
    document.getElementById('modalSubtitle').textContent = `${incident.vehicle_number || '-'} • ${(incident.driver_name || '-').trim() || '-'} • ${formatTimestamp(incident.created_at)}`;
    document.getElementById('modalType').textContent = formatIncidentType(incident.incident_type);

    const severityEl = document.getElementById('modalSeverity');
    severityEl.textContent = String(incident.severity || 'info').toUpperCase();
    severityEl.className = `text-sm font-bold ${getSeverityTextClass(incident.severity)}`;

    document.getElementById('modalInitialWeight').textContent = incident.initial_weight_kg !== null && incident.initial_weight_kg !== undefined
        ? `${Number(incident.initial_weight_kg).toFixed(2)} kg`
        : '-';
    document.getElementById('modalWeightDiff').textContent = incident.weight_difference_kg !== null && incident.weight_difference_kg !== undefined
        ? `${Number(incident.weight_difference_kg).toFixed(2)} kg`
        : '-';
    document.getElementById('modalDescription').textContent = incident.description || 'No description';

    const modal = document.getElementById('incidentDetailModal');
    modal.classList.remove('hidden');

    setTimeout(() => {
        if (modalMap) {
            modalMap.remove();
        }

        const lat = Number(incident.latitude) || DEFAULT_CENTER[0];
        const lng = Number(incident.longitude) || DEFAULT_CENTER[1];
        modalMap = L.map('modalMap').setView([lat, lng], 15);
        L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(modalMap);

        if (Number.isFinite(Number(incident.latitude)) && Number.isFinite(Number(incident.longitude))) {
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-lg ${getSeverityDotBgClass(incident.severity)}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            L.marker([lat, lng], { icon }).addTo(modalMap);
        }

        modalMap.invalidateSize();
    }, 100);

    renderWeightChart(incident);
}

async function renderWeightChart(incident) {
    if (weightChart) {
        weightChart.destroy();
    }

    let timeline = [];
    try {
        const result = await requestJson(`${API_BASE}/${incident.id}/timeline?limit=30`);
        timeline = Array.isArray(result.data) ? result.data : [];
    } catch (error) {
        timeline = [];
    }

    if (timeline.length === 0) {
        const baseWeight = Number(incident.initial_weight_kg || 0);
        const delta = Number(incident.weight_difference_kg || 0);
        timeline = Array.from({ length: 8 }).map((_, idx) => ({
            recorded_at: new Date(new Date(incident.created_at).getTime() + idx * 5 * 60000).toISOString(),
            weight_kg: idx < 4 ? baseWeight : Math.max(0, baseWeight - delta)
        }));
    }

    document.getElementById('weightChartContainer').innerHTML = '<canvas id="weightChart"></canvas>';
    const chartEl = document.getElementById('weightChart');

    const labels = timeline.map((item) => formatTime(item.recorded_at));
    const weights = timeline.map((item) => Number(item.weight_kg));

    weightChart = new Chart(chartEl, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Weight (kg)',
                    data: weights,
                    borderColor: '#2DD4BF',
                    backgroundColor: 'rgba(45, 212, 191, 0.12)',
                    fill: true,
                    tension: 0.35
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

async function handleStatusUpdate(nextStatus) {
    if (!currentIncidentId || !nextStatus) {
        return;
    }

    clearStatusUpdateErrors();
    const resolutionNotes = String(document.getElementById('resolutionNotes')?.value || '').trim();

    try {
        await requestJson(`${API_BASE}/${currentIncidentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: nextStatus,
                resolutionNotes
            })
        });

        const target = allIncidents.find((item) => item.id === currentIncidentId);
        if (target) {
            target.status = nextStatus;
        }

        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
        closeModal();
    } catch (error) {
        const fieldErrors = error.fieldErrors || {};

        if (fieldErrors.resolutionNotes) {
            const resolutionNotesError = document.getElementById('resolutionNotesError');
            resolutionNotesError.textContent = fieldErrors.resolutionNotes;
            resolutionNotesError.classList.remove('hidden');
        }

        if (fieldErrors.status || fieldErrors.incidentId) {
            setStatusUpdateError(fieldErrors.status || fieldErrors.incidentId);
            return;
        }

        setStatusUpdateError(error.message || 'Failed to update incident status.');
    }
}

function closeModal() {
    const modal = document.getElementById('incidentDetailModal');
    modal?.classList.add('hidden');

    const notesField = document.getElementById('resolutionNotes');
    if (notesField) {
        notesField.value = '';
    }

    clearStatusUpdateErrors();
    currentIncidentId = null;

    if (modalMap) {
        modalMap.remove();
        modalMap = null;
    }
}

function setIncidentTableError(message) {
    const el = document.getElementById('incidentTableError');
    if (!el) {
        return;
    }

    if (!message) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }

    el.textContent = message;
    el.classList.remove('hidden');
}

function clearStatusUpdateErrors() {
    const statusError = document.getElementById('statusUpdateError');
    const notesError = document.getElementById('resolutionNotesError');

    if (statusError) {
        statusError.textContent = '';
        statusError.classList.add('hidden');
    }

    if (notesError) {
        notesError.textContent = '';
        notesError.classList.add('hidden');
    }
}

function setStatusUpdateError(message) {
    const el = document.getElementById('statusUpdateError');
    if (!el) {
        return;
    }

    el.textContent = message;
    el.classList.remove('hidden');
}

function exportIncidents() {
    if (allIncidents.length === 0) {
        setIncidentTableError('No incidents to export.');
        return;
    }

    const headers = ['Timestamp', 'Incident Type', 'Severity', 'Status', 'Task ID', 'Vehicle', 'Driver', 'Weight Impact (kg)', 'Latitude', 'Longitude'];
    const rows = allIncidents.map((item) => [
        formatTimestamp(item.created_at),
        item.incident_type || '-',
        item.severity || '-',
        item.status || '-',
        item.task_id || '-',
        item.vehicle_number || '-',
        (item.driver_name || '-').trim() || '-',
        item.weight_difference_kg ?? '-',
        item.latitude ?? '-',
        item.longitude ?? '-'
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `incidents_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function formatIncidentType(type) {
    const labels = {
        cargo_loss: 'Cargo Loss',
        overload: 'Overload',
        route_deviation: 'Route Deviation',
        unauthorized_stop: 'Unauthorized Stop'
    };

    return labels[String(type || '').toLowerCase()] || String(type || 'Unknown');
}

function formatStatus(status) {
    return String(status || 'pending')
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

function getIncidentTypeBadgeClass(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'cargo_loss') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'overload') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'route_deviation') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold tracking-wide';
    }
    return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-600 text-[10px] font-bold tracking-wide';
}

function getSeverityBadgeClass(severity) {
    const normalized = String(severity || 'info').toLowerCase();
    if (normalized === 'critical') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'warning') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold tracking-wide';
    }
    return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold tracking-wide';
}

function getStatusBadgeClass(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'resolved') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'false_alarm') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-700/70 text-slate-300 border border-slate-500/70 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'investigating' || normalized === 'acknowledged') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'pending' || normalized === 'open') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold tracking-wide';
    }
    return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-600 text-[10px] font-bold tracking-wide';
}

function getSeverityTextClass(severity) {
    const normalized = String(severity || 'info').toLowerCase();
    if (normalized === 'critical') return 'text-rose-500';
    if (normalized === 'warning') return 'text-amber-500';
    return 'text-blue-500';
}

function getSeverityDotBgClass(severity) {
    const normalized = String(severity || 'info').toLowerCase();
    if (normalized === 'critical') return 'bg-rose-500';
    if (normalized === 'warning') return 'bg-amber-500';
    return 'bg-blue-500';
}

function formatTimestamp(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function formatTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

window.openIncidentDetail = openIncidentDetail;
window.closeModal = closeModal;
