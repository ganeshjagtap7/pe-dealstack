/**
 * PE OS - Admin Dashboard (Command Center)
 * Wired to live platform data: users, deals, tasks, audit log
 */

const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

// Cached data
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

// ─── Task Table ──────────────────────────────────────────────

function renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    if (allTasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-5 py-12 text-center text-text-muted">
                    <span class="material-symbols-outlined text-[32px] mb-2 block">task_alt</span>
                    <p class="text-sm font-medium">No tasks yet</p>
                    <p class="text-xs mt-1">Create a task to get started</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = allTasks.map(task => {
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
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

function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Modals ──────────────────────────────────────────────────

function initModals() {
    // Assign Deal Modal
    const assignDealBtn = document.getElementById('assign-deal-btn');
    const assignDealModal = document.getElementById('assign-deal-modal');
    const closeAssignModal = document.getElementById('close-assign-modal');
    const cancelAssign = document.getElementById('cancel-assign');
    const assignModalBackdrop = document.getElementById('assign-modal-backdrop');
    const submitAssign = document.getElementById('submit-assign');

    if (assignDealBtn && assignDealModal) {
        assignDealBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(assignDealModal);
        });
        closeAssignModal?.addEventListener('click', () => closeModal(assignDealModal));
        cancelAssign?.addEventListener('click', () => closeModal(assignDealModal));
        assignModalBackdrop?.addEventListener('click', () => closeModal(assignDealModal));
    }

    if (submitAssign) {
        submitAssign.addEventListener('click', handleAssignDeal);
    }

    // Create Task Modal
    const createTaskBtn = document.getElementById('create-task-btn');
    const createTaskModal = document.getElementById('create-task-modal');
    const closeTaskModal = document.getElementById('close-task-modal');
    const cancelTask = document.getElementById('cancel-task');
    const taskModalBackdrop = document.getElementById('task-modal-backdrop');
    const submitTask = document.getElementById('submit-task');

    if (createTaskBtn && createTaskModal) {
        createTaskBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(createTaskModal);
        });
        closeTaskModal?.addEventListener('click', () => closeModal(createTaskModal));
        cancelTask?.addEventListener('click', () => closeModal(createTaskModal));
        taskModalBackdrop?.addEventListener('click', () => closeModal(createTaskModal));
    }

    if (submitTask) {
        submitTask.addEventListener('click', handleCreateTask);
    }

    // Schedule Review Modal
    const scheduleReviewBtn = document.getElementById('schedule-review-btn');
    const scheduleReviewModal = document.getElementById('schedule-review-modal');
    const closeReviewModal = document.getElementById('close-review-modal');
    const cancelReview = document.getElementById('cancel-review');
    const reviewModalBackdrop = document.getElementById('review-modal-backdrop');
    const submitReview = document.getElementById('submit-review');

    if (scheduleReviewBtn && scheduleReviewModal) {
        scheduleReviewBtn.addEventListener('click', () => {
            populateModalDropdowns();
            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateInput = document.getElementById('review-date-input');
            if (dateInput) dateInput.value = tomorrow.toISOString().split('T')[0];
            openModal(scheduleReviewModal);
        });
        closeReviewModal?.addEventListener('click', () => closeModal(scheduleReviewModal));
        cancelReview?.addEventListener('click', () => closeModal(scheduleReviewModal));
        reviewModalBackdrop?.addEventListener('click', () => closeModal(scheduleReviewModal));
    }

    if (submitReview) {
        submitReview.addEventListener('click', handleScheduleReview);
    }

    // Send Reminder Modal
    const sendReminderBtn = document.getElementById('send-reminder-btn');
    const sendReminderModal = document.getElementById('send-reminder-modal');
    const closeReminderModal = document.getElementById('close-reminder-modal');
    const cancelReminder = document.getElementById('cancel-reminder');
    const reminderModalBackdrop = document.getElementById('reminder-modal-backdrop');
    const submitReminder = document.getElementById('submit-reminder');

    if (sendReminderBtn && sendReminderModal) {
        sendReminderBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(sendReminderModal);
        });
        closeReminderModal?.addEventListener('click', () => closeModal(sendReminderModal));
        cancelReminder?.addEventListener('click', () => closeModal(sendReminderModal));
        reminderModalBackdrop?.addEventListener('click', () => closeModal(sendReminderModal));
    }

    if (submitReminder) {
        submitReminder.addEventListener('click', handleSendReminder);
    }

    // Task filter/sort buttons
    initTaskFilterSort();

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [assignDealModal, createTaskModal, scheduleReviewModal, sendReminderModal].forEach(modal => {
                if (modal && !modal.classList.contains('hidden')) closeModal(modal);
            });
        }
    });
}

function populateModalDropdowns() {
    // Deal dropdowns
    document.querySelectorAll('#assign-deal-select, #task-deal-select, #review-deal-select, #reminder-deal-select').forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Choose a deal...</option>';
        allDeals.forEach(deal => {
            const size = deal.dealSize ? ` - ${formatCurrency(deal.dealSize)}` : '';
            select.innerHTML += `<option value="${deal.id}">${escapeHtml(deal.name)}${size}</option>`;
        });
        if (current) select.value = current;
    });

    // User dropdowns
    document.querySelectorAll('#assign-user-select, #task-user-select, #review-user-select, #reminder-user-select').forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Choose a team member...</option>';
        teamMembers.forEach(user => {
            const label = user.name || user.email.split('@')[0];
            const role = user.title || user.role || '';
            select.innerHTML += `<option value="${user.id}">${escapeHtml(label)}${role ? ' - ' + escapeHtml(role) : ''}</option>`;
        });
        if (current) select.value = current;
    });
}

async function handleAssignDeal() {
    const dealId = document.getElementById('assign-deal-select')?.value;
    const userId = document.getElementById('assign-user-select')?.value;
    const role = document.querySelector('input[name="role"]:checked')?.value || 'analyst';

    if (!dealId || !userId) {
        showNotification('Please select both a deal and a team member', 'error');
        return;
    }

    const btn = document.getElementById('submit-assign');
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role }),
        });

        if (response.ok) {
            showNotification('Deal assigned successfully', 'success');
            closeModal(document.getElementById('assign-deal-modal'));
            await loadDeals();
            renderResourceAllocation();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to assign deal', 'error');
        }
    } catch (e) {
        showNotification('Failed to assign deal', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Assign Deal'; }
    }
}

async function handleCreateTask() {
    const title = document.getElementById('task-title-input')?.value?.trim();
    const assignedTo = document.getElementById('task-user-select')?.value || undefined;
    const dealId = document.getElementById('task-deal-select')?.value || undefined;
    const dueDate = document.getElementById('task-due-date')?.value || undefined;
    const priority = document.getElementById('task-priority-select')?.value || 'MEDIUM';
    const description = document.getElementById('task-description')?.value?.trim() || undefined;

    if (!title) {
        showNotification('Please enter a task title', 'error');
        return;
    }

    const btn = document.getElementById('submit-task');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, assignedTo, dealId, dueDate, priority: priority.toUpperCase(), description }),
        });

        if (response.ok) {
            showNotification('Task created successfully', 'success');
            closeModal(document.getElementById('create-task-modal'));
            // Clear form
            ['task-title-input', 'task-user-select', 'task-deal-select', 'task-due-date', 'task-description'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await loadTasks();
            renderStatsCards();
            renderTaskTable();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to create task', 'error');
        }
    } catch (e) {
        showNotification('Failed to create task', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Create Task'; }
    }
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

// ─── Schedule Review ─────────────────────────────────────────

async function handleScheduleReview() {
    const title = document.getElementById('review-title-input')?.value?.trim();
    const dealId = document.getElementById('review-deal-select')?.value || undefined;
    const assignedTo = document.getElementById('review-user-select')?.value || undefined;
    const dueDate = document.getElementById('review-date-input')?.value || undefined;
    const priority = document.getElementById('review-priority-select')?.value || 'MEDIUM';
    const notes = document.getElementById('review-notes')?.value?.trim() || undefined;

    if (!title) {
        showNotification('Please enter a review title', 'error');
        return;
    }
    if (!dueDate) {
        showNotification('Please select a review date', 'error');
        return;
    }

    const btn = document.getElementById('submit-review');
    if (btn) { btn.disabled = true; btn.textContent = 'Scheduling...'; }

    try {
        // Create as a task with "[Review]" prefix
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `[Review] ${title}`,
                assignedTo,
                dealId,
                dueDate,
                priority: priority.toUpperCase(),
                description: notes ? `Review Notes: ${notes}` : undefined,
            }),
        });

        if (response.ok) {
            showNotification('Review scheduled successfully', 'success');
            closeModal(document.getElementById('schedule-review-modal'));
            // Clear form
            ['review-title-input', 'review-deal-select', 'review-user-select', 'review-date-input', 'review-notes'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await loadTasks();
            renderStatsCards();
            renderTaskTable();
            renderUpcomingReviews();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to schedule review', 'error');
        }
    } catch (e) {
        showNotification('Failed to schedule review', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Schedule Review'; }
    }
}

// ─── Send Reminder ───────────────────────────────────────────

async function handleSendReminder() {
    const userId = document.getElementById('reminder-user-select')?.value;
    const message = document.getElementById('reminder-message')?.value?.trim();
    const dealId = document.getElementById('reminder-deal-select')?.value || undefined;

    if (!userId) {
        showNotification('Please select a team member', 'error');
        return;
    }
    if (!message) {
        showNotification('Please enter a reminder message', 'error');
        return;
    }

    const btn = document.getElementById('submit-reminder');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                type: 'SYSTEM',
                title: 'Reminder from Admin',
                message,
                dealId: dealId || undefined,
            }),
        });

        if (response.ok) {
            showNotification('Reminder sent successfully', 'success');
            closeModal(document.getElementById('send-reminder-modal'));
            document.getElementById('reminder-message').value = '';
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to send reminder', 'error');
        }
    } catch (e) {
        showNotification('Failed to send reminder', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reminder'; }
    }
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

// ─── UI Helpers ──────────────────────────────────────────────

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function updateLastUpdated() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = 'Just now';
}

function formatCurrency(amount) {
    if (!amount || amount === 0) return '$0';
    // dealSize is stored in millions
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}B`;
    if (amount >= 1) return `$${amount.toFixed(0)}M`;
    return `$${(amount * 1000).toFixed(0)}K`;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all duration-300 translate-y-full opacity-0';

    if (type === 'success') notification.classList.add('bg-secondary', 'text-white');
    else if (type === 'error') notification.classList.add('bg-accent-danger', 'text-white');
    else notification.classList.add('bg-primary', 'text-white');

    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';

    notification.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${icon}</span>
        <span class="text-sm font-medium">${message}</span>
    `;

    document.body.appendChild(notification);
    requestAnimationFrame(() => notification.classList.remove('translate-y-full', 'opacity-0'));

    setTimeout(() => {
        notification.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Export for potential external use
window.AdminDashboard = {
    loadTeamMembers,
    loadDeals,
    loadTasks,
    showNotification,
};
