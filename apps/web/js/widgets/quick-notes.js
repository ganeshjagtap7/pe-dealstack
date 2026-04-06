/**
 * PE OS — Quick Notes Widget
 * localStorage scratchpad, namespaced per user so a shared browser doesn't leak notes.
 */

(function() {
    'use strict';

    function storageKey() {
        const userId = WidgetBase.getCurrentUserId() || 'anon';
        return `pe-quick-notes:${userId}`;
    }

    function getStoredNote() {
        try { return localStorage.getItem(storageKey()) || ''; }
        catch (e) { return ''; }
    }

    function saveNote(text) {
        try { localStorage.setItem(storageKey(), text); }
        catch (e) { /* ignore quota errors */ }
    }

    window.initQuickNotesWidget = function(container) {
        WidgetBase.setBody(container, `
            <div class="p-5">
                <textarea id="qn-textarea"
                          class="w-full h-32 resize-none rounded-lg border border-border-subtle p-3 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                          placeholder="Jot down quick notes, reminders, follow-ups..."></textarea>
                <p id="qn-status" class="text-[11px] text-text-muted mt-1.5">Auto-saves on blur</p>
            </div>`);

        const ta = container.querySelector('#qn-textarea');
        const status = container.querySelector('#qn-status');
        ta.value = getStoredNote();

        ta.addEventListener('blur', () => {
            saveNote(ta.value);
            status.textContent = `Saved · ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
        });
    };
})();
