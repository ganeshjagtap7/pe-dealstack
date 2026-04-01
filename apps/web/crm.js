        // API_BASE_URL loaded from js/config.js

        // Current filter/sort state
        let filters = {
            stage: '',
            industry: '',
            minDealSize: '',
            maxDealSize: '',
            priority: '',
            search: '',
            sortBy: 'updatedAt',
            sortOrder: 'desc'
        };

        // Bulk selection state
        let selectedDeals = new Set();
        let allDeals = []; // Store all loaded deals for reference

        // Stage badge styles
        const stageStyles = {
            'INITIAL_REVIEW': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', label: 'Initial Review' },
            'DUE_DILIGENCE': { bg: 'bg-primary-light', border: 'border-primary/20', text: 'text-primary', label: 'Due Diligence' },
            'IOI_SUBMITTED': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'IOI Submitted' },
            'LOI_SUBMITTED': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', label: 'LOI Submitted' },
            'NEGOTIATION': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', label: 'Negotiation' },
            'CLOSING': { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', label: 'Closing' },
            'PASSED': { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600', label: 'Passed' },
            'CLOSED_WON': { bg: 'bg-secondary-light', border: 'border-secondary/20', text: 'text-secondary', label: 'Closed Won' },
            'CLOSED_LOST': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', label: 'Closed Lost' }
        };

        // Metrics configuration — maps metric keys to display info
        const METRIC_CONFIG = {
            irrProjected: {
                label: 'IRR (Proj)',
                kanbanLabel: 'IRR',
                format: (val) => val ? val.toFixed(1) + '%' : 'N/A',
                colorFn: () => 'text-text-main',
            },
            mom: {
                label: 'MoM',
                kanbanLabel: 'MoM',
                format: (val) => val ? val.toFixed(1) + 'x' : 'N/A',
                colorFn: (val) => val >= 3 ? 'text-secondary' : 'text-text-main',
            },
            ebitda: {
                label: 'EBITDA',
                kanbanLabel: 'EBITDA',
                format: (val) => formatCurrency(val),
                colorFn: (val) => val < 0 ? 'text-red-600' : 'text-text-main',
            },
            revenue: {
                label: 'Revenue',
                kanbanLabel: 'Revenue',
                format: (val) => formatCurrency(val),
                colorFn: () => 'text-text-main',
            },
            dealSize: {
                label: 'Deal Size',
                kanbanLabel: 'Size',
                format: (val) => formatCurrency(val),
                colorFn: () => 'text-text-main',
            },
        };

        const DEFAULT_CARD_METRICS = ['irrProjected', 'mom', 'ebitda', 'revenue'];
        let activeCardMetrics = [...DEFAULT_CARD_METRICS];

        const METRICS_STORAGE_KEY = 'pe-deal-card-metrics';

        // formatCurrency(), formatRelativeTime(), getDocIcon() available globally from js/formatters.js

        // Current view state
        let currentView = localStorage.getItem('crm-view') || 'list'; // 'list' or 'kanban'

        // Load deals from API
        async function loadDeals() {
            const grid = document.getElementById('deals-grid');
            grid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <span class="material-symbols-outlined text-primary text-4xl animate-spin mb-4">sync</span>
            <p class="text-text-muted text-sm font-medium">Loading deals...</p>
        </div>
    `;

            try {
                const queryString = buildQueryString();
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals?${queryString}`);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const deals = await response.json();
                allDeals = deals; // Store for bulk operations

                // Onboarding: mark createDeal step as complete if user has deals
                if (deals.length > 0 && window.OnboardingAPI) {
                    OnboardingAPI.completeStep('createDeal');
                }

                // Update industry filter with actual industries from deals
                updateIndustryFilter(deals);

                // Update deal count
                const activeDeals = deals.filter(d => d.status !== 'PASSED').length;
                document.getElementById('deal-count').innerHTML = `
            <span class="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(5,150,105,0.4)]"></span>
            ${activeDeals} Active Opportunities
        `;

                if (deals.length === 0) {
                    grid.innerHTML = renderEmpty();
                    return;
                }

                // Render based on current view
                if (currentView === 'kanban') {
                    grid.classList.add('hidden');
                    document.getElementById('kanban-board').classList.remove('hidden');
                    renderKanbanBoard();
                } else {
                    grid.classList.remove('hidden');
                    document.getElementById('kanban-board').classList.add('hidden');
                    grid.innerHTML = deals.map(deal => renderDealCard(deal)).join('') + renderUploadCard();
                }

            } catch (error) {
                console.error('Error loading deals:', error);
                grid.innerHTML = renderError(error.message);
            }
        }

        // Upload modal functionality — uses deal-intake-modal.js
        function initializeUploadModal() {
            // Initialize the full Deal Intake modal (Upload File, Paste Text, Enter URL)
            initDealIntakeModal(API_BASE_URL);

            // Wire up the "Ingest Deal Data" header button to open the modal
            const ingestBtn = document.getElementById('ingest-btn');
            if (ingestBtn) {
                ingestBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDealIntakeModal();
                });
            }
        }

        // Initialize view toggle
        function initializeViewToggle() {
            document.getElementById('view-list-btn')?.addEventListener('click', () => setView('list'));
            document.getElementById('view-kanban-btn')?.addEventListener('click', () => setView('kanban'));

            // Apply saved view preference on load
            if (currentView === 'kanban') {
                setView('kanban');
            }
        }

        // Initialize upload card click handler
        function initializeUploadCard() {
            document.addEventListener('click', (e) => {
                if (e.target.closest('#upload-card')) {
                    openDealIntakeModal();
                }
            });
        }

        function initializeKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // CMD+K to focus search
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                    e.preventDefault();
                    document.getElementById('search-input').focus();
                }
                // Escape to close modal
                if (e.key === 'Escape') {
                    closeDealIntakeModal();
                }
            });
        }

        // Initialize on page load
        // Apply user preferences from server (source of truth)
        window.addEventListener('pe-user-loaded', (e) => {
            const prefs = e.detail?.user?.preferences;
            if (!prefs) return;
            const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs;
            if (Array.isArray(parsed.dealCardMetrics) && parsed.dealCardMetrics.length > 0) {
                const validKeys = Object.keys(METRIC_CONFIG);
                const validated = parsed.dealCardMetrics.filter(k => validKeys.includes(k));
                if (validated.length > 0) {
                    activeCardMetrics = validated;
                    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(validated));
                    // Re-render if deals already loaded
                    if (allDeals.length > 0) {
                        if (currentView === 'kanban') {
                            renderKanbanBoard();
                        } else {
                            renderDealsGrid();
                        }
                    }
                }
            }
        });

        document.addEventListener('DOMContentLoaded', async () => {
            // Check authentication - redirect to login if not authenticated
            await PEAuth.initSupabase();
            const auth = await PEAuth.checkAuth();
            if (!auth) return; // checkAuth redirects to login

            // Initialize shared layout with collapsible sidebar
            PELayout.init('deals', { collapsible: true });

            loadCachedMetrics();
            initializeFilters();
            initializeViewToggle();
            initializeMetricsSelector();
            loadDeals();
            initializeUploadModal();
            initializeUploadCard();
            initializeKeyboardShortcuts();
            initializeBulkActions();

            // Onboarding: feedback button + beta badge + step detection
            if (window.initOnboardingUI) initOnboardingUI();
        });
