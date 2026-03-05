
        // Fetch and display deals
        async function loadDeals() {
            try {
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals`);
                if (!response.ok) throw new Error('Failed to fetch deals');

                const deals = await response.json();

                // Update deal count
                const activeDeals = deals.filter(d => d.status === 'ACTIVE').length;
                document.getElementById('deal-count').textContent = `${activeDeals} Active Opportunities`;

                // Render deals
                renderDeals(deals);
            } catch (error) {
                console.error('Error loading deals:', error);
                document.getElementById('deals-grid').innerHTML = `
            <div class="col-span-full flex items-center justify-center py-20">
                <div class="text-center">
                    <span class="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
                    <p class="text-text-muted mb-2">Failed to load deals</p>
                    <p class="text-sm text-text-muted">Make sure the API server is running at ${API_BASE_URL}</p>
                    <button onclick="loadDeals()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover">
                        Retry
                    </button>
                </div>
            </div>
        `;
            }
        }

        function getStageColor(stage) {
            const colors = {
                'DUE_DILIGENCE': 'emerald',
                'INITIAL_REVIEW': 'blue',
                'IOI_SUBMITTED': 'amber',
                'LOI_SUBMITTED': 'purple',
                'NEGOTIATION': 'orange',
                'CLOSING': 'green',
                'PASSED': 'slate',
            };
            return colors[stage] || 'gray';
        }

        function getStageLabel(stage) {
            const labels = {
                'DUE_DILIGENCE': 'Due Diligence',
                'INITIAL_REVIEW': 'Initial Review',
                'IOI_SUBMITTED': 'IOI Submitted',
                'LOI_SUBMITTED': 'LOI Submitted',
                'NEGOTIATION': 'Negotiation',
                'CLOSING': 'Closing',
                'PASSED': 'Passed',
            };
            return labels[stage] || stage;
        }

        function formatTime(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            if (hours < 24) return `${hours}h ago`;
            return `${days}d ago`;
        }

        function renderDeals(deals) {
            const grid = document.getElementById('deals-grid');

            if (deals.length === 0) {
                grid.innerHTML = `
            <div class="col-span-full flex items-center justify-center py-20">
                <div class="text-center">
                    <span class="material-symbols-outlined text-5xl text-text-muted mb-4">inventory_2</span>
                    <p class="text-text-muted">No deals found</p>
                </div>
            </div>
        `;
                return;
            }

            const activeDeals = deals.filter(d => d.status === 'ACTIVE');
            const passedDeals = deals.filter(d => d.status === 'PASSED');

            grid.innerHTML = activeDeals.map(deal => renderDealCard(deal)).join('') +
                passedDeals.map(deal => renderDealCard(deal)).join('') +
                renderUploadCard();
        }

        // Format currency — values stored in millions USD
        function formatCurrency(value) {
            if (value === null || value === undefined) return 'N/A';
            const absValue = Math.abs(value);
            const sign = value < 0 ? '-' : '';
            if (absValue >= 1000) {
                const b = absValue / 1000;
                return `${sign}$${b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)}B`;
            }
            if (absValue >= 1) {
                return `${sign}$${absValue >= 100 ? absValue.toFixed(0) : absValue >= 10 ? absValue.toFixed(1) : absValue.toFixed(2)}M`;
            }
            const k = absValue * 1000;
            if (k >= 1) {
                return `${sign}$${k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)}K`;
            }
            const dollars = absValue * 1000000;
            return `${sign}$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        }

        function renderDealCard(deal) {
            const stageColor = getStageColor(deal.stage);
            const isPassed = deal.status === 'PASSED';
            const opacityClass = isPassed ? 'opacity-80 hover:opacity-100 grayscale hover:grayscale-0' : '';

            return `
        <a href="deal.html?id=${deal.id}" class="block">
            <article class="bg-surface-white rounded-xl border border-border-subtle p-6 hover:border-primary/30 transition-all cursor-pointer group flex flex-col h-full shadow-card hover:shadow-card-hover relative overflow-hidden ${opacityClass}">
                <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-slate-50 to-transparent rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
                <div class="flex justify-between items-start mb-6 relative z-10">
                    <div class="flex gap-3 items-center">
                        <div class="size-11 rounded-lg bg-slate-50 border border-border-subtle flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined">${deal.icon || 'business_center'}</span>
                        </div>
                        <div>
                            <h3 class="text-text-main font-bold text-lg leading-tight group-hover:text-primary transition-colors">${deal.name}</h3>
                            <p class="text-text-muted text-xs font-medium">${deal.industry || 'N/A'}</p>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-md bg-${stageColor}-50 border border-${stageColor}-100 text-${stageColor}-600 text-[10px] font-bold uppercase tracking-wider">${getStageLabel(deal.stage)}</span>
                </div>
                <div class="grid grid-cols-2 gap-px bg-border-subtle rounded-lg overflow-hidden border border-border-subtle mb-6">
                    <div class="bg-surface-white p-3.5 flex flex-col items-center">
                        <span class="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-1">IRR (Proj)</span>
                        <span class="text-text-main font-bold text-lg tabular-nums">${deal.irrProjected ? deal.irrProjected.toFixed(1) + '%' : 'N/A'}</span>
                    </div>
                    <div class="bg-surface-white p-3.5 flex flex-col items-center">
                        <span class="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-1">MoM</span>
                        <span class="text-${deal.mom >= 3 ? 'emerald' : 'text'}-${deal.mom >= 3 ? '600' : 'main'} font-bold text-lg tabular-nums">${deal.mom ? deal.mom.toFixed(1) + 'x' : 'N/A'}</span>
                    </div>
                    <div class="bg-surface-white p-3.5 flex flex-col items-center">
                        <span class="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-1">EBITDA</span>
                        <span class="text-${deal.ebitda < 0 ? 'red' : 'text'}-${deal.ebitda < 0 ? '500' : 'main'} font-bold text-lg tabular-nums">${formatCurrency(deal.ebitda)}</span>
                    </div>
                    <div class="bg-surface-white p-3.5 flex flex-col items-center">
                        <span class="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-1">Revenue</span>
                        <span class="text-text-main font-bold text-lg tabular-nums">${formatCurrency(deal.revenue)}</span>
                    </div>
                </div>
                <div class="bg-slate-50 rounded-lg p-4 border border-border-subtle mt-auto">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="material-symbols-outlined text-${isPassed ? 'red' : 'purple'}-${isPassed ? '500' : '600'} text-sm">${isPassed ? 'warning' : 'auto_awesome'}</span>
                        <span class="text-${isPassed ? 'red' : 'purple'}-${isPassed ? '500' : '600'} text-xs font-bold uppercase">${isPassed ? 'Risk Flag' : 'AI Thesis'}</span>
                    </div>
                    <p class="text-slate-600 text-xs leading-relaxed font-medium">
                        ${deal.aiThesis || 'No AI thesis available'}
                    </p>
                </div>
                ${deal.lastDocument ? `
                <div class="flex items-center justify-between mt-5 pt-4 border-t border-border-subtle">
                    <div class="flex items-center gap-1.5 text-text-muted hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[16px]">description</span>
                        <span class="text-[11px] font-medium">${deal.lastDocument}</span>
                    </div>
                    <span class="text-[11px] text-text-muted font-medium">Updated ${deal.lastDocumentUpdated ? formatTime(deal.lastDocumentUpdated) : 'recently'}</span>
                </div>
                ` : ''}
            </article>
        </a>
    `;
        }

        function renderUploadCard() {
            return `
        <article class="bg-transparent rounded-xl border-2 border-dashed border-slate-300 p-6 hover:border-primary hover:bg-white/50 transition-all cursor-pointer group flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
            <div class="size-16 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:scale-110 group-hover:border-primary/20 transition-all shadow-sm group-hover:shadow-md">
                <span class="material-symbols-outlined text-text-muted group-hover:text-primary text-3xl">add</span>
            </div>
            <div>
                <h3 class="text-text-main font-bold text-lg group-hover:text-primary transition-colors">Upload Documents</h3>
                <p class="text-text-muted text-sm mt-1 max-w-[200px] font-medium">Drag & drop CIMs, Teasers, or Excel models to auto-create deal blocks.</p>
            </div>
        </article>
    `;
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', async function () {
            // Initialize auth and check if user is logged in
            await PEAuth.initSupabase();
            const auth = await PEAuth.checkAuth();
            if (!auth) return; // Will redirect to login

            loadDeals();
        });
