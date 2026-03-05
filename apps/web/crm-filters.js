// CRM Filters Module
// PE OS - Private Equity Operating System
// Extracted from crm.js — filter/search/sort logic

        // Build query string from filters
        function buildQueryString() {
            const params = new URLSearchParams();
            if (filters.stage) params.set('stage', filters.stage);
            if (filters.industry) params.set('industry', filters.industry);
            if (filters.minDealSize) params.set('minDealSize', filters.minDealSize);
            if (filters.maxDealSize) params.set('maxDealSize', filters.maxDealSize);
            if (filters.priority) params.set('priority', filters.priority);
            if (filters.search) params.set('search', filters.search);
            if (filters.sortBy) params.set('sortBy', filters.sortBy);
            if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
            return params.toString();
        }

        // Check if any filters are active
        function hasActiveFilters() {
            return filters.stage || filters.industry || filters.minDealSize || filters.maxDealSize || filters.priority;
        }

        // Update clear filters button visibility
        function updateClearFiltersButton() {
            const btn = document.getElementById('clear-filters-btn');
            if (btn) {
                if (hasActiveFilters()) {
                    btn.classList.remove('hidden');
                    btn.classList.add('flex');
                } else {
                    btn.classList.add('hidden');
                    btn.classList.remove('flex');
                }
            }
        }

        // Clear all filters
        function clearAllFilters() {
            filters.stage = '';
            filters.industry = '';
            filters.minDealSize = '';
            filters.maxDealSize = '';
            filters.priority = '';

            // Reset UI
            document.getElementById('stage-filter-text').textContent = 'Stage: All';
            document.getElementById('industry-filter-text').textContent = 'Industry: All';
            document.getElementById('dealsize-filter-text').textContent = 'Deal Size: All';
            document.getElementById('priority-filter-text').textContent = 'Priority: All';

            updateClearFiltersButton();
            loadDeals();
        }

        // Update industry filter dropdown dynamically based on deals data
        function updateIndustryFilter(deals) {
            const industries = [...new Set(deals.map(d => d.industry).filter(Boolean))].sort();
            const dropdown = document.getElementById('industry-dropdown');

            dropdown.innerHTML = `
        <button data-industry="" class="w-full text-left px-4 py-2 text-sm hover:bg-primary-light font-medium">All Industries</button>
        ${industries.map(ind =>
                `<button data-industry="${ind}" class="w-full text-left px-4 py-2 text-sm hover:bg-primary-light">${ind}</button>`
            ).join('')}
    `;

            // Re-attach click handlers
            dropdown.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.industry = btn.dataset.industry;
                    document.getElementById('industry-filter-text').textContent = filters.industry
                        ? `Industry: ${filters.industry}`
                        : 'Industry: All';
                    dropdown.classList.add('hidden');
                    updateClearFiltersButton();
                    loadDeals();
                });
            });
        }

        // Debounce function for search
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Initialize dropdowns and event listeners
        function initializeFilters() {
            // Toggle dropdown visibility
            function toggleDropdown(btnId, dropdownId) {
                const btn = document.getElementById(btnId);
                const dropdown = document.getElementById(dropdownId);

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close all other dropdowns
                    document.querySelectorAll('[id$="-dropdown"]').forEach(d => {
                        if (d.id !== dropdownId) d.classList.add('hidden');
                    });
                    dropdown.classList.toggle('hidden');
                });
            }

            // Stage filter
            toggleDropdown('stage-filter-btn', 'stage-dropdown');
            document.querySelectorAll('#stage-dropdown button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.stage = btn.dataset.stage;
                    document.getElementById('stage-filter-text').textContent = filters.stage
                        ? `Stage: ${stageStyles[filters.stage]?.label || filters.stage}`
                        : 'Stage: All';
                    document.getElementById('stage-dropdown').classList.add('hidden');
                    loadDeals();
                });
            });

            // Industry filter
            toggleDropdown('industry-filter-btn', 'industry-dropdown');
            document.querySelectorAll('#industry-dropdown button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.industry = btn.dataset.industry;
                    document.getElementById('industry-filter-text').textContent = filters.industry
                        ? `Industry: ${filters.industry}`
                        : 'Industry: All';
                    document.getElementById('industry-dropdown').classList.add('hidden');
                    loadDeals();
                });
            });

            // Deal size filter
            toggleDropdown('dealsize-filter-btn', 'dealsize-dropdown');
            document.querySelectorAll('#dealsize-dropdown button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.minDealSize = btn.dataset.min;
                    filters.maxDealSize = btn.dataset.max;
                    let text = 'Deal Size: All';
                    if (btn.dataset.min && btn.dataset.max) {
                        text = `Deal Size: $${btn.dataset.min}M - $${btn.dataset.max}M`;
                    } else if (btn.dataset.min) {
                        text = `Deal Size: > $${btn.dataset.min}M`;
                    } else if (btn.dataset.max) {
                        text = `Deal Size: < $${btn.dataset.max}M`;
                    }
                    document.getElementById('dealsize-filter-text').textContent = text;
                    document.getElementById('dealsize-dropdown').classList.add('hidden');
                    loadDeals();
                });
            });

            // Priority filter
            toggleDropdown('priority-filter-btn', 'priority-dropdown');
            document.querySelectorAll('#priority-dropdown button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.priority = btn.dataset.priority;
                    const priorityLabels = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
                    document.getElementById('priority-filter-text').textContent = filters.priority
                        ? `Priority: ${priorityLabels[filters.priority] || filters.priority}`
                        : 'Priority: All';
                    document.getElementById('priority-dropdown').classList.add('hidden');
                    loadDeals();
                    updateClearFiltersButton();
                });
            });

            // Sort
            toggleDropdown('sort-btn', 'sort-dropdown');
            document.querySelectorAll('#sort-dropdown button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filters.sortBy = btn.dataset.sort;
                    filters.sortOrder = btn.dataset.order;
                    document.getElementById('sort-text').textContent = `Sort by: ${btn.textContent.trim()}`;
                    document.getElementById('sort-dropdown').classList.add('hidden');
                    loadDeals();
                });
            });

            // Clear filters button
            document.getElementById('clear-filters-btn')?.addEventListener('click', clearAllFilters);

            // Search input with debounce
            const searchInput = document.getElementById('search-input');
            const debouncedSearch = debounce(() => {
                filters.search = searchInput.value;
                loadDeals();
            }, 300);
            searchInput.addEventListener('input', debouncedSearch);

            // Close dropdowns when clicking outside
            document.addEventListener('click', () => {
                document.querySelectorAll('[id$="-dropdown"]').forEach(d => d.classList.add('hidden'));
            });
        }
