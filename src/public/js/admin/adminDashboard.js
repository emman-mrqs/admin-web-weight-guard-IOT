const DASHBOARD_API_BASE = '/api/admin/dashboard';

const theme = {
    text: '#94a3b8',
    grid: '#1e293b',
    bg: '#0f172a',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185'
};

let cargoWeightChart = null;
let fleetStatusChart = null;

Chart.defaults.color = theme.text;
Chart.defaults.font.family = "'Inter', 'sans-serif'";

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadDashboardAnalytics();
});

function setupEventListeners() {
    document.getElementById('btnViewAllVehicles')?.addEventListener('click', () => {
        window.location.href = '/admin/fleet';
    });
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
        throw new Error(data?.error || 'Request failed.');
    }

    return data;
}

async function loadDashboardAnalytics() {
    try {
        setError('');
        const response = await requestJson(`${DASHBOARD_API_BASE}/analytics`);
        renderDashboard(response);
    } catch (error) {
        setError(error.message || 'Failed to load dashboard analytics.');
    }
}

function renderDashboard(data) {
    const summary = data?.summary || {};
    const charts = data?.charts || {};
    const liveVehicles = Array.isArray(data?.liveVehicles) ? data.liveVehicles : [];
    const mapAlert = data?.mapAlert || {};

    const activeFleet = toFiniteNumber(summary.activeFleet);
    const totalFleet = toFiniteNumber(summary.totalFleet);
    const activeFleetPct = clampPct(summary.activeFleetPct);

    setText('statActiveFleet', String(Math.round(activeFleet)));
    setText('statActiveFleetPct', `${Math.round(activeFleetPct)}%`);
    setBarWidth('statActiveFleetBar', activeFleetPct);

    setText('statCargoNormal', String(Math.round(toFiniteNumber(summary.normalCapacity))));
    setText('statCargoOverloaded', String(Math.round(toFiniteNumber(summary.overloadedWarning))));
    setText('statCargoLoss', String(Math.round(toFiniteNumber(summary.potentialLoss))));

    setText('statAlertCritical', String(Math.round(toFiniteNumber(summary.criticalAlerts))));
    setText('statAlertWarning', String(Math.round(toFiniteNumber(summary.warningAlerts))));
    setText('statTotalLossEvents', String(Math.round(toFiniteNumber(summary.totalLossEvents))));

    setText('fleetTotalCount', String(Math.round(totalFleet)));
    setText('mapAlertTitle', mapAlert.title || 'Alert: Cargo Loss');
    setText('mapAlertVehicle', mapAlert.vehicle || 'Vehicle: Monitoring all active fleet');

    renderLiveVehicles(liveVehicles);
    renderCharts(charts);
}

function renderLiveVehicles(rows) {
    const tbody = document.getElementById('liveVehicleTableBody');
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-8 text-center text-slate-500 text-xs">No live vehicles found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.slice(0, 2).map((item) => {
        const vehicleNo = Number(item.vehicleId || 0);
        const vehicleLabel = `#${String(vehicleNo).padStart(3, '0')}`;
        const statusBadge = getLoadStatusBadge(item.loadStatus);
        const locationText = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
            ? `${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`
            : 'No telemetry';

        return `
            <tr class="hover:bg-slate-800/40 transition-colors group">
                <td class="px-6 py-4">
                    <div class="font-bold text-white">${escapeHtml(vehicleLabel)}</div>
                    <div class="text-xs text-slate-500 mt-0.5 font-medium">${escapeHtml(item.vehicleType || 'Vehicle')}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="${statusBadge.className}">${statusBadge.label}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <span class="font-mono text-sm text-slate-400 font-medium">${escapeHtml(locationText)}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getLoadStatusBadge(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'loss') {
        return {
            label: 'POTENTIAL LOSS',
            className: 'px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold tracking-wide'
        };
    }

    if (normalized === 'overloaded') {
        return {
            label: 'OVERLOADED',
            className: 'px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-bold tracking-wide'
        };
    }

    return {
        label: 'NORMAL',
        className: 'px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold tracking-wide'
    };
}

function renderCharts(charts) {
    renderWeightChart(charts?.weightFluctuation || {});
    renderFleetStatusChart(charts?.fleetComposition || {});
}

function renderWeightChart(weightFluctuation) {
    const canvas = document.getElementById('cargoWeightChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gradientFill = ctx.createLinearGradient(0, 0, 0, 250);
    gradientFill.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
    gradientFill.addColorStop(1, 'rgba(52, 211, 153, 0.0)');

    const labels = Array.isArray(weightFluctuation.labels) ? weightFluctuation.labels : [];
    const values = Array.isArray(weightFluctuation.values) ? weightFluctuation.values.map(toFiniteNumber) : [];

    if (cargoWeightChart) {
        cargoWeightChart.data.labels = labels;
        cargoWeightChart.data.datasets[0].data = values;
        cargoWeightChart.update();
        return;
    }

    cargoWeightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Fleet Average Weight (tons)',
                data: values,
                borderColor: theme.emerald,
                backgroundColor: gradientFill,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: theme.bg,
                pointBorderColor: theme.emerald,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: theme.grid,
                        drawBorder: false
                    },
                    ticks: { padding: 10 }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: { padding: 10 }
                }
            }
        }
    });
}

function renderFleetStatusChart(fleetComposition) {
    const canvas = document.getElementById('fleetStatusChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = Array.isArray(fleetComposition.labels) ? fleetComposition.labels : ['Normal Capacity', 'Overloaded', 'Potential Loss'];
    const values = Array.isArray(fleetComposition.values) ? fleetComposition.values.map(toFiniteNumber) : [0, 0, 0];

    if (fleetStatusChart) {
        fleetStatusChart.data.labels = labels;
        fleetStatusChart.data.datasets[0].data = values;
        fleetStatusChart.update();
        return;
    }

    fleetStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [theme.emerald, theme.amber, theme.rose],
                borderColor: theme.bg,
                borderWidth: 6,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12
                }
            }
        }
    });
}

function setError(message) {
    const banner = document.getElementById('dashboardErrorBanner');
    if (!banner) return;

    if (!message) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }

    banner.textContent = message;
    banner.classList.remove('hidden');
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = String(value);
    }
}

function setBarWidth(id, value) {
    const element = document.getElementById(id);
    if (!element) return;

    element.style.width = `${clampPct(value).toFixed(0)}%`;
}

function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function clampPct(value) {
    return Math.max(0, Math.min(100, toFiniteNumber(value)));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}