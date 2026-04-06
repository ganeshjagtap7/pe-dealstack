/**
 * PE OS — Document Alerts Widget
 * Lists documents across the org needing review (pending or ready-for-AI).
 */

(function() {
    'use strict';

    const STATE_META = {
        pending: { label: 'Pending', icon: 'hourglass_top', color: '#6B7280', bg: '#F3F4F6' },
        ready_for_ai: { label: 'Ready for AI', icon: 'check_circle', color: '#10B981', bg: '#D1FAE5' },
    };

    window.initDocumentAlertsWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const data = await WidgetBase.getJSON('/documents/alerts');
            const items = data?.items || [];

            if (items.length === 0) {
                WidgetBase.renderEmpty(container, 'All documents reviewed', 'task_alt');
                return;
            }

            WidgetBase.setBody(container, `
                <div class="p-2">
                    ${items.slice(0, 8).map(item => {
                        const meta = STATE_META[item.state] || STATE_META.pending;
                        const dealHref = item.dealId ? `/deal.html?id=${item.dealId}#documents-list` : '#';
                        return `
                            <a href="${dealHref}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                <span class="material-symbols-outlined text-[20px] shrink-0" style="color:${meta.color}">${meta.icon}</span>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-text-main truncate">${WidgetBase.escapeHtml(item.name)}</p>
                                    <p class="text-xs text-text-muted truncate">${WidgetBase.escapeHtml(item.dealName || '—')}</p>
                                </div>
                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
                            </a>`;
                    }).join('')}
                    ${items.length > 8 ? `<p class="text-[11px] text-text-muted text-center mt-2">+ ${items.length - 8} more</p>` : ''}
                </div>`);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load document alerts');
        }
    };
})();
