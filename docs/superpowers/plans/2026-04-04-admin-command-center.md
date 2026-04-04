# Admin Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Admin Command Center fully production-ready for real-world ops managers at PE firms and search funds — fix dead links, add error states, meaningful stats, inline task status editing, and expand-in-place patterns.

**Architecture:** Single page (`admin-dashboard.html`) with 3-file JS split. All sections pull from real API data. No new pages — "View more" buttons expand content in-place. Stats cards get clickable scroll-to-section behavior. Task status editable inline via dropdown.

**Tech Stack:** Vanilla JS, Tailwind CSS (CDN), existing API endpoints (`/tasks`, `/audit`, `/users`, `/deals`)

**Spec:** `docs/superpowers/specs/2026-04-04-admin-command-center-design.md`

---

### Task 1: Rewrite Stats Cards HTML — Remove Progress Bars, Add Context Subtitles

**Files:**
- Modify: `apps/web/admin-dashboard.html:119-178`

Replace the 4 stats cards grid. Remove the hardcoded progress bars and static subtitle text. Add `id` attributes for subtitles and make cards clickable with `data-scroll-to` attributes.

- [ ] **Step 1: Replace stats cards HTML**

Replace the entire stats cards grid (lines 119-178) in `admin-dashboard.html` with:

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
    <!-- Team Card -->
    <div class="relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer" data-scroll-to="resource-allocation" id="card-team">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-text-secondary">Team</span>
            <span class="material-symbols-outlined text-text-muted text-[20px]">groups</span>
        </div>
        <div class="flex items-end gap-2 mt-3">
            <h3 class="text-3xl font-bold text-text-main tracking-tight" id="analyst-count">&mdash;</h3>
        </div>
        <p class="text-xs text-text-muted mt-1" id="analyst-subtitle">Loading...</p>
    </div>

    <!-- Deal Volume Card -->
    <div class="relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer" data-scroll-to="resource-allocation" id="card-deals">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-text-secondary">Deal Volume</span>
            <span class="material-symbols-outlined text-text-muted text-[20px]">payments</span>
        </div>
        <div class="flex items-end gap-2 mt-3">
            <h3 class="text-3xl font-bold text-text-main tracking-tight" id="deal-volume">&mdash;</h3>
        </div>
        <p class="text-xs text-text-muted mt-1" id="deal-subtitle">Loading...</p>
    </div>

    <!-- Overdue Card -->
    <div class="relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer" data-scroll-to="task-table-body" id="card-overdue">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-text-secondary">Overdue</span>
            <span class="material-symbols-outlined text-text-muted text-[20px]">pending_actions</span>
        </div>
        <div class="flex items-end gap-2 mt-3">
            <h3 class="text-3xl font-bold tracking-tight" id="overdue-tasks" style="color: #003366">&mdash;</h3>
        </div>
        <p class="text-xs text-text-muted mt-1" id="overdue-subtitle">Loading...</p>
    </div>

    <!-- Utilization Card -->
    <div class="relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer" data-scroll-to="resource-allocation" id="card-utilization">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-text-secondary">Utilization</span>
            <span class="material-symbols-outlined text-text-muted text-[20px]">speed</span>
        </div>
        <div class="flex items-end gap-2 mt-3">
            <h3 class="text-3xl font-bold text-text-main tracking-tight" id="utilization">&mdash;</h3>
        </div>
        <p class="text-xs text-text-muted mt-1" id="utilization-subtitle">Loading...</p>
    </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/admin-dashboard.html
git commit -m "refactor(admin): replace stats card progress bars with context subtitles"
```

---

### Task 2: Rewrite Stats Card JS — Meaningful Subtitles + Click-to-Scroll

**Files:**
- Modify: `apps/web/admin-dashboard.js:103-158`

Replace `renderStatsCards()`, remove `updateProgressBar()`, add click-to-scroll handler.

- [ ] **Step 1: Replace renderStatsCards and remove updateProgressBar**

Replace everything from line 103 (`// ─── Stats Cards`) through line 158 (end of `updateProgressBar`) in `admin-dashboard.js` with:

```javascript
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
```

- [ ] **Step 2: Call initCardScrollLinks from initAdminDashboard**

In `admin-dashboard.js`, inside `initAdminDashboard()` (around line 48, after `initModals()`), add:

```javascript
    initCardScrollLinks();
```

So the block reads:

```javascript
    initModals();
    initCardScrollLinks();
    updateLastUpdated();
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/admin-dashboard.js
git commit -m "feat(admin): meaningful stats subtitles + click-to-scroll cards"
```

---

### Task 3: Resource Allocation — Error State, Empty State, Expand/Collapse

**Files:**
- Modify: `apps/web/admin-dashboard.js:160-224` (renderResourceAllocation function)
- Modify: `apps/web/admin-dashboard.html:187-201` (Resource Allocation card)

- [ ] **Step 1: Update "View Detailed Report" button in HTML**

In `admin-dashboard.html`, replace the Resource Allocation header button (line 193):

```html
<button class="text-sm text-primary font-medium hover:text-primary-hover transition-colors">View Detailed Report</button>
```

with:

```html
<button id="toggle-resource-detail" class="text-sm text-primary font-medium hover:text-primary-hover transition-colors">View Detailed Report</button>
```

- [ ] **Step 2: Replace renderResourceAllocation in admin-dashboard.js**

Replace the entire `renderResourceAllocation` function (lines 162-224) with:

```javascript
let resourceExpanded = false;

async function renderResourceAllocation() {
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

    const displayLimit = resourceExpanded ? teamMembers.length : 8;
    const membersToShow = teamMembers.slice(0, displayLimit);
    const memberHtml = [];

    for (const member of membersToShow) {
        let dealNames = [];
        let taskCount = 0;

        try {
            const resp = await PEAuth.authFetch(`${API_BASE_URL}/users/${member.id}/deals`);
            if (resp.ok) {
                const deals = await resp.json();
                dealNames = (Array.isArray(deals) ? deals : []).slice(0, 3).map(d => d.name || d.dealName || 'Unknown');
            }
        } catch (e) { /* ignore per-member failure */ }

        taskCount = allTasks.filter(t => t.assignedTo === member.id && t.status !== 'COMPLETED').length;
        const capacity = Math.min(100, Math.round((dealNames.length / 5) * 100));
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
```

- [ ] **Step 3: Add error handling wrapper for resource allocation in initAdminDashboard**

In the `initAdminDashboard` function, after `Promise.all(...)` where `renderResourceAllocation()` is called, wrap it:

Replace:
```javascript
    renderResourceAllocation();
```

With:
```javascript
    try {
        await renderResourceAllocation();
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
```

- [ ] **Step 4: Call initResourceToggle from initAdminDashboard**

Add `initResourceToggle();` right after `initCardScrollLinks();` in `initAdminDashboard()`:

```javascript
    initModals();
    initCardScrollLinks();
    initResourceToggle();
    updateLastUpdated();
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/admin-dashboard.js apps/web/admin-dashboard.html
git commit -m "feat(admin): resource allocation error/empty states + expand/collapse"
```

---

### Task 4: Activity Feed — Error State, Day Grouping, Paginated "View Full History"

**Files:**
- Modify: `apps/web/admin-dashboard.js:226-276` (loadActivityFeed function)
- Modify: `apps/web/admin-dashboard.html:256-274` (activity feed container)

- [ ] **Step 1: Add id to "View full history" button in HTML**

In `admin-dashboard.html`, replace the "View full history" button (line 272):

```html
<button class="text-xs text-text-muted hover:text-primary font-medium uppercase tracking-wide transition-colors">View full history</button>
```

with:

```html
<button id="load-more-activity" class="text-xs text-text-muted hover:text-primary font-medium uppercase tracking-wide transition-colors">View full history</button>
```

- [ ] **Step 2: Replace loadActivityFeed in admin-dashboard.js**

Replace the entire `loadActivityFeed` function and add the paginated load-more logic. Replace from `// ─── Activity Feed` through the end of `formatAuditAction` (lines 226-306) with:

```javascript
// ─── Activity Feed ───────────────────────────────────────────

let activityOffset = 0;
const ACTIVITY_PAGE_SIZE = 10;
let allActivityLogs = [];

async function loadActivityFeed(append = false) {
    const container = document.querySelector('.activity-timeline .space-y-5');
    if (!container) return;

    if (!append) {
        activityOffset = 0;
        allActivityLogs = [];
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/audit?limit=${ACTIVITY_PAGE_SIZE}&offset=${activityOffset}`);
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

function groupLogsByDay(logs) {
    const groups = new Map();
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();

    for (const log of logs) {
        const date = new Date(log.createdAt);
        const dateStr = date.toDateString();
        let label;

        if (dateStr === today) label = 'Today';
        else if (dateStr === yesterday) label = 'Yesterday';
        else label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(log);
    }

    return groups;
}

function renderActivityItem(log) {
    const userName = log.userEmail?.split('@')[0] || 'System';
    const initials = getInitials(userName);
    const { text, icon } = formatAuditAction(log);
    const timeAgo = getTimeAgo(log.createdAt);
    const isAI = log.action?.startsWith('AI_');

    return `
        <div class="flex gap-3 relative z-10 mb-4">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-full text-white text-xs font-medium flex items-center justify-center" style="background-color: #003366">
                    ${isAI ? '<span class="material-symbols-outlined text-[18px]">auto_awesome</span>' : initials}
                </div>
                <div class="absolute -bottom-0.5 -right-0.5 rounded-full w-4 h-4 flex items-center justify-center border-2 border-white" style="background-color: #003366">
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
}

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
```

- [ ] **Step 3: Keep formatAuditAction and getTimeAgo unchanged**

The `formatAuditAction` function (lines 278-306 in the original) and `getTimeAgo` alias (line 309) stay exactly the same — they are still used by `renderActivityItem`. Do not delete them.

- [ ] **Step 4: Call initLoadMoreActivity in initAdminDashboard**

Add `initLoadMoreActivity();` after `initResourceToggle();`:

```javascript
    initModals();
    initCardScrollLinks();
    initResourceToggle();
    initLoadMoreActivity();
    updateLastUpdated();
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/admin-dashboard.js apps/web/admin-dashboard.html
git commit -m "feat(admin): activity feed error states, day grouping, paginated load-more"
```

---

### Task 5: Task Table — Empty State, Expand All, Inline Status Update

**Files:**
- Modify: `apps/web/admin-tasks.js:10-51` (renderTaskTable) and add new functions
- Modify: `apps/web/admin-dashboard.html:244-248` ("View all tasks" button area)

- [ ] **Step 1: Update "View all tasks" button in HTML**

In `admin-dashboard.html`, replace the "View all tasks" button (lines 244-248):

```html
<div class="p-4 border-t border-border-subtle flex justify-center bg-gray-50/30">
    <button class="text-sm font-medium text-text-secondary hover:text-primary flex items-center gap-1 transition-colors">
        View all tasks <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
    </button>
</div>
```

with:

```html
<div class="p-4 border-t border-border-subtle flex justify-center bg-gray-50/30">
    <button id="toggle-all-tasks" class="text-sm font-medium text-text-secondary hover:text-primary flex items-center gap-1 transition-colors">
        View all tasks <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
    </button>
</div>
```

- [ ] **Step 2: Replace renderTaskTable in admin-tasks.js**

Replace the `renderTaskTable` function (lines 11-51) with an updated version that includes empty state and inline status dropdowns:

```javascript
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
```

- [ ] **Step 3: Add inline status update functions to admin-tasks.js**

Append these functions at the end of `admin-tasks.js`:

```javascript
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
```

- [ ] **Step 4: Call initToggleAllTasks from initModals in admin-modals.js**

In `admin-modals.js`, at the end of `initModals()` (after `initTaskFilterSort();` around line 107), add:

```javascript
    initToggleAllTasks();
```

- [ ] **Step 5: Update applyTaskFilterSort in admin-tasks.js to also use TASK_PAGE_SIZE**

In the `applyTaskFilterSort` function (around line 274), the `filtered` array rendering uses all filtered results. This is correct — when a filter is active, show all matching tasks (filter already narrows the set). No change needed to `applyTaskFilterSort`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/admin-tasks.js apps/web/admin-modals.js apps/web/admin-dashboard.html
git commit -m "feat(admin): task table empty state, view-all toggle, inline status updates"
```

---

### Task 6: Final Polish — Wire Everything Together and Test

**Files:**
- Modify: `apps/web/admin-dashboard.js` — ensure init order is correct

- [ ] **Step 1: Verify the complete initAdminDashboard function**

The final `initAdminDashboard` function in `admin-dashboard.js` should read:

```javascript
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
        await renderResourceAllocation();
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
```

- [ ] **Step 2: Verify no duplicate function definitions**

Ensure:
- `updateProgressBar` is fully removed from `admin-dashboard.js` (replaced in Task 2)
- `renderTaskTable` in `admin-tasks.js` replaces the old version (not appended alongside it)
- No duplicate `setCardValue` definitions

- [ ] **Step 3: Manual smoke test**

Open `localhost:3000/admin-dashboard.html` and verify:
1. Stats cards show real numbers with context subtitles (not dashes or "Loading...")
2. Clicking Overdue card scrolls to task table and filters to overdue
3. Clicking Team card scrolls to resource allocation
4. Resource allocation shows team members with capacity bars (or empty state)
5. "View Detailed Report" expands to show all members (if >8)
6. Task table shows tasks with clickable status badges
7. Clicking a status badge shows dropdown, selecting updates status
8. "View all tasks" toggles between limited and full view
9. Activity feed shows entries grouped by day
10. "View full history" loads more entries
11. All sections show error state (not infinite spinner) when API fails

- [ ] **Step 4: Final commit**

```bash
git add apps/web/admin-dashboard.js apps/web/admin-tasks.js apps/web/admin-modals.js apps/web/admin-dashboard.html
git commit -m "feat(admin): production-ready Command Center for ops managers"
```
