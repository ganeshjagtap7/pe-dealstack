/**
 * PE OS — Watchlist Widget
 * Companies the team is monitoring but haven't formally entered into pipeline.
 * Add via inline modal (watchlist-modal.js), delete via trash icon.
 */

(function() {
    'use strict';

    async function loadAndRender(body) {
        body.querySelector('#wl-list').innerHTML = `
            <div class="text-center py-6 text-text-muted">
                <span class="material-symbols-outlined animate-spin text-[20px] block mb-1 opacity-60">progress_activity</span>
                <p class="text-xs">Loading...</p>
            </div>`;
        try {
            const data = await WidgetBase.getJSON('/watchlist');
            const items = data?.items || [];
            const list = body.querySelector('#wl-list');

            if (items.length === 0) {
                list.innerHTML = `
                    <div class="text-center py-6 text-text-muted">
                        <span class="material-symbols-outlined text-[28px] mb-2 block opacity-60">visibility</span>
                        <p class="text-sm font-medium">No companies watched yet</p>
                    </div>`;
                return;
            }

            list.innerHTML = `
                <div class="p-2">
                    ${items.map(item => `
                        <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group" data-watchlist-id="${item.id}">
                            <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background-color: #003366">
                                <span class="material-symbols-outlined text-white text-[18px]">visibility</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-text-main truncate">${WidgetBase.escapeHtml(item.companyName)}</p>
                                <p class="text-xs text-text-muted truncate">${WidgetBase.escapeHtml(item.industry || item.notes || '—')}</p>
                            </div>
                            <button class="wl-delete opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-500 p-1" data-id="${item.id}" title="Remove">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    `).join('')}
                </div>`;

            list.querySelectorAll('.wl-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    try {
                        const resp = await PEAuth.authFetch(`${API_BASE_URL}/watchlist/${id}`, { method: 'DELETE' });
                        if (!resp.ok) throw new Error('Delete failed');
                        if (window.showNotification) showNotification('Removed', 'Watchlist item removed', 'success');
                        loadAndRender(body);
                    } catch (err) {
                        if (window.showNotification) showNotification('Error', 'Could not remove item', 'error');
                    }
                });
            });
        } catch (e) {
            body.querySelector('#wl-list').innerHTML = `
                <div class="text-center py-6 text-text-muted">
                    <span class="material-symbols-outlined text-[28px] mb-2 block">cloud_off</span>
                    <p class="text-sm font-medium">Could not load watchlist</p>
                </div>`;
        }
    }

    window.initWatchlistWidget = async function(container) {
        WidgetBase.setBody(container, `
            <div>
                <div class="flex items-center justify-between p-4 border-b border-border-subtle">
                    <span class="text-xs text-text-muted">Companies you're tracking</span>
                    <button id="wl-add-btn" class="text-xs font-bold text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">add</span> Add
                    </button>
                </div>
                <div id="wl-list"></div>
            </div>`);

        const body = WidgetBase.getOrCreateBody(container);
        body.querySelector('#wl-add-btn').addEventListener('click', () => {
            if (window.openWatchlistModal) {
                window.openWatchlistModal(() => loadAndRender(body));
            }
        });

        await loadAndRender(body);
    };
})();
