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
let currentIncident = null;
let pendingStatus = null;
let weightChart = null;
let currentView = 'active';
const incidentsPagination = {
    page: 1,
    limit: 10,
    totalEntries: 0,
    totalPages: 1
};

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
};
const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 8;

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
        params.set('page', String(incidentsPagination.page));
        params.set('limit', String(incidentsPagination.limit));

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
        incidentsPagination.totalEntries = Number(result?.pagination?.totalEntries || 0);
        incidentsPagination.totalPages = Math.max(1, Number(result?.pagination?.totalPages || 1));

        if (incidentsPagination.page > incidentsPagination.totalPages) {
            incidentsPagination.page = incidentsPagination.totalPages;
            await refreshIncidents();
            return;
        }

        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
        renderIncidentPagination();
    } catch (error) {
        allIncidents = [];
        incidentsPagination.totalEntries = 0;
        incidentsPagination.totalPages = 1;
        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
        renderIncidentPagination();
        setIncidentTableError(error.message || 'Failed to load incidents.');
    }
}

function renderStats() {
    const criticalCount = allIncidents.filter((item) => String(item.severity || '').toLowerCase() === 'high').length;
    const warningCount = allIncidents.filter((item) => String(item.severity || '').toLowerCase() === 'medium').length;
    const openCount = allIncidents.filter((item) => INCIDENT_ACTIVE_STATUSES.includes(item.status)).length;

    document.getElementById('statCritical').textContent = String(criticalCount);
    document.getElementById('statWarning').textContent = String(warningCount);
    document.getElementById('statOpen').textContent = String(openCount);
    document.getElementById('statRecent').textContent = String(incidentsPagination.totalEntries || allIncidents.length);
}

function renderIncidentMarkers() {
    incidentMarkers.forEach((marker) => incidentMap.removeLayer(marker));
    incidentMarkers.clear();

    allIncidents
        .filter((item) => item.latitude && item.longitude && INCIDENT_ACTIVE_STATUSES.includes(item.status))
        .forEach((incident) => addIncidentMarker(incident));

    const markers = Array.from(incidentMarkers.values());

    if (markers.length === 1) {
        incidentMap.setView(markers[0].getLatLng(), 9);
        return;
    }

    if (markers.length > 1) {
        const group = new L.featureGroup(markers);
        incidentMap.fitBounds(group.getBounds(), {
            padding: [90, 90],
            maxZoom: 10
        });
        return;
    }

    incidentMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}

function addIncidentMarker(incident) {
    const lat = Number(incident.latitude);
    const lng = Number(incident.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
    }

    const colorMap = {
        high: '#EF4444',
        medium: '#F59E0B',
        normal: '#3B82F6'
    };

    const normalizedSeverity = String(incident.severity || 'normal').toLowerCase();
    const color = colorMap[normalizedSeverity] || colorMap.normal;
    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg ${normalizedSeverity === 'high' ? 'animate-pulse' : ''}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([lat, lng], { icon });
    marker.bindPopup(buildIncidentPopupContent(incident, color));

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
        const weightImpact = incident.weight_difference_kg !== null && incident.weight_difference_kg !== undefined
            ? `${Number(incident.weight_difference_kg) > 0 ? '+' : ''}${Number(incident.weight_difference_kg).toFixed(2)} kg`
            : '-';

        return `
            <tr class="hover:bg-slate-800/40 transition-colors" data-incident-id="${incident.id}">
                <td class="px-6 py-4 text-xs font-mono text-slate-400">${formatTimestamp(incident.created_at)}</td>
                <td class="px-6 py-4">
                    <span class="${getIncidentTypeBadgeClass(incident.incident_type)}">${formatIncidentType(incident.incident_type)}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="${getSeverityBadgeClass(incident.severity)}">${String(incident.severity || 'info').toUpperCase()}</span>
                    <p class="mt-1 text-[10px] text-slate-500">${escapeHtml(getSeverityDetail(incident))}</p>
                </td>
                <td class="px-6 py-4">
                    <span class="${getStatusBadgeClass(incident.status)}">${formatStatus(incident.status)}</span>
                    <p class="mt-1 text-[10px] text-slate-500">${escapeHtml(getStatusDetail(incident))}</p>
                </td>
                <td class="px-6 py-4 text-xs text-slate-300">
                    ${buildDispatchTaskCell(incident)}
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-white">${escapeHtml(incident.vehicle_name || 'Unknown Vehicle')}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">Plate: ${escapeHtml(incident.vehicle_number || '-')}</div>
                    <div class="text-xs text-slate-400 mt-1">Driver: ${escapeHtml((incident.driver_name || '').trim() || '-')}</div>
                </td>
                <td class="px-6 py-4 text-sm font-semibold text-slate-200">${weightImpact}</td>
                <td class="px-6 py-4 text-right">
                    <button
                        type="button"
                        data-action="view-incident"
                        data-incident-id="${incident.id}"
                        onclick="openIncidentDetail(${incident.id})"
                        class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-blue-900/20 hover:border-blue-500/30 hover:text-blue-300"
                        title="View Incident"
                        aria-label="View Incident"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function setupEventListeners() {
    document.getElementById('btnActiveView')?.addEventListener('click', async () => {
        currentView = 'active';
        incidentsPagination.page = 1;
        setViewButtons();
        await refreshIncidents();
    });

    document.getElementById('btnHistoryView')?.addEventListener('click', async () => {
        currentView = 'history';
        incidentsPagination.page = 1;
        setViewButtons();
        await refreshIncidents();
    });

    document.getElementById('btnRefresh')?.addEventListener('click', async () => {
        await refreshIncidents();
    });

    document.getElementById('filterType')?.addEventListener('change', async () => {
        incidentsPagination.page = 1;
        await refreshIncidents();
    });

    document.getElementById('filterStatus')?.addEventListener('change', async () => {
        incidentsPagination.page = 1;
        await refreshIncidents();
    });

    document.getElementById('btnExport')?.addEventListener('click', exportIncidents);

    document.getElementById('incidentTableBody')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-action="view-incident"], [data-action="view-details"]');
        if (!viewButton) return;

        const incidentId = Number(viewButton.dataset.incidentId);
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
        button.addEventListener('click', () => {
            openStatusConfirmModal(button.dataset.status);
        });
    });

    document.getElementById('btnFocusIncidentMap')?.addEventListener('click', () => {
        focusIncidentOnMainMap();
    });

    document.getElementById('btnCancelStatusConfirm')?.addEventListener('click', closeStatusConfirmModal);
    document.getElementById('btnConfirmStatusChange')?.addEventListener('click', async () => {
        if (!pendingStatus) {
            closeStatusConfirmModal();
            return;
        }

        const statusToApply = pendingStatus;
        closeStatusConfirmModal();
        await handleStatusUpdate(statusToApply);
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

function getAllowedNextStatuses(currentStatus) {
    const current = String(currentStatus || '').toLowerCase();
    const map = {
        pending: ['acknowledged', 'false_alarm'],
        open: ['acknowledged', 'false_alarm'],
        acknowledged: ['investigating', 'resolved', 'false_alarm'],
        investigating: ['resolved', 'false_alarm'],
        resolved: [],
        false_alarm: [],
        closed: []
    };

    return map[current] || [];
}

function getDisabledStatusReason(currentStatus, nextStatus) {
    const current = String(currentStatus || '').toLowerCase();
    const next = String(nextStatus || '').toLowerCase();

    if (current === next) {
        return `Already marked as ${formatStatus(next)}.`;
    }

    if (next === 'acknowledged') {
        if (current === 'resolved' || current === 'false_alarm' || current === 'closed') {
            return 'Finalized incidents cannot be acknowledged.';
        }
        return 'Acknowledge is only available for open incidents.';
    }

    if (next === 'investigating') {
        if (current === 'pending' || current === 'open') {
            return 'Acknowledge first before Investigate.';
        }
        if (current === 'resolved' || current === 'false_alarm' || current === 'closed') {
            return 'Finalized incidents cannot be investigated.';
        }
    }

    if (next === 'resolved') {
        if (current === 'pending' || current === 'open') {
            return 'Acknowledge and Investigate first before Resolve.';
        }
        if (current === 'resolved' || current === 'false_alarm' || current === 'closed') {
            return 'This incident is already finalized.';
        }
    }

    if (next === 'false_alarm') {
        if (current === 'resolved' || current === 'false_alarm' || current === 'closed') {
            return 'This incident is already finalized.';
        }
    }

    return 'Action is not available for the current incident status.';
}

function updateStatusActionButtons(currentStatus) {
    const allowed = getAllowedNextStatuses(currentStatus);
    const buttons = document.querySelectorAll('.status-btn');

    buttons.forEach((button) => {
        const nextStatus = String(button.dataset.status || '').toLowerCase();
        const isAllowed = allowed.includes(nextStatus);

        button.disabled = !isAllowed;

        if (isAllowed) {
            button.classList.remove('opacity-40', 'cursor-not-allowed');
            button.removeAttribute('title');
            return;
        }

        button.classList.add('opacity-40', 'cursor-not-allowed');
        button.title = getDisabledStatusReason(currentStatus, nextStatus);
    });
}

async function openIncidentDetail(id) {
    currentIncidentId = id;
    const incident = allIncidents.find((item) => Number(item.id) === Number(id));
    const modal = document.getElementById('incidentDetailModal');

    if (!modal) {
        setStatusUpdateError('Incident modal was not found in the page.');
        return;
    }

    if (!incident) {
        setStatusUpdateError('Incident not found in the current list.');
        return;
    }

    currentIncident = incident;

    clearStatusUpdateErrors();

    // Open modal first so users always get immediate feedback on click.
    modal.classList.remove('hidden');

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('modalTitle', formatIncidentType(incident.incident_type));
    const vehicleName = incident.vehicle_name || 'Unknown Vehicle';
    const plateNumber = incident.vehicle_number || '-';
    const driverName = (incident.driver_name || '-').trim() || '-';
    setText('modalSubtitle', `${vehicleName} • Plate ${plateNumber} • ${driverName} • ${formatTimestamp(incident.created_at)}`);
    setText('modalType', formatIncidentType(incident.incident_type));

    const severityEl = document.getElementById('modalSeverity');
    if (severityEl) {
        severityEl.textContent = String(incident.severity || 'info').toUpperCase();
        severityEl.className = `text-sm font-bold ${getSeverityTextClass(incident.severity)}`;
    }

    setText(
        'modalInitialWeight',
        incident.initial_weight_kg !== null && incident.initial_weight_kg !== undefined
            ? `${Number(incident.initial_weight_kg).toFixed(2)} kg`
            : '-'
    );
    setText(
        'modalWeightDiff',
        incident.weight_difference_kg !== null && incident.weight_difference_kg !== undefined
            ? `${Number(incident.weight_difference_kg).toFixed(2)} kg`
            : '-'
    );
    setText('modalDescription', incident.description || 'No description');

    const statusUpdateSection = document.getElementById('statusUpdateSection');
    const normalizedStatus = String(incident.status || '').toLowerCase();
    if (statusUpdateSection) {
        if (normalizedStatus === 'resolved' || normalizedStatus === 'closed') {
            statusUpdateSection.classList.add('hidden');
        } else {
            statusUpdateSection.classList.remove('hidden');
            updateStatusActionButtons(normalizedStatus);
        }
    }

    await renderIncidentHistory(incident.id);

    setTimeout(() => {
        if (modalMap) {
            modalMap.remove();
        }

        const lat = Number(incident.latitude) || DEFAULT_CENTER[0];
        const lng = Number(incident.longitude) || DEFAULT_CENTER[1];
        modalMap = L.map('modalMap').setView([lat, lng], 10);
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

    renderWeightChart(incident).catch(() => {
        // Keep modal usable even if timeline chart data fails.
    });
}

async function renderIncidentHistory(incidentId) {
    const historyContainer = document.getElementById('modalHistoryContainer');
    if (!historyContainer) {
        return;
    }

    historyContainer.innerHTML = '<p class="text-slate-500">Loading incident history...</p>';

    try {
        const result = await requestJson(`${API_BASE}/${incidentId}/history`);
        const rows = Array.isArray(result.data) ? result.data : [];

        if (rows.length === 0) {
            historyContainer.innerHTML = '<p class="text-slate-500">No lifecycle events found for this incident.</p>';
            return;
        }

        historyContainer.innerHTML = rows.map((row) => {
            const severityClass = getSeverityTextClass(row.severity);
            const eventText = formatStatus(row.status);
            const message = escapeHtml(row.description || 'Incident state updated by the system.');
            const weightImpact = row.weight_impact_kg === null || row.weight_impact_kg === undefined
                ? ''
                : ` <span class="text-slate-500">(${Number(row.weight_impact_kg).toFixed(2)} kg)</span>`;

            return `
                <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-[11px] font-bold uppercase tracking-wide ${severityClass}">${escapeHtml(eventText)}</p>
                        <p class="text-[10px] font-mono text-slate-500">${escapeHtml(formatTimestamp(row.created_at))}</p>
                    </div>
                    <p class="mt-1 text-slate-300 leading-relaxed">${message}${weightImpact}</p>
                </div>
            `;
        }).join('');
    } catch (error) {
        historyContainer.innerHTML = `<p class="text-rose-300">${escapeHtml(error.message || 'Failed to load history.')}</p>`;
    }
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
        const normalizedType = String(incident.incident_type || '').toLowerCase();
        let estimatedIncidentWeight = baseWeight;

        if (normalizedType === 'loss' || normalizedType === 'cargo_loss') {
            estimatedIncidentWeight = Math.max(0, baseWeight + delta);
        }

        if (normalizedType === 'overload') {
            estimatedIncidentWeight = baseWeight;
        }

        timeline = Array.from({ length: 8 }).map((_, idx) => ({
            recorded_at: new Date(new Date(incident.created_at).getTime() + idx * 5 * 60000).toISOString(),
            weight_kg: idx < 4 ? baseWeight : estimatedIncidentWeight
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

    try {
        await requestJson(`${API_BASE}/${currentIncidentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: nextStatus
            })
        });

        const target = allIncidents.find((item) => Number(item.id) === Number(currentIncidentId));
        if (target) {
            target.status = nextStatus;
        }

        renderIncidentTable();
        renderIncidentMarkers();
        renderStats();
        closeModal();
    } catch (error) {
        const fieldErrors = error.fieldErrors || {};

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

    closeStatusConfirmModal();

    clearStatusUpdateErrors();
    currentIncidentId = null;
    currentIncident = null;

    if (modalMap) {
        modalMap.remove();
        modalMap = null;
    }
}

function focusIncidentOnMainMap() {
    if (!incidentMap || !currentIncident) {
        return;
    }

    const selectedIncident = { ...currentIncident };

    const lat = Number(selectedIncident.latitude);
    const lng = Number(selectedIncident.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatusUpdateError('Incident location is not available on the map.');
        return;
    }

    incidentMap.flyTo([lat, lng], 10, { duration: 0.7 });

    const marker = incidentMarkers.get(selectedIncident.id);
    if (marker) {
        marker.openPopup();
        closeModal();
        return;
    }

    const color = String(selectedIncident.severity || '').toLowerCase() === 'high'
        ? '#EF4444'
        : String(selectedIncident.severity || '').toLowerCase() === 'medium'
            ? '#F59E0B'
            : '#3B82F6';

    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const tempMarker = L.marker([lat, lng], { icon }).addTo(incidentMap);
    tempMarker.bindPopup(buildIncidentPopupContent(selectedIncident, color)).openPopup();

    closeModal();
}

function buildIncidentPopupContent(incident, color) {
    const weightText = incident.weight_difference_kg !== null && incident.weight_difference_kg !== undefined
        ? `${Number(incident.weight_difference_kg).toFixed(2)} kg`
        : null;

    return `
        <div class="min-w-[230px] rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 text-slate-200 shadow-xl">
            <div class="flex items-center justify-between gap-2 mb-2">
                <p class="text-xs font-extrabold uppercase tracking-wide" style="color:${color}">${escapeHtml(formatIncidentType(incident.incident_type))}</p>
                <span class="text-[10px] px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800 text-slate-300">${escapeHtml(formatStatus(incident.status || 'open'))}</span>
            </div>
            <p class="text-xs text-slate-300 font-semibold">${escapeHtml(incident.vehicle_number || 'Unknown Vehicle')}</p>
            <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">${escapeHtml(incident.description || 'No description')}</p>
            ${weightText ? `<p class="text-[11px] text-sky-300 mt-2 font-semibold">Weight Impact: ${escapeHtml(weightText)}</p>` : ''}
            <button onclick="openIncidentDetail(${Number(incident.id)})" class="mt-3 w-full px-3 py-1.5 text-[11px] font-bold rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition">View Details</button>
        </div>
    `;
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

function renderIncidentPagination() {
    const paginationInfo = document.getElementById('incidentPaginationInfo');
    const paginationControls = document.getElementById('incidentPaginationControls');

    if (!paginationInfo || !paginationControls) {
        return;
    }

    const totalEntries = Number(incidentsPagination.totalEntries || 0);
    const totalPages = Math.max(1, Number(incidentsPagination.totalPages || 1));
    const currentPage = Math.min(Math.max(1, incidentsPagination.page), totalPages);
    incidentsPagination.page = currentPage;

    if (totalEntries === 0) {
        paginationInfo.textContent = 'Showing 0 to 0 of 0 entries';
        paginationControls.classList.add('hidden');
        paginationControls.innerHTML = '';
        return;
    }

    const startIndex = (currentPage - 1) * incidentsPagination.limit;
    const endIndex = Math.min(startIndex + allIncidents.length, totalEntries);
    paginationInfo.innerHTML = `Showing <span class="text-white font-bold">${startIndex + 1}</span> to <span class="text-white font-bold">${endIndex}</span> of <span class="text-white font-bold">${totalEntries}</span> entries`;
    paginationControls.classList.remove('hidden');

    const makePageBtn = (p, active = false) => {
        const cls = active
            ? 'w-8 h-8 flex items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold'
            : 'w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-bold';

        return `<button onclick="goToIncidentPage(${p})" class="${cls}">${p}</button>`;
    };

    const makeArrowBtn = (targetPage, direction, disabled = false) => {
        const path = direction === 'prev' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7';
        const baseCls = disabled
            ? 'p-2 rounded-lg border border-slate-700 text-slate-500 opacity-50 cursor-not-allowed bg-slate-800/50'
            : 'p-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition';
        const clickAttr = disabled ? '' : `onclick="goToIncidentPage(${targetPage})"`;

        return `<button ${disabled ? 'disabled' : ''} ${clickAttr} class="${baseCls}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${path}"></path></svg></button>`;
    };

    let html = '';
    html += makeArrowBtn(currentPage - 1, 'prev', currentPage <= 1);

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push('...');
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i += 1) pages.push(i);
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach((entry) => {
        if (entry === '...') {
            html += '<span class="w-8 h-8 flex items-center justify-center text-slate-600 text-xs font-bold">...</span>';
        } else {
            html += makePageBtn(entry, entry === currentPage);
        }
    });

    html += makeArrowBtn(currentPage + 1, 'next', currentPage >= totalPages);
    paginationControls.innerHTML = html;
}

async function goToIncidentPage(targetPage) {
    const target = Number(targetPage);
    if (!Number.isFinite(target)) {
        return;
    }

    const totalPages = Math.max(1, Number(incidentsPagination.totalPages || 1));
    const nextPage = Math.min(Math.max(1, target), totalPages);
    if (nextPage === incidentsPagination.page) {
        return;
    }

    incidentsPagination.page = nextPage;
    await refreshIncidents();
}

function clearStatusUpdateErrors() {
    const statusError = document.getElementById('statusUpdateError');

    if (statusError) {
        statusError.textContent = '';
        statusError.classList.add('hidden');
    }
}

function openStatusConfirmModal(nextStatus) {
    if (!currentIncidentId || !nextStatus) {
        return;
    }

    const confirmModal = document.getElementById('statusConfirmModal');
    const confirmMessage = document.getElementById('statusConfirmMessage');
    if (!confirmModal || !confirmMessage) {
        return;
    }

    pendingStatus = String(nextStatus).toLowerCase();
    confirmMessage.textContent = `Are you sure you want to set this incident to ${formatStatus(pendingStatus)}?`;
    confirmModal.classList.remove('hidden');
}

function closeStatusConfirmModal() {
    const confirmModal = document.getElementById('statusConfirmModal');
    confirmModal?.classList.add('hidden');
    pendingStatus = null;
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
        loss: 'Cargo Loss',
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

function formatRelativeTime(value) {
    if (!value) {
        return 'time unavailable';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'time unavailable';
    }

    const diffMs = Date.now() - date.getTime();
    const absMs = Math.abs(diffMs);
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (absMs < hourMs) {
        const mins = Math.max(1, Math.round(absMs / minuteMs));
        return `${mins} min ${diffMs >= 0 ? 'ago' : 'ahead'}`;
    }

    if (absMs < dayMs) {
        const hours = Math.max(1, Math.round(absMs / hourMs));
        return `${hours} hr ${diffMs >= 0 ? 'ago' : 'ahead'}`;
    }

    const days = Math.max(1, Math.round(absMs / dayMs));
    return `${days} day${days === 1 ? '' : 's'} ${diffMs >= 0 ? 'ago' : 'ahead'}`;
}

function getSeverityDetail(incident) {
    const severity = String(incident.severity || '').toLowerCase();
    const impact = Number(incident.weight_difference_kg);

    if (Number.isFinite(impact)) {
        const sign = impact > 0 ? '+' : '';
        return `Impact ${sign}${impact.toFixed(2)} kg`;
    }

    if (severity === 'high') return 'Critical priority alert';
    if (severity === 'medium') return 'Needs operator review';
    return 'Routine monitoring event';
}

function getStatusDetail(incident) {
    const status = String(incident.status || '').toLowerCase();
    const ageText = `Logged ${formatRelativeTime(incident.created_at)}`;

    if (status === 'resolved') {
        return incident.resolved_at
            ? `Resolved ${formatRelativeTime(incident.resolved_at)}`
            : 'Marked resolved';
    }

    if (status === 'false_alarm') {
        return 'Closed as false alarm';
    }

    if (status === 'investigating') {
        return `${ageText} • under investigation`;
    }

    if (status === 'acknowledged') {
        return `${ageText} • acknowledged`;
    }

    return ageText;
}

function formatCoordinatePair(lat, lng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        return 'N/A';
    }

    return `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
}

function buildDispatchTaskCell(incident) {
    const taskLabel = incident.task_id ? `#${incident.task_id}` : 'No Task';
    const dispatchStatus = formatStatus(incident.dispatch_status || 'pending');
    const pickupLabel = formatCoordinatePair(incident.pickup_lat, incident.pickup_lng);
    const dropoffLabel = formatCoordinatePair(incident.destination_lat, incident.destination_lng);

    return `
        <div class="space-y-1.5">
            <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-md border border-slate-600/80 bg-slate-800/70 px-2 py-0.5 text-[10px] font-bold text-slate-200">${escapeHtml(taskLabel)}</span>
                <span class="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">${escapeHtml(dispatchStatus)}</span>
            </div>
            <div class="text-[10px] leading-relaxed text-slate-400">
                <div><span class="text-slate-500">Pickup:</span> ${escapeHtml(pickupLabel)}</div>
                <div><span class="text-slate-500">Dropoff:</span> ${escapeHtml(dropoffLabel)}</div>
            </div>
        </div>
    `;
}

function getIncidentTypeBadgeClass(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'cargo_loss' || normalized === 'loss') {
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
    const normalized = String(severity || 'normal').toLowerCase();
    if (normalized === 'high') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold tracking-wide';
    }
    if (normalized === 'medium') {
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
    const normalized = String(severity || 'normal').toLowerCase();
    if (normalized === 'high') return 'text-rose-500';
    if (normalized === 'medium') return 'text-amber-500';
    return 'text-blue-500';
}

function getSeverityDotBgClass(severity) {
    const normalized = String(severity || 'normal').toLowerCase();
    if (normalized === 'high') return 'bg-rose-500';
    if (normalized === 'medium') return 'bg-amber-500';
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
window.goToIncidentPage = goToIncidentPage;
