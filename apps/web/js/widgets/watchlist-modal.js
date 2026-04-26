/**
 * PE OS — Watchlist Add Modal
 * Lightweight inline modal for adding a Watchlist entry. Lazy-injected on first
 * use, then reused. Calls back into watchlist.js on success.
 */

(function() {
    'use strict';

    let modalEl = null;
    let onSuccess = null;

    function ensureModal() {
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.id = 'watchlist-modal';
        modalEl.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-black/40 backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-bold text-text-main">Add to Watchlist</h2>
                    <button id="wlm-close" class="text-text-muted hover:text-text-main">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form id="wlm-form" class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-text-secondary mb-1">Company Name *</label>
                        <input id="wlm-company" type="text" required maxlength="200" class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-secondary mb-1">Industry</label>
                        <input id="wlm-industry" type="text" maxlength="100" class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-secondary mb-1">Notes</label>
                        <textarea id="wlm-notes" rows="3" maxlength="2000" class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm resize-none focus:border-primary focus:ring-1 focus:ring-primary/30"></textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" id="wlm-cancel" class="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
                        <button type="submit" id="wlm-submit" class="px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors" style="background-color: #003366">Add</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modalEl);

        const close = () => {
            modalEl.classList.add('hidden');
            modalEl.classList.remove('flex');
            modalEl.querySelector('#wlm-form').reset();
        };

        modalEl.querySelector('#wlm-close').addEventListener('click', close);
        modalEl.querySelector('#wlm-cancel').addEventListener('click', close);
        modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

        modalEl.querySelector('#wlm-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = modalEl.querySelector('#wlm-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding…';
            try {
                const body = {
                    companyName: modalEl.querySelector('#wlm-company').value.trim(),
                    industry: modalEl.querySelector('#wlm-industry').value.trim(),
                    notes: modalEl.querySelector('#wlm-notes').value.trim(),
                };
                const resp = await PEAuth.authFetch(`${API_BASE_URL}/watchlist`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!resp.ok) throw new Error('Add failed');
                if (window.showNotification) showNotification('Added', 'Company added to watchlist', 'success');
                close();
                if (onSuccess) onSuccess();
            } catch (err) {
                if (window.showNotification) showNotification('Error', 'Could not add to watchlist', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Add';
            }
        });

        return modalEl;
    }

    window.openWatchlistModal = function(callback) {
        ensureModal();
        onSuccess = callback || null;
        modalEl.classList.remove('hidden');
        modalEl.classList.add('flex');
        modalEl.querySelector('#wlm-company').focus();
    };
})();
