// CRM Cards Module
// PE OS - Private Equity Operating System
// Extracted from crm.js — deal card rendering, kanban view, drag-and-drop

        // Render a deal card
        function renderDealCard(deal) {
            const style = stageStyles[deal.stage] || stageStyles['INITIAL_REVIEW'];
            const isPassed = deal.status === 'PASSED' || deal.stage === 'PASSED';
            const hasRiskFlag = deal.ebitda < 0 || deal.stage === 'PASSED';
            const isSelected = selectedDeals.has(deal.id);

            const gridCols = activeCardMetrics.length >= 5 ? 'grid-cols-3' : 'grid-cols-2';
            const metricsGrid = activeCardMetrics.map(key => {
                const config = METRIC_CONFIG[key];
                if (!config) return '';
                const value = deal[key];
                const colorClass = config.colorFn(value);
                return `
                    <div class="bg-background-body rounded-md p-3">
                        <span class="text-text-muted text-[10px] font-bold uppercase tracking-wider block mb-1">${config.label}</span>
                        <span class="${colorClass} font-bold text-lg">${config.format(value)}</span>
                    </div>
                `;
            }).join('');

            return `
        <div class="relative group/card" data-deal-id="${deal.id}">
            <!-- Selection Checkbox -->
            <div class="absolute top-3 left-3 z-10">
                <label class="flex items-center justify-center size-6 rounded bg-white/90 backdrop-blur border border-border-subtle cursor-pointer hover:border-primary shadow-sm transition-all ${isSelected ? 'bg-primary border-primary' : ''}" onclick="event.stopPropagation();">
                    <input type="checkbox" class="deal-checkbox sr-only" data-deal-id="${deal.id}" ${isSelected ? 'checked' : ''} onchange="toggleDealSelection('${deal.id}')">
                    <span class="material-symbols-outlined text-[16px] ${isSelected ? 'text-white' : 'text-transparent group-hover/card:text-gray-300'}">${isSelected ? 'check' : 'check'}</span>
                </label>
            </div>
            <!-- Three-dot Menu -->
            <div class="absolute top-3 right-3 z-10">
                <button onclick="event.preventDefault(); event.stopPropagation(); toggleDealMenu('${deal.id}');" class="flex items-center justify-center size-7 rounded-md bg-white/90 backdrop-blur border border-border-subtle cursor-pointer hover:border-primary shadow-sm transition-all opacity-0 group-hover/card:opacity-100 focus:opacity-100" title="More options">
                    <span class="material-symbols-outlined text-[18px] text-text-muted">more_vert</span>
                </button>
                <div id="deal-menu-${deal.id}" class="hidden absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-50">
                    <a href="deal.html?id=${deal.id}" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                        Open Deal
                    </a>
                    <a href="vdr.html?dealId=${deal.id}" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[18px]">folder_open</span>
                        Open Data Room
                    </a>
                    <div class="border-t border-border-subtle my-1"></div>
                    <button onclick="event.preventDefault(); event.stopPropagation(); deleteDeal('${deal.id}', '${deal.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}');" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                        Delete Deal
                    </button>
                </div>
            </div>
            <a href="deal.html?id=${deal.id}" class="block">
                <article class="bg-surface-card rounded-lg border border-border-subtle p-5 hover:border-primary/30 transition-all cursor-pointer flex flex-col h-full shadow-card hover:shadow-card-hover relative overflow-hidden ${isPassed ? 'opacity-70 hover:opacity-100' : ''} ${isSelected ? 'ring-2 ring-primary border-primary' : ''}">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex gap-3 items-center pl-6">
                            <div class="size-10 rounded-lg bg-primary-light border border-primary/10 flex items-center justify-center text-primary">
                                <span class="material-symbols-outlined text-[20px]">${deal.icon || 'business_center'}</span>
                            </div>
                            <div>
                                <h3 class="text-text-main font-bold text-base leading-tight group-hover/card:text-primary transition-colors">${deal.name}</h3>
                                <p class="text-text-muted text-xs font-medium">${deal.industry || 'N/A'}</p>
                            </div>
                        </div>
                        <span class="px-2 py-1 rounded-md ${style.bg} border ${style.border} ${style.text} text-[10px] font-bold uppercase tracking-wider mr-8">${style.label}</span>
                    </div>
                <div class="grid ${gridCols} gap-3 mb-4">
                    ${metricsGrid}
                </div>
                <div class="bg-background-body rounded-md p-3 mt-auto border border-border-subtle">
                    <div class="flex items-center gap-2 mb-1.5">
                        <span class="material-symbols-outlined ${hasRiskFlag ? 'text-red-500' : 'text-secondary'} text-[14px]">${hasRiskFlag ? 'warning' : 'auto_awesome'}</span>
                        <span class="${hasRiskFlag ? 'text-red-500' : 'text-secondary'} text-[10px] font-bold uppercase tracking-wider">${hasRiskFlag ? 'Risk Flag' : 'AI Thesis'}</span>
                    </div>
                    <p class="text-text-secondary text-xs leading-relaxed line-clamp-2">${deal.aiThesis || 'No AI analysis available yet.'}</p>
                </div>
                <div class="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle">
                    <div class="flex items-center gap-1.5 text-text-muted">
                        <span class="material-symbols-outlined text-[14px]">${getDocIcon(deal.lastDocument)}</span>
                        <span class="text-[11px] font-medium truncate max-w-[100px]">${deal.lastDocument || 'No docs'}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <a href="vdr.html?dealId=${deal.id}" onclick="event.stopPropagation();" class="flex items-center gap-1 text-[11px] text-text-muted hover:text-primary transition-colors" title="Open Data Room">
                            <span class="material-symbols-outlined text-[14px]">folder_open</span>
                            <span class="hidden sm:inline">VDR</span>
                        </a>
                        <span class="text-[11px] text-text-muted font-medium">${formatRelativeTime(deal.lastDocumentUpdated || deal.updatedAt)}</span>
                    </div>
                </div>
            </article>
        </a>
    </div>
    `;
        }

        // Render upload card
        function renderUploadCard() {
            return `
        <article id="upload-card" class="bg-surface-card/50 rounded-lg border-2 border-dashed border-border-subtle p-5 hover:border-primary hover:bg-primary-light/30 transition-all cursor-pointer group flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-4">
            <div class="size-14 rounded-full bg-surface-card border border-border-subtle flex items-center justify-center group-hover:scale-110 group-hover:border-primary/30 transition-all shadow-sm">
                <span class="material-symbols-outlined text-text-muted group-hover:text-primary text-2xl">add</span>
            </div>
            <div>
                <h3 class="text-text-main font-bold text-base group-hover:text-primary transition-colors">Upload Documents</h3>
                <p class="text-text-muted text-sm mt-1 max-w-[180px]">Drop CIMs, Teasers, or Excel models</p>
            </div>
        </article>
    `;
        }

        // Render error state
        function renderError(message) {
            return `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <span class="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
            <p class="text-text-main font-medium mb-2">Failed to load deals</p>
            <p class="text-text-muted text-sm mb-4">${message}</p>
            <button onclick="loadDeals()" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
                Try Again
            </button>
        </div>
    `;
        }

        // Render empty state
        function renderEmpty() {
            return `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <span class="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
            <p class="text-text-main font-medium mb-2">No deals found</p>
            <p class="text-text-muted text-sm">Try adjusting your filters or search query</p>
        </div>
        ${renderUploadCard()}
    `;
        }

        // Render deals in grid view
        function renderDealsGrid() {
            const grid = document.getElementById('deals-grid');

            if (allDeals.length === 0) {
                grid.innerHTML = renderEmpty();
                return;
            }

            grid.innerHTML = allDeals.map(deal => renderDealCard(deal)).join('') + renderUploadCard();
        }

        // ============================================================
        // Kanban View
        // ============================================================

        // Kanban stage order (active pipeline stages)
        const kanbanStages = [
            'INITIAL_REVIEW',
            'DUE_DILIGENCE',
            'IOI_SUBMITTED',
            'LOI_SUBMITTED',
            'NEGOTIATION',
            'CLOSING'
        ];

        // Toggle between list and kanban view
        function setView(view) {
            currentView = view;
            localStorage.setItem('crm-view', view);

            const listBtn = document.getElementById('view-list-btn');
            const kanbanBtn = document.getElementById('view-kanban-btn');
            const dealsGrid = document.getElementById('deals-grid');
            const kanbanBoard = document.getElementById('kanban-board');
            const sortBtn = document.getElementById('sort-btn');

            if (view === 'kanban') {
                listBtn.classList.remove('text-primary', 'bg-primary/10');
                listBtn.classList.add('text-text-muted', 'hover:text-text-secondary', 'hover:bg-gray-100');
                kanbanBtn.classList.add('text-primary', 'bg-primary/10');
                kanbanBtn.classList.remove('text-text-muted', 'hover:text-text-secondary', 'hover:bg-gray-100');
                dealsGrid.classList.add('hidden');
                kanbanBoard.classList.remove('hidden');
                sortBtn.parentElement.classList.add('hidden'); // Hide sort in kanban view
                renderKanbanBoard();
            } else {
                kanbanBtn.classList.remove('text-primary', 'bg-primary/10');
                kanbanBtn.classList.add('text-text-muted', 'hover:text-text-secondary', 'hover:bg-gray-100');
                listBtn.classList.add('text-primary', 'bg-primary/10');
                listBtn.classList.remove('text-text-muted', 'hover:text-text-secondary', 'hover:bg-gray-100');
                kanbanBoard.classList.add('hidden');
                dealsGrid.classList.remove('hidden');
                sortBtn.parentElement.classList.remove('hidden'); // Show sort in list view
                renderDealsGrid();
            }
        }

        // Render Kanban board
        function renderKanbanBoard() {
            const columnsContainer = document.getElementById('kanban-columns');

            if (allDeals.length === 0) {
                columnsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 w-full">
                <span class="material-symbols-outlined text-text-muted text-4xl mb-4">view_kanban</span>
                <p class="text-text-main font-medium mb-2">No deals to display</p>
                <p class="text-text-muted text-sm">Upload documents to create deals</p>
            </div>
        `;
                return;
            }

            // Group deals by stage
            const dealsByStage = {};
            kanbanStages.forEach(stage => {
                dealsByStage[stage] = allDeals.filter(d => d.stage === stage);
            });

            // Render columns
            columnsContainer.innerHTML = kanbanStages.map(stage => {
                const style = stageStyles[stage];
                const deals = dealsByStage[stage] || [];

                return `
            <div class="kanban-column" data-stage="${stage}">
                <div class="bg-surface-card rounded-xl border border-border-subtle overflow-hidden h-full flex flex-col">
                    <!-- Column Header -->
                    <div class="px-4 py-3 border-b border-border-subtle ${style.bg}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 rounded ${style.bg} border ${style.border} ${style.text} text-[10px] font-bold uppercase tracking-wider">${style.label}</span>
                            </div>
                            <span class="text-xs font-bold ${style.text} bg-white/60 px-2 py-0.5 rounded-full">${deals.length}</span>
                        </div>
                    </div>
                    <!-- Column Content -->
                    <div class="kanban-dropzone flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-320px)] custom-scrollbar"
                         ondragover="handleDragOver(event)"
                         ondragleave="handleDragLeave(event)"
                         ondrop="handleDrop(event, '${stage}')">
                        ${deals.map(deal => renderKanbanCard(deal)).join('')}
                        ${deals.length === 0 ? `
                            <div class="text-center py-8 text-text-muted text-sm">
                                <span class="material-symbols-outlined text-2xl mb-2 block opacity-40">inbox</span>
                                Drop deals here
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
            }).join('');
        }

        // Render a compact Kanban card
        function renderKanbanCard(deal) {
            const hasRiskFlag = deal.ebitda < 0 || deal.stage === 'PASSED';

            const kanbanMetrics = activeCardMetrics.slice(0, 3);
            const metricsRow = kanbanMetrics.map(key => {
                const config = METRIC_CONFIG[key];
                if (!config) return '';
                const value = deal[key];
                const colorClass = config.colorFn(value);
                return `
                    <div class="flex-1 bg-background-body rounded px-2 py-1.5">
                        <span class="text-[9px] text-text-muted font-medium uppercase block">${config.kanbanLabel}</span>
                        <span class="text-xs font-bold ${colorClass}">${config.format(value)}</span>
                    </div>
                `;
            }).join('');

            return `
        <div class="kanban-card bg-white rounded-lg border border-border-subtle p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
             draggable="true"
             data-deal-id="${deal.id}"
             ondragstart="handleDragStart(event, '${deal.id}')"
             ondragend="handleDragEnd(event)">
            <a href="deal.html?id=${deal.id}" class="block">
                <!-- Header -->
                <div class="flex items-start gap-2 mb-2">
                    <div class="size-8 rounded-md bg-primary-light border border-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <span class="material-symbols-outlined text-[16px]">${deal.icon || 'business_center'}</span>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="text-sm font-semibold text-text-main truncate hover:text-primary transition-colors">${deal.name}</h4>
                        <p class="text-[11px] text-text-muted truncate">${deal.industry || 'N/A'}</p>
                    </div>
                </div>

                <!-- Metrics Row -->
                <div class="flex gap-3 mb-2">
                    ${metricsRow}
                </div>

                <!-- AI Insight (truncated) -->
                ${deal.aiThesis ? `
                    <div class="flex items-start gap-1.5 pt-2 border-t border-border-subtle">
                        <span class="material-symbols-outlined ${hasRiskFlag ? 'text-red-500' : 'text-secondary'} text-[12px] mt-0.5">${hasRiskFlag ? 'warning' : 'auto_awesome'}</span>
                        <p class="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">${deal.aiThesis}</p>
                    </div>
                ` : ''}
            </a>
        </div>
    `;
        }

        // ============================================================
        // Drag and Drop Handlers
        // ============================================================
        let draggedDealId = null;

        function handleDragStart(event, dealId) {
            draggedDealId = dealId;
            event.target.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', dealId);

            // Add visual feedback to all columns
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.add('drag-active');
            });
        }

        function handleDragEnd(event) {
            event.target.classList.remove('dragging');
            draggedDealId = null;

            // Remove visual feedback from all columns
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-active', 'drag-over');
            });
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';

            const column = event.target.closest('.kanban-column');
            if (column) {
                column.classList.add('drag-over');
            }
        }

        function handleDragLeave(event) {
            const column = event.target.closest('.kanban-column');
            if (column && !column.contains(event.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        }

        async function handleDrop(event, newStage) {
            event.preventDefault();

            const column = event.target.closest('.kanban-column');
            if (column) {
                column.classList.remove('drag-over');
            }

            const dealId = event.dataTransfer.getData('text/plain') || draggedDealId;
            if (!dealId) return;

            const deal = allDeals.find(d => d.id === dealId);
            if (!deal || deal.stage === newStage) return;

            const oldStage = deal.stage;
            const stageLabel = stageStyles[newStage]?.label || newStage;

            // Optimistically update UI
            deal.stage = newStage;
            renderKanbanBoard();

            try {
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stage: newStage }),
                });

                if (!response.ok) {
                    throw new Error('Failed to update stage');
                }

                showNotification('Stage Updated', `"${deal.name}" moved to ${stageLabel}`, 'success');
            } catch (error) {
                console.error('Error updating deal stage:', error);
                // Revert on error
                deal.stage = oldStage;
                renderKanbanBoard();
                showNotification('Error', 'Failed to update deal stage', 'error');
            }
        }
