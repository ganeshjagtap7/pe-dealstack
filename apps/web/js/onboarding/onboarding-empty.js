/**
 * PE OS — Empty State Components
 * Reusable empty states for pages with no data.
 * Reads content from ONBOARDING_CONFIG.emptyStates.
 */

(function() {
    'use strict';

    /**
     * Render an empty state into a container
     * @param {string} containerId - DOM element ID to render into
     * @param {string} configKey - Key from ONBOARDING_CONFIG.emptyStates (dashboard, deals, contacts, templates)
     * @param {Object} [options] - Optional overrides
     * @param {string} [options.message] - Override message text
     * @param {Function} [options.onCtaClick] - Custom CTA handler
     */
    window.renderOnboardingEmptyState = function(containerId, configKey, options = {}) {
        if (!window.ONBOARDING_CONFIG?.emptyStates) return;

        const config = ONBOARDING_CONFIG.emptyStates[configKey];
        if (!config) return;

        const container = document.getElementById(containerId);
        if (!container) return;

        const message = options.message || config.message;
        const ctaHref = config.ctaHref || null;
        const ctaAction = config.ctaAction || null;

        let ctaOnClick = '';
        if (options.onCtaClick) {
            // Custom handler — will be bound after render
        } else if (ctaHref) {
            ctaOnClick = `onclick="window.location.href='${ctaHref}'"`;
        } else if (ctaAction) {
            ctaOnClick = `onclick="typeof ${ctaAction} === 'function' && ${ctaAction}()"`;
        }

        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style="background-color: rgba(0,51,102,0.08);">
                    <span class="material-symbols-outlined text-3xl" style="color: #003366;">${config.icon}</span>
                </div>
                <h3 class="text-lg font-semibold text-[#111418] mb-2">${config.title}</h3>
                <p class="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">${message}</p>
                ${config.ctaText ? `
                    <button id="empty-state-cta-${configKey}" ${ctaOnClick}
                            class="px-5 py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
                            style="background-color: #003366;">
                        ${config.ctaText}
                    </button>
                ` : ''}
            </div>
        `;

        // Bind custom click handler if provided
        if (options.onCtaClick) {
            const btn = document.getElementById(`empty-state-cta-${configKey}`);
            if (btn) btn.addEventListener('click', options.onCtaClick);
        }
    };
})();
