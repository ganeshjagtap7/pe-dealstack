/**
 * PE OS — Welcome Modal Component
 * Shows on first login only. Reads content from ONBOARDING_CONFIG.
 */

(function() {
    'use strict';

    const MODAL_ID = 'pe-welcome-modal';

    /**
     * Initialize welcome modal — call on page load
     */
    window.initWelcomeModal = async function() {
        if (!window.OnboardingAPI || !window.ONBOARDING_CONFIG) return;

        try {
            const status = await OnboardingAPI.getStatus();
            if (!status.welcomeShown) {
                showWelcomeModal();
            }
        } catch (e) {
            // Silently skip if API fails
        }
    };

    function showWelcomeModal() {
        const config = ONBOARDING_CONFIG.welcome;
        if (!config) return;

        // Build step cards
        const stepsHtml = config.steps.map((step, i) => `
            <div class="flex items-start gap-4 p-4 rounded-xl bg-[#F8F9FA] border border-slate-100">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background-color: #003366;">
                    <span class="material-symbols-outlined text-white text-xl">${step.icon}</span>
                </div>
                <div>
                    <p class="font-semibold text-[#111418] text-sm">${step.title}</p>
                    <p class="text-slate-500 text-xs mt-0.5 leading-relaxed">${step.description}</p>
                </div>
            </div>
        `).join('');

        // Video embed (optional)
        const videoHtml = config.videoDemoUrl ? `
            <div class="mt-4 rounded-xl overflow-hidden border border-slate-200">
                <iframe src="${config.videoDemoUrl}" width="100%" height="200" frameborder="0" allowfullscreen></iframe>
            </div>
        ` : '';

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" id="welcome-backdrop"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-fadeIn">
                <!-- Header -->
                <div class="p-6 pb-2 text-center">
                    <div class="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style="background-color: #003366;">
                        <span class="material-symbols-outlined text-white text-3xl">rocket_launch</span>
                    </div>
                    <h2 class="text-xl font-bold text-[#111418]">${config.title}</h2>
                    <p class="text-slate-500 text-sm mt-1">${config.subtitle}</p>
                </div>

                <!-- Steps -->
                <div class="px-6 py-4 flex flex-col gap-3">
                    ${stepsHtml}
                </div>

                ${videoHtml}

                <!-- CTA -->
                <div class="p-6 pt-2">
                    <button id="welcome-cta" class="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition-all hover:opacity-90 hover:shadow-xl"
                            style="background-color: #003366;">
                        ${config.ctaText}
                        <span class="material-symbols-outlined text-[18px] align-middle ml-1">arrow_forward</span>
                    </button>
                    <button id="welcome-skip" class="w-full py-2 mt-2 text-slate-400 text-xs hover:text-slate-600 transition-colors">
                        I'll explore on my own
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add fade-in animation
        requestAnimationFrame(() => {
            modal.querySelector('.relative').style.animation = 'fadeInUp 0.3s ease-out';
        });

        // Event listeners
        document.getElementById('welcome-cta').addEventListener('click', () => {
            closeWelcomeModal();
            if (config.ctaHref) window.location.href = config.ctaHref;
        });

        document.getElementById('welcome-skip').addEventListener('click', closeWelcomeModal);
        document.getElementById('welcome-backdrop').addEventListener('click', closeWelcomeModal);
    }

    function closeWelcomeModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.2s ease-out';
            setTimeout(() => modal.remove(), 200);
        }
        OnboardingAPI.markWelcomeShown();
    }

    // Inject keyframe animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
})();
