/**
 * PE OS — Quick Actions Widget
 * Pure UI: 4 button shortcuts. Hides Create Task for non-admin users.
 */

(function() {
    'use strict';

    function getUserRole() {
        try {
            const cached = sessionStorage.getItem('pe-os-user');
            if (cached) {
                const u = JSON.parse(cached);
                return (u?.role || '').toUpperCase();
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    window.initQuickActionsWidget = function(container) {
        const role = getUserRole();
        const isAdmin = ['ADMIN', 'PARTNER', 'PRINCIPAL'].includes(role);

        const actions = [
            { icon: 'add_circle',  label: 'New Deal',     href: '/deal-intake.html' },
            { icon: 'upload_file', label: 'Upload Doc',   href: '/crm.html' },
            { icon: 'person_add',  label: 'Add Contact',  href: '/contacts.html' },
        ];
        if (isAdmin) {
            actions.push({ icon: 'task_alt', label: 'Create Task', href: '/admin-dashboard.html' });
        }

        WidgetBase.setBody(container, `
            <div class="grid grid-cols-2 gap-3 p-5">
                ${actions.map(a => `
                    <a href="${a.href}" class="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-border-subtle hover:border-primary hover:bg-primary-light/30 transition-all group">
                        <span class="material-symbols-outlined text-primary text-[28px] group-hover:scale-110 transition-transform">${a.icon}</span>
                        <span class="text-xs font-semibold text-text-main">${a.label}</span>
                    </a>
                `).join('')}
            </div>`);
    };
})();
