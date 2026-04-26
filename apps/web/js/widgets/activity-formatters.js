/**
 * PE OS — Activity Log Formatters
 *
 * Shared between admin-dashboard.js Team Activity feed AND the new
 * Recent Activity widget on the main dashboard.
 *
 * Exposes globals:
 *   window.formatAuditAction(log) → { text, icon }
 *   window.groupLogsByDay(logs)   → Map<dayLabel, log[]>
 *   window.renderActivityItem(log) → HTML string
 *   window.getInitials(name)      → "AB"
 *
 * Originally extracted from admin-dashboard.js to avoid duplication.
 */

(function() {
    'use strict';

    function escapeHtmlSafe(s) {
        if (window.escapeHtml) return window.escapeHtml(s);
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getInitials(name) {
        if (!name) return '?';
        return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    }

    function getTimeAgo(date) {
        if (window.formatRelativeTime) return window.formatRelativeTime(date);
        // Minimal fallback
        const d = new Date(date);
        const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diffSec < 60) return 'just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        return `${Math.floor(diffSec / 86400)}d ago`;
    }

    function formatAuditAction(log) {
        const entity = log.entityName || log.resourceName || '';
        const entityHtml = entity ? `<span class="text-primary font-medium">${escapeHtmlSafe(entity)}</span>` : '';

        const actionMap = {
            'DEAL_CREATED':       { text: `created deal ${entityHtml}`, icon: 'add_circle' },
            'DEAL_UPDATED':       { text: `updated ${entityHtml}`, icon: 'edit' },
            'DEAL_DELETED':       { text: `deleted deal ${entityHtml}`, icon: 'delete' },
            'DEAL_STAGE_CHANGED': { text: `moved ${entityHtml} to a new stage`, icon: 'arrow_forward' },
            'DEAL_ASSIGNED':      { text: `assigned ${entityHtml}`, icon: 'person_add' },
            'DEAL_VIEWED':        { text: `viewed ${entityHtml}`, icon: 'visibility' },
            'DEAL_EXPORTED':      { text: `exported ${entityHtml}`, icon: 'file_download' },
            'DOCUMENT_UPLOADED':  { text: `uploaded ${entityHtml}`, icon: 'upload_file' },
            'DOCUMENT_DELETED':   { text: `deleted document ${entityHtml}`, icon: 'delete' },
            'DOCUMENT_DOWNLOADED':{ text: `downloaded ${entityHtml}`, icon: 'download' },
            'DOCUMENT_VIEWED':    { text: `viewed document ${entityHtml}`, icon: 'visibility' },
            'MEMO_CREATED':       { text: `created memo ${entityHtml}`, icon: 'description' },
            'MEMO_UPDATED':       { text: `updated memo ${entityHtml}`, icon: 'edit_note' },
            'MEMO_EXPORTED':      { text: `exported memo ${entityHtml}`, icon: 'file_download' },
            'USER_CREATED':       { text: `added team member ${entityHtml}`, icon: 'person_add' },
            'USER_UPDATED':       { text: `updated user ${entityHtml}`, icon: 'manage_accounts' },
            'USER_INVITED':       { text: `invited ${entityHtml}`, icon: 'mail' },
            'AI_INGEST':          { text: `ingested document ${entityHtml}`, icon: 'auto_awesome' },
            'AI_GENERATE':        { text: `generated analysis for ${entityHtml}`, icon: 'auto_awesome' },
            'AI_CHAT':            { text: `chatted with ${entityHtml || 'PE OS AI'}`, icon: 'auto_awesome' },
            'LOGIN':              { text: 'logged in', icon: 'login' },
            'LOGOUT':             { text: 'logged out', icon: 'logout' },
            'SETTINGS_CHANGED':   { text: 'updated settings', icon: 'settings' },
        };

        return actionMap[log.action] || { text: `performed ${log.action || 'an action'}`, icon: 'info' };
    }

    function groupLogsByDay(logs) {
        const groups = new Map();
        const now = new Date();
        const today = now.toDateString();
        const yesterday = new Date(now.getTime() - 86400000).toDateString();

        for (const log of logs) {
            const date = new Date(log.createdAt);
            const dateStr = date.toDateString();
            let label;

            if (dateStr === today) label = 'Today';
            else if (dateStr === yesterday) label = 'Yesterday';
            else label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(log);
        }

        return groups;
    }

    function renderActivityItem(log) {
        const userName = log.userEmail?.split('@')[0] || 'System';
        const initials = getInitials(userName);
        const { text, icon } = formatAuditAction(log);
        const timeAgo = getTimeAgo(log.createdAt);
        const isAI = log.action?.startsWith('AI_');

        return `
            <div class="flex gap-3 relative z-10 mb-4">
                <div class="relative flex-shrink-0">
                    <div class="w-9 h-9 rounded-full text-white text-xs font-medium flex items-center justify-center" style="background-color: #003366">
                        ${isAI ? '<span class="material-symbols-outlined text-[18px]">auto_awesome</span>' : initials}
                    </div>
                    <div class="absolute -bottom-0.5 -right-0.5 rounded-full w-4 h-4 flex items-center justify-center border-2 border-white" style="background-color: #003366">
                        <span class="material-symbols-outlined text-white text-[10px]">${icon}</span>
                    </div>
                </div>
                <div class="flex-1 pt-0.5">
                    <p class="text-sm text-text-main">
                        <span class="font-semibold${isAI ? ' text-primary' : ''}">${isAI ? 'PE OS AI' : escapeHtmlSafe(userName)}</span> ${text}
                    </p>
                    <p class="text-xs text-text-muted mt-1">${timeAgo}</p>
                </div>
            </div>`;
    }

    // Expose as globals for both admin-dashboard.js and recent-activity.js
    window.formatAuditAction = formatAuditAction;
    window.groupLogsByDay = groupLogsByDay;
    window.renderActivityItem = renderActivityItem;
    window.getInitials = getInitials;
    window.getTimeAgo = getTimeAgo;
})();
