// Dashboard Interactive Features
// PE OS - Private Equity Operating System

// ============================================================
// State Management
// ============================================================
const state = {
    tasks: [],
    notifications: [
        { id: 1, type: "alert", title: "New Deal Alert", message: "TechCorp SaaS reached Due Diligence stage", time: "5 min ago", read: false },
        { id: 2, type: "info", title: "Report Ready", message: "Q3 Market Analysis is now available", time: "1 hour ago", read: false },
        { id: 3, type: "success", title: "Deal Closed", message: "GreenEnergy Co completed successfully", time: "2 hours ago", read: true },
        { id: 4, type: "warning", title: "Action Required", message: "LOI response deadline approaching", time: "3 hours ago", read: false }
    ],
    aiSearchHistory: [
        "What's the average EBITDA margin in our portfolio?",
        "Show me all healthcare deals",
        "Recent updates on Project Alpha",
        "Compare TechCorp vs Nexus Logistics"
    ]
};

// ============================================================
// DOM Ready
// ============================================================
// Prevent double initialization
let dashboardInitialized = false;

function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    console.log('Dashboard initialized');
    initializeFeatures();
}

// Wait for PE Layout to be ready (header with search bar is injected async after auth)
window.addEventListener('pe-layout-ready', initDashboard);

// Fallback: If layout is already initialized (e.g., script loads late)
document.addEventListener('DOMContentLoaded', function() {
    // Check if global-search exists (layout already initialized)
    if (document.getElementById('global-search')) {
        initDashboard();
    }
});

function initializeFeatures() {
    initMobileMenu();
    initAISearch();
    initNotifications();
    initSettings();
    initTasks();
    initNewDealModal();
    initStatCards();
    initPriorityTable();
    initWidgetManagement();
    updateGreeting();
    updateTaskCount();

    // Update greeting when user data loads (async from layout.js)
    window.addEventListener('pe-user-loaded', () => {
        updateGreeting();
    });
}

// ============================================================
// Mobile Menu Toggle
// ============================================================
function initMobileMenu() {
    const menuButton = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('pe-sidebar');

    if (menuButton && sidebar) {
        menuButton.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            sidebar.classList.toggle('flex');
            sidebar.classList.toggle('fixed');
            sidebar.classList.toggle('inset-0');
            sidebar.classList.toggle('z-50');
        });
    }
}

// ============================================================
// AI Search Functionality
// ============================================================
function initAISearch() {
    const searchInput = document.getElementById('global-search');
    const searchButton = searchInput?.parentElement?.querySelector('button');

    if (!searchInput) return;

    // Create suggestions dropdown
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'absolute top-full left-0 right-0 mt-2 bg-white rounded-lg border border-border-subtle shadow-card-hover z-50 hidden';
    suggestionsDiv.innerHTML = `
        <div class="p-2">
            <div class="text-xs font-bold text-text-secondary uppercase tracking-wide px-3 py-2">Recent Searches</div>
            <div id="search-suggestions"></div>
            <div class="border-t border-border-subtle mt-2 pt-2">
                <div class="text-xs font-bold text-text-secondary uppercase tracking-wide px-3 py-2">Quick Actions</div>
                <button class="w-full text-left px-3 py-2 hover:bg-primary-light rounded-md transition-colors text-sm flex items-center gap-2" data-action="new-deal">
                    <span class="material-symbols-outlined text-[16px]">add</span>
                    Create New Deal
                </button>
                <button class="w-full text-left px-3 py-2 hover:bg-primary-light rounded-md transition-colors text-sm flex items-center gap-2" data-action="view-reports">
                    <span class="material-symbols-outlined text-[16px]">description</span>
                    View AI Reports
                </button>
            </div>
        </div>
    `;

    searchInput.parentElement.appendChild(suggestionsDiv);

    // Show suggestions on focus
    searchInput.addEventListener('focus', () => {
        updateSearchSuggestions();
        suggestionsDiv.classList.remove('hidden');
    });

    // Hide on blur (with delay for click events)
    searchInput.addEventListener('blur', () => {
        setTimeout(() => suggestionsDiv.classList.add('hidden'), 200);
    });

    // Handle search input
    searchInput.addEventListener('input', (e) => {
        if (e.target.value.length > 0) {
            filterSearchSuggestions(e.target.value);
        } else {
            updateSearchSuggestions();
        }
    });

    // Handle search submit
    const performSearch = () => {
        const query = searchInput.value.trim();
        if (query) {
            console.log('AI Search Query:', query);
            showAISearchResult(query);
            if (!state.aiSearchHistory.includes(query)) {
                state.aiSearchHistory.unshift(query);
                if (state.aiSearchHistory.length > 5) state.aiSearchHistory.pop();
            }
            searchInput.value = '';
            suggestionsDiv.classList.add('hidden');
        }
    };

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }

    // Quick action handlers
    suggestionsDiv.addEventListener('click', (e) => {
        const button = e.target.closest('[data-action]');
        if (button) {
            const action = button.dataset.action;
            if (action === 'new-deal') {
                showNewDealModal();
            } else if (action === 'view-reports') {
                showNotification('AI Reports', 'Opening AI-generated reports...', 'info');
            }
        }
    });
}

function updateSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    if (!container) return;

    container.innerHTML = state.aiSearchHistory.map(query => `
        <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm text-text-main" onclick="fillSearch('${query}')">
            <span class="material-symbols-outlined text-[14px] text-text-muted mr-2 align-middle">history</span>
            ${query}
        </button>
    `).join('');
}

function filterSearchSuggestions(query) {
    const container = document.getElementById('search-suggestions');
    if (!container) return;

    const filtered = state.aiSearchHistory.filter(h =>
        h.toLowerCase().includes(query.toLowerCase())
    );

    container.innerHTML = filtered.map(q => `
        <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm text-text-main" onclick="fillSearch('${q}')">
            <span class="material-symbols-outlined text-[14px] text-text-muted mr-2 align-middle">history</span>
            ${q}
        </button>
    `).join('');
}

function fillSearch(query) {
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.value = query;
        searchInput.focus();
    }
}

async function showAISearchResult(query) {
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

    // Create modal with loading state
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-fadeIn">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-secondary-light rounded-lg">
                        <span class="material-symbols-outlined text-secondary">auto_awesome</span>
                    </div>
                    <div>
                        <h3 class="font-bold text-text-main">AI Portfolio Assistant</h3>
                        <p class="text-sm text-text-secondary">"${query}"</p>
                    </div>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div id="ai-response-content" class="p-6">
                <div class="flex items-center justify-center py-12">
                    <span class="material-symbols-outlined text-primary animate-spin text-3xl mr-3">sync</span>
                    <span class="text-text-secondary">Analyzing your portfolio...</span>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Call the API
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/portfolio/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: query }),
        });

        if (!response.ok) {
            throw new Error('Failed to get AI response');
        }

        const data = await response.json();
        const contentDiv = document.getElementById('ai-response-content');

        // Format the response with markdown-like rendering
        const formattedResponse = data.response
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        contentDiv.innerHTML = `
            <div class="bg-secondary-light border border-secondary/20 rounded-lg p-4 mb-4">
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-secondary">psychology</span>
                    <div class="flex-1">
                        <p class="text-sm text-text-main leading-relaxed">${formattedResponse}</p>
                    </div>
                </div>
            </div>
            ${data.relatedDeals && data.relatedDeals.length > 0 ? `
                <div class="mt-4">
                    <h4 class="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">Related Deals</h4>
                    <div class="space-y-2">
                        ${data.relatedDeals.map(deal => `
                            <a href="deal.html?id=${deal.id}" class="block p-3 border border-border-subtle rounded-lg hover:border-primary/30 hover:bg-primary-light/30 transition-colors">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <span class="font-semibold text-text-main">${deal.name}</span>
                                        <span class="text-xs text-text-muted ml-2">${deal.industry || ''}</span>
                                    </div>
                                    <span class="text-xs font-medium text-primary bg-primary-light px-2 py-1 rounded">${formatStage(deal.stage)}</span>
                                </div>
                                ${deal.revenue ? `<p class="text-xs text-text-secondary mt-1">Revenue: $${deal.revenue}M</p>` : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            <div class="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
                <span>${data.context?.activeDeals || 0} active deals analyzed</span>
                <span>Avg IRR: ${data.context?.avgIRR || 'N/A'}%</span>
            </div>
        `;
    } catch (error) {
        console.error('AI Search error:', error);
        const contentDiv = document.getElementById('ai-response-content');
        contentDiv.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-red-500">
                <span class="material-symbols-outlined text-3xl mb-2">error</span>
                <p class="text-sm font-medium">Failed to get AI response</p>
                <p class="text-xs text-text-muted mt-1">Please try again later</p>
            </div>
        `;
    }
}

function formatStage(stage) {
    const stageLabels = {
        'INITIAL_REVIEW': 'Initial Review',
        'DUE_DILIGENCE': 'Due Diligence',
        'IOI_SUBMITTED': 'IOI Submitted',
        'LOI_SUBMITTED': 'LOI Submitted',
        'NEGOTIATION': 'Negotiation',
        'CLOSING': 'Closing',
        'CLOSED_WON': 'Closed Won',
        'CLOSED_LOST': 'Closed Lost',
        'PASSED': 'Passed',
    };
    return stageLabels[stage] || stage;
}

// ============================================================
// Notifications
// ============================================================
function initNotifications() {
    const notifButton = document.getElementById('notifications-btn');
    if (!notifButton) return;

    // Create notification dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'notification-dropdown';
    dropdown.className = 'absolute top-full right-0 mt-2 w-96 bg-white rounded-lg border border-border-subtle shadow-card-hover z-50 hidden';
    dropdown.innerHTML = `
        <div class="p-4 border-b border-border-subtle flex items-center justify-between">
            <h3 class="font-bold text-text-main">Notifications</h3>
            <button onclick="markAllRead()" class="text-xs font-semibold text-primary hover:text-primary-hover">Mark all read</button>
        </div>
        <div id="notification-list" class="max-h-96 overflow-y-auto custom-scrollbar"></div>
        <div class="p-3 border-t border-border-subtle text-center">
            <button class="text-xs font-bold text-primary hover:text-primary-hover uppercase tracking-wide">View All</button>
        </div>
    `;

    notifButton.parentElement.style.position = 'relative';
    notifButton.parentElement.appendChild(dropdown);

    notifButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
        updateNotificationsList();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== notifButton) {
            dropdown.classList.add('hidden');
        }
    });

    updateNotificationBadge();
}

function updateNotificationsList() {
    const list = document.getElementById('notification-list');
    if (!list) return;

    const iconMap = {
        alert: 'campaign',
        info: 'info',
        success: 'check_circle',
        warning: 'warning'
    };

    const colorMap = {
        alert: 'text-red-600 bg-red-50',
        info: 'text-blue-600 bg-blue-50',
        success: 'text-secondary bg-secondary-light',
        warning: 'text-orange-600 bg-orange-50'
    };

    list.innerHTML = state.notifications.map(notif => `
        <div class="p-4 hover:bg-gray-50 transition-colors border-b border-border-subtle/50 cursor-pointer ${notif.read ? 'opacity-60' : ''}" onclick="markNotificationRead(${notif.id})">
            <div class="flex items-start gap-3">
                <div class="p-2 ${colorMap[notif.type]} rounded-lg">
                    <span class="material-symbols-outlined text-[18px]">${iconMap[notif.type]}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <h4 class="font-semibold text-sm text-text-main">${notif.title}</h4>
                        ${!notif.read ? '<span class="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></span>' : ''}
                    </div>
                    <p class="text-xs text-text-secondary mb-1">${notif.message}</p>
                    <span class="text-xs text-text-muted">${notif.time}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = state.notifications.find(n => n.id === id);
    if (notif) {
        notif.read = true;
        updateNotificationsList();
        updateNotificationBadge();
    }
}

function markAllRead() {
    state.notifications.forEach(n => n.read = true);
    updateNotificationsList();
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.querySelector('.absolute.top-2.right-2.h-2.w-2');
    const unreadCount = state.notifications.filter(n => !n.read).length;

    if (badge) {
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

// ============================================================
// User Menu Dropdown
// ============================================================
function initSettings() {
    const userMenuButton = document.getElementById('user-menu-btn');
    if (!userMenuButton) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'user-menu-dropdown';
    dropdown.className = 'absolute top-full right-0 mt-2 w-56 bg-white rounded-lg border border-border-subtle shadow-card-hover z-50 hidden';
    dropdown.innerHTML = `
        <div class="p-2">
            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">person</span>
                Profile Settings
            </button>
            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">notifications</span>
                Notification Preferences
            </button>
            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">palette</span>
                Appearance
            </button>
            <div class="border-t border-border-subtle my-2"></div>
            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">help</span>
                Help & Support
            </button>
            <button class="w-full text-left px-3 py-2 hover:bg-red-50 rounded-md transition-colors text-sm flex items-center gap-2 text-red-600">
                <span class="material-symbols-outlined text-[18px]">logout</span>
                Sign Out
            </button>
        </div>
    `;

    userMenuButton.parentElement.style.position = 'relative';
    userMenuButton.parentElement.appendChild(dropdown);

    userMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== userMenuButton) {
            dropdown.classList.add('hidden');
        }
    });

    dropdown.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.textContent.trim();
            showNotification('Settings', `${text} clicked`, 'info');
            dropdown.classList.add('hidden');
        });
    });
}

// ============================================================
// Tasks Management — Connected to real API
// ============================================================
const API_TASKS_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

async function initTasks() {
    await loadRealTasks();

    const viewAllButton = document.getElementById('view-all-tasks');
    if (viewAllButton) {
        viewAllButton.addEventListener('click', () => showTasksModal());
    }
}

async function loadRealTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) return;

    // Show loading state
    tasksList.innerHTML = `
        <div class="flex items-center justify-center py-8 text-text-muted">
            <span class="material-symbols-outlined animate-spin mr-2 text-lg">sync</span>
            <span class="text-sm">Loading tasks...</span>
        </div>
    `;

    try {
        // Wait for user data if not loaded yet
        let userId = USER?.id;
        if (!userId) {
            await new Promise(resolve => {
                const handler = () => { resolve(); window.removeEventListener('pe-user-loaded', handler); };
                window.addEventListener('pe-user-loaded', handler);
                setTimeout(resolve, 3000); // fallback timeout
            });
            userId = USER?.id;
        }

        // Fetch tasks assigned to current user (pending + in_progress)
        const url = userId
            ? `${API_TASKS_URL}/tasks?assignedTo=${userId}&limit=20`
            : `${API_TASKS_URL}/tasks?limit=20`;

        const response = await PEAuth.authFetch(url);
        if (!response.ok) throw new Error('Failed to fetch tasks');

        const data = await response.json();
        state.tasks = (data.tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            due: formatTaskDue(t.dueDate),
            priority: t.priority,
            status: t.status,
            completed: t.status === 'COMPLETED',
            dealName: t.deal?.name || null,
            dealId: t.dealId,
        }));

        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
        tasksList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-2xl mb-1">cloud_off</span>
                <span class="text-sm">Could not load tasks</span>
            </div>
        `;
        updateTaskCount();
    }
}

function formatTaskDue(dueDate) {
    if (!dueDate) return 'No due date';
    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d)`;
    if (diffDays === 0) return 'Due Today';
    if (diffDays === 1) return 'Due Tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) return;

    if (state.tasks.length === 0) {
        tasksList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-3xl mb-2 text-secondary">task_alt</span>
                <span class="text-sm font-medium">All caught up!</span>
                <span class="text-xs mt-0.5">No tasks assigned to you</span>
            </div>
        `;
        updateTaskCount();
        return;
    }

    // Sort: incomplete first, then by priority, then by due date
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...state.tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pa = priorityOrder[a.priority] ?? 1;
        const pb = priorityOrder[b.priority] ?? 1;
        return pa - pb;
    });

    // Show max 5 in widget, rest in modal
    const visible = sorted.slice(0, 5);

    tasksList.innerHTML = visible.map(task => {
        const isOverdue = task.due.startsWith('Overdue');
        const dueColor = task.completed ? 'text-text-secondary' : isOverdue ? 'text-red-500' : task.due === 'Due Today' ? 'text-orange-500' : 'text-text-muted';
        const priorityBadge = task.priority === 'HIGH' ? '<span class="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">HIGH</span>' :
                              task.priority === 'LOW' ? '<span class="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-bold">LOW</span>' : '';

        return `
            <label class="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors border-b border-border-subtle/50 cursor-pointer group" data-task-id="${task.id}">
                <input class="task-checkbox mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0" type="checkbox" ${task.completed ? 'checked' : ''}>
                <div class="flex flex-col gap-0.5 flex-1 ${task.completed ? 'opacity-50' : ''}">
                    <div class="flex items-center gap-2">
                        <span class="text-sm ${task.completed ? 'font-medium line-through' : 'font-semibold'} text-text-main group-hover:text-primary transition-colors">${task.title}</span>
                        ${priorityBadge}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs ${dueColor} font-medium">${task.due}</span>
                        ${task.dealName ? `<span class="text-xs text-text-muted">· ${task.dealName}</span>` : ''}
                    </div>
                </div>
            </label>
        `;
    }).join('');

    // Attach checkbox handlers
    tasksList.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const label = e.target.closest('[data-task-id]');
            const taskId = label?.dataset.taskId;
            if (!taskId) return;

            const newStatus = e.target.checked ? 'COMPLETED' : 'PENDING';
            const textDiv = label.querySelector('.flex.flex-col');

            // Optimistic UI update
            if (e.target.checked) {
                textDiv.classList.add('opacity-50');
                textDiv.querySelector('span:first-child').classList.add('line-through');
            } else {
                textDiv.classList.remove('opacity-50');
                textDiv.querySelector('span:first-child').classList.remove('line-through');
            }

            // Update state
            const task = state.tasks.find(t => t.id === taskId);
            if (task) task.completed = e.target.checked;
            updateTaskCount();

            // Persist to API
            try {
                await PEAuth.authFetch(`${API_TASKS_URL}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                if (e.target.checked) {
                    showNotification('Task Completed', `"${task?.title}" marked as done`, 'success');
                }
            } catch (err) {
                console.error('Failed to update task:', err);
                // Revert on failure
                e.target.checked = !e.target.checked;
                if (task) task.completed = e.target.checked;
                renderTasks();
            }
        });
    });

    updateTaskCount();
}

function updateTaskCount() {
    const pendingCount = state.tasks.filter(t => !t.completed).length;
    const badge = document.getElementById('task-count');
    if (badge) {
        badge.textContent = `${pendingCount} Pending`;
    }
}

function showTasksModal() {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...state.tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
    });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">check_circle</span>
                    <h3 class="font-bold text-text-main text-lg">All Tasks</h3>
                    <span class="text-xs bg-gray-100 text-text-muted px-2 py-0.5 rounded-full">${state.tasks.length}</span>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6">
                ${sorted.length === 0 ? `
                    <div class="text-center py-8 text-text-muted">
                        <span class="material-symbols-outlined text-3xl mb-2 text-secondary">task_alt</span>
                        <p class="text-sm">No tasks assigned to you</p>
                    </div>
                ` : `
                    <div class="space-y-2">
                        ${sorted.map(task => {
                            const isOverdue = task.due.startsWith('Overdue');
                            const dueColor = task.completed ? 'text-text-secondary' : isOverdue ? 'text-red-500' : task.due === 'Due Today' ? 'text-orange-500' : 'text-text-muted';
                            return `
                                <div class="p-4 border border-border-subtle rounded-lg hover:border-primary/30 transition-colors">
                                    <div class="flex items-start gap-3">
                                        <input type="checkbox" ${task.completed ? 'checked' : ''} class="mt-1 size-4 rounded border-gray-300 text-primary" disabled>
                                        <div class="flex-1">
                                            <div class="flex items-center gap-2">
                                                <span class="font-semibold text-text-main ${task.completed ? 'line-through opacity-50' : ''}">${task.title}</span>
                                                ${task.priority === 'HIGH' ? '<span class="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">HIGH</span>' : ''}
                                            </div>
                                            <div class="text-xs mt-1 flex items-center gap-2">
                                                <span class="${dueColor}">${task.due}</span>
                                                ${task.dealName ? `<span class="text-text-muted">· <a href="deal.html?id=${task.dealId}" class="hover:text-primary">${task.dealName}</a></span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// New Deal Modal
// ============================================================
function initNewDealModal() {
    // Listen for New Deal button in header (if present)
    const newDealButton = document.getElementById('new-deal-btn');
    if (newDealButton) {
        newDealButton.addEventListener('click', showNewDealModal);
    }
}

function showNewDealModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">add_circle</span>
                    <h3 class="font-bold text-text-main text-lg">Create New Deal</h3>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <form id="new-deal-form" class="p-6">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-text-main mb-2">Deal Name *</label>
                        <input type="text" required class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" placeholder="e.g., TechCorp Acquisition">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-text-main mb-2">Stage *</label>
                            <select required class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                                <option value="">Select stage</option>
                                <option value="sourcing">Sourcing</option>
                                <option value="initial">Initial Review</option>
                                <option value="dd">Due Diligence</option>
                                <option value="loi">LOI / Offer</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-text-main mb-2">Value</label>
                            <input type="text" class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" placeholder="$125M">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-text-main mb-2">Industry</label>
                        <select class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary">
                            <option value="">Select industry</option>
                            <option value="saas">SaaS</option>
                            <option value="healthcare">Healthcare</option>
                            <option value="logistics">Logistics</option>
                            <option value="fintech">Fintech</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-text-main mb-2">Description</label>
                        <textarea rows="3" class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" placeholder="Brief description of the opportunity..."></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-text-main mb-2">Lead Partner</label>
                        <input type="text" class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" placeholder="e.g., John Smith">
                    </div>
                </div>
                <div class="flex gap-3 mt-6">
                    <button type="submit" class="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors">
                        Create Deal
                    </button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="px-6 py-3 border border-border-subtle rounded-lg font-semibold hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    const form = modal.querySelector('#new-deal-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const dealName = form.querySelector('input[type="text"]').value;
        showNotification('Deal Created', `${dealName} has been added to your pipeline`, 'success');
        modal.remove();
    });
}

// ============================================================
// Stat Cards Click Handlers
// ============================================================
function initStatCards() {
    const statCards = document.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2 > div');

    statCards.forEach((card, index) => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            const stages = ['Sourcing', 'Due Diligence', 'LOI / Offer', 'Closed'];
            showStatDetail(stages[index]);
        });
    });
}

function showStatDetail(stage) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';

    const dealsData = {
        'Sourcing': [
            { name: 'CloudTech Solutions', value: '$45M', status: 'Active' },
            { name: 'DataFlow Systems', value: '$32M', status: 'Active' },
            { name: 'HealthSync Pro', value: '$78M', status: 'New' }
        ],
        'Due Diligence': [
            { name: 'TechCorp SaaS', value: '$125M', status: 'In Progress' },
            { name: 'Nexus Logistics', value: '$85M', status: 'In Progress' }
        ],
        'LOI / Offer': [
            { name: 'GreenEnergy Co', value: '$210M', status: 'Pending Response' },
            { name: 'FinanceAI', value: '$95M', status: 'Negotiating' }
        ],
        'Closed': [
            { name: 'MediCarePlus', value: '$42M', status: 'Completed Q3' }
        ]
    };

    const deals = dealsData[stage] || [];

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <h3 class="font-bold text-text-main text-lg">${stage} Deals</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6">
                <div class="space-y-3">
                    ${deals.map(deal => `
                        <div class="p-4 border border-border-subtle rounded-lg hover:border-primary/30 transition-colors cursor-pointer" onclick="window.location.href='deal.html'">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-text-main">${deal.name}</h4>
                                <span class="font-mono font-medium text-primary">${deal.value}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded">${deal.status}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// Priority Table Row Click
// ============================================================
function initPriorityTable() {
    const tableBody = document.getElementById('priorities-table');
    if (!tableBody) return;

    const tableRows = tableBody.querySelectorAll('tr');

    tableRows.forEach(row => {
        // Rows already have onclick in HTML, but add cursor styling
        row.style.cursor = 'pointer';
    });
}

// ============================================================
// Utility Functions
// ============================================================
function updateGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('greeting');

    if (greetingEl) {
        let greeting = 'Good Morning';
        if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
        else if (hour >= 17) greeting = 'Good Evening';

        // Use actual user name from layout.js USER object, fallback to 'User'
        const userName = (typeof USER !== 'undefined' && USER.name && USER.name !== 'Loading...')
            ? USER.name.split(' ')[0]  // Use first name only
            : 'User';
        greetingEl.textContent = `${greeting}, ${userName}`;
    }

    // Update date
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

function showNotification(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-6 bg-white border border-border-subtle rounded-lg shadow-card-hover p-4 z-50 min-w-[320px] animate-slideIn';

    const icons = {
        info: 'info',
        success: 'check_circle',
        warning: 'warning',
        error: 'error'
    };

    const colors = {
        info: 'text-blue-600 bg-blue-50',
        success: 'text-secondary bg-secondary-light',
        warning: 'text-orange-600 bg-orange-50',
        error: 'text-red-600 bg-red-50'
    };

    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="p-2 ${colors[type]} rounded-lg">
                <span class="material-symbols-outlined text-[20px]">${icons[type]}</span>
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-text-main text-sm">${title}</h4>
                <p class="text-xs text-text-secondary mt-0.5">${message}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .animate-slideIn {
        animation: slideIn 0.3s ease-out;
    }

    .animate-fadeIn {
        animation: fadeIn 0.2s ease-out;
    }
`;
document.head.appendChild(style);

// ============================================================
// Widget Management System
// ============================================================
const WIDGET_CONFIG = {
    // === ACTIVE WIDGETS (Currently Implemented) ===
    'stats-cards': {
        name: 'Pipeline Stats',
        description: 'Overview of deals across pipeline stages',
        icon: 'analytics',
        defaultVisible: true,
        category: 'core'
    },
    'ai-sentiment': {
        name: 'AI Market Sentiment',
        description: 'AI-powered market analysis and insights',
        icon: 'psychology',
        defaultVisible: true,
        category: 'ai'
    },
    'active-priorities': {
        name: 'Active Priorities',
        description: 'Table of high-priority deals requiring attention',
        icon: 'priority_high',
        defaultVisible: true,
        category: 'deals'
    },
    'my-tasks': {
        name: 'My Tasks',
        description: 'Your pending tasks and to-dos',
        icon: 'check_circle',
        defaultVisible: true,
        category: 'productivity'
    },
    'portfolio-allocation': {
        name: 'Portfolio Allocation',
        description: 'Sector allocation breakdown chart',
        icon: 'pie_chart',
        defaultVisible: true,
        category: 'portfolio'
    },

    // === PRODUCTIVITY & ACTIONS ===
    'quick-actions': {
        name: 'Quick Actions',
        description: 'Shortcuts to common tasks: New Deal, Upload Doc, Schedule Meeting',
        icon: 'bolt',
        defaultVisible: false,
        category: 'productivity'
    },
    'calendar': {
        name: 'Calendar',
        description: 'Upcoming meetings, IC dates, and important deadlines',
        icon: 'calendar_month',
        defaultVisible: false,
        category: 'productivity'
    },
    'upcoming-deadlines': {
        name: 'Upcoming Deadlines',
        description: 'Calendar of important dates and milestones',
        icon: 'event_upcoming',
        defaultVisible: false,
        category: 'productivity'
    },
    'notes-memo': {
        name: 'Quick Notes',
        description: 'Scratchpad for quick notes and reminders',
        icon: 'sticky_note_2',
        defaultVisible: false,
        category: 'productivity'
    },

    // === DEAL FLOW & PIPELINE ===
    'deal-funnel': {
        name: 'Deal Funnel',
        description: 'Visual funnel showing conversion rates through pipeline stages',
        icon: 'filter_alt',
        defaultVisible: false,
        category: 'deals'
    },
    'deal-sources': {
        name: 'Deal Sources',
        description: 'Track where deals originate: bankers, proprietary, referrals',
        icon: 'share',
        defaultVisible: false,
        category: 'deals'
    },
    'watchlist': {
        name: 'Watchlist',
        description: 'Companies being monitored but not in active pipeline',
        icon: 'visibility',
        defaultVisible: false,
        category: 'deals'
    },
    'recent-activity': {
        name: 'Recent Activity',
        description: 'Latest activity feed from your deals',
        icon: 'history',
        defaultVisible: false,
        category: 'deals'
    },

    // === PORTFOLIO & FUND ===
    'capital-deployed': {
        name: 'Capital Deployed',
        description: 'Track deployed vs committed capital by fund',
        icon: 'account_balance',
        defaultVisible: false,
        category: 'portfolio'
    },
    'fund-performance': {
        name: 'Fund Performance',
        description: 'Key metrics: IRR, MOIC, DPI by fund',
        icon: 'trending_up',
        defaultVisible: false,
        category: 'portfolio'
    },
    'exit-tracker': {
        name: 'Exit Tracker',
        description: 'Track potential exits and timeline planning',
        icon: 'logout',
        defaultVisible: false,
        category: 'portfolio'
    },

    // === MARKET & RESEARCH ===
    'market-news': {
        name: 'Market News',
        description: 'AI-curated industry news for your focus sectors',
        icon: 'newspaper',
        defaultVisible: false,
        category: 'market'
    },
    'market-multiples': {
        name: 'Market Multiples',
        description: 'Current EV/EBITDA and revenue multiples by sector',
        icon: 'insert_chart',
        defaultVisible: false,
        category: 'market'
    },

    // === TEAM & CONTACTS ===
    'team-performance': {
        name: 'Team Performance',
        description: 'Team metrics and deal attribution',
        icon: 'groups',
        defaultVisible: false,
        category: 'team'
    },
    'key-contacts': {
        name: 'Key Contacts',
        description: 'Quick access to important contacts and advisors',
        icon: 'contacts',
        defaultVisible: false,
        category: 'team'
    },
    'co-investor-activity': {
        name: 'Co-Investor Activity',
        description: 'Track syndicate partner and co-investor activity',
        icon: 'handshake',
        defaultVisible: false,
        category: 'team'
    },

    // === DOCUMENTS & ALERTS ===
    'document-alerts': {
        name: 'Document Alerts',
        description: 'Documents pending review or expiring soon',
        icon: 'folder_alert',
        defaultVisible: false,
        category: 'documents'
    }
};

const WIDGET_STORAGE_KEY = 'pe-dashboard-widgets';

function getWidgetPreferences() {
    try {
        const stored = localStorage.getItem(WIDGET_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Error reading widget preferences:', e);
    }
    // Return default preferences
    const defaults = {};
    Object.keys(WIDGET_CONFIG).forEach(key => {
        defaults[key] = WIDGET_CONFIG[key].defaultVisible;
    });
    return defaults;
}

function saveWidgetPreferences(prefs) {
    try {
        localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.warn('Error saving widget preferences:', e);
    }
}

function applyWidgetPreferences() {
    const prefs = getWidgetPreferences();
    document.querySelectorAll('.widget-container').forEach(widget => {
        const widgetId = widget.dataset.widget;
        if (widgetId && prefs[widgetId] === false) {
            widget.style.display = 'none';
        } else {
            widget.style.display = '';
        }
    });
}

function removeWidget(widgetId) {
    const prefs = getWidgetPreferences();
    prefs[widgetId] = false;
    saveWidgetPreferences(prefs);

    const widget = document.querySelector(`[data-widget="${widgetId}"]`);
    if (widget) {
        widget.style.opacity = '0';
        widget.style.transform = 'scale(0.95)';
        widget.style.transition = 'all 0.2s ease-out';
        setTimeout(() => {
            widget.style.display = 'none';
        }, 200);
    }

    showNotification('Widget Removed', `${WIDGET_CONFIG[widgetId]?.name || 'Widget'} has been removed. You can add it back anytime.`, 'info');
}

function addWidget(widgetId) {
    const prefs = getWidgetPreferences();
    prefs[widgetId] = true;
    saveWidgetPreferences(prefs);

    const widget = document.querySelector(`[data-widget="${widgetId}"]`);
    if (widget) {
        widget.style.display = '';
        widget.style.opacity = '0';
        widget.style.transform = 'scale(0.95)';
        setTimeout(() => {
            widget.style.opacity = '1';
            widget.style.transform = 'scale(1)';
            widget.style.transition = 'all 0.2s ease-out';
        }, 10);
    }
}

const CATEGORY_LABELS = {
    'core': { name: 'Core Widgets', icon: 'dashboard' },
    'productivity': { name: 'Productivity', icon: 'task_alt' },
    'deals': { name: 'Deal Flow & Pipeline', icon: 'work' },
    'portfolio': { name: 'Portfolio & Fund', icon: 'account_balance' },
    'market': { name: 'Market & Research', icon: 'insights' },
    'team': { name: 'Team & Contacts', icon: 'groups' },
    'documents': { name: 'Documents & Alerts', icon: 'folder' },
    'ai': { name: 'AI-Powered', icon: 'auto_awesome' }
};

function openWidgetModal() {
    const modal = document.getElementById('add-widget-modal');
    const optionsContainer = document.getElementById('widget-options');
    const prefs = getWidgetPreferences();

    if (!modal || !optionsContainer) return;

    // Group widgets by category
    const grouped = {};
    Object.entries(WIDGET_CONFIG).forEach(([id, config]) => {
        const cat = config.category || 'core';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ id, ...config });
    });

    // Define category order
    const categoryOrder = ['core', 'ai', 'productivity', 'deals', 'portfolio', 'market', 'team', 'documents'];

    // Render grouped widgets
    optionsContainer.innerHTML = categoryOrder
        .filter(cat => grouped[cat]?.length > 0)
        .map(cat => {
            const catInfo = CATEGORY_LABELS[cat] || { name: cat, icon: 'widgets' };
            const widgets = grouped[cat];

            return `
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
                        <span class="material-symbols-outlined text-[18px] text-primary">${catInfo.icon}</span>
                        <h3 class="text-sm font-bold text-text-main uppercase tracking-wide">${catInfo.name}</h3>
                    </div>
                    <div class="grid gap-2">
                        ${widgets.map(config => {
                            const isActive = prefs[config.id] !== false;
                            const hasWidget = document.querySelector(`[data-widget="${config.id}"]`) !== null;

                            return `
                                <label class="flex items-center gap-3 p-3 rounded-lg border ${isActive && hasWidget ? 'border-primary bg-primary-light/30' : 'border-border-subtle hover:border-primary/50'} cursor-pointer transition-all group ${!hasWidget ? 'opacity-60' : ''}">
                                    <input type="checkbox" class="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        data-widget-id="${config.id}" ${isActive && hasWidget ? 'checked' : ''} ${!hasWidget ? 'disabled' : ''}>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="material-symbols-outlined text-[18px] ${isActive && hasWidget ? 'text-primary' : 'text-text-muted'}">${config.icon}</span>
                                            <span class="font-medium text-sm text-text-main truncate">${config.name}</span>
                                            ${!hasWidget ? '<span class="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-medium">Soon</span>' : ''}
                                        </div>
                                        <p class="text-xs text-text-secondary mt-0.5 line-clamp-1">${config.description}</p>
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeWidgetModal() {
    const modal = document.getElementById('add-widget-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function saveWidgetSelection() {
    const prefs = {};
    document.querySelectorAll('.widget-checkbox').forEach(checkbox => {
        const widgetId = checkbox.dataset.widgetId;
        if (widgetId) {
            prefs[widgetId] = checkbox.checked;
        }
    });

    saveWidgetPreferences(prefs);
    applyWidgetPreferences();
    closeWidgetModal();
    showNotification('Dashboard Updated', 'Your widget preferences have been saved.', 'success');
}

function initWidgetManagement() {
    // Apply saved preferences
    applyWidgetPreferences();

    // Setup remove buttons
    document.querySelectorAll('.widget-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const widget = btn.closest('.widget-container');
            if (widget && widget.dataset.widget) {
                removeWidget(widget.dataset.widget);
            }
        });
    });

    // Setup add widget button
    const addBtn = document.getElementById('add-widget-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openWidgetModal);
    }

    // Setup customize dashboard button
    const settingsBtn = document.getElementById('widget-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openWidgetModal);
    }

    // Setup modal close buttons
    const closeBtn = document.getElementById('close-widget-modal');
    const cancelBtn = document.getElementById('cancel-widget-modal');
    const saveBtn = document.getElementById('save-widget-selection');

    if (closeBtn) closeBtn.addEventListener('click', closeWidgetModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeWidgetModal);
    if (saveBtn) saveBtn.addEventListener('click', saveWidgetSelection);

    // Close modal on backdrop click
    const modal = document.getElementById('add-widget-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeWidgetModal();
        });
    }
}

console.log('PE OS Dashboard fully initialized');
