/**
 * PE OS — Key Contacts Widget
 * Top 5 contacts by relationship score. Two API calls (list + scores), merged.
 * No avatar field on Contact, so initials are used.
 */

(function() {
    'use strict';

    function colorForScore(score) {
        if (score >= 75) return '#10B981';
        if (score >= 50) return '#003366';
        if (score >= 25) return '#F59E0B';
        return '#6B7280';
    }

    window.initKeyContactsWidget = async function(container) {
        WidgetBase.renderLoading(container);
        try {
            const [contactsData, scoresData] = await Promise.all([
                WidgetBase.getJSON('/contacts?limit=200'),
                WidgetBase.getJSON('/contacts/insights/scores').catch(() => ({ scores: {} })),
            ]);

            const contacts = contactsData?.contacts || [];
            const scores = scoresData?.scores || {};

            const enriched = contacts
                .map(c => ({ ...c, score: scores[c.id]?.score ?? 0, label: scores[c.id]?.label ?? '' }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            if (enriched.length === 0) {
                WidgetBase.renderEmpty(container, 'No contacts yet', 'contacts');
                return;
            }

            WidgetBase.setBody(container, `
                <div class="p-2">
                    ${enriched.map(c => {
                        const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || 'Unknown';
                        const initials = window.getInitials ? window.getInitials(fullName) : fullName[0]?.toUpperCase() || '?';
                        const subtitle = [c.title, c.company].filter(Boolean).join(' · ') || c.email || '';
                        const color = colorForScore(c.score);
                        return `
                            <a href="/contacts.html" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                <div class="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style="background-color: ${color}">${initials}</div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-text-main truncate">${WidgetBase.escapeHtml(fullName)}</p>
                                    <p class="text-xs text-text-muted truncate">${WidgetBase.escapeHtml(subtitle)}</p>
                                </div>
                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style="background-color: ${color}1a; color: ${color}">${c.score || 0}</span>
                            </a>`;
                    }).join('')}
                </div>`);
        } catch (e) {
            WidgetBase.renderError(container, 'Could not load contacts');
        }
    };
})();
