/**
 * PE OS Global Search (Command Palette)
 * Triggered by Cmd+K or clicking the search box
 */

window.PEGlobalSearch = (function() {
    const API_BASE_URL = 'http://localhost:3001/api';
    let isOpen = false;
    let searchTimeout = null;
    let selectedIndex = 0;
    let results = [];

    // Search categories
    const categories = {
        deals: { label: 'Deals', icon: 'trending_up', color: 'text-primary' },
        documents: { label: 'Documents', icon: 'description', color: 'text-blue-600' },
        actions: { label: 'Actions', icon: 'bolt', color: 'text-amber-500' },
    };

    // Quick actions
    const quickActions = [
        { id: 'new-deal', label: 'Create New Deal', icon: 'add_circle', action: () => window.location.href = 'crm.html?action=new' },
        { id: 'goto-crm', label: 'Go to Deal Pipeline', icon: 'dashboard', action: () => window.location.href = 'crm.html' },
        { id: 'goto-vdr', label: 'Open Data Room', icon: 'folder_open', action: () => window.location.href = 'vdr.html' },
        { id: 'goto-memo', label: 'Investment Memo Builder', icon: 'edit_note', action: () => window.location.href = 'memo-builder.html' },
        { id: 'goto-settings', label: 'Settings', icon: 'settings', action: () => window.location.href = 'settings.html' },
    ];

    // Open search modal
    function open() {
        if (isOpen) return;
        isOpen = true;
        selectedIndex = 0;
        results = [];

        const modal = document.createElement('div');
        modal.id = 'global-search-modal';
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-start justify-center pt-[15vh]';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-fadeIn">
                <!-- Search Input -->
                <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
                    <span class="material-symbols-outlined text-gray-400">search</span>
                    <input
                        type="text"
                        id="global-search-input"
                        class="flex-1 text-lg outline-none placeholder-gray-400"
                        placeholder="Search deals, documents, or type a command..."
                        autocomplete="off"
                    />
                    <kbd class="px-2 py-0.5 text-xs font-bold text-gray-400 bg-gray-100 rounded border border-gray-200">ESC</kbd>
                </div>

                <!-- Results -->
                <div id="global-search-results" class="max-h-[400px] overflow-y-auto">
                    ${renderQuickActions()}
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
                    <div class="flex items-center gap-4">
                        <span class="flex items-center gap-1">
                            <kbd class="px-1.5 py-0.5 bg-white rounded border border-gray-200">↑</kbd>
                            <kbd class="px-1.5 py-0.5 bg-white rounded border border-gray-200">↓</kbd>
                            Navigate
                        </span>
                        <span class="flex items-center gap-1">
                            <kbd class="px-1.5 py-0.5 bg-white rounded border border-gray-200">↵</kbd>
                            Select
                        </span>
                    </div>
                    <span>PE OS Command Palette</span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Focus input
        const input = document.getElementById('global-search-input');
        input.focus();

        // Event handlers
        input.addEventListener('input', (e) => handleSearch(e.target.value));
        input.addEventListener('keydown', handleKeyDown);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        // Add click handlers for result items
        addResultClickHandlers();
    }

    // Close search modal
    function close() {
        const modal = document.getElementById('global-search-modal');
        if (modal) {
            modal.remove();
        }
        isOpen = false;
    }

    // Render quick actions
    function renderQuickActions() {
        return `
            <div class="p-2">
                <div class="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Actions</div>
                ${quickActions.map((action, idx) => `
                    <div class="search-result-item flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 ${idx === selectedIndex ? 'bg-primary-light' : ''}" data-index="${idx}" data-type="action" data-action-id="${action.id}">
                        <div class="size-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <span class="material-symbols-outlined text-amber-600 text-lg">${action.icon}</span>
                        </div>
                        <span class="text-sm font-medium text-gray-800">${action.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Handle search input
    async function handleSearch(query) {
        // Clear previous timeout
        if (searchTimeout) clearTimeout(searchTimeout);

        if (!query.trim()) {
            // Show quick actions if no query
            document.getElementById('global-search-results').innerHTML = renderQuickActions();
            results = quickActions.map(a => ({ ...a, type: 'action' }));
            selectedIndex = 0;
            addResultClickHandlers();
            return;
        }

        // Show loading state
        document.getElementById('global-search-results').innerHTML = `
            <div class="flex items-center justify-center py-8">
                <span class="material-symbols-outlined text-primary animate-spin">sync</span>
                <span class="ml-2 text-gray-500">Searching...</span>
            </div>
        `;

        // Debounce search
        searchTimeout = setTimeout(async () => {
            await performSearch(query);
        }, 300);
    }

    // Perform the actual search
    async function performSearch(query) {
        try {
            // Search deals
            const dealsResponse = await window.PEAuth.authFetch(`${API_BASE_URL}/deals?search=${encodeURIComponent(query)}&limit=5`);
            const deals = dealsResponse.ok ? await dealsResponse.json() : [];

            // Filter quick actions by query
            const matchingActions = quickActions.filter(a =>
                a.label.toLowerCase().includes(query.toLowerCase())
            );

            // Build results
            results = [
                ...deals.map(d => ({ ...d, type: 'deal' })),
                ...matchingActions.map(a => ({ ...a, type: 'action' })),
            ];

            selectedIndex = 0;
            renderResults(query);
        } catch (error) {
            console.error('Search error:', error);
            document.getElementById('global-search-results').innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                    <span class="material-symbols-outlined text-2xl mb-2">error</span>
                    <p class="text-sm">Search failed. Please try again.</p>
                </div>
            `;
        }
    }

    // Render search results
    function renderResults(query) {
        const container = document.getElementById('global-search-results');

        if (results.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                    <span class="material-symbols-outlined text-3xl mb-2">search_off</span>
                    <p class="text-sm font-medium">No results found for "${query}"</p>
                    <p class="text-xs mt-1">Try a different search term</p>
                </div>
            `;
            return;
        }

        // Group results by type
        const dealResults = results.filter(r => r.type === 'deal');
        const actionResults = results.filter(r => r.type === 'action');

        let html = '<div class="p-2">';
        let globalIndex = 0;

        // Deals section
        if (dealResults.length > 0) {
            html += `<div class="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Deals</div>`;
            html += dealResults.map(deal => {
                const isSelected = globalIndex === selectedIndex;
                const itemHtml = `
                    <div class="search-result-item flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-primary-light' : ''}" data-index="${globalIndex}" data-type="deal" data-deal-id="${deal.id}">
                        <div class="size-8 rounded-lg bg-primary-light flex items-center justify-center">
                            <span class="material-symbols-outlined text-primary text-lg">${deal.icon || 'business_center'}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 truncate">${highlightMatch(deal.name, query)}</p>
                            <p class="text-xs text-gray-500 truncate">${deal.industry || 'No industry'} • ${formatStage(deal.stage)}</p>
                        </div>
                        ${deal.dealSize ? `<span class="text-xs font-bold text-gray-500">$${deal.dealSize}M</span>` : ''}
                    </div>
                `;
                globalIndex++;
                return itemHtml;
            }).join('');
        }

        // Actions section
        if (actionResults.length > 0) {
            html += `<div class="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">Quick Actions</div>`;
            html += actionResults.map(action => {
                const isSelected = globalIndex === selectedIndex;
                const itemHtml = `
                    <div class="search-result-item flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-primary-light' : ''}" data-index="${globalIndex}" data-type="action" data-action-id="${action.id}">
                        <div class="size-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <span class="material-symbols-outlined text-amber-600 text-lg">${action.icon}</span>
                        </div>
                        <span class="text-sm font-medium text-gray-800">${highlightMatch(action.label, query)}</span>
                    </div>
                `;
                globalIndex++;
                return itemHtml;
            }).join('');
        }

        html += '</div>';
        container.innerHTML = html;
        addResultClickHandlers();
    }

    // Highlight matching text
    function highlightMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="bg-amber-200 px-0.5 rounded">$1</mark>');
    }

    // Format stage label
    function formatStage(stage) {
        const stages = {
            'INITIAL_REVIEW': 'Initial Review',
            'DUE_DILIGENCE': 'Due Diligence',
            'IOI_SUBMITTED': 'IOI Submitted',
            'LOI_SUBMITTED': 'LOI Submitted',
            'NEGOTIATION': 'Negotiation',
            'CLOSING': 'Closing',
            'PASSED': 'Passed',
            'CLOSED_WON': 'Closed Won',
            'CLOSED_LOST': 'Closed Lost',
        };
        return stages[stage] || stage;
    }

    // Add click handlers to result items
    function addResultClickHandlers() {
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                const idx = parseInt(item.dataset.index);
                selectResult(idx, type, item);
            });
        });
    }

    // Handle keyboard navigation
    function handleKeyDown(e) {
        const totalResults = results.length;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % totalResults;
                updateSelection();
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? totalResults - 1 : selectedIndex - 1;
                updateSelection();
                break;
            case 'Enter':
                e.preventDefault();
                const selected = document.querySelector('.search-result-item.bg-primary-light');
                if (selected) {
                    selectResult(selectedIndex, selected.dataset.type, selected);
                }
                break;
            case 'Escape':
                e.preventDefault();
                close();
                break;
        }
    }

    // Update selected item highlighting
    function updateSelection() {
        document.querySelectorAll('.search-result-item').forEach((item, idx) => {
            if (idx === selectedIndex) {
                item.classList.add('bg-primary-light');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-primary-light');
            }
        });
    }

    // Select and execute a result
    function selectResult(index, type, element) {
        close();

        if (type === 'deal') {
            const dealId = element.dataset.dealId;
            window.location.href = `deal.html?id=${dealId}`;
        } else if (type === 'action') {
            const actionId = element.dataset.actionId;
            const action = quickActions.find(a => a.id === actionId);
            if (action && action.action) {
                action.action();
            }
        }
    }

    // Initialize global keyboard shortcut
    function init() {
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + K to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (isOpen) {
                    close();
                } else {
                    open();
                }
            }
        });

        // Setup search input click handler on CRM page
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('focus', (e) => {
                // Only open command palette if user clicks (not from tab)
                if (e.relatedTarget === null) {
                    open();
                    e.target.blur();
                }
            });
        }
    }

    // Public API
    return {
        init,
        open,
        close,
    };
})();

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.PEGlobalSearch.init();
});

console.log('PEGlobalSearch loaded successfully');
