/**
 * PE OS — Command Palette (Cmd+K)
 * Spotlight-style search overlay for quick navigation.
 * Searches pages, deals, and contacts with keyboard navigation.
 *
 * Usage: loaded via <script> on any page with layout.js.
 * Opens with Cmd+K (Mac) or Ctrl+K (Windows).
 */

(function () {
    // ── Static pages ────────────────────────────────────
    const PAGES = [
        { type: 'page', label: 'Dashboard', href: '/dashboard.html', icon: 'dashboard', keywords: 'home overview' },
        { type: 'page', label: 'Deals', href: '/crm.html', icon: 'work', keywords: 'pipeline crm deals' },
        { type: 'page', label: 'Data Room', href: '/vdr.html', icon: 'folder_open', keywords: 'vdr documents files' },
        { type: 'page', label: 'Contacts', href: '/contacts.html', icon: 'groups', keywords: 'crm people network' },
        { type: 'page', label: 'AI Reports', href: '/memo-builder.html', icon: 'auto_awesome', keywords: 'memo ic report' },
        { type: 'page', label: 'Admin', href: '/admin-dashboard.html', icon: 'admin_panel_settings', keywords: 'admin tasks team' },
        { type: 'page', label: 'Settings', href: '/settings.html', icon: 'settings', keywords: 'profile preferences account' },
    ];

    let overlay = null;
    let input = null;
    let resultsList = null;
    let activeIndex = 0;
    let results = [];
    let dealsCache = null;
    let contactsCache = null;

    // ── Build the DOM ───────────────────────────────────
    function createPalette() {
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.id = 'command-palette-overlay';
        overlay.innerHTML = `
            <div id="command-palette" onclick="event.stopPropagation()">
                <div class="cp-input-wrapper">
                    <span class="material-symbols-outlined cp-search-icon">search</span>
                    <input id="cp-input" type="text" placeholder="Search deals, contacts, pages..." autocomplete="off" spellcheck="false" />
                    <kbd class="cp-kbd">ESC</kbd>
                </div>
                <div id="cp-results" class="cp-results"></div>
                <div class="cp-footer">
                    <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
                    <span><kbd>Enter</kbd> open</span>
                    <span><kbd>ESC</kbd> close</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        input = document.getElementById('cp-input');
        resultsList = document.getElementById('cp-results');

        // Events
        overlay.addEventListener('click', close);
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeydown);

        injectStyles();
    }

    // ── Styles ──────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('cp-styles')) return;
        const style = document.createElement('style');
        style.id = 'cp-styles';
        style.textContent = `
            #command-palette-overlay {
                position: fixed; inset: 0; z-index: 9999;
                background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
                display: flex; align-items: flex-start; justify-content: center;
                padding-top: 18vh;
                animation: cpFadeIn 0.15s ease-out;
            }
            @keyframes cpFadeIn { from { opacity: 0; } to { opacity: 1; } }
            #command-palette {
                width: 100%; max-width: 560px;
                background: #fff; border-radius: 12px;
                box-shadow: 0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05);
                overflow: hidden;
                animation: cpSlideIn 0.15s ease-out;
            }
            @keyframes cpSlideIn { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
            .cp-input-wrapper {
                display: flex; align-items: center; gap: 10px;
                padding: 14px 16px;
                border-bottom: 1px solid #E5E7EB;
            }
            .cp-search-icon { color: #9CA3AF; font-size: 22px; }
            #cp-input {
                flex: 1; border: none; outline: none; font-size: 15px;
                color: #111827; background: transparent; font-family: 'Inter', sans-serif;
            }
            #cp-input::placeholder { color: #9CA3AF; }
            .cp-kbd {
                font-size: 10px; font-weight: 600; color: #9CA3AF;
                background: #F3F4F6; border: 1px solid #E5E7EB;
                border-radius: 4px; padding: 2px 6px;
                font-family: 'Inter', sans-serif;
            }
            .cp-results {
                max-height: 340px; overflow-y: auto;
                padding: 6px;
            }
            .cp-results::-webkit-scrollbar { width: 4px; }
            .cp-results::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 2px; }
            .cp-group-label {
                font-size: 10px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.06em; color: #9CA3AF;
                padding: 8px 10px 4px;
            }
            .cp-item {
                display: flex; align-items: center; gap: 10px;
                padding: 10px 10px; border-radius: 8px;
                cursor: pointer; transition: background 0.1s;
            }
            .cp-item:hover, .cp-item.active { background: #E6EEF5; }
            .cp-item.active { background: #003366; color: #fff; }
            .cp-item.active .cp-item-sub { color: rgba(255,255,255,0.7); }
            .cp-item.active .cp-item-icon { color: #fff; }
            .cp-item-icon {
                width: 32px; height: 32px; border-radius: 8px;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px; flex-shrink: 0;
            }
            .cp-item[data-type="page"] .cp-item-icon { background: #E6EEF5; color: #003366; }
            .cp-item[data-type="deal"] .cp-item-icon { background: #DBEAFE; color: #1D4ED8; }
            .cp-item[data-type="contact"] .cp-item-icon { background: #D1FAE5; color: #059669; }
            .cp-item.active .cp-item-icon { background: rgba(255,255,255,0.15); }
            .cp-item-text { flex: 1; min-width: 0; }
            .cp-item-label { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cp-item-sub { font-size: 11px; color: #9CA3AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cp-empty {
                text-align: center; padding: 32px 16px; color: #9CA3AF; font-size: 13px;
            }
            .cp-footer {
                display: flex; gap: 16px; padding: 8px 16px;
                border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF;
            }
            .cp-footer kbd {
                font-size: 10px; font-weight: 600; background: #F3F4F6;
                border: 1px solid #E5E7EB; border-radius: 3px; padding: 1px 4px;
                font-family: 'Inter', sans-serif; margin: 0 2px;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Open / Close ────────────────────────────────────
    function open() {
        createPalette();
        overlay.style.display = 'flex';
        input.value = '';
        activeIndex = 0;
        showDefaultResults();
        setTimeout(() => input.focus(), 50);
        prefetchData();
    }

    function close() {
        if (overlay) overlay.style.display = 'none';
    }

    function isOpen() {
        return overlay && overlay.style.display !== 'none';
    }

    // ── Data fetching ───────────────────────────────────
    async function prefetchData() {
        if (typeof PEAuth === 'undefined' || !PEAuth.authFetch) return;
        if (!dealsCache) {
            try {
                const r = await PEAuth.authFetch(`${API_BASE_URL}/deals`);
                if (r.ok) {
                    const d = await r.json();
                    dealsCache = (Array.isArray(d) ? d : d?.deals || []).map(deal => ({
                        type: 'deal', label: deal.name, href: `/deal.html?id=${deal.id}`,
                        icon: 'work', sub: [deal.stage, deal.industry].filter(Boolean).join(' · '),
                        keywords: `${deal.name} ${deal.industry || ''} ${deal.company || ''}`.toLowerCase(),
                    }));
                }
            } catch { /* silent */ }
        }
        if (!contactsCache) {
            try {
                const r = await PEAuth.authFetch(`${API_BASE_URL}/contacts`);
                if (r.ok) {
                    const c = await r.json();
                    const list = Array.isArray(c) ? c : c?.contacts || [];
                    contactsCache = list.map(ct => ({
                        type: 'contact', label: `${ct.firstName || ''} ${ct.lastName || ''}`.trim(),
                        href: `/contacts.html#detail-${ct.id}`, icon: 'person',
                        sub: [ct.title, ct.company].filter(Boolean).join(' · '),
                        keywords: `${ct.firstName || ''} ${ct.lastName || ''} ${ct.company || ''} ${ct.email || ''}`.toLowerCase(),
                    }));
                }
            } catch { /* silent */ }
        }
    }

    // ── Search ──────────────────────────────────────────
    function showDefaultResults() {
        results = PAGES.slice();
        renderResults('Pages');
    }

    function onInput() {
        const q = input.value.trim().toLowerCase();
        if (!q) { showDefaultResults(); return; }

        const allItems = [
            ...PAGES,
            ...(dealsCache || []),
            ...(contactsCache || []),
        ];

        results = allItems.filter(item => {
            const haystack = `${item.label} ${item.sub || ''} ${item.keywords || ''}`.toLowerCase();
            return q.split(' ').every(word => haystack.includes(word));
        }).slice(0, 12);

        activeIndex = 0;
        renderResults();
    }

    function renderResults(forcedGroupLabel) {
        if (results.length === 0) {
            resultsList.innerHTML = '<div class="cp-empty"><span class="material-symbols-outlined" style="font-size:28px;display:block;margin-bottom:4px;opacity:0.4">search_off</span>No results found</div>';
            return;
        }

        // Group by type
        const groups = {};
        results.forEach(r => {
            const g = r.type === 'page' ? 'Pages' : r.type === 'deal' ? 'Deals' : 'Contacts';
            if (!groups[g]) groups[g] = [];
            groups[g].push(r);
        });

        let html = '';
        let idx = 0;
        for (const [groupLabel, items] of Object.entries(groups)) {
            html += `<div class="cp-group-label">${forcedGroupLabel || groupLabel}</div>`;
            items.forEach(item => {
                const isActive = idx === activeIndex;
                html += `
                    <div class="cp-item ${isActive ? 'active' : ''}" data-index="${idx}" data-type="${item.type}" data-href="${item.href}">
                        <div class="cp-item-icon"><span class="material-symbols-outlined">${item.icon}</span></div>
                        <div class="cp-item-text">
                            <div class="cp-item-label">${escapeForPalette(item.label)}</div>
                            ${item.sub ? `<div class="cp-item-sub">${escapeForPalette(item.sub)}</div>` : ''}
                        </div>
                    </div>
                `;
                idx++;
            });
        }
        resultsList.innerHTML = html;

        // Click handlers
        resultsList.querySelectorAll('.cp-item').forEach(el => {
            el.addEventListener('click', () => navigate(el.dataset.href));
            el.addEventListener('mouseenter', () => {
                activeIndex = parseInt(el.dataset.index);
                updateActive();
            });
        });
    }

    function updateActive() {
        resultsList.querySelectorAll('.cp-item').forEach((el, i) => {
            el.classList.toggle('active', i === activeIndex);
        });
        // Scroll active into view
        const active = resultsList.querySelector('.cp-item.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    // ── Keyboard ────────────────────────────────────────
    function onKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, results.length - 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[activeIndex]) {
                navigate(results[activeIndex].href);
            }
        } else if (e.key === 'Escape') {
            close();
        }
    }

    function navigate(href) {
        close();
        if (href) window.location.href = href;
    }

    function escapeForPalette(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Global keyboard shortcut ────────────────────────
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isOpen()) { close(); } else { open(); }
        }
        if (e.key === 'Escape' && isOpen()) {
            close();
        }
    });

    // Expose for external use
    window.CommandPalette = { open, close };
})();
