/**
 * PE OS - Admin Dashboard: Task Table, Filter/Sort, Upcoming Reviews
 * Extracted from admin-dashboard.js — all functions are globals.
 * Depends on: admin-dashboard.js (allTasks, allDeals, teamMembers),
 *             js/formatters.js (escapeHtml, formatRelativeTime),
 *             js/notifications.js (showNotification)
 */

// ─── Task Table ──────────────────────────────────────────────

let showAllTasks = false;
const TASK_PAGE_SIZE = 20;

function renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    if (allTasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-5 py-12 text-center text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">task_alt</span>
                    <p class="text-sm font-medium">No tasks yet</p>
                    <p class="text-xs mt-1 mb-3">Create your first task to start tracking work</p>
                    <button onclick="document.getElementById('create-task-btn')?.click()" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style="background-color: #003366">
                        <span class="material-symbols-outlined text-[16px]">add_task</span>
                        Create Task
                    </button>
                </td>
            </tr>`;
        updateToggleAllButton();
        return;
    }

    const displayTasks = showAllTasks ? allTasks : allTasks.slice(0, TASK_PAGE_SIZE);
    const now = new Date();

    tbody.innerHTML = displayTasks.map(task => {
        const isOverdue = task.dueDate && new Date(task.dueDate) < now && task.status !== 'COMPLETED';
        const assignee = task.assignee;
        const deal = task.deal;
        const initials = assignee ? getInitials(assignee.name || assignee.email) : '?';

        return `
            <tr class="hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}">
                <td class="px-5 py-4 font-medium text-text-main">
                    ${deal
                        ? `<a href="/deal.html?id=${deal.id}" class="hover:text-primary hover:underline transition-colors">${escapeHtml(task.title)}</a>`
                        : escapeHtml(task.title)}
                </td>
                <td class="px-5 py-4">${renderPriorityBadge(task.priority)}</td>
                <td class="px-5 py-4 ${isOverdue ? 'text-accent-danger font-medium' : 'text-text-main'}">${formatDueDate(task.dueDate, isOverdue)}</td>
                <td class="px-5 py-4">
                    ${assignee ? `
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full text-white text-[10px] font-medium flex items-center justify-center" style="background-color: #003366">${initials}</div>
                        <span class="text-text-secondary">${escapeHtml(assignee.name || assignee.email?.split('@')[0] || 'Unknown')}</span>
                    </div>` : '<span class="text-text-muted text-xs">Unassigned</span>'}
                </td>
                <td class="px-5 py-4">
                    ${deal ? `<a href="/deal.html?id=${deal.id}" class="text-primary font-medium hover:underline">${escapeHtml(deal.name)}</a>` : '<span class="text-text-muted text-xs">&mdash;</span>'}
                </td>
                <td class="px-5 py-4">
                    <div class="relative inline-block">
                        <button onclick="toggleStatusDropdown(event, '${task.id}')" class="cursor-pointer hover:opacity-80 transition-opacity">
                            ${renderStatusBadge(task.status, isOverdue)}
                        </button>
                        <div id="status-dropdown-${task.id}" class="hidden absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-border-subtle shadow-lg z-50">
                            <div class="py-1">
                                ${['PENDING', 'IN_PROGRESS', 'COMPLETED', 'STUCK'].map(s => `
                                    <button onclick="updateTaskStatus('${task.id}', '${s}')" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${task.status === s ? 'text-primary font-medium bg-primary-light/30' : 'text-text-main'}">
                                        ${renderStatusBadge(s, false)}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>`;
    }).join('');

    updateToggleAllButton();
}

function updateToggleAllButton() {
    const btn = document.getElementById('toggle-all-tasks');
    if (!btn) return;
    if (allTasks.length <= TASK_PAGE_SIZE) {
        btn.style.display = 'none';
    } else {
        btn.style.display = '';
        btn.innerHTML = showAllTasks
            ? 'Show recent <span class="material-symbols-outlined text-[16px]">expand_less</span>'
            : `View all ${allTasks.length} tasks <span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
    }
}

function initToggleAllTasks() {
    const btn = document.getElementById('toggle-all-tasks');
    if (btn) {
        btn.addEventListener('click', () => {
            showAllTasks = !showAllTasks;
            renderTaskTable();
        });
    }
}

function renderPriorityBadge(priority) {
    const styles = {
        URGENT: 'bg-red-50 text-accent-danger border-red-100',
        HIGH: 'bg-red-50 text-accent-danger border-red-100',
        MEDIUM: 'bg-slate-100 text-slate-600 border-slate-200',
        LOW: 'bg-gray-100 text-text-secondary border-gray-200',
    };
    const cls = styles[priority] || styles.MEDIUM;
    return `<span class="inline-flex items-center gap-1 ${cls} text-xs px-2.5 py-1 rounded-full font-medium border">${priority || 'Med'}</span>`;
}

function renderStatusBadge(status, isOverdue) {
    if (status === 'COMPLETED') {
        return '<span class="text-secondary flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">check_circle</span> Completed</span>';
    }
    if (isOverdue || status === 'STUCK') {
        return '<span class="text-accent-danger flex items-center gap-1.5 font-medium"><span class="material-symbols-outlined text-[16px]">error</span> ' + (status === 'STUCK' ? 'Stuck' : 'Overdue') + '</span>';
    }
    if (status === 'IN_PROGRESS') {
        return '<span class="text-primary flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> In Progress</span>';
    }
    return '<span class="text-text-muted flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Pending</span>';
}

function formatDueDate(dateStr, isOverdue) {
    if (!dateStr) return '<span class="text-text-muted">No date</span>';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (isOverdue) {
        const overdueDays = Math.abs(diffDays);
        return overdueDays === 0 ? 'Overdue (today)' : `Overdue (${overdueDays}d)`;
    }
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Upcoming Reviews Card ────────────────────────────────────

function renderUpcomingReviews() {
    const container = document.getElementById('upcoming-reviews-list');
    if (!container) return;

    // Find [Review] tasks that are not completed
    const reviews = allTasks
        .filter(t => t.title.startsWith('[Review]') && t.status !== 'COMPLETED')
        .sort((a, b) => {
            const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return da - db;
        })
        .slice(0, 3);

    if (reviews.length === 0) {
        container.innerHTML = `
            <p class="text-blue-200 text-sm mb-3">No upcoming reviews scheduled</p>
            <button onclick="document.getElementById('schedule-review-btn')?.click()" class="bg-white/10 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-white/20 transition-colors border border-white/20 flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px]">add</span>
                Schedule Review
            </button>
        `;
        return;
    }

    container.innerHTML = `
        <div class="space-y-3 mt-3">
            ${reviews.map(review => {
                const title = review.title.replace('[Review] ', '');
                const date = review.dueDate ? new Date(review.dueDate) : null;
                const assignee = review.assignee;
                const deal = review.deal;
                const isOverdue = date && date < new Date();
                const month = date ? date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
                const day = date ? date.getDate() : '?';

                return `
                    <div class="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                        <div class="flex items-center gap-3">
                            ${date ? `
                            <div class="bg-white text-primary rounded-lg px-2.5 py-1.5 text-center min-w-[50px] ${isOverdue ? 'bg-red-100 text-red-600' : ''}">
                                <span class="block text-[10px] font-bold uppercase tracking-wide">${month}</span>
                                <span class="block text-xl font-bold leading-none">${day}</span>
                            </div>` : ''}
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-sm truncate">${escapeHtml(title)}</p>
                                <p class="text-xs text-blue-200 mt-0.5">
                                    ${assignee ? escapeHtml(assignee.name || assignee.email?.split('@')[0]) : 'Unassigned'}
                                    ${deal ? ` · ${escapeHtml(deal.name)}` : ''}
                                    ${isOverdue ? ' · <span class="text-red-300 font-medium">Overdue</span>' : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ─── Task Filter & Sort ──────────────────────────────────────

let taskFilter = 'ALL'; // ALL, PENDING, IN_PROGRESS, COMPLETED, OVERDUE
let taskSortField = 'createdAt'; // createdAt, dueDate, priority
let taskSortAsc = false;

function initTaskFilterSort() {
    const filterBtn = document.getElementById('task-filter-btn');
    const sortBtn = document.getElementById('task-sort-btn');

    if (filterBtn) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFilterDropdown();
        });
    }

    if (sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSortDropdown();
        });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.task-dropdown').forEach(d => d.remove());
    });
}

function toggleFilterDropdown() {
    // Remove existing
    document.querySelectorAll('.task-dropdown').forEach(d => d.remove());

    const filterBtn = document.getElementById('task-filter-btn');
    const dropdown = document.createElement('div');
    dropdown.className = 'task-dropdown absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-border-subtle shadow-lg z-50';

    const filters = [
        { value: 'ALL', label: 'All Tasks', icon: 'list' },
        { value: 'PENDING', label: 'Pending', icon: 'hourglass_empty' },
        { value: 'IN_PROGRESS', label: 'In Progress', icon: 'play_circle' },
        { value: 'COMPLETED', label: 'Completed', icon: 'check_circle' },
        { value: 'OVERDUE', label: 'Overdue', icon: 'warning' },
    ];

    dropdown.innerHTML = `<div class="py-1">${filters.map(f => `
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${taskFilter === f.value ? 'text-primary font-medium bg-primary-light/30' : 'text-text-main'}" data-filter="${f.value}">
            <span class="material-symbols-outlined text-[16px]">${f.icon}</span>
            ${f.label}
            ${taskFilter === f.value ? '<span class="material-symbols-outlined text-[14px] ml-auto">check</span>' : ''}
        </button>
    `).join('')}</div>`;

    dropdown.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (btn) {
            taskFilter = btn.dataset.filter;
            applyTaskFilterSort();
            dropdown.remove();

            // Update filter button visual
            if (taskFilter !== 'ALL') {
                filterBtn.classList.add('text-primary', 'bg-primary-light/30');
                filterBtn.classList.remove('text-text-muted');
            } else {
                filterBtn.classList.remove('text-primary', 'bg-primary-light/30');
                filterBtn.classList.add('text-text-muted');
            }
        }
    });

    filterBtn.closest('.relative').appendChild(dropdown);
}

function toggleSortDropdown() {
    document.querySelectorAll('.task-dropdown').forEach(d => d.remove());

    const sortBtn = document.getElementById('task-sort-btn');
    const dropdown = document.createElement('div');
    dropdown.className = 'task-dropdown absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-border-subtle shadow-lg z-50';

    const sorts = [
        { value: 'createdAt', label: 'Date Created' },
        { value: 'dueDate', label: 'Due Date' },
        { value: 'priority', label: 'Priority' },
    ];

    dropdown.innerHTML = `<div class="py-1">${sorts.map(s => `
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${taskSortField === s.value ? 'text-primary font-medium bg-primary-light/30' : 'text-text-main'}" data-sort="${s.value}">
            ${s.label}
            ${taskSortField === s.value ? `<span class="material-symbols-outlined text-[14px] ml-auto">${taskSortAsc ? 'arrow_upward' : 'arrow_downward'}</span>` : ''}
        </button>
    `).join('')}
    <div class="border-t border-border-subtle mt-1 pt-1">
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-text-main" data-toggle-dir>
            <span class="material-symbols-outlined text-[16px]">swap_vert</span>
            ${taskSortAsc ? 'Ascending' : 'Descending'}
        </button>
    </div></div>`;

    dropdown.addEventListener('click', (e) => {
        const sortOption = e.target.closest('[data-sort]');
        const toggleDir = e.target.closest('[data-toggle-dir]');
        if (sortOption) {
            taskSortField = sortOption.dataset.sort;
            applyTaskFilterSort();
            dropdown.remove();
        } else if (toggleDir) {
            taskSortAsc = !taskSortAsc;
            applyTaskFilterSort();
            dropdown.remove();
        }
    });

    sortBtn.closest('.relative').appendChild(dropdown);
}

function applyTaskFilterSort() {
    const now = new Date();
    let filtered = [...allTasks];

    // Apply filter
    if (taskFilter === 'OVERDUE') {
        filtered = filtered.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED');
    } else if (taskFilter !== 'ALL') {
        filtered = filtered.filter(t => t.status === taskFilter);
    }

    // Apply sort
    const priorityRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    filtered.sort((a, b) => {
        let cmp = 0;
        if (taskSortField === 'priority') {
            cmp = (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2);
        } else if (taskSortField === 'dueDate') {
            const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            cmp = da - db;
        } else {
            cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return taskSortAsc ? cmp : -cmp;
    });

    // Render filtered results
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    // Update pending count badge
    const pendingEl = document.getElementById('pending-count');
    if (pendingEl) {
        const count = filtered.length;
        const label = taskFilter === 'ALL' ? `${allTasks.filter(t => t.status === 'PENDING' || t.status === 'STUCK').length} Pending` : `${count} ${taskFilter === 'OVERDUE' ? 'Overdue' : taskFilter.charAt(0) + taskFilter.slice(1).toLowerCase().replace('_', ' ')}`;
        pendingEl.textContent = label;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-5 py-12 text-center text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">filter_list_off</span>
                    <p class="text-sm font-medium">No tasks match this filter</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(task => {
        const isOverdue = task.dueDate && new Date(task.dueDate) < now && task.status !== 'COMPLETED';
        const assignee = task.assignee;
        const deal = task.deal;
        const initials = assignee ? getInitials(assignee.name || assignee.email) : '?';

        return `
            <tr class="hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}">
                <td class="px-5 py-4 font-medium text-text-main">${escapeHtml(task.title)}</td>
                <td class="px-5 py-4">${renderPriorityBadge(task.priority)}</td>
                <td class="px-5 py-4 ${isOverdue ? 'text-accent-danger font-medium' : 'text-text-main'}">${formatDueDate(task.dueDate, isOverdue)}</td>
                <td class="px-5 py-4">
                    ${assignee ? `
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-primary text-white text-[10px] font-medium flex items-center justify-center">${initials}</div>
                        <span class="text-text-secondary">${escapeHtml(assignee.name || assignee.email?.split('@')[0] || 'Unknown')}</span>
                    </div>` : '<span class="text-text-muted text-xs">Unassigned</span>'}
                </td>
                <td class="px-5 py-4">
                    ${deal ? `<span class="text-primary font-medium cursor-pointer hover:underline" onclick="window.location.href='/deal.html?id=${deal.id}'">${escapeHtml(deal.name)}</span>` : '<span class="text-text-muted text-xs">\u2014</span>'}
                </td>
                <td class="px-5 py-4">${renderStatusBadge(task.status, isOverdue)}</td>
            </tr>`;
    }).join('');
}

// ─── Inline Status Update ────────────────────────────────────

function toggleStatusDropdown(event, taskId) {
    event.stopPropagation();
    // Close all other dropdowns
    document.querySelectorAll('[id^="status-dropdown-"]').forEach(d => d.classList.add('hidden'));
    const dropdown = document.getElementById(`status-dropdown-${taskId}`);
    if (dropdown) dropdown.classList.toggle('hidden');
}

async function updateTaskStatus(taskId, newStatus) {
    // Close dropdown
    document.querySelectorAll('[id^="status-dropdown-"]').forEach(d => d.classList.add('hidden'));

    // Optimistic update: update local task immediately
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    const oldStatus = task.status;
    task.status = newStatus;
    renderTaskTable();
    renderStatsCards();

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
            // Revert on failure
            task.status = oldStatus;
            renderTaskTable();
            renderStatsCards();
            showNotification('Failed to update task status', 'error');
        } else {
            showNotification(`Task marked as ${newStatus.replace('_', ' ').toLowerCase()}`, 'success');
        }
    } catch (e) {
        task.status = oldStatus;
        renderTaskTable();
        renderStatsCards();
        showNotification('Failed to update task status', 'error');
    }
}

// Close status dropdowns on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('[id^="status-dropdown-"]').forEach(d => d.classList.add('hidden'));
});
