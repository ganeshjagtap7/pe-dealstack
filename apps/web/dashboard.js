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
