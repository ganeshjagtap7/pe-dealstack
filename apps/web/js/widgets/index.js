/**
 * PE OS — Dashboard Widget Registry
 *
 * Maps widget IDs (matching dashboard-widgets.js WIDGET_CONFIG keys) to their
 * init functions. dashboard.js calls WidgetRegistry.initAll() during dashboard
 * boot — only widgets whose container element exists AND whose user preference
 * is enabled get initialized.
 *
 * To register a new widget:
 *   1. Add a window.init<Name>Widget global in your widget file.
 *   2. Add an entry below.
 *   3. Add a `<div data-widget="<id>">` block in dashboard.html.
 */

(function() {
    'use strict';

    const REGISTRY = {
        'quick-actions':       () => window.initQuickActionsWidget,
        'notes-memo':          () => window.initQuickNotesWidget,
        'deal-funnel':         () => window.initDealFunnelWidget,
        'recent-activity':     () => window.initRecentActivityWidget,
        'upcoming-deadlines':  () => window.initUpcomingDeadlinesWidget,
        'key-contacts':        () => window.initKeyContactsWidget,
        'team-performance':    () => window.initTeamPerformanceWidget,
        'document-alerts':     () => window.initDocumentAlertsWidget,
        'calendar':            () => window.initCalendarWidget,
        'watchlist':           () => window.initWatchlistWidget,
        'market-multiples':    () => window.initMarketMultiplesWidget,
    };

    // Track which widgets have already been initialized so re-running initAll
    // (e.g. after the user enables a new widget via Customize Dashboard) doesn't
    // double-fetch data for widgets that are already rendered.
    const initialized = new Set();

    async function initAll() {
        if (!window.WidgetBase) {
            console.warn('WidgetBase not loaded — skipping widget init');
            return;
        }

        await WidgetBase.waitForAuth();

        for (const [widgetId, getInit] of Object.entries(REGISTRY)) {
            const container = document.querySelector(`[data-widget="${widgetId}"]`);
            if (!container) continue; // Widget block not in DOM (still "Soon")

            // Skip widgets the user has hidden via Customize Dashboard
            if (!WidgetBase.isWidgetVisible(widgetId)) continue;

            // Skip widgets that already initialized in a previous run
            if (initialized.has(widgetId)) continue;

            const initFn = getInit();
            if (typeof initFn !== 'function') {
                console.warn(`Widget '${widgetId}' has no init function`);
                continue;
            }

            try {
                await initFn(container);
                initialized.add(widgetId);
            } catch (e) {
                console.error(`Widget '${widgetId}' init failed:`, e);
                WidgetBase.renderError(container, 'Could not load widget');
            }
        }
    }

    function reset() {
        initialized.clear();
    }

    window.WidgetRegistry = { initAll, reset, REGISTRY };
})();
