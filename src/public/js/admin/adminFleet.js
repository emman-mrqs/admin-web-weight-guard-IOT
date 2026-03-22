const fleetState = {
    items: [],
    pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1
    },
    stats: {
        totalFleet: 0,
        activeCount: 0,
        maintenanceCount: 0,
        avgCapacityKg: 0,
        alertCount: 0
    },
    filter: 'all',
    search: '',
    selectedVehicleId: null,
    searchTimer: null,
    sparklineCharts: []
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function normalizeState(state) {
    const value = String(state || '').toLowerCase();
    if (value.includes('maintenance')) return 'maintenance';
    if (value.includes('alert')) return 'alert';
    if (value.includes('transit')) return 'in_transit';
    if (value.includes('idle')) return 'idle';
    return 'available';
}

function getStatusBadge(state, loadStatus) {
    const normalized = normalizeState(state);
    const lowerLoad = String(loadStatus || '').toLowerCase();

    if (lowerLoad.includes('loss') || normalized === 'alert') {
        return {
            label: 'ALERT',
            className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            dotClass: 'bg-rose-500'
        };
    }

    if (normalized === 'maintenance') {
        return {
            label: 'MAINTENANCE',
            className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            dotClass: 'bg-amber-500'
        };
    }

    if (normalized === 'in_transit') {
        return {
            label: 'IN TRANSIT',
            className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            dotClass: 'bg-emerald-400'
        };
    }

    return {
        label: 'IDLE',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
        dotClass: 'bg-slate-500'
    };
}

function closeAllModals() {
    const overlay = document.getElementById('modalOverlay');
    const modals = document.querySelectorAll('[id$="Modal"]');

    if (overlay) overlay.classList.add('opacity-0');

    modals.forEach((modal) => {
        modal.classList.remove('opacity-100', 'scale-100');
        modal.classList.add('opacity-0', 'scale-95');
    });

    setTimeout(() => {
        if (overlay) overlay.classList.add('hidden');
        modals.forEach((modal) => modal.classList.add('hidden'));
    }, 300);
}

function openModal(modalId) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById(modalId);
    if (!overlay || !modal) return;

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('opacity-0', 'scale-95');
        modal.classList.add('opacity-100', 'scale-100');
    });
}

function renderStats() {
    const stats = fleetState.stats;

    const totalEl = document.getElementById('fleetStatTotal');
    const activeEl = document.getElementById('fleetStatActive');
    const avgEl = document.getElementById('fleetStatAvgCapacity');
    const alertEl = document.getElementById('fleetStatAlerts');

    if (totalEl) totalEl.textContent = formatNumber(stats.totalFleet);
    if (activeEl) activeEl.textContent = formatNumber(stats.activeCount);
    if (avgEl) {
        avgEl.innerHTML = `${formatNumber(Math.round(stats.avgCapacityKg || 0))} <span class="text-sm font-semibold text-slate-500">kg</span>`;
    }
    if (alertEl) alertEl.textContent = formatNumber(stats.alertCount);

    const activeCountEl = document.getElementById('fleetActiveCount');
    const maintenanceCountEl = document.getElementById('fleetMaintenanceCount');
    const alertCountEl = document.getElementById('fleetAlertCount');

    if (activeCountEl) activeCountEl.textContent = formatNumber(stats.activeCount);
    if (maintenanceCountEl) maintenanceCountEl.textContent = formatNumber(stats.maintenanceCount);
    if (alertCountEl) alertCountEl.textContent = formatNumber(stats.alertCount);
}

function renderFleetRows() {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody) return;

    if (!fleetState.items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-10 text-center text-slate-500 text-sm">
                    No vehicles found for the current filters.
                </td>
            </tr>
        `;
        return;
    }

    // Clean up old sparkline instances before re-render.
    fleetState.sparklineCharts.forEach((chart) => {
        try {
            chart.destroy();
        } catch (error) {
            console.error('Error destroying sparkline chart:', error);
        }
    });
    fleetState.sparklineCharts = [];

    tbody.innerHTML = fleetState.items.map((vehicle) => {
        const status = getStatusBadge(vehicle.current_state, vehicle.current_load_status);
        const isAlert = status.label === 'ALERT';
        const driverName = vehicle.driver_first_name
            ? `${vehicle.driver_first_name} ${vehicle.driver_last_name || ''}`.trim()
            : 'Unassigned';
        const plate = vehicle.plate_number || 'N/A';
        const type = vehicle.vehicle_type || 'Unknown Vehicle';
        const maxCapacity = Number(vehicle.max_capacity_kg || 0);

        const loadStatusText = String(vehicle.current_load_status || 'empty');
        const numericFromStatus = Number((loadStatusText.match(/\d+(\.\d+)?/) || [])[0] || 0);
        const currentLoadKg = Number.isFinite(numericFromStatus) && numericFromStatus > 0
            ? numericFromStatus
            : (loadStatusText.toLowerCase().includes('empty') ? 0 : 0);
        const loadPercent = maxCapacity > 0 ? Math.max(0, Math.min(100, (currentLoadKg / maxCapacity) * 100)) : 0;

        const routeLine = String(vehicle.current_state || 'Unknown').replace(/_/g, ' ');
        const routeMeta = `Assigned: ${driverName}`;
        const sparklineId = `sparkline-row-${vehicle.id}`;
        const rowClass = isAlert
            ? 'bg-rose-950/10 hover:bg-rose-900/20 transition-colors group'
            : 'hover:bg-slate-800/40 transition-colors group';

        return `
            <tr class="${rowClass}">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 ${isAlert ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' : 'bg-slate-800 border border-slate-700 text-slate-400'} rounded-lg flex items-center justify-center">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1"></path></svg>
                        </div>
                        <div>
                            <div class="font-bold text-white text-sm">${type}</div>
                            <div class="text-xs ${isAlert ? 'text-rose-500' : 'text-slate-500'} mt-0.5">${driverName} &bull; <span class="${isAlert ? 'text-rose-400/80' : 'text-emerald-400/80'} font-mono">${plate}</span></div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wide ${status.className}">
                        <span class="w-1.5 h-1.5 rounded-full ${status.dotClass}"></span>
                        ${status.label}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-slate-300">${routeLine}</div>
                    <div class="font-mono text-[10px] text-slate-500 mt-0.5">${routeMeta}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="text-sm font-bold ${isAlert ? 'text-rose-400' : 'text-white'}">${formatNumber(currentLoadKg)} kg <span class="${isAlert ? 'text-rose-500/60' : 'text-slate-500'} font-medium text-xs">/ ${formatNumber(maxCapacity)} kg</span></div>
                        <div class="w-32 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div class="${isAlert ? 'bg-rose-500' : 'bg-emerald-400'} h-full rounded-full" style="width: ${loadPercent.toFixed(1)}%"></div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="w-24 h-8 ${isAlert ? '' : 'opacity-70 group-hover:opacity-100 transition-opacity'}">
                        <canvas id="${sparklineId}"></canvas>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button onclick="openViewVehicle(${vehicle.id})" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-teal-900/20 hover:border-teal-500/30 hover:text-teal-300" title="View Vehicle">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        </button>
                        <button onclick="openEditVehicle(${vehicle.id})" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-blue-900/20 hover:border-blue-500/30 hover:text-blue-300" title="Edit Vehicle">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button onclick="openDeleteVehicle(${vehicle.id})" class="p-2 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/40 transition hover:bg-red-900/20 hover:border-red-500/30 hover:text-red-300" title="Delete Vehicle">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRowSparklines() {
    if (typeof Chart === 'undefined') return;

    fleetState.items.forEach((vehicle) => {
        const canvas = document.getElementById(`sparkline-row-${vehicle.id}`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const isAlert = getStatusBadge(vehicle.current_state, vehicle.current_load_status).label === 'ALERT';
        const color = isAlert ? '#fb7185' : '#34d399';
        const base = Number(vehicle.max_capacity_kg || 1000) / 10;
        const data = [
            Math.max(0, base * 0.62),
            Math.max(0, base * 0.75),
            Math.max(0, base * 0.7),
            Math.max(0, base * 0.84),
            Math.max(0, base * 0.78),
            Math.max(0, base * 0.9)
        ];

        const gradient = ctx.createLinearGradient(0, 0, 0, 40);
        gradient.addColorStop(0, `${color}40`);
        gradient.addColorStop(1, `${color}00`);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map((_, idx) => idx),
                datasets: [{
                    data,
                    borderColor: color,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: gradient,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                layout: { padding: 2 }
            }
        });

        fleetState.sparklineCharts.push(chart);
    });
}

function renderPagination() {
    const { page, limit, total, totalPages } = fleetState.pagination;
    const controls = document.getElementById('pagination-controls');
    const info = document.getElementById('pagination-info');
    if (!controls || !info) return;

    if (total === 0 || totalPages <= 0) {
        info.textContent = 'Showing 0 to 0 of 0 entries';
        controls.classList.add('hidden');
        return;
    }

    controls.classList.remove('hidden');
    const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);
    info.innerHTML = `Showing <span class="text-white font-bold">${startItem}</span> to <span class="text-white font-bold">${endItem}</span> of <span class="text-white font-bold">${total}</span> entries`;

    const makePageBtn = (p, disabled = false, active = false) => {
        const cls = active
            ? 'w-8 h-8 flex items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold'
            : 'w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-bold';

        return `<button ${disabled ? 'disabled' : ''} onclick="goToPage(${p})" class="${cls} ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-800/50 text-slate-500' : ''}">${p}</button>`;
    };

    const makeArrowBtn = (targetPage, direction, disabled = false) => {
        const path = direction === 'prev'
            ? 'M15 19l-7-7 7-7'
            : 'M9 5l7 7-7 7';
        const baseCls = disabled
            ? 'p-2 rounded-lg border border-slate-700 text-slate-500 opacity-50 cursor-not-allowed bg-slate-800/50'
            : 'p-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition';
        const clickAttr = disabled ? '' : `onclick="goToPage(${targetPage})"`;

        return `<button ${disabled ? 'disabled' : ''} ${clickAttr} class="${baseCls}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${path}"></path></svg></button>`;
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
            html += makePageBtn(entry, false, entry === page);
        }
    });

    html += makeArrowBtn(page + 1, 'next', page >= totalPages);
    controls.innerHTML = html;
}

async function fetchFleetData() {
    try {
        const params = new URLSearchParams({
            page: String(fleetState.pagination.page),
            limit: String(fleetState.pagination.limit),
            filter: fleetState.filter,
            search: fleetState.search
        });

        const response = await fetch(`/api/admin/fleet?${params.toString()}`);
        const payload = await response.json();

        if (!response.ok) {
            console.error(payload.error || 'Failed to fetch fleet data');
            return;
        }

        fleetState.items = payload.data || [];
        fleetState.pagination = payload.pagination || fleetState.pagination;
        fleetState.stats = payload.stats || fleetState.stats;

        renderStats();
        renderFleetRows();
        renderRowSparklines();
        renderPagination();
    } catch (error) {
        console.error('Error fetching fleet data:', error);
    }
}

function getVehicleById(vehicleId) {
    return fleetState.items.find((item) => Number(item.id) === Number(vehicleId));
}

function fillViewModal(vehicle) {
    if (!vehicle) return;

    const badge = getStatusBadge(vehicle.current_state, vehicle.current_load_status);
    const driverName = vehicle.driver_first_name
        ? `${vehicle.driver_first_name} ${vehicle.driver_last_name || ''}`.trim()
        : 'Unassigned';

    const vehicleType = document.getElementById('viewVehicleType');
    const statusBadge = document.getElementById('viewStatusBadge');
    const plate = document.getElementById('viewPlateNumber');
    const driver = document.getElementById('viewDriverName');
    const state = document.getElementById('viewCurrentState');
    const currentLoad = document.getElementById('viewCurrentLoad');
    const maxCapacity = document.getElementById('viewMaxCapacity');
    const loadProgressBar = document.getElementById('viewLoadProgressBar');
    const vehicleClass = document.getElementById('viewVehicleClass');
    const createdAt = document.getElementById('viewCreatedAt');
    const lastMaintenance = document.getElementById('viewLastMaintenance');

    const loadStatusText = String(vehicle.current_load_status || 'empty');
    const numericFromStatus = Number((loadStatusText.match(/\d+(\.\d+)?/) || [])[0] || 0);
    const currentLoadKg = Number.isFinite(numericFromStatus) && numericFromStatus > 0 ? numericFromStatus : 0;
    const maxCapacityKg = Number(vehicle.max_capacity_kg || 0);
    const loadPercent = maxCapacityKg > 0
        ? Math.max(0, Math.min(100, (currentLoadKg / maxCapacityKg) * 100))
        : 0;

    if (vehicleType) vehicleType.textContent = vehicle.vehicle_type || 'N/A';
    if (plate) plate.textContent = vehicle.plate_number || 'N/A';
    if (driver) driver.textContent = driverName;
    if (state) state.textContent = String(vehicle.current_state || 'N/A').replace(/_/g, ' ');
    if (currentLoad) currentLoad.innerHTML = `${formatNumber(currentLoadKg)} <span class="text-sm font-medium text-slate-500">kg</span>`;
    if (maxCapacity) maxCapacity.textContent = `${formatNumber(maxCapacityKg)} kg`;
    if (loadProgressBar) {
        loadProgressBar.style.width = `${loadPercent.toFixed(1)}%`;
    }
    if (vehicleClass) vehicleClass.textContent = vehicle.vehicle_type || 'N/A';
    if (createdAt) createdAt.textContent = formatDate(vehicle.created_at);
    if (lastMaintenance) lastMaintenance.textContent = 'N/A';

    if (statusBadge) {
        statusBadge.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wide ${badge.className}`;
        statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${badge.dotClass}"></span>${badge.label}`;
    }
}

function ensureEditFieldError(fieldName) {
    const field = document.querySelector(`#editFleetForm [name="${fieldName}"]`);
    if (!field) return null;

    const existing = field.parentElement.querySelector(`.inline-error[data-field="${fieldName}"]`);
    if (existing) return existing;

    const error = document.createElement('div');
    error.className = 'inline-error hidden mt-2 text-xs font-medium text-rose-400';
    error.setAttribute('data-field', fieldName);
    field.parentElement.appendChild(error);
    return error;
}

function clearEditErrors() {
    document.querySelectorAll('#editFleetForm .inline-error').forEach((el) => {
        el.classList.add('hidden');
        el.textContent = '';
    });

    const feedback = document.getElementById('editFleetFormFeedback');
    if (feedback) {
        feedback.classList.add('hidden');
        feedback.textContent = '';
        feedback.classList.remove('border-rose-700', 'bg-rose-950/60', 'text-rose-300', 'border-emerald-700', 'bg-emerald-950/60', 'text-emerald-300');
    }
}

function showEditFeedback(type, message) {
    const feedback = document.getElementById('editFleetFormFeedback');
    if (!feedback) return;

    feedback.classList.remove('hidden', 'border-rose-700', 'bg-rose-950/60', 'text-rose-300', 'border-emerald-700', 'bg-emerald-950/60', 'text-emerald-300');
    feedback.textContent = message;

    if (type === 'success') {
        feedback.classList.add('border-emerald-700', 'bg-emerald-950/60', 'text-emerald-300');
    } else {
        feedback.classList.add('border-rose-700', 'bg-rose-950/60', 'text-rose-300');
    }
}

async function populateEditDriverOptions(vehicleId, currentDriverId) {
    const select = document.getElementById('editDriverId');
    if (!select) return;

    const response = await fetch(`/api/admin/fleet/drivers?vehicleId=${vehicleId}`);
    const payload = await response.json();
    if (!response.ok) {
        console.error(payload.error || 'Failed to load drivers');
        return;
    }

    select.innerHTML = '<option value="">-- Unassigned --</option>';

    (payload.data || []).forEach((driver) => {
        const option = document.createElement('option');
        option.value = String(driver.id);
        option.textContent = `${driver.first_name} ${driver.last_name}`;
        if (Number(currentDriverId) === Number(driver.id)) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

async function handleEditFleetSubmit(event) {
    event.preventDefault();
    clearEditErrors();

    const form = event.currentTarget;
    const vehicleId = form.querySelector('[name="vehicleId"]')?.value;
    const plateNumber = form.querySelector('[name="plateNumber"]')?.value?.trim();
    const vehicleType = form.querySelector('[name="vehicleType"]')?.value;
    const maxCapacity = form.querySelector('[name="maxCapacity"]')?.value;
    const driverId = form.querySelector('[name="driverId"]')?.value;
    const currentState = form.querySelector('[name="currentState"]')?.value;

    try {
        const response = await fetch(`/api/admin/fleet/${vehicleId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                vehicleType,
                plateNumber,
                maxCapacity,
                driverId: driverId || null,
                currentState
            })
        });

        const payload = await response.json();

        if (!response.ok) {
            const fieldErrors = payload.fieldErrors || {};
            Object.entries(fieldErrors).forEach(([field, message]) => {
                const target = ensureEditFieldError(field);
                if (target) {
                    target.textContent = String(message);
                    target.classList.remove('hidden');
                }
            });

            showEditFeedback('error', payload.error || 'Failed to update vehicle.');
            return;
        }

        showEditFeedback('success', payload.message || 'Vehicle updated.');
        await fetchFleetData();

        setTimeout(() => {
            closeAllModals();
        }, 400);
    } catch (error) {
        console.error('Error updating vehicle:', error);
        showEditFeedback('error', 'Network error while updating vehicle.');
    }
}

window.openViewVehicle = function openViewVehicle(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return;

    fillViewModal(vehicle);
    openModal('viewModal');
};

window.openEditVehicle = async function openEditVehicle(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return;

    clearEditErrors();

    const idField = document.getElementById('editVehicleId');
    const plateField = document.getElementById('editPlateNumber');
    const typeField = document.getElementById('editVehicleType');
    const maxCapacityField = document.getElementById('editMaxCapacity');
    const maxCapacityDisplay = document.getElementById('editCapacityDisplay');
    const stateField = document.getElementById('editCurrentState');

    if (idField) idField.value = String(vehicle.id);
    if (plateField) plateField.value = vehicle.plate_number || '';
    if (typeField) typeField.value = vehicle.vehicle_type || '';
    if (maxCapacityField) maxCapacityField.value = Number(vehicle.max_capacity_kg || 0);
    if (maxCapacityDisplay) maxCapacityDisplay.textContent = `${formatNumber(vehicle.max_capacity_kg || 0)} kg`;
    if (stateField) stateField.value = normalizeState(vehicle.current_state);

    await populateEditDriverOptions(vehicle.id, vehicle.assigned_driver_id);
    openModal('editModal');
};

window.openDeleteVehicle = function openDeleteVehicle(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return;

    fleetState.selectedVehicleId = Number(vehicleId);

    const plateText = document.getElementById('deletePlateNumber');
    if (plateText) {
        plateText.textContent = vehicle.plate_number || `#${vehicle.id}`;
    }

    openModal('deleteModal');
};

window.toggleModal = openModal;
window.closeAllModals = closeAllModals;

window.filterFleet = function filterFleet(filterType, clickedBtn) {
    fleetState.filter = String(filterType || 'all');
    fleetState.pagination.page = 1;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        const text = btn.textContent || '';
        if (text.includes('Alerts')) {
            btn.className = 'filter-btn px-4 py-2 bg-transparent text-rose-400 text-xs font-bold rounded-lg border border-transparent hover:bg-rose-500/10 transition flex items-center gap-2';
        } else if (text.includes('Maintenance')) {
            btn.className = 'filter-btn px-4 py-2 bg-transparent text-amber-400 text-xs font-bold rounded-lg border border-transparent hover:bg-amber-500/10 transition flex items-center gap-2';
        } else {
            btn.className = 'filter-btn px-4 py-2 bg-transparent text-slate-400 text-xs font-bold rounded-lg border border-transparent hover:text-slate-200 transition';
        }
    });

    if (clickedBtn) {
        const text = clickedBtn.textContent || '';
        if (text.includes('Alerts')) {
            clickedBtn.className = 'filter-btn px-4 py-2 bg-rose-500/20 text-rose-400 text-xs font-bold rounded-lg border border-rose-500/50 transition flex items-center gap-2 shadow-[0_0_10px_rgba(244,63,94,0.2)]';
        } else if (text.includes('Maintenance')) {
            clickedBtn.className = 'filter-btn px-4 py-2 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/50 transition flex items-center gap-2 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
        } else {
            clickedBtn.className = 'filter-btn px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition shadow-md';
        }
    }

    fetchFleetData();
};

window.goToPage = function goToPage(page) {
    const target = Number(page);
    if (!Number.isFinite(target)) return;

    if (target < 1 || target > fleetState.pagination.totalPages) return;
    fleetState.pagination.page = target;
    fetchFleetData();
};

async function handleDeleteVehicle() {
    const vehicleId = fleetState.selectedVehicleId;
    if (!vehicleId) return;

    const deleteError = document.getElementById('deleteFleetFormError');
    if (deleteError) {
        deleteError.classList.add('hidden');
        deleteError.textContent = '';
    }

    try {
        const response = await fetch(`/api/admin/fleet/${vehicleId}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });

        const payload = await response.json();
        if (!response.ok) {
            if (deleteError) {
                deleteError.textContent = payload.error || 'Failed to delete vehicle.';
                deleteError.classList.remove('hidden');
            }
            console.error(payload.error || 'Failed to delete vehicle');
            return;
        }

        closeAllModals();
        await fetchFleetData();
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        if (deleteError) {
            deleteError.textContent = 'Network error while deleting vehicle.';
            deleteError.classList.remove('hidden');
        }
    }
}

function initializeFleetPage() {
    const searchInput = document.getElementById('fleetSearchInput');
    const editForm = document.getElementById('editFleetForm');
    const deleteBtn = document.getElementById('confirmDeleteVehicleBtn');
    const editCapacitySlider = document.getElementById('editMaxCapacity');
    const editCapacityDisplay = document.getElementById('editCapacityDisplay');

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            const value = String(event.target.value || '').trim();
            clearTimeout(fleetState.searchTimer);
            fleetState.searchTimer = setTimeout(() => {
                fleetState.search = value;
                fleetState.pagination.page = 1;
                fetchFleetData();
            }, 280);
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', handleEditFleetSubmit);
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteVehicle);
    }

    if (editCapacitySlider && editCapacityDisplay) {
        const syncCapacityText = () => {
            editCapacityDisplay.textContent = `${formatNumber(editCapacitySlider.value)} kg`;
        };
        editCapacitySlider.addEventListener('input', syncCapacityText);
        syncCapacityText();
    }

    fetchFleetData();
}

document.addEventListener('DOMContentLoaded', initializeFleetPage);
