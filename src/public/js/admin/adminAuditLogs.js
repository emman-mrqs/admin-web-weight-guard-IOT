(function () {
    const state = {
        logs: [],
        filteredLogs: [],
        currentPage: 1,
        pageSize: 12
    };

    const el = {
        tableBody: document.getElementById('auditLogsTableBody'),
        summary: document.getElementById('auditLogsSummary'),
        pagination: document.getElementById('auditLogsPagination'),
        searchInput: document.getElementById('auditSearchInput'),
        severityFilter: document.getElementById('auditSeverityFilter'),
        moduleFilter: document.getElementById('auditModuleFilter'),
        actionFilter: document.getElementById('auditActionFilter'),
        dateFromFilter: document.getElementById('auditDateFromFilter'),
        dateToFilter: document.getElementById('auditDateToFilter'),
        resetFiltersBtn: document.getElementById('auditResetFiltersBtn'),
        overlay: document.getElementById('modalOverlay'),
        modal: document.getElementById('auditContextModal'),
        closeModalBtn: document.getElementById('closeAuditModalBtn'),
        closeModalFooterBtn: document.getElementById('closeAuditModalFooterBtn'),
        modalEvent: document.getElementById('modal-event'),
        modalActor: document.getElementById('modal-actor'),
        modalIp: document.getElementById('modal-ip'),
        modalTime: document.getElementById('modal-time'),
        modalAgent: document.getElementById('modal-agent'),
        modalDesc: document.getElementById('modal-desc')
    };

    const formatDateTime = (value) => {
        const dateValue = new Date(value);
        if (Number.isNaN(dateValue.getTime())) {
            return 'N/A';
        }

        return dateValue.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const normalizeText = (value) => String(value || '').toLowerCase().trim();

    const truncateText = (value, maxLength = 120) => {
        const text = String(value || '').trim();
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 1)}...`;
    };

    const severityClasses = (severity) => {
        const normalized = normalizeText(severity);
        if (normalized === 'high') {
            return {
                badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                dot: 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.8)]'
            };
        }

        if (normalized === 'low') {
            return {
                badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                dot: 'bg-blue-400'
            };
        }

        return {
            badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            dot: 'bg-amber-400'
        };
    };

    const actorTextClass = (actor) => {
        const normalized = normalizeText(actor);
        if (!normalized || normalized === 'system') {
            return 'text-blue-300';
        }

        return 'text-slate-100';
    };

    const renderSummary = () => {
        if (!el.summary) {
            return;
        }

        const total = state.logs.length;
        const filtered = state.filteredLogs.length;
        const pageCount = Math.max(1, Math.ceil(filtered / state.pageSize));
        const normalizedPage = Math.min(Math.max(1, state.currentPage), pageCount);
        const start = filtered ? ((normalizedPage - 1) * state.pageSize) + 1 : 0;
        const end = Math.min(normalizedPage * state.pageSize, filtered);

        el.summary.innerHTML = `Showing <span class="text-white font-bold">${start}</span> to <span class="text-white font-bold">${end}</span> of <span class="text-white font-bold">${filtered}</span> filtered entries (<span class="text-white font-bold">${total}</span> total)`;
    };

    const getPagedLogs = () => {
        const filteredCount = state.filteredLogs.length;
        const pageCount = Math.max(1, Math.ceil(filteredCount / state.pageSize));
        state.currentPage = Math.min(Math.max(1, state.currentPage), pageCount);

        const startIndex = (state.currentPage - 1) * state.pageSize;
        const endIndex = startIndex + state.pageSize;

        return state.filteredLogs.slice(startIndex, endIndex);
    };

    const renderPagination = () => {
        if (!el.pagination) {
            return;
        }

        const totalItems = state.filteredLogs.length;
        const pageCount = Math.max(1, Math.ceil(totalItems / state.pageSize));

        if (totalItems === 0) {
            el.pagination.innerHTML = '';
            return;
        }

        const startPage = Math.max(1, state.currentPage - 1);
        const endPage = Math.min(pageCount, startPage + 2);

        const prevDisabled = state.currentPage <= 1;
        const nextDisabled = state.currentPage >= pageCount;

        let html = `
            <button data-page="prev" class="p-2 rounded-lg border border-slate-700 ${prevDisabled ? 'text-slate-600 cursor-not-allowed bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white transition'}" ${prevDisabled ? 'disabled' : ''}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
        `;

        for (let page = startPage; page <= endPage; page += 1) {
            const active = page === state.currentPage;
            html += `
                <button data-page="${page}" class="w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-bold ${active ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition'}">${page}</button>
            `;
        }

        if (endPage < pageCount) {
            html += `<span class="w-8 h-8 flex items-center justify-center text-slate-600 text-xs font-bold">...</span>`;
            html += `
                <button data-page="${pageCount}" class="w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-bold border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition">${pageCount}</button>
            `;
        }

        html += `
            <button data-page="next" class="p-2 rounded-lg border border-slate-700 ${nextDisabled ? 'text-slate-600 cursor-not-allowed bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white transition'}" ${nextDisabled ? 'disabled' : ''}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
        `;

        el.pagination.innerHTML = html;

        el.pagination.querySelectorAll('button[data-page]').forEach((button) => {
            button.addEventListener('click', () => {
                const pageValue = button.dataset.page;

                if (pageValue === 'prev') {
                    state.currentPage = Math.max(1, state.currentPage - 1);
                } else if (pageValue === 'next') {
                    state.currentPage += 1;
                } else {
                    const nextPage = Number(pageValue);
                    if (Number.isFinite(nextPage) && nextPage > 0) {
                        state.currentPage = nextPage;
                    }
                }

                renderRows();
            });
        });
    };

    const renderEmptyState = (message) => {
        if (!el.tableBody) {
            return;
        }

        el.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-10 text-center text-sm text-slate-500">${message}</td>
            </tr>
        `;
    };

    const openModal = (log) => {
        if (!el.modal || !el.overlay) {
            return;
        }

        el.modalEvent.textContent = log.eventName || 'N/A';
        el.modalActor.textContent = log.actor || 'System';
        el.modalIp.textContent = log.ipAddress || 'N/A';
        el.modalTime.textContent = formatDateTime(log.createdAt);
        el.modalAgent.textContent = log.userAgent || 'N/A';
        const description = String(log.description || 'No details available.').trim();
        const contextMessage = log.details && typeof log.details === 'object'
            ? String(log.details.contextMessage || '').trim()
            : '';
        el.modalDesc.textContent = contextMessage || description;

        el.overlay.classList.remove('hidden');
        el.modal.classList.remove('hidden');

        requestAnimationFrame(() => {
            el.overlay.classList.remove('opacity-0');
            el.modal.classList.remove('opacity-0', 'scale-95');
            el.modal.classList.add('opacity-100', 'scale-100');
        });
    };

    const closeModal = () => {
        if (!el.modal || !el.overlay) {
            return;
        }

        el.overlay.classList.add('opacity-0');
        el.modal.classList.remove('opacity-100', 'scale-100');
        el.modal.classList.add('opacity-0', 'scale-95');

        setTimeout(() => {
            el.overlay.classList.add('hidden');
            el.modal.classList.add('hidden');
        }, 200);
    };

    const renderRows = () => {
        if (!el.tableBody) {
            return;
        }

        if (!state.filteredLogs.length) {
            renderEmptyState('No audit logs match the current filters.');
            renderSummary();
            return;
        }

        const pagedLogs = getPagedLogs();

        const rowsHtml = pagedLogs.map((log) => {
            const severity = String(log.severity || 'Medium');
            const styles = severityClasses(severity);
            const shortDescription = truncateText(log.description || 'No details available.', 140);

            return `
                <tr class="hover:bg-slate-800/40 transition-colors group">
                    <td class="px-6 py-4 align-top">
                        <div class="text-sm font-bold text-white break-words">${log.eventName}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 break-words">${log.module}</div>
                    </td>
                    <td class="px-6 py-4 align-top">
                        <div class="text-sm font-semibold ${actorTextClass(log.actor)} break-words">${log.actor}</div>
                    </td>
                    <td class="px-6 py-4 align-top">
                        <div class="text-xs text-slate-300 break-words leading-relaxed">${shortDescription}</div>
                    </td>
                    <td class="px-6 py-4 text-xs font-mono text-slate-400 align-top break-all">${log.ipAddress || 'N/A'}</td>
                    <td class="px-6 py-4 align-top">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wide ${styles.badge}">
                            <span class="w-1.5 h-1.5 rounded-full ${styles.dot}"></span>${severity}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-xs text-slate-400 font-mono align-top">${formatDateTime(log.createdAt)}</td>
                    <td class="px-6 py-4 text-right align-top">
                        <button data-log-id="${log.id}" class="audit-view-btn text-slate-500 hover:text-white transition p-2 rounded-lg hover:bg-slate-800" title="View Context">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        el.tableBody.innerHTML = rowsHtml;
        renderSummary();

        el.tableBody.querySelectorAll('.audit-view-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const logId = Number(button.dataset.logId);
                const log = state.filteredLogs.find((entry) => entry.id === logId);
                if (log) {
                    openModal(log);
                }
            });
        });

        renderPagination();
    };

    const applyFilters = () => {
        const searchTerm = normalizeText(el.searchInput?.value);
        const severity = normalizeText(el.severityFilter?.value);
        const moduleValue = normalizeText(el.moduleFilter?.value);
        const action = normalizeText(el.actionFilter?.value);
        const fromDate = el.dateFromFilter?.value ? new Date(`${el.dateFromFilter.value}T00:00:00`) : null;
        const toDate = el.dateToFilter?.value ? new Date(`${el.dateToFilter.value}T23:59:59`) : null;

        state.filteredLogs = state.logs.filter((log) => {
            const logDate = new Date(log.createdAt);

            const inSearch = !searchTerm || [
                log.eventName,
                log.actor,
                log.ipAddress,
                log.description,
                log.module,
                log.severity
            ].some((value) => normalizeText(value).includes(searchTerm));

            const inSeverity = !severity || normalizeText(log.severity) === severity;
            const inModule = !moduleValue || normalizeText(log.module) === moduleValue;
            const inAction = !action || normalizeText(log.eventName) === action;
            const inDateFrom = !fromDate || (logDate instanceof Date && !Number.isNaN(logDate.getTime()) && logDate >= fromDate);
            const inDateTo = !toDate || (logDate instanceof Date && !Number.isNaN(logDate.getTime()) && logDate <= toDate);

            return inSearch && inSeverity && inModule && inAction && inDateFrom && inDateTo;
        });

        state.currentPage = 1;

        renderRows();
    };

    const setSelectOptions = (selectEl, values) => {
        if (!selectEl) {
            return;
        }

        const firstOption = selectEl.querySelector('option');
        selectEl.innerHTML = '';
        if (firstOption) {
            selectEl.appendChild(firstOption);
        }

        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            selectEl.appendChild(option);
        });
    };

    const bindEvents = () => {
        [el.searchInput, el.severityFilter, el.moduleFilter, el.actionFilter, el.dateFromFilter, el.dateToFilter]
            .forEach((node) => node?.addEventListener('input', applyFilters));

        [el.severityFilter, el.moduleFilter, el.actionFilter]
            .forEach((node) => node?.addEventListener('change', applyFilters));

        el.resetFiltersBtn?.addEventListener('click', () => {
            if (el.searchInput) el.searchInput.value = '';
            if (el.severityFilter) el.severityFilter.value = '';
            if (el.moduleFilter) el.moduleFilter.value = '';
            if (el.actionFilter) el.actionFilter.value = '';
            if (el.dateFromFilter) el.dateFromFilter.value = '';
            if (el.dateToFilter) el.dateToFilter.value = '';
            applyFilters();
        });

        el.overlay?.addEventListener('click', closeModal);
        el.closeModalBtn?.addEventListener('click', closeModal);
        el.closeModalFooterBtn?.addEventListener('click', closeModal);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        });
    };

    const loadAuditLogs = async () => {
        if (!el.tableBody) {
            return;
        }

        renderEmptyState('Loading audit logs...');

        try {
            const response = await fetch('/api/admin/audit-logs', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch audit logs.');
            }

            const payload = await response.json();
            state.logs = Array.isArray(payload?.data) ? payload.data : [];
            state.filteredLogs = [...state.logs];

            const moduleValues = [...new Set(state.logs.map((log) => String(log.module || '').trim()).filter(Boolean))].sort();
            const actionValues = [...new Set(state.logs.map((log) => String(log.eventName || '').trim()).filter(Boolean))].sort();

            setSelectOptions(el.moduleFilter, moduleValues);
            setSelectOptions(el.actionFilter, actionValues);

            renderRows();
        } catch (error) {
            console.error('Audit logs load error:', error);
            renderEmptyState('Unable to load audit logs right now.');
            if (el.summary) {
                el.summary.textContent = 'Failed to load audit logs.';
            }
        }
    };

    bindEvents();
    loadAuditLogs();
})();