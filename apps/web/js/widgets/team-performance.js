/**
 * PE OS — Team Performance Widget
 * Per team member: active deal count + pending task count + capacity bar.
 */

(function() {
    'use strict';

    function capacityColor(pct) {
        if (pct >= 80) return '#EF4444';
        if (pct >= 50) return '#F59E0B';
        return '#003366';
    }

    window.initTeamPerformanceWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const [users, dealsData, tasksData] = await Promise.all([
                WidgetBase.getJSON('/users?isActive=true'),
                WidgetBase.dealsCache(),
                WidgetBase.tasksCache(),
            ]);

            const team = Array.isArray(users) ? users : [];
            const deals = Array.isArray(dealsData) ? dealsData : [];
            const tasks = tasksData?.tasks || [];

            if (team.length === 0) {
                WidgetBase.renderEmpty(container, 'No team members yet', 'groups');
                return;
            }

            const dealsByMember = new Map();
            deals.forEach(d => {
                (d.teamMembers || []).forEach(tm => {
                    const uid = tm.user?.id || tm.userId;
                    if (!uid) return;
                    dealsByMember.set(uid, (dealsByMember.get(uid) || 0) + 1);
                });
            });

            const rows = team.slice(0, 6).map(m => {
                const dealCount = dealsByMember.get(m.id) || 0;
                const taskCount = tasks.filter(t => t.assignedTo === m.id && t.status !== 'COMPLETED').length;
                const capacity = Math.min(100, Math.round((dealCount / 5) * 100));
                const initials = window.getInitials ? window.getInitials(m.name || m.email) : '?';
                const color = capacityColor(capacity);
                return { ...m, dealCount, taskCount, capacity, initials, color };
            });

            WidgetBase.setBody(container, `
                <div class="p-2">
                    ${rows.map(r => `
                        <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                            <div class="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style="background-color: #003366">${r.initials}</div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-text-main truncate">${WidgetBase.escapeHtml(r.name || r.email)}</p>
                                <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1">
                                    <div class="h-full rounded-full transition-all" style="width: ${Math.max(r.capacity, 4)}%; background-color: ${r.color}"></div>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <p class="text-xs font-bold text-text-main">${r.dealCount}<span class="text-text-muted font-normal text-[10px] ml-0.5">deals</span></p>
                                <p class="text-[10px] text-text-muted">${r.taskCount} tasks</p>
                            </div>
                        </div>
                    `).join('')}
                </div>`);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load team');
        }
    };
})();
