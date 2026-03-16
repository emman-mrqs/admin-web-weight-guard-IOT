// ===========================================
// USER MANAGEMENT ONLY LOGIC
// ===========================================

function getInitials(fullName) {
    return fullName.split(' ').map(n => n[0]).join('').toUpperCase();
}

const USERS_PER_PAGE = 10;
let allUsers = [];
let currentUserPage = 1;

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const overlay = document.getElementById('modalOverlay');
    const content = modal.querySelector('.modal-content') || modal;

    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.remove('opacity-0');
    }

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0', 'scale-95', 'modal-enter');
        modal.classList.add('opacity-100', 'scale-100', 'modal-enter-active');
        if (content !== modal) {
            content.classList.remove('modal-content-enter');
            content.classList.add('modal-content-enter-active');
        }
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const overlay = document.getElementById('modalOverlay');
    const content = modal.querySelector('.modal-content') || modal;

    modal.classList.remove('opacity-100', 'scale-100', 'modal-enter-active');
    modal.classList.add('opacity-0', 'scale-95', 'modal-enter');
    if (content !== modal) {
        content.classList.remove('modal-content-enter-active');
        content.classList.add('modal-content-enter');
    }

    if (overlay) {
        overlay.classList.add('opacity-0');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
        if (overlay && !document.querySelector('[id$="Modal"]:not(.hidden)')) {
            overlay.classList.add('hidden');
        }
    }, 300);
}

function closeAllModals() {
    document.querySelectorAll('[id$="Modal"]').forEach(modal => {
        if (!modal.classList.contains('hidden')) {
            closeModal(modal.id);
        }
    });
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
        openModal(modalId);
    } else {
        closeModal(modalId);
    }
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);

    if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
    } else {
        input.type = 'password';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
    }
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < 12; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }

    const passwordField = document.getElementById('addPassword');
    const confirmField = document.getElementById('addConfirmPassword');

    if (passwordField) passwordField.value = password;
    if (confirmField) confirmField.value = password;

    passwordField.type = 'text';
    confirmField.type = 'text';

    const eyeOffSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';

    const icon1 = document.getElementById('toggleAddPasswordIcon');
    const icon2 = document.getElementById('toggleAddConfirmPasswordIcon');
    if (icon1) icon1.innerHTML = eyeOffSvg;
    if (icon2) icon2.innerHTML = eyeOffSvg;
}

async function summaryStats() {
    try {
        const res = await fetch('/admin/users/fetch');
        const data = await res.json();

        const activeUser = data.users.filter(u => u.status === 'active').length;
        const inTransitUser = data.users.filter(u => u.assignment_status === 'active').length;
        const unassignedUser = data.users.filter(u => !u.assignment_id).length;
        const suspendedUser = data.users.filter(u => u.status === 'inactive').length;

        const totalEl = document.getElementById('summaryTotalUsers');
        const activeEl = document.getElementById('summaryActiveUsers');
        const inTransitEl = document.getElementById('summaryInTransit');
        const unassignedEl = document.getElementById('summaryUnassigned');
        const suspendedEl = document.getElementById('summarySuspendedUsers');

        if (totalEl && activeEl && unassignedEl) {
            totalEl.textContent = String(data.users.length);
            activeEl.textContent = String(activeUser);
            unassignedEl.textContent = String(unassignedUser);
            if (inTransitEl) {
                inTransitEl.textContent = String(inTransitUser);
            }
            if (suspendedEl) {
                suspendedEl.textContent = String(suspendedUser);
            }
            return;
        }

        // Backward-compatible fallback if the static summary markup is missing.
        const div = document.getElementById('summaryStats');
        if (div) {
            div.innerHTML = `
                <div class="card-bg p-4 rounded-xl">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Total Users</p>
                    <p class="text-2xl font-bold text-white">${data.users.length}</p>
                </div>
                <div class="card-bg p-4 rounded-xl border-l-4 border-[#2DD4BF]">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Active Now</p>
                    <p class="text-2xl font-bold text-white">${activeUser}</p>
                </div>
                <div class="card-bg p-4 rounded-xl">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">In Transit</p>
                    <p class="text-2xl font-bold text-white">${inTransitUser}</p>
                </div>
                <div class="card-bg p-4 rounded-xl">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Unassigned</p>
                    <p class="text-2xl font-bold text-white">${unassignedUser}</p>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error fetching summary stats:', err);
    }
}

function locateUserOnMap(assignmentId) {
    if (!assignmentId) return;
    window.location.href = `/admin/task-dispatch?assignmentId=${assignmentId}`;
}

async function loadUsers() {
    try {
        const res = await fetch('/admin/users/fetch');
        const data = await res.json();

        allUsers = Array.isArray(data.users) ? data.users : [];
        const totalPages = Math.max(1, Math.ceil(allUsers.length / USERS_PER_PAGE));
        if (currentUserPage > totalPages) {
            currentUserPage = totalPages;
        }
        renderUsersTable();
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

function goToUserPage(page) {
    const totalPages = Math.max(1, Math.ceil(allUsers.length / USERS_PER_PAGE));
    currentUserPage = Math.min(Math.max(1, page), totalPages);
    renderUsersTable();
}

function updatePaginationInfo(totalUsers, startIndex, endIndex) {
    const infoEl = document.getElementById('pagination-info');
    if (!infoEl) return;

    if (totalUsers === 0) {
        infoEl.innerHTML = 'Showing <span class="text-white font-bold">0</span> to <span class="text-white font-bold">0</span> of <span class="text-white font-bold">0</span> entries';
        return;
    }

    infoEl.innerHTML = `Showing <span class="text-white font-bold">${startIndex}</span> to <span class="text-white font-bold">${endIndex}</span> of <span class="text-white font-bold">${totalUsers}</span> entries`;
}

function renderPaginationControls(totalPages) {
    const controlsEl = document.getElementById('pagination-controls');
    if (!controlsEl) return;

    controlsEl.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = `p-2 rounded-lg border border-slate-700 transition ${currentUserPage === 1 ? 'text-slate-400 opacity-50 cursor-not-allowed bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`;
    prevBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>';
    prevBtn.disabled = currentUserPage === 1;
    prevBtn.onclick = () => goToUserPage(currentUserPage - 1);
    controlsEl.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = i === currentUserPage
            ? 'w-8 h-8 flex items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold'
            : 'w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-bold';
        pageBtn.textContent = String(i);
        pageBtn.onclick = () => goToUserPage(i);
        controlsEl.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `p-2 rounded-lg border border-slate-700 transition ${currentUserPage === totalPages ? 'text-slate-400 opacity-50 cursor-not-allowed bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`;
    nextBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
    nextBtn.disabled = currentUserPage === totalPages;
    nextBtn.onclick = () => goToUserPage(currentUserPage + 1);
    controlsEl.appendChild(nextBtn);
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const totalUsers = allUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
    const startOffset = (currentUserPage - 1) * USERS_PER_PAGE;
    const paginatedUsers = allUsers.slice(startOffset, startOffset + USERS_PER_PAGE);

    if (paginatedUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-10 text-center text-slate-500 text-sm">No users found.</td>
            </tr>
        `;
    }

    paginatedUsers.forEach(user => {
            const initials = getInitials(user.full_name);
            const hasAssignment = user.assignment_id && user.assignment_status;

            let assignment = 'UNASSIGNED';
            let assignmentClass = 'bg-gray-800 text-gray-400';
            let vehicleInfo = '';
            let tripInfo = '';

            if (hasAssignment) {
                if (user.assignment_status === 'active') {
                    assignment = 'IN TRANSIT';
                    assignmentClass = 'bg-[#2DD4BF]/10 text-[#2DD4BF]';
                } else if (user.assignment_status === 'pending') {
                    assignment = 'PENDING';
                    assignmentClass = 'bg-yellow-900/20 text-yellow-400';
                }
                vehicleInfo = user.vehicle_number || '';
                if (user.distance_km && user.est_duration_min) {
                    tripInfo = `${user.distance_km} km • ${user.est_duration_min} min`;
                }
            }

            const statusClass = user.status.toLowerCase() === 'active'
                ? 'bg-green-900/20 text-green-500'
                : 'bg-orange-900/20 text-orange-400';

            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-800/30 transition group';
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">${initials}</div>
                        <div>
                            <p class="text-sm font-bold text-white">${user.full_name}</p>
                            <p class="text-xs text-gray-500">${user.email}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col">
                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${assignmentClass} text-[10px] font-bold w-fit mb-1 border ${hasAssignment ? 'border-current/20' : 'border-gray-700'}">${assignment}</span>
                        ${vehicleInfo ? `<span class="text-xs text-gray-300 font-mono">${vehicleInfo}</span>` : ''}
                        ${tripInfo ? `<span class="text-[10px] text-gray-500">${tripInfo}</span>` : ''}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full ${statusClass} text-[10px] font-bold">${user.status.toUpperCase()}</span>
                </td>
                <td class="px-6 py-4 text-xs text-gray-400">${user.created_at ? new Date(user.created_at).toLocaleDateString() : '--'}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="locateUserOnMap(${user.assignment_id})"
                            class="p-2 transition rounded-lg border ${hasAssignment
                                ? 'text-white hover:bg-gray-700 bg-gray-800 border-gray-600 cursor-pointer'
                                : 'text-gray-600 bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50'}"
                            title="${hasAssignment ? 'Open Task Dispatch' : 'No active assignment'}"
                            ${hasAssignment ? '' : 'disabled'}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>
                            </svg>
                        </button>
                        <button onclick="openModal('historyModal')" class="p-2 text-[#2DD4BF] hover:text-teal-300 transition bg-teal-900/20 rounded-lg border border-teal-500/30 hover:border-teal-500/50" title="Cargo Integrity History">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                        </button>
                        <button onclick="openEditUserModal(${user.id})" class="p-2 text-blue-400 hover:text-blue-300 transition bg-blue-900/20 rounded-lg border border-blue-500/30" title="Edit User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button onclick="openDeleteUserModal(${user.id}, '${user.full_name.replace(/'/g, "\\'")}')"
                            class="p-2 text-red-500 hover:text-red-400 transition bg-red-900/20 rounded-lg border border-red-500/30" title="Delete User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });

    const startIndex = totalUsers === 0 ? 0 : startOffset + 1;
    const endIndex = startOffset + paginatedUsers.length;
    updatePaginationInfo(totalUsers, startIndex, endIndex);
    renderPaginationControls(totalPages);
}

async function openEditUserModal(userId) {
    try {
        const res = await fetch('/admin/users/fetch');
        const data = await res.json();
        const user = data.users.find(u => u.id === userId);
        if (!user) return;

        const nameParts = user.full_name.split(' ');
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editFirstName').value = nameParts[0] || '';
        document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editStatus').value = user.status;

        document.getElementById('editFormError').textContent = '';
        document.getElementById('editFormSuccess').textContent = '';
        openModal('editUserModal');
    } catch (err) {
        console.error('Error fetching user data:', err);
    }
}

function openDeleteUserModal(userId, userName) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteUserName').textContent = userName;
    document.getElementById('deleteFormError').textContent = '';
    document.getElementById('deleteFormSuccess').textContent = '';
    openModal('deleteUserModal');
}

async function confirmDeleteUser() {
    const userId = document.getElementById('deleteUserId').value;
    const errorEl = document.getElementById('deleteFormError');
    const successEl = document.getElementById('deleteFormSuccess');

    errorEl.textContent = '';
    successEl.textContent = '';

    try {
        const res = await fetch(`/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error || 'Delete failed.';
            return;
        }

        successEl.textContent = data.message || 'User deleted successfully.';

        setTimeout(() => {
            closeModal('deleteUserModal');
            loadUsers();
            summaryStats();
        }, 800);
    } catch (err) {
        errorEl.textContent = 'Something went wrong. Please try again.';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    summaryStats();
    loadUsers();

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const payload = {
                firstName: addUserForm.firstName.value,
                lastName: addUserForm.lastName.value,
                email: addUserForm.email.value,
                password: addUserForm.password.value,
                confirmPassword: addUserForm.confirmPassword.value
            };

            const errorEl = document.getElementById('formError');
            const successEl = document.getElementById('formSuccess');
            errorEl.textContent = '';
            successEl.textContent = '';

            try {
                const res = await fetch('/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (!res.ok) {
                    errorEl.textContent = data.error;
                    return;
                }

                loadUsers();
                summaryStats();
                successEl.textContent = data.message;
                addUserForm.reset();
            } catch (err) {
                errorEl.textContent = 'Something went wrong. Please try again.';
            }
        });
    }

    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const userId = document.getElementById('editUserId').value;
            const payload = {
                firstName: document.getElementById('editFirstName').value,
                lastName: document.getElementById('editLastName').value,
                status: document.getElementById('editStatus').value
            };

            const errorEl = document.getElementById('editFormError');
            const successEl = document.getElementById('editFormSuccess');
            errorEl.textContent = '';
            successEl.textContent = '';

            try {
                const res = await fetch(`/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (!res.ok) {
                    errorEl.textContent = data.error || 'Update failed.';
                    return;
                }

                successEl.textContent = data.message || 'User updated successfully.';
                loadUsers();
                summaryStats();
            } catch (err) {
                errorEl.textContent = 'Something went wrong. Please try again.';
            }
        });
    }
});
