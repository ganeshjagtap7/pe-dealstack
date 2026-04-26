/**
 * PE OS — Widget Base Utilities
 *
 * Shared helpers for all dashboard widgets:
 *   - waitForAuth        — wait until PEAuth is ready
 *   - getJSON            — auth-fetch + JSON parse + error normalization
 *   - dealsCache/tasksCache — request coalescing across widgets
 *   - renderEmpty/renderError — consistent fallback UI
 *   - getCurrentUserId   — for localStorage namespacing
 *   - escapeHtml         — local convenience (re-export of formatters.js helper)
 *
 * Loaded BEFORE every widget file. Exposes globals on window.WidgetBase.
 */

(function() {
    'use strict';

    function waitForAuth() {
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (window.PEAuth && PEAuth.authFetch) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(); }, 3000);
        });
    }

    async function getJSON(path) {
        const url = path.startsWith('http') ? path : `${window.API_BASE_URL}${path}`;
        const resp = await PEAuth.authFetch(url);
        if (!resp.ok) {
            const err = new Error(`HTTP ${resp.status}`);
            err.status = resp.status;
            throw err;
        }
        return resp.json();
    }

    // ─── Request coalescing caches ────────────────────────────
    // Multiple widgets may want /deals or /tasks. Cache the in-flight
    // promise so only one HTTP request is issued per page load.

    let _dealsPromise = null;
    let _tasksPromise = null;

    function dealsCache() {
        if (!_dealsPromise) {
            _dealsPromise = getJSON('/deals').catch(err => {
                _dealsPromise = null; // allow retry on next call
                throw err;
            });
        }
        return _dealsPromise;
    }

    function tasksCache() {
        if (!_tasksPromise) {
            _tasksPromise = getJSON('/tasks?limit=100').catch(err => {
                _tasksPromise = null;
                throw err;
            });
        }
        return _tasksPromise;
    }

    function clearCaches() {
        _dealsPromise = null;
        _tasksPromise = null;
    }

    // ─── Render helpers ───────────────────────────────────────
    //
    // Each widget container in dashboard.html has a static title bar at the top
    // (rendered once from HTML). Widget files render their dynamic content into
    // a `.widget-body` div underneath the title bar. getOrCreateBody() lazily
    // appends that div on first call so widget files don't need to know about it.

    function getOrCreateBody(container) {
        if (!container) return null;
        let body = container.querySelector(':scope > .widget-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'widget-body';
            container.appendChild(body);
        }
        return body;
    }

    function setBody(container, html) {
        const body = getOrCreateBody(container);
        if (body) body.innerHTML = html;
    }

    function renderEmpty(container, message, icon = 'inbox') {
        setBody(container, `
            <div class="text-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-[32px] mb-2 block opacity-60">${icon}</span>
                <p class="text-sm font-medium">${message}</p>
            </div>`);
    }

    function renderError(container, label = 'Could not load data') {
        setBody(container, `
            <div class="text-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-[32px] mb-2 block">cloud_off</span>
                <p class="text-sm font-medium">${label}</p>
            </div>`);
    }

    function renderLoading(container, label = 'Loading...') {
        setBody(container, `
            <div class="text-center py-6 text-text-muted">
                <span class="material-symbols-outlined animate-spin text-[24px] block mb-1 opacity-60">progress_activity</span>
                <p class="text-xs">${label}</p>
            </div>`);
    }

    // ─── Misc utilities ───────────────────────────────────────

    function getCurrentUserId() {
        // Cached user from layout.js, or fall back to Supabase auth user id
        try {
            const cached = sessionStorage.getItem('pe-os-user');
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed?.id || parsed?.authId || null;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function escapeHtml(s) {
        if (window.escapeHtml) return window.escapeHtml(s);
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isWidgetVisible(widgetId) {
        // Use the dashboard-widgets.js global if available (it knows the defaults
        // map AND honors localStorage). Falls back to localStorage-only check.
        try {
            if (typeof window.getWidgetPreferences === 'function') {
                const prefs = window.getWidgetPreferences();
                return prefs[widgetId] !== false;
            }
            const stored = localStorage.getItem('pe-dashboard-widgets');
            if (!stored) return true;
            const prefs = JSON.parse(stored);
            return prefs[widgetId] !== false;
        } catch (e) {
            return true;
        }
    }

    window.WidgetBase = {
        waitForAuth,
        getJSON,
        dealsCache,
        tasksCache,
        clearCaches,
        getOrCreateBody,
        setBody,
        renderEmpty,
        renderError,
        renderLoading,
        getCurrentUserId,
        escapeHtml,
        isWidgetVisible,
    };
})();
