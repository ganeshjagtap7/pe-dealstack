/**
 * PE OS — Recent Activity Widget
 * Top 10 audit logs for the current org. Reuses the same renderer as the
 * admin Team Activity feed (activity-formatters.js).
 *
 * Note: depends on the auditLog.ts org-id fix. Without that fix, this widget
 * will show "No activity yet" — the empty state copy reflects that.
 */

(function() {
    'use strict';

    window.initRecentActivityWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const data = await WidgetBase.getJSON('/audit?limit=10');
            const logs = data?.logs || [];

            if (logs.length === 0) {
                WidgetBase.renderEmpty(container, 'Activity will appear here as your team works', 'rss_feed');
                return;
            }

            const grouped = window.groupLogsByDay(logs);
            let html = '<div class="p-5">';
            for (const [dayLabel, dayLogs] of grouped) {
                html += `<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mt-2 mb-2 first:mt-0">${dayLabel}</p>`;
                html += dayLogs.map(window.renderActivityItem).join('');
            }
            html += '</div>';
            WidgetBase.setBody(container, html);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load activity');
        }
    };
})();
