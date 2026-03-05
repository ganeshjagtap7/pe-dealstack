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
    updateLastUpdated();
    setInterval(updateLastUpdated, 60000);

    // Load all data in parallel
    await Promise.all([
        loadTeamMembers(),
        loadDeals(),
        loadTasks(),
    ]);

    renderStatsCards();
    renderResourceAllocation();
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
    // Team count
    const teamCount = teamMembers.length;
    setCardValue('analyst-count', teamCount);

    // Deal volume (dealSize is stored in millions)
    const totalVolume = allDeals.reduce((sum, d) => sum + (d.dealSize || 0), 0);
    setCardValue('deal-volume', formatCurrency(totalVolume));

    // Overdue / pending tasks
    const now = new Date();
    const pendingTasks = allTasks.filter(t => t.status === 'PENDING' || t.status === 'STUCK');
    const overdueTasks = allTasks.filter(t =>
        t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
    );
    setCardValue('overdue-tasks', overdueTasks.length || pendingTasks.length);

    // Utilization: (members with at least 1 deal assignment / total members)
    const membersWithDeals = new Set();
    allDeals.forEach(d => {
        if (d.teamMembers) d.teamMembers.forEach(tm => membersWithDeals.add(tm.userId));
    });
    const utilization = teamCount > 0 ? Math.round((membersWithDeals.size / teamCount) * 100) : 0;
    setCardValue('utilization', `${Math.min(100, utilization)}%`);

    // Update progress bars
    updateProgressBar('analyst-count', Math.min(100, teamCount * 10));
    updateProgressBar('deal-volume', Math.min(100, (totalVolume / 1000) * 10));
    updateProgressBar('overdue-tasks', overdueTasks.length > 0 ? Math.min(100, overdueTasks.length * 20) : 10);
    updateProgressBar('utilization', Math.min(100, utilization));

    // Pending count badge
    const pendingEl = document.getElementById('pending-count');
    if (pendingEl) pendingEl.textContent = `${pendingTasks.length} Pending`;
}

function setCardValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateProgressBar(cardId, percent) {
    const card = document.getElementById(cardId)?.closest('.rounded-lg');
    if (!card) return;
    const bars = card.querySelectorAll('.rounded-full');
    // Find the colored bar (not the gray track)
    for (const bar of bars) {
        if (bar.classList.contains('bg-gray-100') || bar.classList.contains('overflow-hidden')) continue;
        if (bar.classList.contains('h-1.5') || bar.style.width) {
            bar.style.width = `${percent}%`;
            break;
        }
    }
}

// ─── Resource Allocation ─────────────────────────────────────

async function renderResourceAllocation() {
    const container = document.getElementById('resource-allocation');
    if (!container) return;

    if (teamMembers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-[32px] mb-2 block">groups</span>
                <p class="text-sm">No team members found</p>
            </div>`;
        return;
    }

    // Fetch deal assignments for each member (limit to first 8)
    const memberHtml = [];
    for (const member of teamMembers.slice(0, 8)) {
        let dealNames = [];
        let taskCount = 0;

        try {
            const resp = await PEAuth.authFetch(`${API_BASE_URL}/users/${member.id}/deals`);
            if (resp.ok) {
                const deals = await resp.json();
                dealNames = (Array.isArray(deals) ? deals : []).slice(0, 3).map(d => d.name || d.dealName || 'Unknown');
            }
        } catch (e) { /* ignore */ }

        taskCount = allTasks.filter(t => t.assignedTo === member.id && t.status !== 'COMPLETED').length;
        const capacity = Math.min(100, dealNames.length * 25 + taskCount * 10);
        const initials = getInitials(member.name || member.email);

        memberHtml.push(`
            <div class="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center flex-shrink-0">${initials}</div>
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
                            <div class="bg-primary h-full rounded-full" style="width: ${capacity}%"></div>
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
}

// ─── Activity Feed ───────────────────────────────────────────

async function loadActivityFeed() {
    const container = document.querySelector('.activity-timeline .space-y-5');
    if (!container) return;

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/audit?limit=10`);
        if (!response.ok) throw new Error('Failed to fetch audit logs');

        const data = await response.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-text-muted">
                    <span class="material-symbols-outlined text-[24px] mb-2 block">rss_feed</span>
                    <p class="text-sm">No recent activity</p>
                </div>`;
            return;
        }

        container.innerHTML = logs.map(log => {
            const userName = log.userEmail?.split('@')[0] || 'System';
            const initials = getInitials(userName);
            const { text, icon } = formatAuditAction(log);
            const timeAgo = getTimeAgo(log.createdAt);
            const isAI = log.action?.startsWith('AI_');

            return `
                <div class="flex gap-3 relative z-10">
                    <div class="relative flex-shrink-0">
                        <div class="w-9 h-9 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">
                            ${isAI ? '<span class="material-symbols-outlined text-[18px]">auto_awesome</span>' : initials}
                        </div>
                        <div class="absolute -bottom-0.5 -right-0.5 bg-primary rounded-full w-4 h-4 flex items-center justify-center border-2 border-white">
                            <span class="material-symbols-outlined text-white text-[10px]">${icon}</span>
                        </div>
                    </div>
                    <div class="flex-1 pt-0.5">
                        <p class="text-sm text-text-main">
                            <span class="font-semibold${isAI ? ' text-primary' : ''}">${isAI ? 'PE OS AI' : escapeHtml(userName)}</span> ${text}
                        </p>
                        <p class="text-xs text-text-muted mt-1">${timeAgo}</p>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        console.warn('Could not load activity feed:', e);
    }
}

function formatAuditAction(log) {
    const entity = log.entityName || log.resourceName || '';
    const entityHtml = entity ? `<span class="text-primary font-medium">${escapeHtml(entity)}</span>` : '';

    const actionMap = {
        'DEAL_CREATED': { text: `created deal ${entityHtml}`, icon: 'add_circle' },
        'DEAL_UPDATED': { text: `updated ${entityHtml}`, icon: 'edit' },
        'DEAL_DELETED': { text: `deleted deal ${entityHtml}`, icon: 'delete' },
        'DEAL_STAGE_CHANGED': { text: `moved ${entityHtml} to a new stage`, icon: 'arrow_forward' },
        'DEAL_ASSIGNED': { text: `assigned ${entityHtml}`, icon: 'person_add' },
        'DOCUMENT_UPLOADED': { text: `uploaded ${entityHtml}`, icon: 'upload_file' },
        'DOCUMENT_DELETED': { text: `deleted document ${entityHtml}`, icon: 'delete' },
        'DOCUMENT_DOWNLOADED': { text: `downloaded ${entityHtml}`, icon: 'download' },
        'MEMO_CREATED': { text: `created memo ${entityHtml}`, icon: 'description' },
        'MEMO_UPDATED': { text: `updated memo ${entityHtml}`, icon: 'edit_note' },
        'MEMO_EXPORTED': { text: `exported memo ${entityHtml}`, icon: 'file_download' },
        'USER_CREATED': { text: `added team member ${entityHtml}`, icon: 'person_add' },
        'USER_UPDATED': { text: `updated user ${entityHtml}`, icon: 'manage_accounts' },
        'USER_INVITED': { text: `invited ${entityHtml}`, icon: 'mail' },
        'INVITATION_SENT': { text: `sent invitation to ${entityHtml}`, icon: 'send' },
        'INVITATION_ACCEPTED': { text: `${entityHtml} accepted invitation`, icon: 'how_to_reg' },
        'AI_INGEST': { text: `ingested document ${entityHtml}`, icon: 'auto_awesome' },
        'AI_GENERATE': { text: `generated analysis for ${entityHtml}`, icon: 'auto_awesome' },
        'LOGIN': { text: 'logged in', icon: 'login' },
        'SETTINGS_CHANGED': { text: 'updated settings', icon: 'settings' },
    };

    return actionMap[log.action] || { text: `performed ${log.action || 'an action'}`, icon: 'info' };
}

// getTimeAgo -> use formatRelativeTime() from js/formatters.js
var getTimeAgo = formatRelativeTime;

// ─── UI Helpers ──────────────────────────────────────────────

function updateLastUpdated() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = 'Just now';
}

// formatCurrency, escapeHtml — now in js/formatters.js
// showNotification — now in js/notifications.js

function getInitials(name) {
    if (!name) return '?';
    return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Export for potential external use
window.AdminDashboard = {
    loadTeamMembers,
    loadDeals,
    loadTasks,
    showNotification,
};
