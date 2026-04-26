/**
 * PE OS — Calendar Widget
 * Next 7 days, day-grouped list of tasks (dueDate) + deal milestones (targetCloseDate).
 */

(function() {
    'use strict';

    function startOfDay(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    window.initCalendarWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const [tasksData, dealsData] = await Promise.all([
                WidgetBase.tasksCache(),
                WidgetBase.dealsCache(),
            ]);
            const tasks = tasksData?.tasks || [];
            const deals = Array.isArray(dealsData) ? dealsData : [];

            const today = startOfDay(new Date());
            const horizon = new Date(today.getTime() + 7 * 86400000);

            const events = [];
            tasks.forEach(t => {
                if (!t.dueDate || t.status === 'COMPLETED') return;
                const d = new Date(t.dueDate);
                if (d < today || d >= horizon) return;
                events.push({ date: d, type: 'task', label: t.title, icon: 'task_alt', color: '#003366' });
            });
            deals.forEach(d => {
                if (!d.targetCloseDate) return;
                const dt = new Date(d.targetCloseDate);
                if (dt < today || dt >= horizon) return;
                events.push({ date: dt, type: 'deal', label: `${d.name} closing`, icon: 'flag', color: '#10B981' });
            });

            if (events.length === 0) {
                WidgetBase.renderEmpty(container, 'Nothing scheduled this week', 'calendar_month');
                return;
            }

            const groups = new Map();
            events.sort((a, b) => a.date - b.date).forEach(e => {
                const key = startOfDay(e.date).toISOString();
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(e);
            });

            let html = '<div class="p-3 space-y-3">';
            for (const [key, dayEvents] of groups) {
                const date = new Date(key);
                const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                html += `
                    <div>
                        <p class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5 px-2">${dateLabel}</p>
                        ${dayEvents.map(e => `
                            <div class="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors">
                                <span class="material-symbols-outlined text-[16px]" style="color:${e.color}">${e.icon}</span>
                                <span class="text-xs text-text-main truncate flex-1">${WidgetBase.escapeHtml(e.label)}</span>
                            </div>
                        `).join('')}
                    </div>`;
            }
            html += '</div>';
            WidgetBase.setBody(container, html);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load calendar');
        }
    };
})();
