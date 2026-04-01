const notificationState = {
    inbox: [],
    sent: [],
    filteredInbox: [],
    filteredSent: [],
    filters: {
        query: '',
        category: 'all'
    }
};

function openModal(modalId) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById(modalId);

    if (modalId === 'createAnnouncementModal') {
        const form = document.getElementById('createAnnouncementForm');
        const feedback = document.getElementById('announcementFormFeedback');

        if (form) {
            form.reset();
        }

        if (feedback) {
            feedback.textContent = '';
            feedback.classList.add('hidden');
            feedback.classList.remove(
                'bg-emerald-500/10',
                'text-emerald-300',
                'border',
                'border-emerald-500/20',
                'bg-rose-500/10',
                'text-rose-300',
                'border-rose-500/20'
            );
        }
    }

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('opacity-0', 'scale-95');
        modal.classList.add('opacity-100', 'scale-100');
    }, 10);
}

function closeAllModals() {
    const overlay = document.getElementById('modalOverlay');
    const modals = document.querySelectorAll('[id$="Modal"]');

    overlay.classList.add('opacity-0');
    modals.forEach((modal) => {
        modal.classList.remove('opacity-100', 'scale-100');
        modal.classList.add('opacity-0', 'scale-95');
    });

    setTimeout(() => {
        overlay.classList.add('hidden');
        modals.forEach((modal) => modal.classList.add('hidden'));
    }, 300);
}

function closeModal(modalId) {
    closeAllModals();
}

function switchTab(tabName) {
    const btnInbox = document.getElementById('tabInbox');
    const btnSent = document.getElementById('tabSent');
    const tableInbox = document.getElementById('inboxTable');
    const tableSent = document.getElementById('sentTable');

    if (tabName === 'inbox') {
        btnInbox.className = 'flex-1 py-4 text-sm font-bold border-b-2 border-emerald-400 text-emerald-400 transition bg-emerald-500/5';
        btnSent.className = 'flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-300 transition hover:bg-slate-800/30';
        tableInbox.classList.remove('hidden');
        tableSent.classList.add('hidden');
        return;
    }

    btnSent.className = 'flex-1 py-4 text-sm font-bold border-b-2 border-blue-400 text-blue-400 transition bg-blue-500/5';
    btnInbox.className = 'flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-300 transition hover:bg-slate-800/30';
    tableSent.classList.remove('hidden');
    tableInbox.classList.add('hidden');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatRelativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const diffMs = date.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);

    if (Math.abs(diffMinutes) < 60) {
        return `${Math.abs(diffMinutes)} min${Math.abs(diffMinutes) === 1 ? '' : 's'} ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
        return `${Math.abs(diffHours)} hour${Math.abs(diffHours) === 1 ? '' : 's'} ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
}

function audienceLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'all') return 'All Staff and Drivers';
    if (normalized === 'staff') return 'All Staff';
    if (normalized === 'incident_staff') return 'Incident Staff';
    if (normalized === 'dispatch_staff') return 'Dispatch Staff';
    if (normalized === 'drivers') return 'Drivers';
    return normalized || 'Unknown';
}

function updateUnreadBadge(unreadCount) {
    const badge = document.getElementById('inboxUnreadBadge');
    if (!badge) return;

    const safeCount = Number(unreadCount) || 0;
    badge.textContent = String(safeCount);
    badge.classList.toggle('hidden', safeCount <= 0);
}

function openNotificationDetails(item) {
    const typeEl = document.getElementById('notificationModalType');
    const priorityEl = document.getElementById('notificationModalPriority');
    const dateEl = document.getElementById('notificationModalDate');
    const titleEl = document.getElementById('notificationModalTitle');
    const messageEl = document.getElementById('notificationModalMessage');
    const senderEl = document.getElementById('notificationModalSender');
    const audienceEl = document.getElementById('notificationModalAudience');
    const recipientsEl = document.getElementById('notificationModalRecipients');
    const readStatusEl = document.getElementById('notificationModalReadStatus');
    const referenceEl = document.getElementById('notificationModalReference');

    const normalizedPriority = normalizeText(item?.priority || 'normal');
    const priorityLabel = normalizedPriority.charAt(0).toUpperCase() + normalizedPriority.slice(1);

    const priorityClassByValue = {
        critical: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
        high: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
        normal: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
    };

    const readStatus = item?.isRead === true
        ? (item?.readAt ? `Read on ${formatDate(item.readAt)}` : 'Read')
        : 'Unread';

    const senderName = item?.sender?.name || 'System';
    const recipientCount = Number(item?.recipientCount);
    const recipientLabel = Number.isFinite(recipientCount)
        ? String(recipientCount)
        : '1';
    const referenceParts = [
        Number(item?.notificationId) ? `Notification #${Number(item.notificationId)}` : null,
        Number(item?.recipientId) ? `Recipient #${Number(item.recipientId)}` : null
    ].filter(Boolean);

    if (typeEl) typeEl.textContent = String(item?.type || 'announcement').toUpperCase();
    if (priorityEl) {
        priorityEl.textContent = priorityLabel.toUpperCase();
        priorityEl.className = `px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${priorityClassByValue[normalizedPriority] || priorityClassByValue.normal}`;
    }
    if (dateEl) dateEl.textContent = formatDate(item?.createdAt);
    if (titleEl) titleEl.textContent = item?.title || 'Notification';
    if (messageEl) messageEl.textContent = item?.message || 'No message.';
    if (senderEl) senderEl.textContent = senderName;
    if (audienceEl) audienceEl.textContent = audienceLabel(item?.targetAudience);
    if (recipientsEl) recipientsEl.textContent = recipientLabel;
    if (readStatusEl) readStatusEl.textContent = readStatus;
    if (referenceEl) referenceEl.textContent = referenceParts.join(' | ') || '-';

    openModal('viewNotificationModal');
}

function attachViewHandlers() {
    document.querySelectorAll('.js-view-notification').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const source = button.dataset.source;
            const index = Number(button.dataset.index);
            if (!Number.isFinite(index)) return;

            const list = source === 'sent' ? notificationState.filteredSent : notificationState.filteredInbox;
            const item = list[index];
            if (!item) return;
            openNotificationDetails(item);
        });
    });
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function applyNotificationFilters() {
    const query = normalizeText(notificationState.filters.query);
    const category = normalizeText(notificationState.filters.category || 'all');

    const matches = (item) => {
        const searchable = [
            item?.title,
            item?.message,
            item?.type,
            item?.targetAudience
        ].map(normalizeText).join(' ');

        const queryMatch = !query || searchable.includes(query);
        const categoryMatch = category === 'all' || normalizeText(item?.type) === category;
        return queryMatch && categoryMatch;
    };

    notificationState.filteredInbox = notificationState.inbox.filter(matches);
    notificationState.filteredSent = notificationState.sent.filter(matches);
}

function renderInboxRows() {
    const tbody = document.getElementById('inboxTableBody');
    if (!tbody) return;

    if (notificationState.filteredInbox.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-slate-500 text-sm">No inbox notifications yet.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = notificationState.filteredInbox.map((item, index) => {
        const unreadRowClass = item.isRead ? 'hover:bg-slate-800/40' : 'bg-blue-500/5 hover:bg-blue-500/10';
        return `
            <tr class="${unreadRowClass} transition-colors group cursor-pointer js-view-notification" data-source="inbox" data-index="${index}">
                <td class="px-6 py-4">
                    ${item.isRead ? '' : '<div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse"></div>'}
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-extrabold text-white">${escapeHtml(item.title)}</div>
                    <div class="text-xs text-slate-400 mt-0.5 truncate max-w-md">${escapeHtml(item.message)}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-widest">${escapeHtml(item.type || 'announcement')}</span>
                </td>
                <td class="px-6 py-4 text-[10px] font-mono text-slate-400 font-bold uppercase">${escapeHtml(formatRelativeDate(item.createdAt))}</td>
                <td class="px-6 py-4 text-right">
                    <button class="text-slate-500 hover:text-white transition p-2 rounded-lg hover:bg-slate-800 js-view-notification" title="View" data-source="inbox" data-index="${index}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSentRows() {
    const tbody = document.getElementById('sentTableBody');
    if (!tbody) return;

    if (notificationState.filteredSent.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-8 text-center text-slate-500 text-sm">No sent notifications yet.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = notificationState.filteredSent.map((item, index) => `
        <tr class="hover:bg-slate-800/40 transition-colors group cursor-pointer js-view-notification" data-source="sent" data-index="${index}">
            <td class="px-6 py-4">
                <div class="text-sm font-bold text-white">${escapeHtml(item.title)}</div>
                <div class="text-xs text-slate-500 mt-0.5 truncate max-w-md">${escapeHtml(item.message)}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">${escapeHtml(audienceLabel(item.targetAudience))}</span>
                <div class="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Recipients: ${Number(item.recipientCount) || 0}</div>
            </td>
            <td class="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase">${escapeHtml(formatDate(item.createdAt))}</td>
            <td class="px-6 py-4 text-right">
                <button class="text-slate-500 hover:text-white transition p-2 rounded-lg hover:bg-slate-800 js-view-notification" title="View" data-source="sent" data-index="${index}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadNotificationTables() {
    const [inboxResponse, sentResponse] = await Promise.all([
        fetch('/api/admin/notifications/inbox'),
        fetch('/api/admin/notifications/sent')
    ]);

    const inboxPayload = await inboxResponse.json().catch(() => ({}));
    const sentPayload = await sentResponse.json().catch(() => ({}));

    if (!inboxResponse.ok || !sentResponse.ok) {
        throw new Error('Unable to load notifications.');
    }

    notificationState.inbox = Array.isArray(inboxPayload?.data) ? inboxPayload.data : [];
    notificationState.sent = Array.isArray(sentPayload?.data) ? sentPayload.data : [];

    applyNotificationFilters();
    renderInboxRows();
    renderSentRows();
    updateUnreadBadge(Number(inboxPayload?.unreadCount) || 0);
    attachViewHandlers();
    window.dispatchEvent(new Event('notification:inbox-updated'));
}

async function markAllAsRead() {
    try {
        const response = await fetch('/api/admin/notifications/inbox/mark-all-read', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            return;
        }

        await loadNotificationTables();
        window.dispatchEvent(new Event('notification:inbox-updated'));
    } catch (error) {
        // ignore UI interruption for this action
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('createAnnouncementForm');
    const submitBtn = document.getElementById('announcementSubmitBtn');
    const feedback = document.getElementById('announcementFormFeedback');
    const audienceSelect = document.getElementById('announcementTargetAudience');
    const prioritySelect = document.getElementById('announcementPriority');
    const titleInput = document.getElementById('announcementTitle');
    const messageInput = document.getElementById('announcementMessage');
    const createAnnouncementBtn = document.getElementById('createAnnouncementBtn');
    const audiencePreview = document.getElementById('announcementAudiencePreview');
    const searchInput = document.getElementById('notificationSearchInput');
    const categoryFilter = document.getElementById('notificationCategoryFilter');

    const setFeedback = (message, isError = false) => {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.remove('hidden', 'bg-emerald-500/10', 'text-emerald-300', 'border', 'border-emerald-500/20', 'bg-rose-500/10', 'text-rose-300', 'border-rose-500/20');

        if (isError) {
            feedback.classList.add('bg-rose-500/10', 'text-rose-300', 'border', 'border-rose-500/20');
            return;
        }

        feedback.classList.add('bg-emerald-500/10', 'text-emerald-300', 'border', 'border-emerald-500/20');
    };

    const toggleSendControls = (isEnabled) => {
        if (createAnnouncementBtn) {
            createAnnouncementBtn.classList.toggle('hidden', !isEnabled);
            createAnnouncementBtn.classList.toggle('flex', isEnabled);
        }

        [audienceSelect, prioritySelect, titleInput, messageInput, submitBtn]
            .filter(Boolean)
            .forEach((element) => {
                element.disabled = !isEnabled;
            });

        if (!submitBtn) return;

        if (isEnabled) {
            submitBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                Send Announcement
            `;
            return;
        }

        submitBtn.textContent = 'Not Allowed';
    };

    const audiencePreviewLabel = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'all') return 'Super Admin, Incident Staff, Dispatch Staff, and Drivers';
        if (normalized === 'staff') return 'Incident Staff and Dispatch Staff';
        if (normalized === 'super_admin') return 'Super Admin';
        if (normalized === 'incident_staff') return 'Incident Staff';
        if (normalized === 'dispatch_staff') return 'Dispatch Staff';
        if (normalized === 'drivers') return 'Drivers';
        return '-';
    };

    const updateAudiencePreview = () => {
        if (!audiencePreview || !audienceSelect) return;
        audiencePreview.textContent = `This will notify: ${audiencePreviewLabel(audienceSelect.value)}`;
    };

    const applyAudienceOptionsByCapabilities = (allowedAudiences = []) => {
        if (!audienceSelect) return;

        const allowed = new Set((Array.isArray(allowedAudiences) ? allowedAudiences : []).map((value) => String(value || '').trim()));
        let firstEnabledValue = null;

        Array.from(audienceSelect.options).forEach((option) => {
            const value = String(option.value || '').trim();
            const isAllowed = allowed.has(value);

            option.hidden = !isAllowed;
            option.disabled = !isAllowed;

            if (isAllowed && !firstEnabledValue) {
                firstEnabledValue = value;
            }
        });

        if (firstEnabledValue) {
            audienceSelect.value = firstEnabledValue;
        }

        updateAudiencePreview();
    };

    const bootstrapSendCapabilities = async () => {
        try {
            const response = await fetch('/api/admin/notifications/capabilities', {
                method: 'GET',
                headers: { Accept: 'application/json' }
            });

            const payload = await response.json().catch(() => ({}));
            const canSend = response.ok && Boolean(payload?.canSendAnnouncements);

            toggleSendControls(canSend);

            if (canSend) {
                applyAudienceOptionsByCapabilities(payload?.allowedAudiences || []);
            }

            if (!canSend) {
                setFeedback('Only super_admin, incident_staff, or dispatch_staff can send announcements.', true);
            }
        } catch (error) {
            toggleSendControls(false);
            setFeedback('Unable to verify send permission right now.', true);
        }
    };

    toggleSendControls(false);
    bootstrapSendCapabilities();

    loadNotificationTables().catch(() => {
        const inboxBody = document.getElementById('inboxTableBody');
        const sentBody = document.getElementById('sentTableBody');
        if (inboxBody) {
            inboxBody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-rose-300 text-sm">Failed to load inbox notifications.</td></tr>';
        }
        if (sentBody) {
            sentBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-rose-300 text-sm">Failed to load sent notifications.</td></tr>';
        }
    });

    updateAudiencePreview();

    if (audienceSelect) {
        audienceSelect.addEventListener('change', updateAudiencePreview);
    }

    const rerenderFilteredTables = () => {
        applyNotificationFilters();
        renderInboxRows();
        renderSentRows();
        attachViewHandlers();
    };

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            notificationState.filters.query = String(event.target?.value || '');
            rerenderFilteredTables();
        });
    }

    if (categoryFilter) {
        categoryFilter.addEventListener('change', (event) => {
            notificationState.filters.category = String(event.target?.value || 'all');
            rerenderFilteredTables();
        });
    }

    if (!form || !submitBtn) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (submitBtn.disabled) {
            return;
        }

        const title = String(document.getElementById('announcementTitle')?.value || '').trim();
        const message = String(document.getElementById('announcementMessage')?.value || '').trim();
        const targetAudience = String(document.getElementById('announcementTargetAudience')?.value || '').trim();
        const priority = String(document.getElementById('announcementPriority')?.value || '').trim();

        if (title.length < 3) {
            setFeedback('Title must be at least 3 characters.', true);
            return;
        }

        if (message.length < 5) {
            setFeedback('Message must be at least 5 characters.', true);
            return;
        }

        submitBtn.disabled = true;
        const originalLabel = submitBtn.innerHTML;
        submitBtn.textContent = 'Sending...';
        if (feedback) {
            feedback.textContent = '';
            feedback.classList.add('hidden');
            feedback.classList.remove(
                'bg-emerald-500/10',
                'text-emerald-300',
                'border',
                'border-emerald-500/20',
                'bg-rose-500/10',
                'text-rose-300',
                'border-rose-500/20'
            );
        }

        try {
            const response = await fetch('/api/admin/notifications/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    message,
                    targetAudience,
                    priority
                })
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                setFeedback(payload?.message || 'Failed to send announcement.', true);
                return;
            }

            const recipientCount = Number(payload?.data?.recipients?.total) || 0;
            setFeedback(`Announcement sent successfully to ${recipientCount} recipient(s).`);
            form.reset();
            await loadNotificationTables();
            window.dispatchEvent(new Event('notification:inbox-updated'));

            setTimeout(() => {
                closeModal('createAnnouncementModal');
            }, 700);
        } catch (error) {
            setFeedback('Unable to send announcement. Please check your connection and try again.', true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalLabel;
        }
    });
});