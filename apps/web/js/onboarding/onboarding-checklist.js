/**
 * PE OS — Onboarding Checklist Widget
 * Persistent on dashboard until dismissed or all steps completed.
 * Reads content from ONBOARDING_CONFIG.checklist.
 */

(function() {
    'use strict';

    const CONTAINER_ID = 'onboarding-checklist-container';

    /**
     * Initialize checklist — call on dashboard page load
     */
    window.initOnboardingChecklist = async function() {
        if (!window.OnboardingAPI || !window.ONBOARDING_CONFIG) return;

        const container = document.getElementById(CONTAINER_ID);
        if (!container) return;

        try {
            const status = await OnboardingAPI.getStatus();

            // Don't show if dismissed or all complete
            if (status.checklistDismissed) return;
            const allComplete = Object.values(status.steps || {}).every(Boolean);
            if (allComplete) return;

            renderChecklist(container, status);
        } catch (e) {
            // Silently skip
        }
    };

    function renderChecklist(container, status) {
        const config = ONBOARDING_CONFIG.checklist;
        if (!config) return;

        const steps = config.steps || [];
        const completedCount = steps.filter(s => status.steps?.[s.id]).length;
        const totalSteps = steps.length;
        const progressPct = Math.round((completedCount / totalSteps) * 100);

        const stepsHtml = steps.map(step => {
            const isComplete = status.steps?.[step.id];
            const linkAttr = step.href ? `onclick="window.location.href='${step.href}'"` : '';
            const cursorClass = step.href ? 'cursor-pointer hover:bg-[#F8F9FA]' : '';

            return `
                <div class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${cursorClass}" ${linkAttr}>
                    <div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isComplete
                            ? 'bg-green-100 text-green-600'
                            : 'border-2 border-slate-200 text-transparent'
                    }">
                        ${isComplete ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm ${isComplete ? 'text-slate-400 line-through' : 'text-[#111418] font-medium'}">${step.label}</p>
                        ${!isComplete && step.description ? `<p class="text-xs text-slate-400 mt-0.5">${step.description}</p>` : ''}
                    </div>
                    ${!isComplete && step.href ? '<span class="material-symbols-outlined text-slate-300 text-[18px]">chevron_right</span>' : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
                <!-- Header -->
                <div class="px-5 py-4 flex items-center justify-between" style="border-bottom: 1px solid #f1f5f9;">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background-color: #003366;">
                            <span class="material-symbols-outlined text-white text-lg">flag</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-[#111418] text-sm">${config.title}</h3>
                            <p class="text-xs text-slate-400">${completedCount}/${totalSteps} completed</p>
                        </div>
                    </div>
                    <button id="checklist-dismiss" class="text-slate-300 hover:text-slate-500 transition-colors" title="Dismiss">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <!-- Progress Bar -->
                <div class="px-5 pt-3 pb-1">
                    <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" style="width: ${progressPct}%; background-color: #003366;"></div>
                    </div>
                </div>

                <!-- Steps -->
                <div class="px-1 py-2">
                    ${stepsHtml}
                </div>
            </div>
        `;

        // Dismiss handler
        document.getElementById('checklist-dismiss')?.addEventListener('click', () => {
            container.innerHTML = '';
            OnboardingAPI.dismissChecklist();
        });
    }

    /**
     * Refresh checklist after a step is completed (call from other pages)
     */
    window.refreshOnboardingChecklist = async function() {
        OnboardingAPI.clearCache();
        await initOnboardingChecklist();
    };
})();
