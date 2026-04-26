// Dashboard Interactive Features
// PE OS - Private Equity Operating System

// ============================================================
// State Management
// ============================================================
const state = {
    tasks: [],
    notifications: [],
    aiSearchHistory: [
        "What's the average EBITDA margin in our portfolio?",
        "Show me all deals in due diligence",
        "Recent updates on active deals",
        "Compare revenue growth across deals"
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
    initTasks();
    initNewDealModal();
    initStatCards();
    initPriorityTable();
    initWidgetManagement();
    updateGreeting();
    updateTaskCount();

    // Initialize all dashboard widgets via the registry.
    // Each widget is opt-in: only widgets with a <div data-widget="..."> element
    // AND a non-hidden user preference will fetch data + render.
    if (window.WidgetRegistry) {
        WidgetRegistry.initAll();
    }

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

// initStatCards — removed. Old implementation used a broad CSS selector
// (.grid.grid-cols-1.md:grid-cols-2 > div) that matched all dashboard widgets,
// not just stat cards, causing "undefined Deals" modal on every widget click.
// Pipeline stat cards now render inline via the <script> block in dashboard.html
// and navigate to crm.html on click if needed.
function initStatCards() {}

// ============================================================
// Active Priorities Table — fetches HIGH-priority active deals
// ============================================================
function initPriorityTable() {
    const tableBody = document.getElementById('priorities-table');
    if (!tableBody) return;
    loadActivePriorities();
}

async function loadActivePriorities() {
    const tableBody = document.getElementById('priorities-table');
    if (!tableBody) return;

    try {
        if (typeof PEAuth === 'undefined' || !PEAuth.authFetch) return;

        // Fetch active deals — API returns flat array sorted by updatedAt desc by default
        const res = await PEAuth.authFetch(`${API_BASE_URL}/deals?status=ACTIVE`);
        if (!res.ok) throw new Error(`Status ${res.status}`);

        const deals = await res.json();
        const list = Array.isArray(deals) ? deals : (deals?.deals || []);

        // Prioritize HIGH first, then MEDIUM, then any. Take top 5.
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        const sorted = [...list].sort((a, b) => {
            const pa = priorityOrder[a.priority] ?? 99;
            const pb = priorityOrder[b.priority] ?? 99;
            return pa - pb;
        });
        const top = sorted.slice(0, 5);

        if (top.length === 0) {
            // Keep the empty state already in the HTML
            return;
        }

        const stageStyles = {
            SOURCING: { label: 'Sourcing', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
            INITIAL_REVIEW: { label: 'Initial Review', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
            DUE_DILIGENCE: { label: 'Due Diligence', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
            LOI_OFFER: { label: 'LOI / Offer', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
            CLOSED: { label: 'Closed', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
            PASSED: { label: 'Passed', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
        };

        const fmtMoney = (val) => {
            if (val == null) return '—';
            const m = Number(val);
            if (Number.isNaN(m)) return '—';
            if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
            return `$${m.toFixed(1)}M`;
        };

        const fmtNextAction = (deal) => {
            switch (deal.stage) {
                case 'SOURCING': return 'Initial review';
                case 'INITIAL_REVIEW': return 'Schedule mgmt call';
                case 'DUE_DILIGENCE': return 'Complete QoE analysis';
                case 'LOI_OFFER': return 'Negotiate terms';
                case 'CLOSED': return 'Onboard portfolio co';
                default: return 'Review deal';
            }
        };

        const teamAvatars = (deal) => {
            const members = [];
            if (deal.assignedUser) members.push(deal.assignedUser);
            if (Array.isArray(deal.teamMembers)) {
                deal.teamMembers.forEach(t => { if (t.user) members.push(t.user); });
            }
            if (members.length === 0) return '<span class="text-xs text-text-muted">Unassigned</span>';
            return members.slice(0, 3).map((m, i) => {
                const initial = (m.name || m.email || '?').charAt(0).toUpperCase();
                return `<div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-white -ml-1.5" style="background-color: #003366; ${i === 0 ? 'margin-left: 0;' : ''}" title="${escapeHtml(m.name || m.email || '')}">${initial}</div>`;
            }).join('');
        };

        const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

        tableBody.innerHTML = top.map(deal => {
            const style = stageStyles[deal.stage] || stageStyles.SOURCING;
            return `
                <tr class="hover:bg-gray-50 cursor-pointer transition-colors" onclick="window.location.href='deal.html?id=${deal.id}'">
                    <td class="px-5 py-4">
                        <div class="font-semibold text-text-main">${escapeHtml(deal.name)}</div>
                        <div class="text-xs text-text-muted">${escapeHtml(deal.industry || '')}</div>
                    </td>
                    <td class="px-5 py-4">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-md ${style.bg} border ${style.border} ${style.text} text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">${style.label}</span>
                    </td>
                    <td class="px-5 py-4 font-mono font-semibold text-text-main">${fmtMoney(deal.dealSize)}</td>
                    <td class="px-5 py-4 text-text-secondary">${fmtNextAction(deal)}</td>
                    <td class="px-5 py-4">
                        <div class="flex items-center">${teamAvatars(deal)}</div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.warn('[Dashboard] Failed to load active priorities:', e.message);
        // Keep the empty-state HTML on failure
    }
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

// showNotification — now in js/notifications.js

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
