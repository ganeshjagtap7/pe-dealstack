// Dashboard Interactive Features
// PE OS - Private Equity Operating System

// ============================================================
// State Management
// ============================================================
const state = {
    tasks: [
        { id: 1, title: "Review NDA for Project Bolt", due: "Due Today", category: "Legal", completed: false },
        { id: 2, title: "Finalize IC Memo Draft", due: "Due Tomorrow", category: "Inv. Committee", completed: false },
        { id: 3, title: "Call with Managing Partner", due: "Completed", category: "Strategy", completed: true },
        { id: 4, title: "Market Research: Logistics", due: "Due Friday", category: "Research", completed: false },
        { id: 5, title: "Schedule team sync meeting", due: "Due This Week", category: "Team", completed: false }
    ],
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
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initialized');
    initializeFeatures();
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
    updateGreeting();
    updateTaskCount();
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
    const API_BASE_URL = 'http://localhost:3001/api';

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
// Tasks Management
// ============================================================
function initTasks() {
    const checkboxes = document.querySelectorAll('.task-checkbox');

    checkboxes.forEach((checkbox, index) => {
        const task = state.tasks[index];
        if (task) {
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', (e) => {
                task.completed = e.target.checked;

                const taskLabel = e.target.closest('label');
                const textDiv = taskLabel.querySelector('.flex.flex-col');

                if (task.completed) {
                    textDiv.classList.add('opacity-50');
                    textDiv.querySelector('span:first-child').classList.add('line-through');
                    textDiv.querySelector('span:first-child').classList.remove('font-semibold');
                    textDiv.querySelector('span:first-child').classList.add('font-medium');
                    showNotification('Task Completed', `"${task.title}" marked as done`, 'success');
                } else {
                    textDiv.classList.remove('opacity-50');
                    textDiv.querySelector('span:first-child').classList.remove('line-through');
                    textDiv.querySelector('span:first-child').classList.add('font-semibold');
                    textDiv.querySelector('span:first-child').classList.remove('font-medium');
                }

                updateTaskCount();
            });
        }
    });

    // View All Tasks button
    const viewAllButton = document.getElementById('view-all-tasks');
    if (viewAllButton) {
        viewAllButton.addEventListener('click', () => {
            showTasksModal();
        });
    }
}

function updateTaskCount() {
    const pendingCount = state.tasks.filter(t => !t.completed).length;
    const badge = document.getElementById('task-count');
    if (badge) {
        badge.textContent = `${pendingCount} Pending`;
    }
}

function showTasksModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">check_circle</span>
                    <h3 class="font-bold text-text-main text-lg">All Tasks</h3>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6">
                <div class="space-y-2">
                    ${state.tasks.map(task => `
                        <div class="p-4 border border-border-subtle rounded-lg hover:border-primary/30 transition-colors">
                            <div class="flex items-start gap-3">
                                <input type="checkbox" ${task.completed ? 'checked' : ''} class="mt-1 size-4 rounded border-gray-300 text-primary" disabled>
                                <div class="flex-1">
                                    <div class="font-semibold text-text-main ${task.completed ? 'line-through opacity-50' : ''}">${task.title}</div>
                                    <div class="text-xs text-text-muted mt-1">${task.due} • ${task.category}</div>
                                </div>
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
                        <input type="text" class="w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary" placeholder="Alex Morgan">
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

        greetingEl.textContent = `${greeting}, Alex`;
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

console.log('PE OS Dashboard fully initialized');
