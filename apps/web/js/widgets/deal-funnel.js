/**
 * PE OS — Deal Funnel Widget
 * Horizontal bars per stage, showing count + share-of-pipeline %.
 */

(function() {
    'use strict';

    const STAGES = [
        { key: 'INITIAL_REVIEW', label: 'Sourcing',     color: '#60A5FA' },
        { key: 'DUE_DILIGENCE',  label: 'Due Diligence', color: '#003366' },
        { key: 'IOI_SUBMITTED',  label: 'IOI / LOI',     color: '#F59E0B', also: ['LOI_SUBMITTED'] },
        { key: 'NEGOTIATION',    label: 'Negotiation',   color: '#8B5CF6', also: ['CLOSING'] },
        { key: 'CLOSED_WON',     label: 'Closed',        color: '#10B981' },
    ];

    window.initDealFunnelWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const deals = await WidgetBase.dealsCache();
            const active = (Array.isArray(deals) ? deals : []).filter(d => d.status !== 'ARCHIVED');

            if (active.length === 0) {
                WidgetBase.renderEmpty(container, 'No deals yet', 'filter_alt');
                return;
            }

            const total = active.length;
            const rows = STAGES.map(stage => {
                const keys = [stage.key, ...(stage.also || [])];
                const count = active.filter(d => keys.includes(d.stage)).length;
                const pct = Math.round((count / total) * 100);
                return { ...stage, count, pct };
            });

            WidgetBase.setBody(container, `
                <div class="p-5 space-y-3">
                    ${rows.map(r => `
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-xs font-semibold text-text-secondary">${r.label}</span>
                                <span class="text-xs text-text-muted"><strong class="text-text-main">${r.count}</strong> · ${r.pct}%</span>
                            </div>
                            <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all" style="width: ${Math.max(r.pct, 2)}%; background-color: ${r.color}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>`);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load deal funnel');
        }
    };
})();
