/**
 * PE OS — Upcoming Deadlines Widget
 * Tasks with dueDate within the next 14 days, color-coded by urgency.
 */

(function() {
    'use strict';

    function colorForDue(dueDate) {
        const now = new Date(); now.setHours(0,0,0,0);
        const due = new Date(dueDate); due.setHours(0,0,0,0);
        const days = Math.round((due - now) / 86400000);
        if (days < 0) return { color: '#EF4444', label: 'Overdue', bg: '#FEE2E2' };
        if (days <= 2) return { color: '#F59E0B', label: days === 0 ? 'Today' : `${days}d`, bg: '#FEF3C7' };
        if (days <= 7) return { color: '#003366', label: `${days}d`, bg: '#DBEAFE' };
        return { color: '#6B7280', label: `${days}d`, bg: '#F3F4F6' };
    }

    window.initUpcomingDeadlinesWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const data = await WidgetBase.tasksCache();
            const tasks = data?.tasks || [];

            const cutoff = Date.now() + 14 * 86400000;
            const upcoming = tasks
                .filter(t => t.dueDate && t.status !== 'COMPLETED' && new Date(t.dueDate).getTime() <= cutoff)
                .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                .slice(0, 8);

            if (upcoming.length === 0) {
                WidgetBase.renderEmpty(container, 'No upcoming deadlines', 'event_available');
                return;
            }

            WidgetBase.setBody(container, `
                <div class="p-2">
                    ${upcoming.map(t => {
                        const meta = colorForDue(t.dueDate);
                        const dealName = t.deal?.name ? ` · ${WidgetBase.escapeHtml(t.deal.name)}` : '';
                        return `
                            <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                <span class="text-[10px] font-bold px-2 py-1 rounded uppercase shrink-0" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-text-main truncate">${WidgetBase.escapeHtml(t.title)}</p>
                                    <p class="text-xs text-text-muted truncate">${new Date(t.dueDate).toLocaleDateString('en-US', {month:'short',day:'numeric'})}${dealName}</p>
                                </div>
                            </div>`;
                    }).join('')}
                </div>`);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load deadlines');
        }
    };
})();
