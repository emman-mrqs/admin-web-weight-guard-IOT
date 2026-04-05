/**
 * Admin incidents module
 * Data rendering is fully API-driven and updates dynamically without page reloads.
 */

const API_BASE = '/api/admin/incidents';
const INCIDENT_ACTIVE_STATUSES = ['pending', 'open', 'acknowledged', 'investigating'];

let incidentMap = null;
let modalMap = null;
let modalMapMarkerLayer = null;
let mainMapEventMarkerLayer = null;
let incidentMarkers = new Map();
let mainMapHistoryCache = new Map();
let allIncidents = [];
let currentIncidentId = null;
let currentIncident = null;
let pendingStatus = null;
let weightChart = null;
let weightChartPanCleanup = null;
let modalHistoryRows = [];
let modalHistoryFilteredRows = [];
let modalHistoryFilter = 'all';
let modalHistoryTypeFilter = 'all';
let selectedHistoryIncidentId = null;
let modalDefaultIncidentId = null;
let modalDefaultIncidentStatus = null;
let modalMapShowAllEventMarkers = true;
let mainMapShowEventMarkers = true;
let isIncidentMapSatellite = false;
let incidentMapDarkLayer = null;
let incidentMapSatelliteLayer = null;
let incidentMapSatelliteLabelLayer = null;
let statusUpdateBusy = false;
let currentView = 'active';
const incidentsPagination = {
    page: 1,
    limit: 10,
    totalEntries: 0,
    totalPages: 1
};

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const SAT_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_LABEL_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const MAP_MAX_ZOOM = 22;
const BASE_LAYER_MAX_NATIVE_ZOOM = 19;
const LABEL_LAYER_MAX_NATIVE_ZOOM = 20;
const DARK_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: BASE_LAYER_MAX_NATIVE_ZOOM
};
const SAT_TILE_OPTIONS = {
    attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: BASE_LAYER_MAX_NATIVE_ZOOM
};
const SAT_LABEL_TILE_OPTIONS = {
    attribution: '&copy; OSM contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: LABEL_LAYER_MAX_NATIVE_ZOOM,
    opacity: 0.9
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
        zoomControl: false,
        maxZoom: MAP_MAX_ZOOM
    });

    L.control.zoom({ position: 'bottomright' }).addTo(incidentMap);

    incidentMapDarkLayer = L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS);
    incidentMapSatelliteLayer = L.tileLayer(SAT_TILE_URL, SAT_TILE_OPTIONS);
    incidentMapSatelliteLabelLayer = L.tileLayer(SAT_LABEL_TILE_URL, SAT_LABEL_TILE_OPTIONS);

    incidentMapDarkLayer.addTo(incidentMap);
    syncIncidentMapStyleButtons();
    setTimeout(() => incidentMap.invalidateSize(), 100);
}

function setIncidentMapStyle(style) {
    if (!incidentMap) {
        return;
    }

    const targetStyle = style === 'sat' ? 'sat' : 'dark';
    isIncidentMapSatellite = targetStyle === 'sat';

    if (incidentMapDarkLayer) {
        incidentMap.removeLayer(incidentMapDarkLayer);
    }

    if (incidentMapSatelliteLayer) {
        incidentMap.removeLayer(incidentMapSatelliteLayer);
    }

    if (incidentMapSatelliteLabelLayer) {
        incidentMap.removeLayer(incidentMapSatelliteLabelLayer);
    }

    if (isIncidentMapSatellite) {
        incidentMapSatelliteLayer?.addTo(incidentMap);
        incidentMapSatelliteLabelLayer?.addTo(incidentMap);
    } else {
        incidentMapDarkLayer?.addTo(incidentMap);
    }

    syncIncidentMapStyleButtons();
}

function syncIncidentMapStyleButtons() {
    const mapButton = document.getElementById('btnIncidentMapStyle');
    const satButton = document.getElementById('btnIncidentSatStyle');

    if (!mapButton || !satButton) {
        return;
    }

    const mapActive = !isIncidentMapSatellite;
    const satActive = isIncidentMapSatellite;

    mapButton.className = mapActive
        ? 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg border border-slate-500/50 bg-slate-800 text-white shadow-sm transition'
        : 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg border border-slate-700 text-slate-400 bg-slate-900 hover:text-slate-200 hover:bg-slate-800 transition';

    satButton.className = satActive
        ? 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 shadow-sm transition'
        : 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg border border-slate-700 text-slate-400 bg-slate-900 hover:text-slate-200 hover:bg-slate-800 transition';
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
        mainMapHistoryCache.clear();
        incidentsPagination.totalEntries = Number(result?.pagination?.totalEntries || 0);
        incidentsPagination.totalPages = Math.max(1, Number(result?.pagination?.totalPages || 1));

        if (incidentsPagination.page > incidentsPagination.totalPages) {
            incidentsPagination.page = incidentsPagination.totalPages;
            await refreshIncidents();
            return;
        }

        renderIncidentTable();
        await renderIncidentMarkers();
        renderStats();
        renderIncidentPagination();
    } catch (error) {
        allIncidents = [];
        incidentsPagination.totalEntries = 0;
        incidentsPagination.totalPages = 1;
        renderIncidentTable();
        await renderIncidentMarkers();
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

async function renderIncidentMarkers() {
    incidentMarkers.forEach((marker) => incidentMap.removeLayer(marker));
    incidentMarkers.clear();

    if (mainMapEventMarkerLayer) {
        incidentMap.removeLayer(mainMapEventMarkerLayer);
        mainMapEventMarkerLayer = null;
    }

    const activeIncidents = allIncidents
        .filter((item) => item.latitude && item.longitude && INCIDENT_ACTIVE_STATUSES.includes(item.status))
        .slice();

    activeIncidents.forEach((incident) => addIncidentMarker(incident));

    if (mainMapShowEventMarkers && activeIncidents.length > 0) {
        await renderMainMapEventMarkers(activeIncidents);
    }

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

async function renderMainMapEventMarkers(baseIncidents) {
    if (!incidentMap || !Array.isArray(baseIncidents) || baseIncidents.length === 0) {
        return;
    }

    if (!mainMapEventMarkerLayer) {
        mainMapEventMarkerLayer = L.layerGroup().addTo(incidentMap);
    } else {
        mainMapEventMarkerLayer.clearLayers();
    }

    const markerPayloads = [];
    await Promise.all(baseIncidents.map(async (baseIncident) => {
        const cacheKey = Number(baseIncident.id);
        let rows = mainMapHistoryCache.get(cacheKey);

        if (!rows) {
            try {
                const result = await requestJson(`${API_BASE}/${cacheKey}/history`);
                rows = Array.isArray(result.data) ? result.data : [];
                mainMapHistoryCache.set(cacheKey, rows);
            } catch (error) {
                rows = [];
            }
        }

        rows.forEach((row) => {
            const lat = Number(row.latitude);
            const lng = Number(row.longitude);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return;
            }

            markerPayloads.push({ baseIncident, row, lat, lng });
        });
    }));

    markerPayloads.forEach(({ baseIncident, row, lat, lng }) => {
        const markerMeta = getMainMapEventMarkerMeta(row, baseIncident);
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: markerMeta.html,
            iconSize: markerMeta.iconSize,
            iconAnchor: markerMeta.iconAnchor
        });

        const marker = L.marker([lat, lng], { icon, opacity: markerMeta.opacity });
        marker.bindPopup(buildMainMapEventPopupContent(baseIncident, row, markerMeta.color, markerMeta.statusLabel));
        marker.addTo(mainMapEventMarkerLayer);
    });
}

function getMainMapEventMarkerMeta(row, baseIncident) {
    const status = String(row.status || baseIncident.status || 'open').toLowerCase();
    const severity = String(row.severity || baseIncident.severity || 'normal').toLowerCase();
    const colorMap = {
        high: '#EF4444',
        medium: '#F59E0B',
        normal: '#3B82F6'
    };
    const statusMeta = {
        resolved: { opacity: 0.55, ring: 'ring-slate-400/40', fill: 'bg-slate-400', pulse: false, statusLabel: 'Resolved' },
        false_alarm: { opacity: 0.5, ring: 'ring-slate-500/35', fill: 'bg-slate-500', pulse: false, statusLabel: 'False Alarm' },
        investigating: { opacity: 0.95, ring: 'ring-sky-400/35', fill: 'bg-sky-400', pulse: true, statusLabel: 'Investigating' },
        acknowledged: { opacity: 0.9, ring: 'ring-blue-400/35', fill: 'bg-blue-400', pulse: false, statusLabel: 'Acknowledged' },
        pending: { opacity: 0.85, ring: 'ring-amber-400/35', fill: 'bg-amber-400', pulse: false, statusLabel: 'Pending' },
        open: { opacity: 0.85, ring: 'ring-amber-400/35', fill: 'bg-amber-400', pulse: false, statusLabel: 'Open' }
    };
    const meta = statusMeta[status] || statusMeta.open;
    const color = colorMap[severity] || colorMap.normal;
    const activeSize = status === 'resolved' || status === 'false_alarm' ? 14 : 16;

    return {
        color,
        opacity: meta.opacity,
        statusLabel: meta.statusLabel,
        iconSize: [activeSize + 6, activeSize + 6],
        iconAnchor: [Math.round((activeSize + 6) / 2), Math.round((activeSize + 6) / 2)],
        html: meta.pulse
            ? `<div class="relative flex items-center justify-center"><div class="absolute inset-0 rounded-full ${meta.fill}/25 animate-ping"></div><div class="relative ${meta.fill} ${meta.ring} border-2 border-white rounded-full shadow-lg" style="width:${activeSize}px;height:${activeSize}px;background-color:${color};"></div></div>`
            : status === 'resolved' || status === 'false_alarm'
                ? `<div class="flex items-center justify-center rounded-full border-2 border-white shadow-lg ${meta.ring}" style="width:${activeSize}px;height:${activeSize}px;background-color:rgba(148, 163, 184, 0.82);"></div>`
                : `<div class="flex items-center justify-center rounded-full border-2 border-white shadow-lg ${meta.ring}" style="width:${activeSize}px;height:${activeSize}px;background-color:${color};"></div>`
    };
}

function buildMainMapEventPopupContent(baseIncident, row, color, statusLabel = '') {
    const eventLabel = formatIncidentType(row.incident_type || baseIncident.incident_type);
    const statusText = statusLabel || formatStatus(row.status || baseIncident.status || 'open');
    const taskLabel = baseIncident.task_id ? `Task #${baseIncident.task_id}` : 'No Task';
    const timeLabel = formatTimestamp(row.resolved_at && String(row.status || '').toLowerCase() === 'resolved'
        ? row.resolved_at
        : row.created_at);
    const note = String(row.operator_note || row.description || baseIncident.description || '').trim();
    const eventCount = Math.max(1, Number(baseIncident.events_count || 0));

    return `
        <div class="min-w-[230px] rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 text-slate-200 shadow-xl">
            <div class="flex items-center justify-between gap-2 mb-2">
                <p class="text-xs font-extrabold uppercase tracking-wide" style="color:${color}">${escapeHtml(eventLabel)}</p>
                <span class="text-[10px] px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800 text-slate-300">${escapeHtml(statusText)}</span>
            </div>
            <p class="text-xs text-slate-300 font-semibold">${escapeHtml(baseIncident.vehicle_name || 'Unknown Vehicle')} • ${escapeHtml(taskLabel)}</p>
            <p class="mt-1 text-[11px] text-slate-400 leading-relaxed">${escapeHtml(note || 'No note available.')}</p>
            <div class="mt-2 space-y-1 text-[11px] text-slate-400">
                <p><span class="text-slate-500">Time:</span> ${escapeHtml(timeLabel)}</p>
                <p><span class="text-slate-500">Location:</span> ${escapeHtml(formatCoordinatePair(row.latitude, row.longitude))}</p>
                <p><span class="text-slate-500">Events:</span> ${escapeHtml(`${eventCount} lifecycle event${eventCount === 1 ? '' : 's'}`)}</p>
            </div>
            <button onclick="openIncidentDetail(${Number(baseIncident.id)})" class="mt-3 w-full px-3 py-1.5 text-[11px] font-bold rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition">View Incident</button>
        </div>
    `;
}

function syncMainMapMarkerButton() {
    const button = document.getElementById('btnToggleMainMapMarkers');
    if (!button) {
        return;
    }

    button.setAttribute('aria-pressed', mainMapShowEventMarkers ? 'true' : 'false');
    button.textContent = mainMapShowEventMarkers ? 'Event Markers: On' : 'Event Markers: Off';
    button.classList.toggle('bg-emerald-500/10', mainMapShowEventMarkers);
    button.classList.toggle('border-emerald-500/30', mainMapShowEventMarkers);
    button.classList.toggle('text-emerald-300', mainMapShowEventMarkers);
    button.classList.toggle('bg-slate-900', !mainMapShowEventMarkers);
    button.classList.toggle('border-slate-700', !mainMapShowEventMarkers);
    button.classList.toggle('text-slate-300', !mainMapShowEventMarkers);
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
                    <div class="text-[10px] font-semibold text-sky-300 mt-0.5">Task: ${escapeHtml(incident.task_id ? `#${incident.task_id}` : 'No Task')}</div>
                    <div class="text-[10px] text-emerald-300 mt-0.5">${escapeHtml(`${Math.max(1, Number(incident.events_count || 0))} event${Math.max(1, Number(incident.events_count || 0)) === 1 ? '' : 's'}`)}</div>
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
    document.getElementById('btnIncidentMapStyle')?.addEventListener('click', () => {
        setIncidentMapStyle('dark');
    });

    document.getElementById('btnIncidentSatStyle')?.addEventListener('click', () => {
        setIncidentMapStyle('sat');
    });

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

    document.getElementById('btnToggleMainMapMarkers')?.addEventListener('click', async () => {
        mainMapShowEventMarkers = !mainMapShowEventMarkers;
        syncMainMapMarkerButton();
        await renderIncidentMarkers();
    });

    document.getElementById('btnToggleModalMapMarkers')?.addEventListener('click', () => {
        modalMapShowAllEventMarkers = !modalMapShowAllEventMarkers;
        renderModalIncidentMap();
    });

    document.getElementById('btnCancelStatusConfirm')?.addEventListener('click', closeStatusConfirmModal);
    document.getElementById('btnConfirmStatusChange')?.addEventListener('click', async () => {
        if (!pendingStatus) {
            closeStatusConfirmModal();
            return;
        }

        const note = getStatusUpdateNote();
        if (!note) {
            setStatusUpdateError('Please add a note before updating the incident status.');
            return;
        }

        const statusToApply = pendingStatus;
        closeStatusConfirmModal();
        await handleStatusUpdate(statusToApply, note);
    });

    document.getElementById('btnStatusFlowInfo')?.addEventListener('click', () => {
        const panel = document.getElementById('statusFlowInfoPanel');
        const button = document.getElementById('btnStatusFlowInfo');
        if (!panel || !button) {
            return;
        }

        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !isHidden);
        button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    document.getElementById('btnToggleHistoryDetails')?.addEventListener('click', () => {
        const body = document.getElementById('modalHistorySelectionDetailsBody');
        const button = document.getElementById('btnToggleHistoryDetails');
        const label = document.getElementById('btnToggleHistoryDetailsLabel');
        if (!body || !button || !label) {
            return;
        }

        const willExpand = body.classList.contains('hidden');
        body.classList.toggle('hidden', !willExpand);
        button.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
        label.textContent = willExpand ? 'Collapse' : 'Expand';
    });

    document.getElementById('modalHistoryFilter')?.addEventListener('change', (event) => {
        modalHistoryFilter = String(event.target?.value || 'all').toLowerCase();
        renderHistoryRows(modalHistoryRows);
    });

    document.getElementById('modalHistoryTypeFilterBar')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-history-type]');
        if (!button) {
            return;
        }

        modalHistoryTypeFilter = String(button.dataset.historyType || 'all').toLowerCase();
        renderHistoryRows(modalHistoryRows);
    });

    document.getElementById('modalHistoryContainer')?.addEventListener('click', (event) => {
        const rowEl = event.target.closest('[data-history-incident-id]');
        if (!rowEl) {
            return;
        }

        const selectedId = Number(rowEl.dataset.historyIncidentId);
        if (!Number.isFinite(selectedId) || selectedId <= 0) {
            return;
        }

        selectHistoryIncidentRow(selectedId);
    });

    document.getElementById('btnHistoryScrollTop')?.addEventListener('click', () => {
        const historyContainer = document.getElementById('modalHistoryContainer');
        historyContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btnHistoryScrollBottom')?.addEventListener('click', () => {
        const historyContainer = document.getElementById('modalHistoryContainer');
        if (!historyContainer) return;
        historyContainer.scrollTo({ top: historyContainer.scrollHeight, behavior: 'smooth' });
    });

    setViewButtons();
    syncMainMapMarkerButton();
    syncIncidentMapStyleButtons();
}

function isWithinHistoryFilter(row, filter) {
    const selected = String(filter || 'all').toLowerCase();
    if (selected === 'all') {
        return true;
    }

    const refDateRaw = row.resolved_at || row.created_at;
    const refDate = new Date(refDateRaw);
    if (Number.isNaN(refDate.getTime())) {
        return false;
    }

    const now = new Date();
    if (selected === 'today') {
        return refDate.getFullYear() === now.getFullYear()
            && refDate.getMonth() === now.getMonth()
            && refDate.getDate() === now.getDate();
    }

    const days = selected === '7d' ? 7 : selected === '30d' ? 30 : null;
    if (days === null) {
        return true;
    }

    const threshold = new Date(now);
    threshold.setDate(now.getDate() - days);
    return refDate >= threshold;
}

function normalizeHistoryIncidentType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'cargo_loss' || normalized === 'loss') {
        return 'loss';
    }

    if (normalized === 'above_reference') {
        return 'above_reference';
    }

    if (normalized === 'overload') {
        return 'overload';
    }

    return normalized;
}

function buildHistoryTimeline(rows) {
    const orderedRows = Array.isArray(rows)
        ? [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        : [];

    if (orderedRows.length === 0) {
        return [];
    }

    const baselineWeight = Number(orderedRows[0].initial_reference_weight_kg || 0);
    const timeline = [{
        recorded_at: orderedRows[0].created_at,
        weight_kg: baselineWeight,
        previous_weight_kg: baselineWeight,
        sourceIncidentId: null,
        weightImpactKg: null,
        incident_type: 'baseline',
        status: 'baseline'
    }];

    let previousWeight = baselineWeight;

    orderedRows.forEach((row) => {
        const impact = Number(row.weight_impact_kg);
        const safeImpact = Number.isFinite(impact) ? impact : 0;
        const status = String(row.status || '').toLowerCase();

        let currentWeight = previousWeight + safeImpact;
        if (status === 'resolved' || status === 'false_alarm') {
            currentWeight = baselineWeight;
        }

        const pointTime = row.resolved_at && status === 'resolved'
            ? row.resolved_at
            : row.created_at;

        timeline.push({
            recorded_at: pointTime,
            weight_kg: Math.max(0, currentWeight),
            previous_weight_kg: Math.max(0, previousWeight),
            incident_type: row.incident_type,
            status,
            sourceIncidentId: Number(row.id),
            weightImpactKg: Number.isFinite(safeImpact) ? safeImpact : null
        });

        previousWeight = currentWeight;
    });

    return timeline;
}

function getHistoryTypeCounts(rows) {
    const counts = {
        all: 0,
        loss: 0,
        above_reference: 0,
        overload: 0
    };

    rows.forEach((row) => {
        counts.all += 1;
        const normalizedType = normalizeHistoryIncidentType(row.incident_type);
        if (Object.prototype.hasOwnProperty.call(counts, normalizedType)) {
            counts[normalizedType] += 1;
        }
    });

    return counts;
}

function syncHistoryTypeFilterButtons(rows) {
    const buttons = document.querySelectorAll('#modalHistoryTypeFilterBar [data-history-type]');
    if (!buttons.length) {
        return;
    }

    const counts = getHistoryTypeCounts(rows);

    buttons.forEach((button) => {
        const type = String(button.dataset.historyType || 'all').toLowerCase();
        const count = counts[type] ?? 0;
        const isActive = type === modalHistoryTypeFilter;

        button.classList.toggle('bg-sky-500/10', isActive);
        button.classList.toggle('border-sky-500/40', isActive);
        button.classList.toggle('text-sky-300', isActive);
        button.classList.toggle('bg-slate-900', !isActive);
        button.classList.toggle('border-slate-700', !isActive);
        button.classList.toggle('text-slate-300', !isActive);
        button.classList.toggle('hover:bg-slate-800', !isActive);

        const badge = button.querySelector('span');
        if (badge) {
            badge.textContent = String(count);
        }
    });
}

function renderSelectedHistoryDetails(selectedRow) {
    const detailsEl = document.getElementById('modalHistorySelectionDetailsBody');
    if (!detailsEl) {
        return;
    }

    if (!selectedRow) {
        detailsEl.innerHTML = `
            <p class="text-slate-400">Select an event row to view detailed context.</p>
        `;
        return;
    }

    const incidentId = Number(selectedRow.id);
    const status = formatStatus(selectedRow.status || 'pending');
    const incidentType = formatIncidentType(selectedRow.incident_type || 'unknown');
    const eventTimeRaw = selectedRow.resolved_at && String(selectedRow.status || '').toLowerCase() === 'resolved'
        ? selectedRow.resolved_at
        : selectedRow.created_at;
    const eventTime = formatTimestamp(eventTimeRaw);
    const locationText = formatCoordinatePair(selectedRow.latitude, selectedRow.longitude);
    const operatorNote = String(selectedRow.operator_note || '').trim();
    const managedByName = String(selectedRow.managed_by_name || '').trim();

    const timeline = buildHistoryTimeline(modalHistoryRows);
    const selectedPoint = timeline.find((point) => Number(point.sourceIncidentId) === Number(selectedRow.id));
    const previousWeight = selectedPoint && Number.isFinite(selectedPoint.previous_weight_kg)
        ? Number(selectedPoint.previous_weight_kg)
        : toFiniteOrNull(selectedRow.initial_reference_weight_kg);
    const currentWeight = selectedPoint && Number.isFinite(selectedPoint.weight_kg)
        ? Number(selectedPoint.weight_kg)
        : toFiniteOrNull(selectedRow.initial_reference_weight_kg);
    const impact = selectedPoint && Number.isFinite(selectedPoint.weightImpactKg)
        ? Number(selectedPoint.weightImpactKg)
        : toFiniteOrNull(selectedRow.weight_impact_kg);

    let cargoNarrative = 'Cargo weight details are not available for this event.';
    if (previousWeight !== null && currentWeight !== null) {
        const changeLabel = impact < 0
            ? `loss ${Math.abs(impact).toFixed(2)} kg`
            : impact > 0
                ? `gain +${impact.toFixed(2)} kg`
                : 'no weight change';

        cargoNarrative = `Cargo changed from ${previousWeight.toFixed(2)} kg to ${currentWeight.toFixed(2)} kg (${changeLabel}).`;
    }

    detailsEl.innerHTML = `
        <div class="space-y-1.5 text-[11px] leading-relaxed">
            <p><span class="text-slate-500">Event:</span> <span class="text-sky-300 font-semibold">${escapeHtml(incidentType)}</span> <span class="text-slate-500">#${Number.isFinite(incidentId) ? incidentId : '-'}</span> <span class="text-amber-300">(${escapeHtml(status)})</span></p>
            <p><span class="text-slate-500">Time:</span> <span class="text-slate-200">${escapeHtml(eventTime)}</span></p>
            <p><span class="text-slate-500">Location:</span> <span class="text-slate-200">${escapeHtml(locationText)}</span></p>
            <p><span class="text-slate-500">Cargo:</span> <span class="text-slate-200">${escapeHtml(cargoNarrative)}</span></p>
            <p><span class="text-slate-500">Operator Note:</span> <span class="text-slate-200">${escapeHtml(operatorNote || 'No operator note yet.')}</span></p>
            <p><span class="text-slate-500">Updated By:</span> <span class="text-slate-200">${escapeHtml(managedByName || 'System')}</span></p>
        </div>
    `;
}

function getStatusUpdateNote() {
    return String(document.getElementById('incidentStatusNote')?.value || '').trim();
}

function setStatusUpdateMessage(message) {
    const el = document.getElementById('statusUpdateMessage');
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

function setStatusUpdateLoading(isLoading) {
    statusUpdateBusy = Boolean(isLoading);

    document.querySelectorAll('.status-btn').forEach((button) => {
        if (statusUpdateBusy) {
            button.disabled = true;
        }
    });

    const noteField = document.getElementById('incidentStatusNote');
    if (noteField) {
        noteField.disabled = statusUpdateBusy;
    }

    const confirmButton = document.getElementById('btnConfirmStatusChange');
    if (confirmButton) {
        confirmButton.disabled = statusUpdateBusy;
        confirmButton.classList.toggle('opacity-50', statusUpdateBusy);
        confirmButton.classList.toggle('cursor-not-allowed', statusUpdateBusy);
    }

    if (!statusUpdateBusy) {
        syncStatusUpdateSectionByStatus(currentIncident?.status || modalDefaultIncidentStatus || 'pending');
    }
}

function renderHistoryRows(rows) {
    const historyContainer = document.getElementById('modalHistoryContainer');
    if (!historyContainer) {
        return;
    }

    const timeFilteredRows = rows.filter((row) => isWithinHistoryFilter(row, modalHistoryFilter));
    syncHistoryTypeFilterButtons(timeFilteredRows);

    const filteredRows = modalHistoryTypeFilter === 'all'
        ? timeFilteredRows
        : timeFilteredRows.filter((row) => normalizeHistoryIncidentType(row.incident_type) === modalHistoryTypeFilter);
    modalHistoryFilteredRows = filteredRows;

    if (filteredRows.length === 0) {
        historyContainer.innerHTML = '<p class="text-slate-500">No lifecycle events for this filter.</p>';
        return;
    }

    historyContainer.innerHTML = `
        <div class="history-timeline-list">
            ${filteredRows.map((row, index) => {
                const severityClass = getSeverityTextClass(row.severity);
                const normalizedStatus = String(row.status || '').toLowerCase();
                const rowIncidentId = Number(row.id);
                const isSelected = Number.isFinite(rowIncidentId) && Number(rowIncidentId) === Number(selectedHistoryIncidentId);
                const eventText = (normalizedStatus === 'open' || normalizedStatus === 'pending')
                    ? 'Opened'
                    : normalizedStatus === 'resolved'
                        ? 'Resolved'
                        : normalizedStatus === 'false_alarm'
                            ? 'Marked False Alarm'
                            : formatStatus(row.status);
                const incidentTypeText = formatIncidentType(row.incident_type || 'unknown');
                const message = escapeHtml(row.description || 'Incident state updated by the system.');
                const operatorNotePreview = String(row.operator_note || '').trim();
                const impactValue = row.weight_impact_kg === null || row.weight_impact_kg === undefined
                    ? null
                    : Number(row.weight_impact_kg);
                const impactText = impactValue === null || Number.isNaN(impactValue)
                    ? ''
                    : `${impactValue > 0 ? '+' : ''}${impactValue.toFixed(2)} kg`;
                const eventTime = normalizedStatus === 'resolved' && row.resolved_at
                    ? formatTimestamp(row.resolved_at)
                    : formatTimestamp(row.created_at);
                const stepNumber = String(index + 1).padStart(2, '0');
                const nodeClass = normalizedStatus === 'resolved' || normalizedStatus === 'false_alarm'
                    ? 'history-timeline-node history-timeline-node-complete'
                    : normalizedStatus === 'investigating'
                        ? 'history-timeline-node history-timeline-node-active'
                        : 'history-timeline-node';

                return `
                    <div class="history-timeline-item">
                        <div class="history-timeline-rail">
                            <div class="${nodeClass}">${stepNumber}</div>
                            ${index === filteredRows.length - 1 ? '' : '<div class="history-timeline-line"></div>'}
                        </div>
                        <div class="history-timeline-card ${isSelected ? 'history-timeline-card-selected' : ''}" data-history-incident-id="${Number.isFinite(rowIncidentId) ? rowIncidentId : ''}">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-[10px] uppercase tracking-[0.24em] text-slate-500 font-bold">Event ${stepNumber}</p>
                                    <p class="mt-1 text-[11px] font-bold uppercase tracking-wide ${severityClass}">${escapeHtml(eventText)}</p>
                                </div>
                                <p class="text-[10px] font-mono text-slate-500 text-right">${escapeHtml(eventTime)}</p>
                            </div>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                <span class="history-chip history-chip-type">${escapeHtml(incidentTypeText)}</span>
                                <span class="history-chip history-chip-status">${escapeHtml(formatStatus(row.status))}</span>
                                ${impactText ? `<span class="history-chip history-chip-impact">${escapeHtml(impactText)}</span>` : ''}
                            </div>
                            <p class="mt-2 text-[11px] text-slate-300 leading-relaxed">${message}</p>
                            <div class="history-note-preview mt-2">
                                <span class="history-note-label">Note:</span>
                                <span class="history-note-text">${escapeHtml(operatorNotePreview || 'No operator note yet.')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    const activeDetailsRow = selectedHistoryIncidentId !== null
        ? modalHistoryRows.find((row) => Number(row.id) === Number(selectedHistoryIncidentId))
        : null;
    renderSelectedHistoryDetails(activeDetailsRow || null);

    renderModalIncidentMap();

    if (currentIncident) {
        renderWeightChart(currentIncident);
    }
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
    selectedHistoryIncidentId = Number(incident.id);
    modalDefaultIncidentId = Number(incident.id);
    modalDefaultIncidentStatus = String(incident.status || 'pending').toLowerCase();
    modalHistoryRows = [];
    modalHistoryFilteredRows = [];
    modalHistoryFilter = 'all';
    modalHistoryTypeFilter = 'all';
    modalMapShowAllEventMarkers = true;

    clearStatusUpdateErrors();

    const modalHistoryFilterSelect = document.getElementById('modalHistoryFilter');
    if (modalHistoryFilterSelect) {
        modalHistoryFilterSelect.value = 'all';
    }

    const detailsBody = document.getElementById('modalHistorySelectionDetailsBody');
    if (detailsBody) {
        detailsBody.classList.remove('hidden');
    }

    const detailsToggle = document.getElementById('btnToggleHistoryDetails');
    const detailsToggleLabel = document.getElementById('btnToggleHistoryDetailsLabel');
    if (detailsToggle && detailsToggleLabel) {
        detailsToggle.setAttribute('aria-expanded', 'true');
        detailsToggleLabel.textContent = 'Collapse';
    }

    syncHistoryTypeFilterButtons([]);
    syncModalMapMarkerButton();

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

    syncStatusUpdateSectionByStatus(incident.status);

    await renderIncidentHistory(incident.id);

    setTimeout(() => {
        if (modalMap) {
            modalMap.remove();
        }

        modalMapMarkerLayer = null;

        const lat = Number(incident.latitude) || DEFAULT_CENTER[0];
        const lng = Number(incident.longitude) || DEFAULT_CENTER[1];
        modalMap = L.map('modalMap').setView([lat, lng], 10);
        L.tileLayer(DARK_TILE_URL, DARK_TILE_OPTIONS).addTo(modalMap);

        modalMap.invalidateSize();
        renderModalIncidentMap();
    }, 100);

    renderWeightChart(incident);
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
        modalHistoryRows = rows;

        if (rows.length > 0) {
            if (selectedHistoryIncidentId !== null) {
                const hasSelected = rows.some((row) => Number(row.id) === Number(selectedHistoryIncidentId));
                if (!hasSelected) {
                    selectedHistoryIncidentId = null;
                }
            }

            const targetId = selectedHistoryIncidentId !== null
                ? Number(selectedHistoryIncidentId)
                : Number(modalDefaultIncidentId);
            const targetRow = rows.find((row) => Number(row.id) === targetId);

            if (targetRow) {
                currentIncidentId = Number(targetRow.id);
                syncStatusUpdateSectionByStatus(targetRow.status);
            } else {
                currentIncidentId = Number.isFinite(Number(modalDefaultIncidentId))
                    ? Number(modalDefaultIncidentId)
                    : currentIncidentId;
                syncStatusUpdateSectionByStatus(modalDefaultIncidentStatus || currentIncident?.status);
            }
        }

        if (rows.length === 0) {
            historyContainer.innerHTML = '<p class="text-slate-500">No lifecycle events found for this incident.</p>';
            return;
        }

        renderHistoryRows(rows);
    } catch (error) {
        historyContainer.innerHTML = `<p class="text-rose-300">${escapeHtml(error.message || 'Failed to load history.')}</p>`;
    }
}

function syncModalMapMarkerButton() {
    const button = document.getElementById('btnToggleModalMapMarkers');
    if (!button) {
        return;
    }

    const hasMapRows = modalHistoryRows.some((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
    const isAllMode = modalMapShowAllEventMarkers;

    button.disabled = !hasMapRows;
    button.textContent = isAllMode ? 'All Event Markers' : 'Selected Event Only';
    button.setAttribute('aria-pressed', isAllMode ? 'true' : 'false');
    button.title = hasMapRows
        ? 'Toggle between all visible history markers and only the selected event marker.'
        : 'No event locations are available for this incident.';

    button.classList.toggle('bg-sky-500/10', isAllMode);
    button.classList.toggle('border-sky-500/30', isAllMode);
    button.classList.toggle('text-sky-300', isAllMode);
    button.classList.toggle('bg-slate-900', !isAllMode);
    button.classList.toggle('border-slate-700', !isAllMode);
    button.classList.toggle('text-slate-300', !isAllMode);
    button.classList.toggle('opacity-50', !hasMapRows);
    button.classList.toggle('cursor-not-allowed', !hasMapRows);
}

function getModalMapRows() {
    if (modalMapShowAllEventMarkers) {
        return modalHistoryFilteredRows.length > 0 ? modalHistoryFilteredRows : modalHistoryRows;
    }

    const selectedRow = selectedHistoryIncidentId !== null
        ? modalHistoryRows.find((row) => Number(row.id) === Number(selectedHistoryIncidentId))
        : null;

    if (selectedRow) {
        return [selectedRow];
    }

    const fallbackRow = modalDefaultIncidentId !== null
        ? modalHistoryRows.find((row) => Number(row.id) === Number(modalDefaultIncidentId))
        : null;

    return fallbackRow ? [fallbackRow] : [];
}

function getModalMapMarkerColor(row, isSelected = false) {
    if (isSelected) {
        return '#38BDF8';
    }

    const normalizedSeverity = String(row?.severity || 'normal').toLowerCase();
    const colors = {
        high: '#EF4444',
        medium: '#F59E0B',
        normal: '#3B82F6'
    };

    return colors[normalizedSeverity] || colors.normal;
}

function buildModalMapPopupContent(row, isSelected = false) {
    const color = getModalMapMarkerColor(row, isSelected);
    const note = String(row.operator_note || row.description || '').trim();
    const eventTime = row.resolved_at && String(row.status || '').toLowerCase() === 'resolved'
        ? row.resolved_at
        : row.created_at;
    const weightImpact = Number(row.weight_impact_kg);
    const impactText = Number.isFinite(weightImpact)
        ? `${weightImpact > 0 ? '+' : ''}${weightImpact.toFixed(2)} kg`
        : '-';

    return `
        <div class="min-w-[220px] rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 text-slate-200 shadow-xl">
            <div class="flex items-center justify-between gap-2 mb-2">
                <p class="text-xs font-extrabold uppercase tracking-wide" style="color:${color}">${escapeHtml(formatIncidentType(row.incident_type))}</p>
                <span class="text-[10px] px-2 py-0.5 rounded-md border ${isSelected ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-slate-600 bg-slate-800 text-slate-300'}">${escapeHtml(formatStatus(row.status || 'open'))}</span>
            </div>
            <p class="text-xs text-slate-300 font-semibold">${escapeHtml(row.vehicle_number || 'Unknown Vehicle')}</p>
            <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">${escapeHtml(note || 'No note available.')}</p>
            <div class="mt-2 space-y-1 text-[11px] text-slate-400">
                <p><span class="text-slate-500">Time:</span> ${escapeHtml(formatTimestamp(eventTime))}</p>
                <p><span class="text-slate-500">Location:</span> ${escapeHtml(formatCoordinatePair(row.latitude, row.longitude))}</p>
                <p><span class="text-slate-500">Impact:</span> ${escapeHtml(impactText)}</p>
            </div>
        </div>
    `;
}

function renderModalIncidentMap() {
    if (!modalMap) {
        return;
    }

    if (!modalMapMarkerLayer) {
        modalMapMarkerLayer = L.layerGroup().addTo(modalMap);
    } else {
        modalMapMarkerLayer.clearLayers();
    }

    const rows = getModalMapRows().filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
    syncModalMapMarkerButton();

    if (rows.length === 0) {
        const fallbackLat = Number(currentIncident?.latitude);
        const fallbackLng = Number(currentIncident?.longitude);

        if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
            const fallbackIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-lg ${getSeverityDotBgClass(currentIncident?.severity)}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            L.marker([fallbackLat, fallbackLng], { icon: fallbackIcon }).addTo(modalMapMarkerLayer);
            modalMap.setView([fallbackLat, fallbackLng], 10);
        } else {
            modalMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }

        return;
    }

    const markers = [];
    const selectedRowId = Number(selectedHistoryIncidentId);

    rows.forEach((row) => {
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
        }

        const rowId = Number(row.id);
        const isSelected = Number.isFinite(selectedRowId) && rowId === selectedRowId;
        const color = getModalMapMarkerColor(row, isSelected);

        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: isSelected
                ? `<div class="relative flex items-center justify-center"><div class="absolute inset-0 rounded-full bg-sky-400/30 animate-ping"></div><div style="background-color:${color};" class="relative w-4 h-4 rounded-full border-2 border-white shadow-lg"></div></div>`
                : `<div style="background-color:${color};" class="w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg"></div>`,
            iconSize: isSelected ? [28, 28] : [20, 20],
            iconAnchor: isSelected ? [14, 14] : [10, 10]
        });

        const marker = L.marker([lat, lng], { icon });
        marker.bindPopup(buildModalMapPopupContent(row, isSelected));
        marker.addTo(modalMapMarkerLayer);
        markers.push(marker);
    });

    if (markers.length === 1) {
        modalMap.setView(markers[0].getLatLng(), 12);
        return;
    }

    if (markers.length > 1) {
        const bounds = L.featureGroup(markers).getBounds();
        if (bounds.isValid()) {
            modalMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
        }
    }
}

function renderWeightChart(incident) {
    if (weightChart) {
        weightChart.destroy();
    }

    if (typeof weightChartPanCleanup === 'function') {
        weightChartPanCleanup();
        weightChartPanCleanup = null;
    }

    const weightChartContainer = document.getElementById('weightChartContainer');
    if (!weightChartContainer) {
        return;
    }

    const timeline = buildHistoryTimeline(modalHistoryFilteredRows);

    if (timeline.length === 0) {
        weightChartContainer.innerHTML = '<p class="text-xs text-slate-500 text-center">No weight events for the selected history filter.</p>';
        return;
    }

    weightChartContainer.innerHTML = `
        <div id="weightChartScroller" class="weight-chart-scroller custom-scrollbar">
            <div id="weightChartInner" class="weight-chart-inner">
                <canvas id="weightChart"></canvas>
            </div>
        </div>
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-1.5" aria-label="Timeline zoom controls">
                <button id="btnWeightZoomOut" type="button" class="h-7 min-w-[2rem] px-2 rounded-md border border-slate-700 bg-slate-900 text-slate-300 text-xs font-bold hover:bg-slate-800 transition" title="Zoom out timeline">-</button>
                <button id="btnWeightZoomReset" type="button" class="h-7 px-2.5 rounded-md border border-slate-700 bg-slate-900 text-slate-300 text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800 transition" title="Reset timeline zoom">100%</button>
                <button id="btnWeightZoomIn" type="button" class="h-7 min-w-[2rem] px-2 rounded-md border border-slate-700 bg-slate-900 text-slate-300 text-xs font-bold hover:bg-slate-800 transition" title="Zoom in timeline">+</button>
            </div>
            <p id="weightZoomLevel" class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Zoom 100%</p>
        </div>
        <div class="weight-chart-legend" aria-label="Weight timeline legend">
            <span class="weight-chart-legend-item">
                <span class="weight-chart-legend-swatch weight-chart-legend-swatch-line"></span>
                Weight (kg)
            </span>
            <span class="weight-chart-legend-item">
                <span class="weight-chart-legend-swatch weight-chart-legend-swatch-dashed"></span>
                Selected Event Time
            </span>
        </div>
        <p class="weight-chart-hint">Click and drag left/right to pan timeline</p>
    `;

    const chartEl = document.getElementById('weightChart');
    const chartScroller = document.getElementById('weightChartScroller');
    const chartInner = document.getElementById('weightChartInner');
    const zoomOutBtn = document.getElementById('btnWeightZoomOut');
    const zoomInBtn = document.getElementById('btnWeightZoomIn');
    const zoomResetBtn = document.getElementById('btnWeightZoomReset');
    const zoomLevelEl = document.getElementById('weightZoomLevel');

    if (!chartEl || !chartScroller || !chartInner) {
        return;
    }

    const labels = timeline.map((item) => formatTimestamp(item.recorded_at));
    const weights = timeline.map((item) => Number(item.weight_kg));
    const totalPoints = labels.length;
    const selectedPointIndex = timeline.findIndex((item) => Number(item.sourceIncidentId) === Number(selectedHistoryIncidentId));

    const chartHintEl = weightChartContainer.querySelector('.weight-chart-hint');
    if (chartHintEl) {
        chartHintEl.textContent = totalPoints > 80
            ? 'Dense timeline: zoom +/- then drag left/right or use mouse-wheel'
            : 'Use +/- to zoom, then drag left/right to pan timeline';
    }

    const visibleWidth = Math.max(chartScroller.clientWidth, 320);
    const basePxPerPoint = totalPoints > 200
        ? 70
        : totalPoints > 120
            ? 76
            : totalPoints > 70
                ? 84
                : 92;
    const densityBoost = totalPoints > 60
        ? Math.min(1.55, 1 + ((totalPoints - 60) / 220))
        : 1;
    const pxPerPoint = Math.round(basePxPerPoint * densityBoost);
    const minTimelineWidth = visibleWidth;
    const baseTimelineWidth = Math.max(minTimelineWidth, labels.length * pxPerPoint);

    const zoomConfig = {
        min: 0.65,
        max: 3,
        step: 0.2
    };

    let timelineZoom = 1;

    const updateZoomUi = () => {
        const zoomPercent = Math.round(timelineZoom * 100);
        if (zoomLevelEl) {
            zoomLevelEl.textContent = `Zoom ${zoomPercent}%`;
        }

        if (zoomOutBtn) {
            zoomOutBtn.disabled = timelineZoom <= zoomConfig.min;
            zoomOutBtn.classList.toggle('opacity-50', zoomOutBtn.disabled);
            zoomOutBtn.classList.toggle('cursor-not-allowed', zoomOutBtn.disabled);
        }

        if (zoomInBtn) {
            zoomInBtn.disabled = timelineZoom >= zoomConfig.max;
            zoomInBtn.classList.toggle('opacity-50', zoomInBtn.disabled);
            zoomInBtn.classList.toggle('cursor-not-allowed', zoomInBtn.disabled);
        }
    };

    const applyTimelineZoom = (nextZoom, preserveCenter = true) => {
        const normalizedZoom = Math.max(zoomConfig.min, Math.min(zoomConfig.max, nextZoom));
        const previousWidth = chartInner.clientWidth || baseTimelineWidth;
        const viewportWidth = chartScroller.clientWidth || visibleWidth;
        const previousCenterRatio = preserveCenter && previousWidth > 0
            ? (chartScroller.scrollLeft + (viewportWidth / 2)) / previousWidth
            : 1;

        timelineZoom = normalizedZoom;

        const zoomedTimelineWidth = Math.max(minTimelineWidth, Math.round(baseTimelineWidth * timelineZoom));
        chartInner.style.width = `${zoomedTimelineWidth}px`;

        if (preserveCenter) {
            const targetCenter = previousCenterRatio * zoomedTimelineWidth;
            const nextScrollLeft = Math.max(0, Math.min(zoomedTimelineWidth - viewportWidth, targetCenter - (viewportWidth / 2)));
            chartScroller.scrollLeft = nextScrollLeft;
        } else {
            chartScroller.scrollLeft = Math.max(0, zoomedTimelineWidth - viewportWidth);
        }

        updateZoomUi();
    };

    applyTimelineZoom(1, false);

    zoomOutBtn?.addEventListener('click', () => {
        applyTimelineZoom(timelineZoom - zoomConfig.step, true);
    });

    zoomInBtn?.addEventListener('click', () => {
        applyTimelineZoom(timelineZoom + zoomConfig.step, true);
    });

    zoomResetBtn?.addEventListener('click', () => {
        applyTimelineZoom(1, true);
    });

    const regularPointRadius = totalPoints > 220
        ? 0
        : totalPoints > 120
            ? 1.5
            : 3;
    const regularPointHoverRadius = totalPoints > 220
        ? 2
        : totalPoints > 120
            ? 3.5
            : 5;
    const xTickLimit = totalPoints > 220
        ? 14
        : totalPoints > 120
            ? 12
            : totalPoints > 60
                ? 10
                : 8;

    const selectedGuideLinePlugin = {
        id: 'selectedGuideLinePlugin',
        afterDatasetsDraw(chart) {
            if (selectedPointIndex < 0) {
                return;
            }

            const meta = chart.getDatasetMeta(0);
            const point = meta?.data?.[selectedPointIndex];
            if (!point) {
                return;
            }

            const { ctx, chartArea } = chart;
            const x = point.x;

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.restore();
        }
    };

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
                    tension: totalPoints > 120 ? 0.22 : 0.35,
                    pointRadius: (_, index) => (index === selectedPointIndex ? 6 : regularPointRadius),
                    pointHoverRadius: (_, index) => (index === selectedPointIndex ? 8 : regularPointHoverRadius),
                    pointBackgroundColor: (_, index) => (index === selectedPointIndex ? '#38BDF8' : '#2DD4BF'),
                    pointBorderColor: (_, index) => (index === selectedPointIndex ? '#E2E8F0' : '#0F172A'),
                    pointBorderWidth: (_, index) => (index === selectedPointIndex ? 2 : 1)
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    labels: { color: '#9CA3AF' }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9CA3AF',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: xTickLimit
                    },
                    grid: { color: '#374151' }
                },
                y: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#374151' }
                }
            }
        },
        plugins: [selectedGuideLinePlugin]
    });

    weightChartPanCleanup = attachDragToScroll(chartScroller);
}

function attachDragToScroll(scrollerEl) {
    if (!scrollerEl) {
        return null;
    }

    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    const onPointerDown = (event) => {
        if (event.button !== 0) {
            return;
        }

        isDragging = true;
        startX = event.clientX;
        startScrollLeft = scrollerEl.scrollLeft;
        scrollerEl.classList.add('is-grabbing');
        scrollerEl.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
        if (!isDragging) {
            return;
        }

        const deltaX = event.clientX - startX;
        scrollerEl.scrollLeft = startScrollLeft - deltaX;
    };

    const stopDragging = () => {
        if (!isDragging) {
            return;
        }

        isDragging = false;
        scrollerEl.classList.remove('is-grabbing');
    };

    const onWheel = (event) => {
        const hasHorizontalOverflow = scrollerEl.scrollWidth > scrollerEl.clientWidth;
        if (!hasHorizontalOverflow) {
            return;
        }

        const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;

        if (dominantDelta === 0) {
            return;
        }

        scrollerEl.scrollLeft += dominantDelta;
        event.preventDefault();
    };

    scrollerEl.addEventListener('pointerdown', onPointerDown);
    scrollerEl.addEventListener('pointermove', onPointerMove);
    scrollerEl.addEventListener('pointerup', stopDragging);
    scrollerEl.addEventListener('pointercancel', stopDragging);
    scrollerEl.addEventListener('pointerleave', stopDragging);
    scrollerEl.addEventListener('wheel', onWheel, { passive: false });

    return () => {
        scrollerEl.removeEventListener('pointerdown', onPointerDown);
        scrollerEl.removeEventListener('pointermove', onPointerMove);
        scrollerEl.removeEventListener('pointerup', stopDragging);
        scrollerEl.removeEventListener('pointercancel', stopDragging);
        scrollerEl.removeEventListener('pointerleave', stopDragging);
        scrollerEl.removeEventListener('wheel', onWheel);
    };
}

async function handleStatusUpdate(nextStatus, noteText = '') {
    if (!currentIncidentId || !nextStatus) {
        return;
    }

    clearStatusUpdateErrors();
    setStatusUpdateMessage('');
    setStatusUpdateLoading(true);

    const note = String(noteText || getStatusUpdateNote()).trim();

    if (!note) {
        setStatusUpdateLoading(false);
        setStatusUpdateError('Please add a note before updating the incident status.');
        return;
    }

    try {
        const result = await requestJson(`${API_BASE}/${currentIncidentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: nextStatus,
                note
            })
        });

        const target = allIncidents.find((item) => Number(item.id) === Number(currentIncidentId));
        if (target) {
            target.status = nextStatus;
            target.description = note;
            target.managed_by = result?.data?.managed_by ?? target.managed_by;
            target.resolved_at = result?.data?.resolved_at ?? target.resolved_at;
        }

        if (currentIncident) {
            currentIncident.status = nextStatus;
            currentIncident.description = note;
            currentIncident.managed_by = result?.data?.managed_by ?? currentIncident.managed_by;
            currentIncident.resolved_at = result?.data?.resolved_at ?? currentIncident.resolved_at;
        }

        renderIncidentTable();
        await renderIncidentMarkers();
        renderStats();
        await renderIncidentHistory(currentIncidentId);
        syncStatusUpdateSectionByStatus(nextStatus);

        const noteField = document.getElementById('incidentStatusNote');
        if (noteField) {
            noteField.value = '';
        }

        setStatusUpdateMessage('Status updated successfully.');
    } catch (error) {
        const fieldErrors = error.fieldErrors || {};

        if (fieldErrors.status || fieldErrors.incidentId) {
            setStatusUpdateError(fieldErrors.status || fieldErrors.incidentId);
            setStatusUpdateLoading(false);
            return;
        }

        if (fieldErrors.note || fieldErrors.session) {
            setStatusUpdateError(fieldErrors.note || fieldErrors.session);
            setStatusUpdateLoading(false);
            return;
        }

        setStatusUpdateError(error.message || 'Failed to update incident status.');
    } finally {
        setStatusUpdateLoading(false);
    }
}

function syncStatusUpdateSectionByStatus(status) {
    const statusUpdateSection = document.getElementById('statusUpdateSection');
    const selectedEventLabel = document.getElementById('statusUpdateSelectedEvent');
    if (!statusUpdateSection) {
        return;
    }

    statusUpdateSection.classList.remove('hidden');
    const normalizedStatus = String(status || 'pending').toLowerCase();
    const resolvedTargetId = Number(currentIncidentId);

    if (selectedEventLabel) {
        const idText = Number.isFinite(resolvedTargetId) && resolvedTargetId > 0
            ? `#${resolvedTargetId}`
            : '-';
        selectedEventLabel.textContent = `Selected event: ${idText} (${formatStatus(normalizedStatus)})`;
    }

    const noteField = document.getElementById('incidentStatusNote');
    if (noteField && !statusUpdateBusy) {
        const placeholders = {
            pending: 'Add a note before acknowledging this incident...',
            open: 'Add a note before acknowledging this incident...',
            acknowledged: 'Add a note before investigating this incident...',
            investigating: 'Add your investigation, resolution, or false alarm note...',
            resolved: 'Add a resolution note...',
            false_alarm: 'Add a false alarm explanation...'
        };

        noteField.placeholder = placeholders[normalizedStatus] || 'Add a note for this status update...';
    }

    updateStatusActionButtons(normalizedStatus);
}

function selectHistoryIncidentRow(incidentId) {
    if (Number(selectedHistoryIncidentId) === Number(incidentId)) {
        selectedHistoryIncidentId = null;
        currentIncidentId = Number.isFinite(Number(modalDefaultIncidentId))
            ? Number(modalDefaultIncidentId)
            : currentIncidentId;

        clearStatusUpdateErrors();
        syncStatusUpdateSectionByStatus(modalDefaultIncidentStatus || currentIncident?.status);
        renderHistoryRows(modalHistoryRows);
        return;
    }

    const selectedRow = modalHistoryRows.find((row) => Number(row.id) === Number(incidentId));
    if (!selectedRow) {
        return;
    }

    selectedHistoryIncidentId = Number(selectedRow.id);
    currentIncidentId = Number(selectedRow.id);

    clearStatusUpdateErrors();
    setStatusUpdateMessage('');
    syncStatusUpdateSectionByStatus(selectedRow.status);
    renderHistoryRows(modalHistoryRows);
}

function closeModal() {
    const modal = document.getElementById('incidentDetailModal');
    modal?.classList.add('hidden');

    closeStatusConfirmModal();

    clearStatusUpdateErrors();
    currentIncidentId = null;
    currentIncident = null;
    selectedHistoryIncidentId = null;
    modalDefaultIncidentId = null;
    modalDefaultIncidentStatus = null;

    if (modalMap) {
        modalMap.remove();
        modalMap = null;
    }

    modalMapMarkerLayer = null;
    modalMapShowAllEventMarkers = true;

    if (weightChart) {
        weightChart.destroy();
        weightChart = null;
    }

    if (typeof weightChartPanCleanup === 'function') {
        weightChartPanCleanup();
        weightChartPanCleanup = null;
    }

    const selectedEventLabel = document.getElementById('statusUpdateSelectedEvent');
    if (selectedEventLabel) {
        selectedEventLabel.textContent = 'Selected event: -';
    }

    const noteField = document.getElementById('incidentStatusNote');
    if (noteField) {
        noteField.value = '';
    }

    const statusFlowInfoPanel = document.getElementById('statusFlowInfoPanel');
    if (statusFlowInfoPanel) {
        statusFlowInfoPanel.classList.add('hidden');
    }

    const statusFlowInfoButton = document.getElementById('btnStatusFlowInfo');
    if (statusFlowInfoButton) {
        statusFlowInfoButton.setAttribute('aria-expanded', 'false');
    }

    const modalMapMarkerButton = document.getElementById('btnToggleModalMapMarkers');
    if (modalMapMarkerButton) {
        modalMapMarkerButton.setAttribute('aria-pressed', 'true');
        modalMapMarkerButton.textContent = 'All Event Markers';
        modalMapMarkerButton.disabled = false;
    }

    setStatusUpdateMessage('');
    renderSelectedHistoryDetails(null);

    const detailsBody = document.getElementById('modalHistorySelectionDetailsBody');
    if (detailsBody) {
        detailsBody.classList.remove('hidden');
    }

    const detailsToggle = document.getElementById('btnToggleHistoryDetails');
    const detailsToggleLabel = document.getElementById('btnToggleHistoryDetailsLabel');
    if (detailsToggle && detailsToggleLabel) {
        detailsToggle.setAttribute('aria-expanded', 'true');
        detailsToggleLabel.textContent = 'Collapse';
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
        above_reference: 'Above Reference',
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

function toFiniteOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function buildDispatchTaskCell(incident) {
    const taskLabel = incident.task_id ? `Task #${incident.task_id}` : 'No Task';
    const dispatchStatus = formatStatus(incident.dispatch_status || 'pending');
    const pickupLabel = formatCoordinatePair(incident.pickup_lat, incident.pickup_lng);
    const dropoffLabel = formatCoordinatePair(incident.destination_lat, incident.destination_lng);
    const eventCount = Math.max(1, Number(incident.events_count || 0));
    const eventCountLabel = `${eventCount} event${eventCount === 1 ? '' : 's'}`;

    return `
        <div class="space-y-1.5">
            <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-md border border-slate-600/80 bg-slate-800/70 px-2 py-0.5 text-[10px] font-bold text-slate-200">${escapeHtml(taskLabel)}</span>
                <span class="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">${escapeHtml(dispatchStatus)}</span>
                <span class="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">${escapeHtml(eventCountLabel)}</span>
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
    if (normalized === 'above_reference') {
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/30 text-[10px] font-bold tracking-wide';
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
