// Dashboard Search & Notifications Module
// PE OS - Private Equity Operating System
// Extracted from dashboard.js — AI search and notification functions

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
