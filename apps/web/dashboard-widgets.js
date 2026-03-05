// Dashboard Widgets Module
// PE OS - Private Equity Operating System
// Extracted from dashboard.js — widget management system

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
