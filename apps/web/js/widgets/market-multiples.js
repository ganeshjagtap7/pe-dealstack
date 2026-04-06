/**
 * PE OS — Market Multiples Widget
 * Static reference table from market-multiples-data.js. Date-stamped + disclaimer.
 */

(function() {
    'use strict';

    window.initMarketMultiplesWidget = function(container) {
        const data = window.MARKET_MULTIPLES;
        if (!data) {
            WidgetBase.renderError(container, 'Reference data missing');
            return;
        }

        WidgetBase.setBody(container, `
            <div class="p-5">
                <p class="text-[11px] text-text-muted mb-3">As of ${data.asOf} · Illustrative only</p>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                        <thead>
                            <tr class="border-b border-border-subtle text-text-muted uppercase tracking-wide">
                                <th class="text-left font-semibold py-2 pr-3">Sector</th>
                                <th class="text-right font-semibold py-2 px-2">EV / EBITDA</th>
                                <th class="text-right font-semibold py-2 pl-2">EV / Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.sectors.map(s => `
                                <tr class="border-b border-border-subtle/50">
                                    <td class="py-2 pr-3 font-medium text-text-main">${WidgetBase.escapeHtml(s.sector)}</td>
                                    <td class="py-2 px-2 text-right text-text-secondary">${WidgetBase.escapeHtml(s.evEbitda)}</td>
                                    <td class="py-2 pl-2 text-right text-text-secondary">${WidgetBase.escapeHtml(s.evRevenue)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p class="text-[10px] text-text-muted italic mt-3">${WidgetBase.escapeHtml(data.disclaimer)}</p>
            </div>`);
    };
})();
