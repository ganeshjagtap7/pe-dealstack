/**
 * PE OS - Admin Dashboard (Command Center)
 * Wired to live platform data: users, deals, tasks, audit log
 *
 * Split into 3 files:
 *   admin-tasks.js  — Task table, filter/sort, upcoming reviews
 *   admin-modals.js — Modal init, handlers (assign, task, review, reminder)
 *   admin-dashboard.js (this file) — Init, data loading, stats, resource allocation, activity feed
 */

// API_BASE_URL loaded from js/config.js

// Cached data (shared across all 3 files via globals)
let teamMembers = [];
let allDeals = [];
let allTasks = [];
let currentUser = null;

// Wait for layout to be ready
window.addEventListener('pe-layout-ready', function() {
    initAdminDashboard();
});

async function initAdminDashboard() {
    // Load current user and check permissions
    try {
        const resp = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
        if (resp.ok) currentUser = await resp.json();
    } catch (e) {
        console.warn('Could not load current user', e);
    }

    // RBAC gate: only admin/partner/principal can access
    const role = (currentUser?.role || '').toLowerCase();
    if (!['admin', 'partner', 'principal'].includes(role)) {
        window.location.href = '/crm.html';
        return;
    }

    // Hide management actions for non-admin roles
    if (role !== 'admin') {
        const assignBtn = document.getElementById('assign-deal-btn');
        const taskBtn = document.getElementById('create-task-btn');
        if (assignBtn) assignBtn.style.display = 'none';
        if (taskBtn) taskBtn.style.display = 'none';
    }

    initModals();
    initCardScrollLinks();
    initResourceToggle();
    initLoadMoreActivity();
    initAuditFilters();
    updateLastUpdated();
    setInterval(updateLastUpdated, 60000);

    // Load all data in parallel
    await Promise.all([
        loadTeamMembers(),
        loadDeals(),
        loadTasks(),
    ]);

    renderStatsCards();
    try {
        renderResourceAllocation();
    } catch (e) {
        const container = document.getElementById('resource-allocation');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-8 text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">cloud_off</span>
                    <p class="text-sm font-medium">Could not load team data</p>
                    <button onclick="renderResourceAllocation()" class="mt-3 text-sm text-primary font-medium hover:text-primary-hover transition-colors">Retry</button>
                </div>`;
        }
    }
    renderTaskTable();
    renderUpcomingReviews();
    loadActivityFeed();
}

// ─── Data Loading ────────────────────────────────────────────

async function loadTeamMembers() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/users?isActive=true`);
        if (response.ok) {
            teamMembers = await response.json();
        }
    } catch (e) {
        console.warn('Could not fetch team data:', e);
    }
}

async function loadDeals() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals`);
        if (response.ok) {
            const data = await response.json();
            allDeals = Array.isArray(data) ? data : (data.deals || []);
        }
    } catch (e) {
        console.warn('Could not fetch deals:', e);
    }
}

async function loadTasks() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks?limit=100`);
        if (response.ok) {
            const data = await response.json();
            allTasks = data.tasks || [];
        }
    } catch (e) {
        console.warn('Could not fetch tasks:', e);
    }
}

// ─── Stats Cards ─────────────────────────────────────────────

function renderStatsCards() {
    const activeMembers = teamMembers.filter(m => m.isActive !== false);
    const totalMembers = teamMembers.length;

    // Team count — show active / total
    setCardValue('analyst-count', activeMembers.length);
    setCardSubtitle('analyst-subtitle', `${activeMembers.length} active / ${totalMembers} total`);

    // Deal volume
    const totalVolume = allDeals.reduce((sum, d) => sum + (d.dealSize || 0), 0);
    setCardValue('deal-volume', formatCurrency(totalVolume));
    setCardSubtitle('deal-subtitle', `across ${allDeals.length} deal${allDeals.length !== 1 ? 's' : ''}`);

    // Overdue tasks
    const now = new Date();
    const overdueTasks = allTasks.filter(t =>
        t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
    );
    const dueThisWeek = allTasks.filter(t => {
        if (!t.dueDate || t.status === 'COMPLETED') return false;
        const due = new Date(t.dueDate);
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return due >= now && due <= weekFromNow;
    });
    setCardValue('overdue-tasks', overdueTasks.length);
    if (overdueTasks.length > 0) {
        document.getElementById('overdue-tasks')?.setAttribute('style', 'color: #ef4444');
        setCardSubtitle('overdue-subtitle', `${dueThisWeek.length} due this week`);
    } else {
        document.getElementById('overdue-tasks')?.setAttribute('style', 'color: #003366');
        setCardSubtitle('overdue-subtitle', `${dueThisWeek.length} due this week`);
    }

    // Utilization
    const membersWithDeals = new Set();
    allDeals.forEach(d => {
        if (d.teamMembers) d.teamMembers.forEach(tm => membersWithDeals.add(tm.userId));
    });
    const assignedCount = membersWithDeals.size;
    const utilization = totalMembers > 0 ? Math.round((assignedCount / totalMembers) * 100) : 0;
    setCardValue('utilization', `${Math.min(100, utilization)}%`);
    setCardSubtitle('utilization-subtitle', `${assignedCount}/${totalMembers} members assigned`);

    // Pending count badge in task table header
    const pendingTasks = allTasks.filter(t => t.status === 'PENDING' || t.status === 'STUCK');
    const pendingEl = document.getElementById('pending-count');
    if (pendingEl) pendingEl.textContent = `${pendingTasks.length} Pending`;
}

function setCardValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setCardSubtitle(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ─── Card Click → Scroll to Section ─────────────────────────

function initCardScrollLinks() {
    document.querySelectorAll('[data-scroll-to]').forEach(card => {
        card.addEventListener('click', () => {
            const targetId = card.getAttribute('data-scroll-to');
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // If clicking overdue card, auto-filter tasks to overdue
            if (card.id === 'card-overdue') {
                taskFilter = 'OVERDUE';
                applyTaskFilterSort();
                const filterBtn = document.getElementById('task-filter-btn');
                if (filterBtn) {
                    filterBtn.classList.add('text-primary', 'bg-primary-light/30');
                    filterBtn.classList.remove('text-text-muted');
                }
            }
        });
    });
}

// ─── Resource Allocation ─────────────────────────────────────

let resourceExpanded = false;

function renderResourceAllocation() {
    const container = document.getElementById('resource-allocation');
    if (!container) return;

    if (teamMembers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-[32px] mb-2 block">groups</span>
                <p class="text-sm font-medium">No team members yet</p>
                <p class="text-xs mt-1 mb-3">Invite your first team member to get started</p>
                <a href="/settings.html" class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style="background-color: #003366">
                    <span class="material-symbols-outlined text-[16px]">person_add</span>
                    Invite Team
                </a>
            </div>`;
        return;
    }

    // Build memberId → [dealNames] map from already-loaded allDeals.
    // This replaces N sequential HTTP calls (one per member) with a single pass.
    const dealsByMember = new Map();
    allDeals.forEach(d => {
        const name = d.name || d.dealName || 'Unknown';
        (d.teamMembers || []).forEach(tm => {
            // Handle both shapes: nested {user: {id}} from joined query, or flat {userId}
            const uid = tm.user?.id || tm.userId;
            if (!uid) return;
            if (!dealsByMember.has(uid)) dealsByMember.set(uid, []);
            dealsByMember.get(uid).push(name);
        });
    });

    const displayLimit = resourceExpanded ? teamMembers.length : 8;
    const membersToShow = teamMembers.slice(0, displayLimit);
    const memberHtml = [];

    for (const member of membersToShow) {
        const memberDeals = dealsByMember.get(member.id) || [];
        const dealNames = memberDeals.slice(0, 3);
        const taskCount = allTasks.filter(t => t.assignedTo === member.id && t.status !== 'COMPLETED').length;
        const capacity = Math.min(100, Math.round((memberDeals.length / 5) * 100));
        const initials = getInitials(member.name || member.email);
        const capacityColor = capacity >= 80 ? '#ef4444' : capacity >= 50 ? '#f59e0b' : '#003366';

        memberHtml.push(`
            <div class="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 rounded-full text-white text-sm font-medium flex items-center justify-center flex-shrink-0" style="background-color: #003366">${initials}</div>
                <div class="w-28 flex-shrink-0">
                    <p class="text-sm font-medium text-text-main">${escapeHtml(member.name || member.email.split('@')[0])}</p>
                    <p class="text-xs text-text-muted">${escapeHtml(member.title || member.role || 'Member')}</p>
                </div>
                <div class="flex-1 grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-text-muted mb-1.5">Active Deals</p>
                        <div class="flex gap-1 flex-wrap">
                            ${dealNames.length > 0
                                ? dealNames.map(n => `<span class="text-xs bg-gray-100 text-text-secondary px-2 py-0.5 rounded border border-border-subtle">${escapeHtml(n)}</span>`).join('')
                                : '<span class="text-xs text-text-muted">None</span>'}
                        </div>
                    </div>
                    <div>
                        <p class="text-xs text-text-muted mb-1.5">Capacity (${capacity}%)</p>
                        <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all" style="width: ${capacity}%; background-color: ${capacityColor}"></div>
                        </div>
                    </div>
                </div>
                <div class="text-right w-14 flex-shrink-0">
                    <span class="block text-lg font-bold text-text-main">${taskCount}</span>
                    <span class="text-xs text-text-muted">Tasks</span>
                </div>
            </div>`);
    }

    container.innerHTML = memberHtml.join('');

    // Update toggle button text
    const toggleBtn = document.getElementById('toggle-resource-detail');
    if (toggleBtn) {
        if (teamMembers.length <= 8) {
            toggleBtn.style.display = 'none';
        } else {
            toggleBtn.style.display = '';
            toggleBtn.textContent = resourceExpanded ? 'Show Less' : `View All (${teamMembers.length})`;
        }
    }
}

function initResourceToggle() {
    const toggleBtn = document.getElementById('toggle-resource-detail');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            resourceExpanded = !resourceExpanded;
            renderResourceAllocation();
        });
    }
}

// ─── Activity Feed ───────────────────────────────────────────

let activityOffset = 0;
const ACTIVITY_PAGE_SIZE = 10;
let allActivityLogs = [];
let currentAuditFilters = {};

function buildAuditQueryParams(includePagination = true) {
    const params = new URLSearchParams();
    if (includePagination) {
        params.set('limit', String(ACTIVITY_PAGE_SIZE));
        params.set('offset', String(activityOffset));
    }
    if (currentAuditFilters.startDate) params.set('startDate', currentAuditFilters.startDate);
    if (currentAuditFilters.endDate) params.set('endDate', currentAuditFilters.endDate);
    if (currentAuditFilters.action) params.set('action', currentAuditFilters.action);
    if (currentAuditFilters.resourceType) params.set('resourceType', currentAuditFilters.resourceType);
    return params;
}

async function loadActivityFeed(append = false) {
    const container = document.querySelector('.activity-timeline .space-y-5');
    if (!container) return;

    if (!append) {
        activityOffset = 0;
        allActivityLogs = [];
    }

    try {
        const params = buildAuditQueryParams(true);
        const response = await PEAuth.authFetch(`${API_BASE_URL}/audit?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch audit logs');

        const data = await response.json();
        const logs = data.logs || [];
        allActivityLogs = append ? allActivityLogs.concat(logs) : logs;
        activityOffset += logs.length;

        if (allActivityLogs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">rss_feed</span>
                    <p class="text-sm font-medium">No activity yet</p>
                    <p class="text-xs mt-1">Actions across your org will appear here</p>
                </div>`;
            updateLoadMoreButton(false);
            return;
        }

        // Group logs by day
        const grouped = groupLogsByDay(allActivityLogs);
        let html = '';

        for (const [dayLabel, dayLogs] of grouped) {
            html += `<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mt-2 mb-2 first:mt-0">${dayLabel}</p>`;
            html += dayLogs.map(log => renderActivityItem(log)).join('');
        }

        container.innerHTML = html;

        // Show/hide load more button
        const hasMore = logs.length === ACTIVITY_PAGE_SIZE;
        updateLoadMoreButton(hasMore);

    } catch (e) {
        console.warn('Could not load activity feed:', e);
        if (!append) {
            container.innerHTML = `
                <div class="text-center py-8 text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">cloud_off</span>
                    <p class="text-sm font-medium">Could not load activity</p>
                    <button onclick="loadActivityFeed()" class="mt-3 text-sm text-primary font-medium hover:text-primary-hover transition-colors">Retry</button>
                </div>`;
        }
    }
}

// groupLogsByDay, renderActivityItem, formatAuditAction, getInitials, getTimeAgo
// are now provided by js/widgets/activity-formatters.js (loaded in admin-dashboard.html
// before this file). Both this page and the dashboard's Recent Activity widget use
// the same implementations.

function updateLoadMoreButton(hasMore) {
    const btn = document.getElementById('load-more-activity');
    if (!btn) return;
    if (hasMore) {
        btn.style.display = '';
        btn.textContent = 'VIEW FULL HISTORY';
        btn.disabled = false;
    } else {
        btn.style.display = 'none';
    }
}

function initLoadMoreActivity() {
    const btn = document.getElementById('load-more-activity');
    if (btn) {
        btn.addEventListener('click', async () => {
            btn.textContent = 'LOADING...';
            btn.disabled = true;
            await loadActivityFeed(true);
        });
    }
}

// ─── Audit filter row + CSV export ──────────────────────────

function initAuditFilters() {
    const startEl = document.getElementById('audit-filter-start');
    const endEl = document.getElementById('audit-filter-end');
    const actionEl = document.getElementById('audit-filter-action');
    const resourceEl = document.getElementById('audit-filter-resource');
    const applyBtn = document.getElementById('audit-filter-apply');
    const resetBtn = document.getElementById('audit-filter-reset');
    const exportBtn = document.getElementById('audit-export-csv');

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            currentAuditFilters = {
                startDate: startEl && startEl.value
                    ? new Date(startEl.value).toISOString()
                    : '',
                endDate: endEl && endEl.value
                    ? new Date(endEl.value + 'T23:59:59').toISOString()
                    : '',
                action: (actionEl && actionEl.value) || '',
                resourceType: (resourceEl && resourceEl.value) || '',
            };
            loadActivityFeed(false);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentAuditFilters = {};
            if (startEl) startEl.value = '';
            if (endEl) endEl.value = '';
            if (actionEl) actionEl.value = '';
            if (resourceEl) resourceEl.value = '';
            loadActivityFeed(false);
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const originalLabel = exportBtn.innerHTML;
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span> Exporting...';
            try {
                const params = buildAuditQueryParams(false);
                const url = `${API_BASE_URL}/audit/export.csv?${params.toString()}`;
                const res = await PEAuth.authFetch(url);
                if (!res.ok) {
                    if (res.status === 403) {
                        if (typeof showNotification === 'function') {
                            showNotification('error', 'Admin role required to export audit log');
                        } else {
                            alert('Admin role required to export audit log.');
                        }
                    } else {
                        if (typeof showNotification === 'function') {
                            showNotification('error', 'Export failed. Please try again.');
                        } else {
                            alert('Export failed.');
                        }
                    }
                    return;
                }
                const blob = await res.blob();
                const a = document.createElement('a');
                const objectUrl = URL.createObjectURL(blob);
                a.href = objectUrl;
                a.download = `pocket-fund-audit-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
                if (typeof showNotification === 'function') {
                    showNotification('success', 'Audit log exported');
                }
            } catch (err) {
                console.error('audit export failed', err);
                if (typeof showNotification === 'function') {
                    showNotification('error', 'Export failed. Please try again.');
                } else {
                    alert('Export failed.');
                }
            } finally {
                exportBtn.disabled = false;
                exportBtn.innerHTML = originalLabel;
            }
        });
    }
}

// formatAuditAction + getTimeAgo provided by js/widgets/activity-formatters.js

// ─── UI Helpers ──────────────────────────────────────────────

function updateLastUpdated() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = 'Just now';
}

// formatCurrency, escapeHtml — now in js/formatters.js
// showNotification — now in js/notifications.js

// getInitials provided by js/widgets/activity-formatters.js

// Export for potential external use
window.AdminDashboard = {
    loadTeamMembers,
    loadDeals,
    loadTasks,
    showNotification,
};
