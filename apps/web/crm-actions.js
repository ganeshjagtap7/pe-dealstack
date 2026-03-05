        // ============================================================
        // Bulk Selection Operations
        // ============================================================
        function toggleDealSelection(dealId) {
            if (selectedDeals.has(dealId)) {
                selectedDeals.delete(dealId);
            } else {
                selectedDeals.add(dealId);
            }
            updateBulkActionsBar();
            updateDealCardSelection(dealId);
        }

        function updateDealCardSelection(dealId) {
            const card = document.querySelector(`[data-deal-id="${dealId}"]`);
            if (!card) return;

            const checkbox = card.querySelector('.deal-checkbox');
            const checkboxLabel = checkbox?.closest('label');
            const article = card.querySelector('article');
            const checkIcon = checkboxLabel?.querySelector('.material-symbols-outlined');

            if (selectedDeals.has(dealId)) {
                checkbox.checked = true;
                checkboxLabel?.classList.add('bg-primary', 'border-primary');
                checkboxLabel?.classList.remove('bg-white/90');
                article?.classList.add('ring-2', 'ring-primary', 'border-primary');
                if (checkIcon) {
                    checkIcon.classList.remove('text-transparent', 'group-hover/card:text-gray-300');
                    checkIcon.classList.add('text-white');
                }
            } else {
                checkbox.checked = false;
                checkboxLabel?.classList.remove('bg-primary', 'border-primary');
                checkboxLabel?.classList.add('bg-white/90');
                article?.classList.remove('ring-2', 'ring-primary', 'border-primary');
                if (checkIcon) {
                    checkIcon.classList.add('text-transparent', 'group-hover/card:text-gray-300');
                    checkIcon.classList.remove('text-white');
                }
            }
        }

        function updateBulkActionsBar() {
            const bar = document.getElementById('bulk-actions-bar');
            const countSpan = document.getElementById('selection-count');

            if (selectedDeals.size > 0) {
                bar.classList.remove('hidden');
                countSpan.textContent = `${selectedDeals.size} deal${selectedDeals.size > 1 ? 's' : ''} selected`;
            } else {
                bar.classList.add('hidden');
            }
        }

        function clearSelection() {
            const dealIds = [...selectedDeals];
            selectedDeals.clear();
            dealIds.forEach(id => updateDealCardSelection(id));
            updateBulkActionsBar();
        }

        function selectAllDeals() {
            allDeals.forEach(deal => {
                selectedDeals.add(deal.id);
                updateDealCardSelection(deal.id);
            });
            updateBulkActionsBar();
        }

        // Bulk Stage Change
        function showBulkStageModal() {
            const stageOptions = Object.entries(stageStyles).map(([key, style]) =>
                `<button data-stage="${key}" class="w-full text-left px-4 py-3 hover:bg-primary-light flex items-center gap-3 transition-colors">
            <span class="px-2 py-0.5 rounded ${style.bg} ${style.text} text-xs font-bold">${style.label}</span>
        </button>`
            ).join('');

            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
            modal.id = 'bulk-stage-modal';
            modal.innerHTML = `
        <div class="bg-surface-card rounded-xl shadow-2xl max-w-md w-full animate-[slideIn_0.2s_ease-out]">
            <div class="p-4 border-b border-border-subtle flex items-center justify-between">
                <h3 class="font-bold text-text-main">Change Stage for ${selectedDeals.size} Deal${selectedDeals.size > 1 ? 's' : ''}</h3>
                <button onclick="this.closest('#bulk-stage-modal').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="max-h-[400px] overflow-y-auto divide-y divide-border-subtle">
                ${stageOptions}
            </div>
        </div>
    `;
            document.body.appendChild(modal);

            // Add click handlers
            modal.querySelectorAll('[data-stage]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const newStage = btn.dataset.stage;
                    await bulkUpdateStage(newStage);
                    modal.remove();
                });
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }

        async function bulkUpdateStage(newStage) {
            const dealIds = [...selectedDeals];
            let successCount = 0;
            let errorCount = 0;

            showNotification('Updating...', `Changing stage for ${dealIds.length} deals`, 'info');

            for (const dealId of dealIds) {
                try {
                    const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stage: newStage }),
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error('Error updating deal:', dealId, error);
                    errorCount++;
                }
            }

            clearSelection();
            loadDeals();

            const stageLabel = stageStyles[newStage]?.label || newStage;
            if (errorCount === 0) {
                showNotification('Success', `${successCount} deals moved to ${stageLabel}`, 'success');
            } else {
                showNotification('Partial Success', `${successCount} updated, ${errorCount} failed`, 'error');
            }
        }

        // Bulk Mark as Passed
        async function bulkMarkAsPassed() {
            const dealIds = [...selectedDeals];
            if (!confirm(`Are you sure you want to mark ${dealIds.length} deal${dealIds.length > 1 ? 's' : ''} as Passed?`)) {
                return;
            }

            await bulkUpdateStage('PASSED');
        }

        // ============================================================
        // Delete Operations
        // ============================================================

        // Delete deal confirmation modal (promise-based)
        // NOTE: DOM elements are resolved lazily at call time since this
        // script loads before crm.js but after DOM is ready.
        let deleteResolve = null;

        function showDeleteConfirm(title) {
            const modal = document.getElementById('delete-deal-modal');
            const titleEl = document.getElementById('delete-deal-title');
            titleEl.textContent = title;
            modal.classList.remove('hidden');
            return new Promise(resolve => { deleteResolve = resolve; });
        }

        function closeDeleteModal(confirmed) {
            const modal = document.getElementById('delete-deal-modal');
            modal.classList.add('hidden');
            if (deleteResolve) { deleteResolve(confirmed); deleteResolve = null; }
        }

        // Wire up delete modal event listeners once DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('delete-deal-modal-backdrop')?.addEventListener('click', () => closeDeleteModal(false));
            document.getElementById('delete-deal-cancel')?.addEventListener('click', () => closeDeleteModal(false));
            document.getElementById('delete-deal-confirm')?.addEventListener('click', () => closeDeleteModal(true));
        });

        // Delete single deal
        async function deleteDeal(dealId, dealName) {
            closeDealMenus();
            const confirmed = await showDeleteConfirm(`Delete "${dealName}"?`);
            if (!confirmed) return;
            try {
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    if (response.status === 403) {
                        throw new Error(`You don't have permission to delete deals. Your role (${err.userRole || 'unknown'}) requires deal:delete access. Contact your admin.`);
                    }
                    throw new Error(err.message || err.error || 'Failed to delete deal');
                }
                allDeals = allDeals.filter(d => d.id !== dealId);
                selectedDeals.delete(dealId);
                renderDealsGrid();
                updateBulkActionsBar();
                updateDealCount();
                showNotification('Deal Deleted', `"${dealName}" has been deleted`, 'success');
            } catch (error) {
                console.error('Error deleting deal:', error);
                showNotification('Permission Denied', error.message || 'Failed to delete deal', 'error');
            }
        }

        // Bulk delete deals
        async function bulkDeleteDeals() {
            const dealIds = [...selectedDeals];
            if (dealIds.length === 0) return;
            const count = dealIds.length;
            const confirmed = await showDeleteConfirm(`Delete ${count} deal${count > 1 ? 's' : ''}?`);
            if (!confirmed) return;
            await executeBulkDelete(dealIds);
        }

        async function executeBulkDelete(dealIds) {

            let successCount = 0;
            let failCount = 0;

            for (const dealId of dealIds) {
                try {
                    const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        successCount++;
                        allDeals = allDeals.filter(d => d.id !== dealId);
                        selectedDeals.delete(dealId);
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    failCount++;
                }
            }

            renderDealsGrid();
            updateBulkActionsBar();
            updateDealCount();

            if (failCount === 0) {
                showNotification('Deals Deleted', `${successCount} deal${successCount > 1 ? 's' : ''} deleted successfully`, 'success');
            } else {
                showNotification('Partial Success', `${successCount} deleted, ${failCount} failed`, 'error');
            }
        }

        // Deal card menu toggle
        function toggleDealMenu(dealId) {
            const menu = document.getElementById(`deal-menu-${dealId}`);
            // Close any other open menus first
            document.querySelectorAll('[id^="deal-menu-"]').forEach(m => {
                if (m.id !== `deal-menu-${dealId}`) m.classList.add('hidden');
            });
            menu?.classList.toggle('hidden');
        }

        function closeDealMenus() {
            document.querySelectorAll('[id^="deal-menu-"]').forEach(m => m.classList.add('hidden'));
        }

        // Close deal menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('[id^="deal-menu-"]') && !e.target.closest('button[onclick*="toggleDealMenu"]')) {
                closeDealMenus();
            }
        });

        // Update the deal count in the header after deletion
        function updateDealCount() {
            const countEl = document.getElementById('deal-count');
            if (countEl) {
                const activeDeals = allDeals.filter(d => d.status !== 'PASSED').length;
                countEl.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(5,150,105,0.4)]"></span>
            ${activeDeals} Active Opportunities
        `;
            }
        }

        // ============================================================
        // CSV Export
        // ============================================================
        function exportSelectedToCSV() {
            const dealIds = [...selectedDeals];
            const dealsToExport = allDeals.filter(d => dealIds.includes(d.id));

            if (dealsToExport.length === 0) {
                showNotification('Error', 'No deals selected for export', 'error');
                return;
            }

            // Define CSV headers
            const headers = [
                'Name',
                'Industry',
                'Stage',
                'Status',
                'Revenue (displayed)',
                'EBITDA (displayed)',
                'Deal Size (displayed)',
                'IRR Projected (%)',
                'MoM Multiple',
                'AI Thesis',
                'Created At',
                'Updated At'
            ];

            // Build CSV rows
            const rows = dealsToExport.map(deal => [
                escapeCSV(deal.name),
                escapeCSV(deal.industry || ''),
                escapeCSV(stageStyles[deal.stage]?.label || deal.stage),
                escapeCSV(deal.status || ''),
                deal.revenue != null ? formatCurrency(deal.revenue) : '',
                deal.ebitda != null ? formatCurrency(deal.ebitda) : '',
                deal.dealSize != null ? formatCurrency(deal.dealSize) : '',
                deal.irrProjected?.toString() || '',
                deal.mom?.toString() || '',
                escapeCSV(deal.aiThesis || ''),
                deal.createdAt ? new Date(deal.createdAt).toISOString() : '',
                deal.updatedAt ? new Date(deal.updatedAt).toISOString() : ''
            ]);

            // Combine headers and rows
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `deals-export-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showNotification('Export Complete', `${dealsToExport.length} deals exported to CSV`, 'success');
        }

        function escapeCSV(value) {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }

        // ============================================================
        // Customize Metrics
        // ============================================================

        function renderMetricsOptions() {
            const container = document.getElementById('metrics-options');
            if (!container) return;
            container.innerHTML = Object.entries(METRIC_CONFIG).map(([key, config]) => {
                const isChecked = activeCardMetrics.includes(key);
                return `
                    <label class="flex items-center gap-3 px-4 py-2 hover:bg-primary-light cursor-pointer transition-colors">
                        <input type="checkbox" class="metric-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary"
                            data-metric="${key}" ${isChecked ? 'checked' : ''}>
                        <span class="text-sm text-text-main font-medium">${config.label}</span>
                    </label>
                `;
            }).join('');
        }

        function initializeMetricsSelector() {
            const btn = document.getElementById('metrics-btn');
            const dropdown = document.getElementById('metrics-dropdown');
            if (!btn || !dropdown) return;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdowns
                document.querySelectorAll('[id$="-dropdown"]').forEach(d => {
                    if (d.id !== 'metrics-dropdown') d.classList.add('hidden');
                });
                dropdown.classList.toggle('hidden');
                if (!dropdown.classList.contains('hidden')) {
                    renderMetricsOptions();
                }
            });

            // Prevent clicks inside dropdown from closing it
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.getElementById('metrics-save-btn')?.addEventListener('click', () => {
                const checked = [...document.querySelectorAll('.metric-checkbox:checked')]
                    .map(cb => cb.dataset.metric);
                if (checked.length === 0) {
                    showNotification('Error', 'Select at least one metric', 'error');
                    return;
                }
                activeCardMetrics = checked;
                dropdown.classList.add('hidden');
                // Re-render immediately
                if (currentView === 'kanban') {
                    renderKanbanBoard();
                } else {
                    renderDealsGrid();
                }
                saveMetricsPreference(checked);
            });

            document.getElementById('metrics-reset-btn')?.addEventListener('click', () => {
                activeCardMetrics = [...DEFAULT_CARD_METRICS];
                renderMetricsOptions();
            });
        }

        async function saveMetricsPreference(metrics) {
            try {
                localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
                await PEAuth.authFetch(`${API_BASE_URL}/users/me`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dealCardMetrics: metrics }),
                });
            } catch (error) {
                console.warn('Failed to save metrics preference:', error);
            }
        }

        function loadCachedMetrics() {
            try {
                const cached = localStorage.getItem(METRICS_STORAGE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const validKeys = Object.keys(METRIC_CONFIG);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const validated = parsed.filter(k => validKeys.includes(k));
                        if (validated.length > 0) {
                            activeCardMetrics = validated;
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // Initialize bulk action handlers
        function initializeBulkActions() {
            // Clear selection button
            document.getElementById('clear-selection-btn')?.addEventListener('click', clearSelection);

            // Bulk stage change button
            document.getElementById('bulk-stage-btn')?.addEventListener('click', showBulkStageModal);

            // Export CSV button
            document.getElementById('bulk-export-btn')?.addEventListener('click', exportSelectedToCSV);

            // Mark as Passed button
            document.getElementById('bulk-pass-btn')?.addEventListener('click', bulkMarkAsPassed);

            // Bulk delete button
            document.getElementById('bulk-delete-btn')?.addEventListener('click', bulkDeleteDeals);

            // Keyboard shortcuts for bulk selection
            document.addEventListener('keydown', (e) => {
                // CMD+A to select all when focused on grid
                if ((e.metaKey || e.ctrlKey) && e.key === 'a' && document.activeElement?.closest('#deals-grid')) {
                    e.preventDefault();
                    selectAllDeals();
                }
                // Escape to clear selection
                if (e.key === 'Escape' && selectedDeals.size > 0) {
                    clearSelection();
                }
            });
        }
