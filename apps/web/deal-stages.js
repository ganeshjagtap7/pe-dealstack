// Deal Stages — Pipeline rendering, stage change modals, deal progress timeline
// PE OS - AI-Powered Deal Analysis
// Depends on: state (from deal.js), showNotification (js/notifications.js), PEAuth (js/auth.js), API_BASE_URL (js/config.js)

// Stage configuration - ordered pipeline stages
const DEAL_STAGES = [
    { key: 'INITIAL_REVIEW', label: 'Initial Review', icon: 'search', color: 'slate' },
    { key: 'DUE_DILIGENCE', label: 'Due Diligence', icon: 'fact_check', color: 'amber' },
    { key: 'IOI_SUBMITTED', label: 'IOI Submitted', icon: 'description', color: 'blue' },
    { key: 'LOI_SUBMITTED', label: 'LOI Submitted', icon: 'verified', color: 'indigo' },
    { key: 'NEGOTIATION', label: 'Negotiation', icon: 'handshake', color: 'purple' },
    { key: 'CLOSING', label: 'Closing', icon: 'gavel', color: 'emerald' },
];

const TERMINAL_STAGES = [
    { key: 'CLOSED_WON', label: 'Closed Won', icon: 'celebration', color: 'green' },
    { key: 'CLOSED_LOST', label: 'Closed Lost', icon: 'cancel', color: 'red' },
    { key: 'PASSED', label: 'Passed', icon: 'block', color: 'gray' },
];

function getStageLabel(stage) {
    const labels = {
        'INITIAL_REVIEW': 'Initial Review',
        'DUE_DILIGENCE': 'Due Diligence',
        'IOI_SUBMITTED': 'IOI Submitted',
        'LOI_SUBMITTED': 'LOI Submitted',
        'NEGOTIATION': 'Negotiation',
        'CLOSING': 'Closing',
        'PASSED': 'Passed',
        'CLOSED_WON': 'Closed Won',
        'CLOSED_LOST': 'Closed Lost'
    };
    return labels[stage] || stage;
}

function getStageIndex(stage) {
    return DEAL_STAGES.findIndex(s => s.key === stage);
}

function isTerminalStage(stage) {
    return TERMINAL_STAGES.some(s => s.key === stage);
}

function renderStagePipeline(currentStage) {
    const container = document.getElementById('pipeline-stages');
    if (!container) return;

    const currentIndex = getStageIndex(currentStage);
    const isTerminal = isTerminalStage(currentStage);

    // Build pipeline HTML
    let html = '';

    DEAL_STAGES.forEach((stage, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex && !isTerminal;
        const isFuture = index > currentIndex || isTerminal;

        // Stage indicator
        let stageClass = '';
        let iconClass = '';
        let textClass = '';

        if (isPast) {
            stageClass = 'bg-secondary text-white';
            iconClass = 'text-white';
            textClass = 'text-secondary font-medium';
        } else if (isCurrent) {
            stageClass = 'bg-primary text-white ring-2 ring-primary/30 shadow-lg';
            iconClass = 'text-white';
            textClass = 'text-primary font-bold';
        } else {
            stageClass = 'bg-gray-100 text-gray-400';
            iconClass = 'text-gray-400';
            textClass = 'text-gray-400';
        }

        html += `
            <div class="flex-1 flex flex-col items-center relative group cursor-pointer" data-stage="${stage.key}">
                <div class="flex items-center w-full">
                    ${index > 0 ? `<div class="flex-1 h-0.5 ${isPast || isCurrent ? 'bg-secondary' : 'bg-gray-200'}"></div>` : '<div class="flex-1"></div>'}
                    <div class="size-8 rounded-full ${stageClass} flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110">
                        ${isPast ? '<span class="material-symbols-outlined text-sm">check</span>' : `<span class="material-symbols-outlined text-sm ${iconClass}">${stage.icon}</span>`}
                    </div>
                    ${index < DEAL_STAGES.length - 1 ? `<div class="flex-1 h-0.5 ${isPast ? 'bg-secondary' : 'bg-gray-200'}"></div>` : '<div class="flex-1"></div>'}
                </div>
                <span class="text-[10px] mt-1.5 ${textClass} text-center leading-tight whitespace-nowrap">${stage.label}</span>
            </div>
        `;
    });

    // Add terminal stage indicator if applicable
    if (isTerminal) {
        const terminalStage = TERMINAL_STAGES.find(s => s.key === currentStage);
        if (terminalStage) {
            const colorClass = currentStage === 'CLOSED_WON' ? 'bg-green-500 text-white' :
                currentStage === 'CLOSED_LOST' ? 'bg-red-500 text-white' :
                    'bg-gray-500 text-white';
            html += `
                <div class="flex items-center ml-2">
                    <div class="h-0.5 w-4 bg-gray-300"></div>
                    <div class="px-3 py-1.5 rounded-full ${colorClass} flex items-center gap-1.5 text-xs font-bold shadow-lg">
                        <span class="material-symbols-outlined text-sm">${terminalStage.icon}</span>
                        ${terminalStage.label}
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // Add click handlers to stages
    container.querySelectorAll('[data-stage]').forEach(el => {
        el.addEventListener('click', () => {
            const targetStage = el.getAttribute('data-stage');
            if (targetStage !== currentStage) {
                showStageChangeModal(currentStage, targetStage);
            }
        });
    });
}

function showStageChangeModal(fromStage, toStage) {
    const fromLabel = getStageLabel(fromStage);
    const toLabel = getStageLabel(toStage);
    const fromIndex = getStageIndex(fromStage);
    const toIndex = getStageIndex(toStage);
    const isMovingBack = toIndex < fromIndex;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">swap_horiz</span>
                        Change Deal Stage
                    </h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6">
                <div class="flex items-center justify-center gap-4 mb-6">
                    <div class="text-center">
                        <div class="size-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                            <span class="material-symbols-outlined text-gray-500">circle</span>
                        </div>
                        <span class="text-sm font-medium text-gray-600">${fromLabel}</span>
                    </div>
                    <span class="material-symbols-outlined text-2xl ${isMovingBack ? 'text-amber-500' : 'text-primary'}">
                        ${isMovingBack ? 'arrow_back' : 'arrow_forward'}
                    </span>
                    <div class="text-center">
                        <div class="size-12 rounded-full ${isMovingBack ? 'bg-amber-100' : 'bg-primary-light'} flex items-center justify-center mx-auto mb-2">
                            <span class="material-symbols-outlined ${isMovingBack ? 'text-amber-600' : 'text-primary'}">circle</span>
                        </div>
                        <span class="text-sm font-bold ${isMovingBack ? 'text-amber-600' : 'text-primary'}">${toLabel}</span>
                    </div>
                </div>

                ${isMovingBack ? `
                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <div class="flex items-start gap-2">
                            <span class="material-symbols-outlined text-amber-500 text-sm mt-0.5">warning</span>
                            <p class="text-sm text-amber-700">You are moving this deal backwards in the pipeline. This will be logged in the activity feed.</p>
                        </div>
                    </div>
                ` : ''}

                <div class="mb-4">
                    <label class="block text-sm font-medium text-slate-700 mb-2">Add a note (optional)</label>
                    <textarea id="stage-change-note" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" rows="2" placeholder="Reason for stage change..."></textarea>
                </div>

                <div class="flex gap-3">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors">
                        Cancel
                    </button>
                    <button onclick="confirmStageChange('${toStage}', document.getElementById('stage-change-note').value); this.closest('.fixed').remove();" class="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors">
                        Confirm Change
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function confirmStageChange(newStage, note) {
    if (!state.dealId) {
        showNotification('Error', 'No deal loaded', 'error');
        return;
    }

    const oldStage = state.dealData?.stage;

    try {
        // Update deal stage via API
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: newStage }),
        });

        if (!response.ok) {
            throw new Error('Failed to update stage');
        }

        const updatedDeal = await response.json();
        state.dealData = updatedDeal;

        // Update UI
        const stageBadge = document.getElementById('deal-stage-badge');
        if (stageBadge) {
            stageBadge.textContent = getStageLabel(newStage);
        }

        // Re-render pipeline
        renderStagePipeline(newStage);

        // Show success notification
        showNotification(
            'Stage Updated',
            `Deal moved from ${getStageLabel(oldStage)} to ${getStageLabel(newStage)}`,
            'success'
        );

    } catch (error) {
        console.error('Error updating stage:', error);
        showNotification('Error', 'Failed to update deal stage', 'error');
    }
}

function showTerminalStageModal() {
    const currentStage = state.dealData?.stage;
    const dealName = state.dealData?.name || 'this deal';

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white/80 backdrop-blur-md rounded-xl shadow-lg max-w-md w-full animate-fadeIn border border-white/50">
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border-subtle">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-semibold text-text-main">Close Deal</h3>
                        <p class="text-xs text-text-muted mt-0.5">${dealName}</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="size-8 rounded-lg text-text-muted hover:text-text-main hover:bg-background-body flex items-center justify-center transition-colors">
                        <span class="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="p-5">
                <p class="text-sm text-text-secondary mb-4">Select the final outcome:</p>

                <div class="space-y-2">
                    <!-- Closed Won -->
                    <button onclick="confirmStageChange('CLOSED_WON', ''); this.closest('.fixed').remove();" class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border-subtle bg-white hover:border-secondary/50 hover:bg-secondary-light/20 transition-all group">
                        <div class="size-9 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center group-hover:bg-secondary group-hover:text-white transition-colors">
                            <span class="material-symbols-outlined text-xl">check_circle</span>
                        </div>
                        <div class="text-left flex-1">
                            <div class="font-medium text-text-main text-sm">Closed Won</div>
                            <div class="text-xs text-text-muted">Deal successfully completed</div>
                        </div>
                    </button>

                    <!-- Closed Lost -->
                    <button onclick="confirmStageChange('CLOSED_LOST', ''); this.closest('.fixed').remove();" class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border-subtle bg-white hover:border-red-300 hover:bg-red-50/30 transition-all group">
                        <div class="size-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                            <span class="material-symbols-outlined text-xl">cancel</span>
                        </div>
                        <div class="text-left flex-1">
                            <div class="font-medium text-text-main text-sm">Closed Lost</div>
                            <div class="text-xs text-text-muted">Deal not completed</div>
                        </div>
                    </button>

                    <!-- Passed -->
                    <button onclick="confirmStageChange('PASSED', ''); this.closest('.fixed').remove();" class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border-subtle bg-white hover:border-gray-300 hover:bg-gray-50/50 transition-all group">
                        <div class="size-9 rounded-lg bg-gray-100 text-text-muted flex items-center justify-center group-hover:bg-gray-500 group-hover:text-white transition-colors">
                            <span class="material-symbols-outlined text-xl">do_not_disturb_on</span>
                        </div>
                        <div class="text-left flex-1">
                            <div class="font-medium text-text-main text-sm">Passed</div>
                            <div class="text-xs text-text-muted">Decided not to pursue</div>
                        </div>
                    </button>
                </div>

                <button onclick="this.closest('.fixed').remove()" class="w-full mt-4 px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Render deal progress timeline based on actual pipeline stage
function renderDealProgress(deal) {
    const container = document.getElementById('deal-progress-items');
    if (!container || !deal) return;

    const currentStage = deal.stage || 'INITIAL_REVIEW';
    const currentIndex = getStageIndex(currentStage);
    const isTerminal = isTerminalStage(currentStage);

    // If stage not recognized, default to first stage
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;

    let html = '<div class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border-subtle"></div>';

    DEAL_STAGES.forEach((stage, index) => {
        const isPast = isTerminal ? true : index < safeIndex;
        const isCurrent = !isTerminal && index === safeIndex;
        const isFuture = !isTerminal && index > safeIndex;

        let dotHtml, titleClass, subtitle;

        if (isPast) {
            dotHtml = `<div class="size-6 rounded-full bg-secondary border-4 border-white z-10 shrink-0 flex items-center justify-center shadow-sm">
                <span class="material-symbols-outlined text-[14px] text-white font-bold">check</span>
            </div>`;
            titleClass = 'text-sm font-bold text-text-main';
            subtitle = '';
        } else if (isCurrent) {
            dotHtml = `<div class="size-6 rounded-full bg-primary border-4 border-primary-light outline outline-2 outline-primary/20 z-10 shrink-0 flex items-center justify-center shadow-[0_0_10px_rgba(0,51,102,0.3)]">
                <div class="size-2 bg-white rounded-full animate-pulse"></div>
            </div>`;
            titleClass = 'text-sm font-bold text-primary';
            subtitle = 'In Progress';
        } else {
            dotHtml = `<div class="size-6 rounded-full bg-background-body border-2 border-border-subtle z-10 shrink-0"></div>`;
            titleClass = 'text-sm font-bold text-text-muted';
            subtitle = '';
        }

        const opacity = isFuture ? 'opacity-40' : '';
        const marginClass = index < DEAL_STAGES.length - 1 ? 'mb-6' : '';

        html += `
            <div class="flex gap-4 ${marginClass} relative ${opacity}">
                ${dotHtml}
                <div>
                    <h4 class="${titleClass}">${stage.label}</h4>
                    ${subtitle ? `<p class="text-xs text-text-muted mt-0.5 font-medium">${subtitle}</p>` : ''}
                </div>
            </div>
        `;
    });

    // Add terminal stage if applicable
    if (isTerminal) {
        const terminalStage = TERMINAL_STAGES.find(s => s.key === currentStage);
        if (terminalStage) {
            const bgColor = currentStage === 'CLOSED_WON' ? 'bg-secondary' :
                currentStage === 'CLOSED_LOST' ? 'bg-red-500' : 'bg-gray-400';
            html += `
                <div class="flex gap-4 mt-6 relative">
                    ${`<div class="size-6 rounded-full ${bgColor} border-4 border-white z-10 shrink-0 flex items-center justify-center shadow-sm">
                        <span class="material-symbols-outlined text-[14px] text-white font-bold">${terminalStage.icon}</span>
                    </div>`}
                    <div>
                        <h4 class="text-sm font-bold text-text-main">${terminalStage.label}</h4>
                        ${deal.actualCloseDate ? `<p class="text-xs text-text-muted mt-0.5 font-medium">${new Date(deal.actualCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

// Render key risks and investment highlights from AI extraction
function renderKeyRisks(deal) {
    const container = document.getElementById('key-risks-list');
    if (!container || !deal) return;

    const aiRisks = deal.aiRisks;
    const risks = aiRisks?.keyRisks || [];
    const highlights = aiRisks?.investmentHighlights || [];

    if (risks.length === 0 && highlights.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-text-muted">
                <span class="material-symbols-outlined text-2xl mb-2">shield</span>
                <p class="text-sm">No risks identified yet</p>
                <p class="text-xs mt-1">Upload documents or use AI chat to analyze risks</p>
            </div>
        `;
        return;
    }

    let html = '<ul class="space-y-2">';

    risks.forEach((risk, i) => {
        const isTop = i === 0;
        const leftBar = isTop
            ? 'border-l-2 border-l-red-400'
            : 'border-l-2 border-l-orange-300';
        const iconClass = isTop ? 'text-red-400' : 'text-orange-400';
        const icon = isTop ? 'error' : 'warning';
        html += `
            <li class="bg-white border border-border-subtle ${leftBar} p-3 rounded-lg hover:border-red-200 hover:shadow-sm transition-all">
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-outlined ${iconClass} text-base mt-0.5 shrink-0">${icon}</span>
                    <p class="text-xs text-text-secondary leading-snug">${escapeHtml(risk)}</p>
                </div>
            </li>
        `;
    });

    highlights.forEach(highlight => {
        html += `
            <li class="bg-white border border-border-subtle border-l-2 border-l-secondary p-3 rounded-lg hover:border-secondary/30 hover:shadow-sm transition-all">
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-secondary text-base mt-0.5 shrink-0">check_circle</span>
                    <p class="text-xs text-text-secondary leading-snug">${escapeHtml(highlight)}</p>
                </div>
            </li>
        `;
    });

    html += '</ul>';
    container.innerHTML = html;
}

function initStagePipeline() {
    const changeStageBtn = document.getElementById('change-stage-btn');
    if (changeStageBtn) {
        changeStageBtn.addEventListener('click', () => {
            const currentStage = state.dealData?.stage;
            if (isTerminalStage(currentStage)) {
                showNotification('Stage Locked', 'This deal has been closed and cannot be moved.', 'warning');
                return;
            }
            showTerminalStageModal();
        });
    }
}
