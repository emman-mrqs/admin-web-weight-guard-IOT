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
        operationalCount: 0,
        aboveRefCount: 0,
        lossCount: 0,
        overloadCount: 0,
        avgCapacityKg: 0,
        alertCount: 0
    },
    filter: 'all',
    search: '',
    selectedVehicleId: null,
    searchTimer: null,
    sparklineCharts: [],
    autoRefreshTimer: null
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

function getProfileInitials(fullName, fallback = 'AD') {
    const normalized = String(fullName || '').trim();
    if (!normalized || normalized.toLowerCase() === 'unassigned') {
        return fallback;
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (!parts.length) return fallback;

    const first = parts[0].charAt(0) || '';
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    const initials = `${first}${second}`.toUpperCase();
    return initials || fallback;
}

function applyDriverProfileBadge(fullName) {
    const initialsEl = document.getElementById('viewDriverInitials');
    const badgeEl = document.getElementById('viewDriverInitialsBadge');
    if (!initialsEl || !badgeEl) return;

    const isUnassigned = String(fullName || '').trim().toLowerCase() === 'unassigned';
    initialsEl.textContent = getProfileInitials(fullName, isUnassigned ? '--' : 'AD');

    if (isUnassigned) {
        badgeEl.className = 'w-12 h-12 bg-slate-800 border border-slate-700 ring-1 ring-slate-600/40 rounded-full flex items-center justify-center text-slate-300 font-bold text-base shadow-[0_0_8px_rgba(15,23,42,0.45)]';
        return;
    }

    badgeEl.className = 'w-12 h-12 bg-gradient-to-b from-emerald-500/20 to-emerald-600/5 border border-emerald-500/30 ring-1 ring-emerald-400/20 rounded-full flex items-center justify-center text-emerald-400 font-bold text-base shadow-[0_0_12px_rgba(16,185,129,0.35)]';
}

function normalizeOperationalState(state) {
    const value = String(state || '').toLowerCase();
    if (value.includes('maintenance')) return 'maintenance';
    if (value.includes('loading')) return 'loading';
    if (value.includes('transit')) return 'in_transit';
    if (value.includes('idle')) return 'idle';
    return 'available';
}

function formatOperationalState(state) {
    const normalized = normalizeOperationalState(state);
    if (normalized === 'in_transit') return 'In Transit';
    if (normalized === 'maintenance') return 'In Maintenance';
    if (normalized === 'loading') return 'Loading';
    if (normalized === 'idle') return 'Idle / Docked';
    return 'Available';
}

function getOperationalStateVisual(state) {
    const normalized = normalizeOperationalState(state);

    if (normalized === 'maintenance') {
        return {
            className: 'w-12 h-12 rounded-xl bg-amber-500/10 text-amber-300 flex items-center justify-center border border-amber-500/30',
            svg: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317a1 1 0 011.35-.936l1.38.69a1 1 0 00.894 0l1.38-.69a1 1 0 011.45.893l.064 1.515a1 1 0 00.52.84l1.31.74a1 1 0 01.278 1.536l-.999 1.14a1 1 0 000 1.318l.999 1.14a1 1 0 01-.278 1.536l-1.31.74a1 1 0 00-.52.84l-.064 1.515a1 1 0 01-1.45.894l-1.38-.69a1 1 0 00-.894 0l-1.38.69a1 1 0 01-1.45-.894l-.064-1.515a1 1 0 00-.52-.84l-1.31-.74a1 1 0 01-.278-1.536l.999-1.14a1 1 0 000-1.318l-.999-1.14a1 1 0 01.278-1.536l1.31-.74a1 1 0 00.52-.84l.064-1.515z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>'
        };
    }

    if (normalized === 'in_transit') {
        return {
            className: 'w-12 h-12 rounded-xl bg-sky-500/10 text-sky-300 flex items-center justify-center border border-sky-500/30',
            svg: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1"></path><circle cx="7" cy="17" r="2" stroke-width="2"></circle><circle cx="17" cy="17" r="2" stroke-width="2"></circle></svg>'
        };
    }

    if (normalized === 'loading') {
        return {
            className: 'w-12 h-12 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center border border-blue-500/30',
            svg: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M5 7l1 12h12l1-12M9 11v4m6-4v4"></path></svg>'
        };
    }

    if (normalized === 'idle') {
        return {
            className: 'w-12 h-12 rounded-xl bg-slate-700/60 text-slate-200 flex items-center justify-center border border-slate-600',
            svg: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
        };
    }

    return {
        className: 'w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center justify-center border border-emerald-500/30',
        svg: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
    };
}

function normalizeDispatchStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (['pending', 'active', 'in_transit'].includes(value)) return value;
    return 'unassigned';
}

function canDecreaseCapacity(dispatchStatus) {
    const normalized = normalizeDispatchStatus(dispatchStatus);
    return normalized === 'pending' || normalized === 'unassigned';
}

function formatDispatchStatusForUi(dispatchStatus) {
    const normalized = normalizeDispatchStatus(dispatchStatus);
    if (normalized === 'in_transit') return 'In Transit';
    if (normalized === 'active') return 'Active';
    if (normalized === 'pending') return 'Pending';
    return 'Unassigned';
}

function updateEditCapacityRuleHint(dispatchStatus) {
    const hint = document.getElementById('editCapacityRuleHint');
    if (!hint) return;

    if (canDecreaseCapacity(dispatchStatus)) {
        hint.className = 'mt-2 text-[10px] text-slate-500 font-medium';
        hint.textContent = `Dispatch status: ${formatDispatchStatusForUi(dispatchStatus)}. Capacity decrease is allowed.`;
        return;
    }

    hint.className = 'mt-2 text-[10px] text-amber-300 font-medium';
    hint.textContent = `Dispatch status: ${formatDispatchStatusForUi(dispatchStatus)}. You can only decrease capacity when dispatch is Pending or Unassigned.`;
}

function getDispatchStatusBadge(status) {
    const normalized = normalizeDispatchStatus(status);

    if (normalized === 'active') {
        return {
            label: 'ACTIVE',
            className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            dotClass: 'bg-emerald-400'
        };
    }

    if (normalized === 'in_transit') {
        return {
            label: 'IN TRANSIT',
            className: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
            dotClass: 'bg-sky-400'
        };
    }

    if (normalized === 'pending') {
        return {
            label: 'PENDING',
            className: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
            dotClass: 'bg-amber-400'
        };
    }

    return {
        label: 'UNASSIGNED',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
        dotClass: 'bg-slate-500'
    };
}

function normalizeVehicleCondition(loadStatus) {
    const value = String(loadStatus || '').trim().toLowerCase();
    if (value.includes('loss')) return 'loss';
    if (value.includes('overload')) return 'overload';
    if (value.includes('above_reference')) return 'above_reference';
    if (value.includes('loading')) return 'loading';
    return 'normal';
}

function getVehicleConditionBadge(loadStatus) {
    const normalized = normalizeVehicleCondition(loadStatus);

    if (normalized === 'loss') {
        return {
            label: 'LOSS',
            className: 'text-rose-400',
            dotClass: 'bg-rose-500'
        };
    }

    if (normalized === 'overload') {
        return {
            label: 'OVERLOAD',
            className: 'text-amber-400',
            dotClass: 'bg-amber-400'
        };
    }

    if (normalized === 'loading') {
        return {
            label: 'LOADING',
            className: 'text-sky-300',
            dotClass: 'bg-sky-400'
        };
    }

    if (normalized === 'above_reference') {
        return {
            label: 'ABOVE REF',
            className: 'text-blue-300',
            dotClass: 'bg-blue-400'
        };
    }

    return {
        label: 'NORMAL',
        className: 'text-emerald-400',
        dotClass: 'bg-emerald-400'
    };
}

function getVehicleConditionMetaClass(loadStatus) {
    const normalized = normalizeVehicleCondition(loadStatus);

    if (normalized === 'loss') return 'text-xs font-mono mt-0.5 text-rose-400';
    if (normalized === 'overload') return 'text-xs font-mono mt-0.5 text-amber-300';
    if (normalized === 'above_reference') return 'text-xs font-mono mt-0.5 text-blue-300';
    if (normalized === 'loading') return 'text-xs font-mono mt-0.5 text-sky-300';
    return 'text-xs font-mono mt-0.5 text-emerald-300';
}

function getLoadProgressBarClass(loadStatus) {
    const normalized = normalizeVehicleCondition(loadStatus);

    if (normalized === 'loss') {
        return 'bg-gradient-to-r from-rose-500 to-rose-400 h-full rounded-full shadow-[0_0_10px_rgba(244,63,94,0.45)]';
    }

    if (normalized === 'overload') {
        return 'bg-gradient-to-r from-amber-500 to-orange-400 h-full rounded-full shadow-[0_0_10px_rgba(245,158,11,0.45)]';
    }

    if (normalized === 'above_reference') {
        return 'bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.45)]';
    }

    if (normalized === 'loading') {
        return 'bg-gradient-to-r from-sky-500 to-blue-400 h-full rounded-full shadow-[0_0_10px_rgba(56,189,248,0.45)]';
    }

    return 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]';
}

function getCurrentLoadKg(vehicle) {
    const loadStatusText = String(vehicle.current_load_status || 'empty');
    const liveCurrentWeightKg = Number(vehicle.current_weight_kg);
    const latestTelemetryWeightKg = Number(vehicle.latest_current_weight_kg);
    const dispatchWeightKg = Number(vehicle.initial_reference_weight_kg);
    const numericFromStatus = Number((loadStatusText.match(/\d+(\.\d+)?/) || [])[0] || 0);

    if (Number.isFinite(liveCurrentWeightKg)) {
        return liveCurrentWeightKg;
    }

    if (Number.isFinite(latestTelemetryWeightKg)) {
        return latestTelemetryWeightKg;
    }

    if (Number.isFinite(dispatchWeightKg) && dispatchWeightKg >= 0) {
        return dispatchWeightKg;
    }

    if (Number.isFinite(numericFromStatus) && numericFromStatus > 0) {
        return numericFromStatus;
    }

    return 0;
}

function buildWeightTrendData(vehicle, currentLoadKg, maxCapacityKg) {
    const safeCurrentLoad = Number.isFinite(currentLoadKg) ? currentLoadKg : 0;
    const safeCapacity = Number.isFinite(maxCapacityKg) ? maxCapacityKg : 0;
    const overloadCeiling = safeCapacity > 0 ? safeCapacity * 1.25 : 200;
    const scaleMax = Math.max(overloadCeiling, safeCurrentLoad * 1.1, 100);
    const scaleMin = 0;

    // Deterministic small oscillation by vehicle id so chart does not look random on each refresh.
    const seed = Number(vehicle.id || 0) % 10;
    const variance = Math.max(scaleMax * 0.02, 8);
    const multipliers = [0.94, 0.98, 0.96, 1.01, 0.99, 1.0];

    const data = multipliers.map((multiplier, idx) => {
        const direction = ((seed + idx) % 2 === 0) ? 1 : -1;
        const offset = direction * variance * (0.45 + (idx / 10));
        const point = (safeCurrentLoad * multiplier) + offset;
        return Math.max(scaleMin, Math.min(scaleMax, point));
    });

    return { data, scaleMin, scaleMax };
}

function closeAllModals() {
    const overlay = document.getElementById('modalOverlay');
    const modals = document.querySelectorAll('[id$="Modal"]');
    const deleteError = document.getElementById('deleteFleetFormError');

    if (overlay) overlay.classList.add('opacity-0');
    if (deleteError) {
        deleteError.classList.add('hidden');
        deleteError.textContent = '';
    }

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
    const totalCountEl = document.getElementById('fleetTotalCount');
    if (totalCountEl) totalCountEl.textContent = formatNumber(stats.totalFleet);
    if (activeEl) activeEl.textContent = formatNumber(stats.operationalCount);
    if (avgEl) {
        avgEl.innerHTML = `${formatNumber(Math.round(stats.avgCapacityKg || 0))} <span class="text-sm font-semibold text-slate-500">kg</span>`;
    }
    if (alertEl) alertEl.textContent = formatNumber((stats.lossCount || 0) + (stats.overloadCount || 0));

    const operationalCountEl = document.getElementById('fleetOperationalCount');
    const aboveRefCountEl = document.getElementById('fleetAboveRefCount');
    const lossCountEl = document.getElementById('fleetLossCount');
    const overloadCountEl = document.getElementById('fleetOverloadCount');

    if (operationalCountEl) operationalCountEl.textContent = formatNumber(stats.operationalCount);
    if (aboveRefCountEl) aboveRefCountEl.textContent = formatNumber(stats.aboveRefCount);
    if (lossCountEl) lossCountEl.textContent = formatNumber(stats.lossCount);
    if (overloadCountEl) overloadCountEl.textContent = formatNumber(stats.overloadCount);
}

function getFilterButtonClasses(filterType, active) {
    const base = 'filter-btn px-4 py-2 text-xs font-bold rounded-lg border transition flex items-center gap-2';
    const inactive = `${base} bg-transparent text-slate-300 border-transparent hover:bg-slate-800/70`;

    if (filterType === 'all') {
        return active
            ? 'filter-btn px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition shadow-md flex items-center gap-2'
            : inactive;
    }

    if (filterType === 'operational') {
        return active
            ? `${base} bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.18)]`
            : inactive;
    }

    if (filterType === 'above_ref') {
        return active
            ? `${base} bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.18)]`
            : inactive;
    }

    if (filterType === 'loss') {
        return active
            ? `${base} bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.18)]`
            : inactive;
    }

    if (filterType === 'overload') {
        return active
            ? `${base} bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.18)]`
            : inactive;
    }

    return inactive;
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
        const dispatchBadge = getDispatchStatusBadge(vehicle.dispatch_task_status || vehicle.dispatch_status);
        const vehicleCondition = getVehicleConditionBadge(vehicle.current_load_status);
        const isAlert = ['OVERLOAD', 'LOSS'].includes(vehicleCondition.label);
        const driverName = vehicle.driver_first_name
            ? `${vehicle.driver_first_name} ${vehicle.driver_last_name || ''}`.trim()
            : 'Unassigned';
        const plate = vehicle.plate_number || 'N/A';
        const type = vehicle.vehicle_type || 'Unknown Vehicle';
        const maxCapacity = Number(vehicle.max_capacity_kg || 0);

        const currentLoadKg = getCurrentLoadKg(vehicle);
        const loadPercent = maxCapacity > 0 ? Math.max(0, Math.min(100, (currentLoadKg / maxCapacity) * 100)) : 0;

        const initialWeightKg = Number(vehicle.initial_reference_weight_kg);
        const initialWeightText = Number.isFinite(initialWeightKg)
            ? `${formatNumber(initialWeightKg)} kg`
            : 'N/A';
        const routeLine = vehicleCondition.label;
        const routeMeta = `Initial: ${initialWeightText} • Driver: ${driverName}`;
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
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wide ${dispatchBadge.className}">
                        <span class="w-1.5 h-1.5 rounded-full ${dispatchBadge.dotClass}"></span>
                        ${dispatchBadge.label}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold ${vehicleCondition.className}">${routeLine}</div>
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

        const isAlert = ['overload', 'loss'].includes(normalizeVehicleCondition(vehicle.current_load_status));
        const color = isAlert ? '#fb7185' : '#34d399';
        const maxCapacityKg = Number(vehicle.max_capacity_kg || 0);
        const currentLoadKg = getCurrentLoadKg(vehicle);
        const { data, scaleMin, scaleMax } = buildWeightTrendData(vehicle, currentLoadKg, maxCapacityKg);

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
                scales: {
                    x: { display: false },
                    y: {
                        display: false,
                        min: scaleMin,
                        max: scaleMax
                    }
                },
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

function formatVehicleIdentifier(plate, vehicleId) {
    return `${plate || 'N/A'} • ID: ${vehicleId || 'N/A'}`;
}

function fillViewModal(vehicle) {
    if (!vehicle) return;

    const badge = getDispatchStatusBadge(vehicle.dispatch_task_status || vehicle.dispatch_status);
    const vehicleCondition = getVehicleConditionBadge(vehicle.current_load_status);
    const driverName = vehicle.driver_first_name
        ? `${vehicle.driver_first_name} ${vehicle.driver_last_name || ''}`.trim()
        : 'Unassigned';

    const vehicleType = document.getElementById('viewVehicleType');
    const statusBadge = document.getElementById('viewStatusBadge');
    const plate = document.getElementById('viewPlateNumber');
    const driver = document.getElementById('viewDriverName');
    const stateIcon = document.getElementById('viewCurrentStateIcon');
    const state = document.getElementById('viewCurrentState');
    const stateMeta = document.getElementById('viewCurrentStateMeta');
    const currentLoad = document.getElementById('viewCurrentLoad');
    const maxCapacity = document.getElementById('viewMaxCapacity');
    const initialReferenceWeight = document.getElementById('viewInitialReferenceWeight');
    const loadProgressBar = document.getElementById('viewLoadProgressBar');
    const vehicleClass = document.getElementById('viewVehicleClass');
    const createdAt = document.getElementById('viewCreatedAt');
    const lastMaintenance = document.getElementById('viewLastMaintenance');

    const currentLoadKg = getCurrentLoadKg(vehicle);
    const maxCapacityKg = Number(vehicle.max_capacity_kg || 0);
    const initialReferenceKg = Number(vehicle.initial_reference_weight_kg);
    const operationalState = normalizeOperationalState(vehicle.current_state);
    const stateVisual = getOperationalStateVisual(operationalState);
    const loadPercent = maxCapacityKg > 0
        ? Math.max(0, Math.min(100, (currentLoadKg / maxCapacityKg) * 100))
        : 0;

    if (vehicleType) vehicleType.textContent = vehicle.vehicle_type || 'N/A';
    if (plate) plate.textContent = vehicle.plate_number || 'N/A';
    
    const viewVehicleId = document.getElementById('viewVehicleId');
    if (viewVehicleId) {
        viewVehicleId.innerHTML = `ID: <span class=\"text-slate-400 font-bold\">${vehicle.id || 'N/A'}</span>`;
    }
    
    if (driver) driver.textContent = driverName;
    applyDriverProfileBadge(driverName);
    if (stateIcon) {
        stateIcon.className = stateVisual.className;
        stateIcon.innerHTML = stateVisual.svg;
    }
    if (state) {
        state.textContent = formatOperationalState(operationalState);
    }
    if (stateMeta) {
        stateMeta.textContent = `Condition: ${vehicleCondition.label}`;
        stateMeta.className = getVehicleConditionMetaClass(vehicle.current_load_status);
    }
    if (currentLoad) currentLoad.innerHTML = `${formatNumber(currentLoadKg)} <span class="text-sm font-medium text-slate-500">kg</span>`;
    if (maxCapacity) maxCapacity.textContent = `${formatNumber(maxCapacityKg)} kg`;
    if (initialReferenceWeight) {
        initialReferenceWeight.textContent = Number.isFinite(initialReferenceKg)
            ? `${formatNumber(initialReferenceKg)} kg`
            : 'N/A';
    }
    if (loadProgressBar) {
        loadProgressBar.className = getLoadProgressBarClass(vehicle.current_load_status);
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
    const originalCapacity = Number(form.dataset.originalCapacity || 0);
    const dispatchStatus = normalizeDispatchStatus(form.dataset.dispatchStatus);

    if (Number.isFinite(originalCapacity) && Number(maxCapacity) < originalCapacity && !canDecreaseCapacity(dispatchStatus)) {
        const target = ensureEditFieldError('maxCapacity');
        if (target) {
            target.textContent = 'Capacity can only be decreased when dispatch is Pending or Unassigned.';
            target.classList.remove('hidden');
        }
        showEditFeedback('error', 'Cannot decrease max capacity for vehicles with active dispatch progress.');
        return;
    }

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
                driverId: driverId || null
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
    const identifierDisplay = document.getElementById('editVehicleIdentifier');
    const dispatchStatus = normalizeDispatchStatus(vehicle.dispatch_task_status || vehicle.dispatch_status);

    if (idField) idField.value = String(vehicle.id);
    if (plateField) plateField.value = vehicle.plate_number || '';
    if (typeField) typeField.value = vehicle.vehicle_type || '';
    if (maxCapacityField) maxCapacityField.value = Number(vehicle.max_capacity_kg || 0);
    if (maxCapacityDisplay) maxCapacityDisplay.textContent = `${formatNumber(vehicle.max_capacity_kg || 0)} kg`;
    if (identifierDisplay) {
        identifierDisplay.innerHTML = `Update parameters for <span class="font-mono text-slate-300 font-bold">${formatVehicleIdentifier(vehicle.plate_number, vehicle.id)}</span>`;
    }
    if (idField?.form) {
        idField.form.dataset.originalCapacity = String(Number(vehicle.max_capacity_kg || 0));
        idField.form.dataset.dispatchStatus = dispatchStatus;
    }
    updateEditCapacityRuleHint(dispatchStatus);

    await populateEditDriverOptions(vehicle.id, vehicle.assigned_driver_id);
    openModal('editModal');
};

window.openDeleteVehicle = function openDeleteVehicle(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return;

    fleetState.selectedVehicleId = Number(vehicleId);

    const deleteError = document.getElementById('deleteFleetFormError');
    if (deleteError) {
        deleteError.classList.add('hidden');
        deleteError.textContent = '';
    }

    const plateText = document.getElementById('deletePlateNumber');
    if (plateText) {
        plateText.textContent = vehicle.plate_number || `#${vehicle.id}`;
    }

    openModal('deleteModal');
};

window.toggleModal = openModal;
window.closeAllModals = closeAllModals;

window.filterFleet = function filterFleet(filterType, clickedBtn) {
    const normalizedFilter = String(filterType || 'all');
    fleetState.filter = normalizedFilter;
    fleetState.pagination.page = 1;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        const btnFilter = String(btn.dataset.filter || '');
        btn.className = getFilterButtonClasses(btnFilter, btnFilter === normalizedFilter);
    });

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

    const defaultFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (defaultFilterBtn) {
        defaultFilterBtn.className = getFilterButtonClasses('all', true);
    }

    fetchFleetData();
}

document.addEventListener('DOMContentLoaded', initializeFleetPage);
