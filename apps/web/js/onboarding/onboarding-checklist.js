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

            const resolvedSteps = await resolveStepHrefs(ONBOARDING_CONFIG.checklist?.steps || []);
            renderChecklist(container, status, resolvedSteps);
        } catch (e) {
            // Silently skip
        }
    };

    /**
     * Resolve `href: null` steps to the user's most recent deal page.
     * Steps that need a deal context (upload, review, chat) get pointed at
     * /deal.html?id={dealId}#{section}. Fallback to /crm.html if no deal exists.
     */
    async function resolveStepHrefs(steps) {
        const needsDeal = steps.some(s => s.href === null);
        if (!needsDeal) return steps;

        let dealId = null;
        try {
            if (window.PEAuth && window.PE_CONFIG) {
                const res = await PEAuth.authFetch(`${PE_CONFIG.API_BASE_URL}/deals?sortBy=updatedAt&sortOrder=desc`);
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.deals || []);
                    dealId = list[0]?.id || null;
                }
            }
        } catch (e) {
            // Fall through to fallback
        }

        const sectionMap = {
            uploadDocument: 'documents-list',
            reviewExtraction: 'financials-section',
            tryDealChat: 'chat-messages',
        };

        return steps.map(s => {
            if (s.href !== null) return s;
            if (dealId && sectionMap[s.id]) {
                return { ...s, href: `/deal.html?id=${dealId}#${sectionMap[s.id]}` };
            }
            return { ...s, href: '/crm.html' };
        });
    }

    function renderChecklist(container, status, resolvedSteps) {
        const config = ONBOARDING_CONFIG.checklist;
        if (!config) return;

        const steps = resolvedSteps || config.steps || [];
        const completedCount = steps.filter(s => status.steps?.[s.id]).length;
        const totalSteps = steps.length;
        const progressPct = Math.round((completedCount / totalSteps) * 100);

        const stepsHtml = steps.map(step => {
            const isComplete = status.steps?.[step.id];
            const cursorClass = step.href ? 'cursor-pointer hover:bg-[#F8F9FA]' : '';
            const circleTitle = isComplete ? 'Completed' : 'Mark as complete';

            return `
                <div class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${cursorClass}"
                     data-step-row="${step.id}"
                     ${step.href ? `data-step-href="${step.href}"` : ''}>
                    <button type="button"
                            class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors hover:scale-110 ${
                                isComplete
                                    ? 'bg-green-100 text-green-600'
                                    : 'border-2 border-slate-300 text-transparent hover:border-[#003366]'
                            }"
                            data-step-toggle="${step.id}"
                            title="${circleTitle}">
                        ${isComplete ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
                    </button>
                    <div class="flex-1 min-w-0" data-step-body="${step.id}">
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

        // Manual check-off — clicking the circle toggles complete
        container.querySelectorAll('[data-step-toggle]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const stepId = btn.getAttribute('data-step-toggle');
                if (!stepId) return;
                const isComplete = btn.classList.contains('bg-green-100');
                if (isComplete) return; // No un-check (idempotent forward only)
                await OnboardingAPI.completeStep(stepId);
                // Re-render to reflect new state
                await window.refreshOnboardingChecklist?.();
            });
        });

        // Row click — navigate to linked page (separate from circle)
        container.querySelectorAll('[data-step-row]').forEach(row => {
            const href = row.getAttribute('data-step-href');
            if (!href) return;
            row.addEventListener('click', (e) => {
                // Ignore clicks on the toggle button
                if (e.target.closest('[data-step-toggle]')) return;
                window.location.href = href;
            });
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
