/**
 * PE OS — Feedback Button + Beta Badge
 * Floating feedback button (bottom-right) and BETA badge in sidebar.
 * Reads config from ONBOARDING_CONFIG.
 */

(function() {
    'use strict';

    /**
     * Initialize feedback button and beta badge
     * Call on any page after layout is rendered
     */
    window.initOnboardingUI = function() {
        if (!window.ONBOARDING_CONFIG) return;

        initFeedbackButton();
        initBetaBadge();
    };

    function initFeedbackButton() {
        const config = ONBOARDING_CONFIG.feedback;
        if (!config?.show) return;

        // Don't add if already exists
        if (document.getElementById('pe-feedback-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'pe-feedback-btn';
        btn.className = 'fixed bottom-5 right-5 z-[999] flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5';
        btn.style.cssText = 'background-color: #003366;';
        btn.innerHTML = `
            <span class="material-symbols-outlined text-[18px]">${config.buttonIcon || 'rate_review'}</span>
            <span>${config.buttonText || 'Feedback'}</span>
        `;

        btn.addEventListener('click', () => {
            if (config.formUrl) {
                window.open(config.formUrl, '_blank', 'noopener,noreferrer');
            }
        });

        document.body.appendChild(btn);
    }

    function initBetaBadge() {
        const config = ONBOARDING_CONFIG.betaBadge;
        if (!config?.show) return;

        // Find the logo text in sidebar
        const logoText = document.querySelector('.logo-text');
        if (!logoText) return;

        // Don't add if already exists
        if (logoText.querySelector('.beta-badge')) return;

        const badge = document.createElement('span');
        badge.className = 'beta-badge ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold';
        badge.style.cssText = 'background-color: #FEF3C7; color: #92400E;';
        badge.textContent = config.text || 'BETA';

        logoText.appendChild(badge);
    }
})();
