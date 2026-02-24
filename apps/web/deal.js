// Deal Intelligence & Chat Terminal Interactive Features
// PE OS - AI-Powered Deal Analysis

const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

// ============================================================
// State Management
// ============================================================
const state = {
    messages: [],
    attachedFiles: [],
    uploadingFiles: [],
    dealData: null,
    dealId: null,
    contextDocuments: []
};

// ============================================================
// Markdown Parser for AI Responses
// ============================================================
function parseMarkdown(text) {
    if (!text) return '';

    // Escape HTML first to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Code: `text`
    html = html.replace(/`(.+?)`/g, '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-xs">$1</code>');

    // Split into paragraphs
    const paragraphs = html.split(/\n\n+/);

    return paragraphs.map(para => {
        // Check if it's a numbered list
        const lines = para.split('\n');
        const isNumberedList = lines.every(line => /^\d+\.\s/.test(line.trim()) || line.trim() === '');

        if (isNumberedList && lines.some(line => /^\d+\.\s/.test(line.trim()))) {
            const items = lines
                .filter(line => /^\d+\.\s/.test(line.trim()))
                .map(line => `<li class="ml-4">${line.replace(/^\d+\.\s/, '')}</li>`)
                .join('');
            return `<ol class="list-decimal list-inside space-y-1 my-2">${items}</ol>`;
        }

        // Check if it's a bullet list
        const isBulletList = lines.every(line => /^[-•]\s/.test(line.trim()) || line.trim() === '');

        if (isBulletList && lines.some(line => /^[-•]\s/.test(line.trim()))) {
            const items = lines
                .filter(line => /^[-•]\s/.test(line.trim()))
                .map(line => `<li class="ml-4">${line.replace(/^[-•]\s/, '')}</li>`)
                .join('');
            return `<ul class="list-disc list-inside space-y-1 my-2">${items}</ul>`;
        }

        // Regular paragraph - convert single newlines to <br>
        return `<p class="my-2">${para.replace(/\n/g, '<br>')}</p>`;
    }).join('');
}

// ============================================================
// API Functions
// ============================================================
function getDealIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function openDataRoom() {
    const dealId = getDealIdFromUrl();
    if (dealId) {
        window.location.href = `vdr.html?dealId=${dealId}`;
    } else {
        showNotification('Error', 'No deal ID available', 'error');
    }
}

function toggleDealActionsMenu() {
    const menu = document.getElementById('deal-actions-menu');
    menu?.classList.toggle('hidden');
}

// Close deal actions menu when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('deal-actions-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById('deal-actions-menu')?.classList.add('hidden');
    }
});

async function deleteDealFromDetail() {
    const menu = document.getElementById('deal-actions-menu');
    menu?.classList.add('hidden');

    const dealName = state.dealData?.name || 'this deal';
    if (!confirm(`Are you sure you want to delete "${dealName}"?\n\nThis will also delete all associated data room files, documents, and team assignments. This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to delete deal');
        }
        // Redirect to deals list
        window.location.href = 'crm.html';
    } catch (error) {
        console.error('Error deleting deal:', error);
        showNotification('Error', error.message || 'Failed to delete deal', 'error');
    }
}

async function loadDealData() {
    const dealId = getDealIdFromUrl();
    if (!dealId) {
        showNotification('Error', 'No deal ID provided', 'error');
        return;
    }

    state.dealId = dealId;

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`);
        if (!response.ok) throw new Error('Deal not found');

        const deal = await response.json();
        state.dealData = deal;
        state.contextDocuments = deal.documents?.map(d => d.name) || [];
        state.attachedFiles = deal.documents?.map((d, i) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            size: formatFileSize(d.fileSize),
            icon: getDocIcon(d.name),
            color: getDocColor(d.name)
        })) || [];

        populateDealPage(deal);
    } catch (error) {
        console.error('Error loading deal:', error);
        showNotification('Error', 'Failed to load deal data', 'error');
    }
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
}

function getDocIcon(name) {
    if (!name) return 'description';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (ext === 'xlsx' || ext === 'xls') return 'table_chart';
    if (ext === 'csv') return 'table_view';
    if (ext === 'msg' || ext === 'eml') return 'mail';
    if (ext === 'md') return 'summarize';
    if (name.startsWith('Deal Overview')) return 'summarize';
    return 'description';
}

function getDocColor(name) {
    if (!name) return 'slate';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'red';
    if (ext === 'xlsx' || ext === 'xls') return 'emerald';
    if (ext === 'csv') return 'blue';
    if (ext === 'md') return 'purple';
    if (name.startsWith('Deal Overview')) return 'purple';
    return 'slate';
}

// Format currency — values are stored in millions USD in the database
// Displays in the most natural unit: B (billions), M (millions), or K (thousands)
function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    // >= 1000M = Billions
    if (absValue >= 1000) {
        const b = absValue / 1000;
        return `${sign}$${b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)}B`;
    }
    // >= 1M = Millions  
    if (absValue >= 1) {
        return `${sign}$${absValue >= 100 ? absValue.toFixed(0) : absValue >= 10 ? absValue.toFixed(1) : absValue.toFixed(2)}M`;
    }
    // < 1M = Thousands (value is fractional millions, e.g. 0.038 = $38K)
    const k = absValue * 1000;
    if (k >= 1) {
        return `${sign}$${k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)}K`;
    }
    // Very small values — show as dollar amount
    const dollars = absValue * 1000000;
    return `${sign}$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

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

function formatRelativeTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    return 'Just now';
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

function populateDealPage(deal) {
    // Update page title
    document.title = `${deal.name} - PE OS Deal Intelligence`;

    // Render stage pipeline
    renderStagePipeline(deal.stage);

    // Update breadcrumb
    const breadcrumbDeal = document.getElementById('breadcrumb-deal');
    if (breadcrumbDeal) breadcrumbDeal.textContent = deal.name || 'Untitled Deal';

    const breadcrumbIndustry = document.getElementById('breadcrumb-industry');
    if (breadcrumbIndustry) breadcrumbIndustry.textContent = deal.industry || 'Deal';

    // Update deal header
    const dealTitle = document.getElementById('deal-title');
    if (dealTitle) dealTitle.textContent = deal.name;

    // Update icon
    const iconContainer = document.getElementById('deal-icon');
    if (iconContainer && deal.icon) iconContainer.textContent = deal.icon;

    // Update stage badge
    const stageBadge = document.getElementById('deal-stage-badge');
    if (stageBadge) {
        stageBadge.textContent = getStageLabel(deal.stage);
    }

    // Update industry badge
    const industryBadge = document.getElementById('deal-industry-badge');
    if (industryBadge && deal.industry) {
        industryBadge.textContent = deal.industry;
    }

    // Update financial metrics with graceful empty states
    const revenueEl = document.getElementById('deal-revenue');
    if (revenueEl) {
        if (deal.revenue != null) {
            revenueEl.textContent = formatCurrency(deal.revenue);
            revenueEl.classList.remove('text-text-muted', 'text-lg');
            revenueEl.classList.add('text-text-main', 'text-2xl');
        } else {
            revenueEl.textContent = 'Not available';
            revenueEl.classList.remove('text-text-main', 'text-2xl');
            revenueEl.classList.add('text-text-muted', 'text-lg');
        }
    }
    // Revenue chart placeholder
    const revenueChart = document.getElementById('revenue-chart');
    if (revenueChart) {
        if (deal.revenue != null) {
            revenueChart.innerHTML = '<div class="flex-1 bg-secondary/60 h-[40%] rounded-t-sm"></div><div class="flex-1 bg-secondary/60 h-[50%] rounded-t-sm"></div><div class="flex-1 bg-secondary/60 h-[45%] rounded-t-sm"></div><div class="flex-1 bg-secondary/60 h-[60%] rounded-t-sm"></div><div class="flex-1 bg-secondary h-[80%] rounded-t-sm"></div>';
        } else {
            revenueChart.innerHTML = '<p class="text-[10px] text-text-muted/50 italic self-center">Add via Edit Deal</p>';
        }
    }

    const ebitdaEl = document.getElementById('deal-ebitda');
    if (ebitdaEl) {
        if (deal.ebitda && deal.revenue) {
            const margin = ((deal.ebitda / deal.revenue) * 100).toFixed(0);
            ebitdaEl.textContent = margin + '%';
            ebitdaEl.classList.remove('text-text-muted', 'text-lg');
            ebitdaEl.classList.add('text-text-main', 'text-2xl');
            const ebitdaBar = document.getElementById('ebitda-bar');
            if (ebitdaBar) ebitdaBar.style.width = Math.min(parseInt(margin), 100) + '%';
        } else {
            ebitdaEl.textContent = 'Not available';
            ebitdaEl.classList.remove('text-text-main', 'text-2xl');
            ebitdaEl.classList.add('text-text-muted', 'text-lg');
        }
    }

    const dealSizeEl = document.getElementById('deal-size');
    if (dealSizeEl) {
        if (deal.dealSize != null) {
            dealSizeEl.textContent = formatCurrency(deal.dealSize);
            dealSizeEl.classList.remove('text-text-muted', 'text-lg');
            dealSizeEl.classList.add('text-text-main', 'text-2xl');
        } else {
            dealSizeEl.textContent = 'Not available';
            dealSizeEl.classList.remove('text-text-main', 'text-2xl');
            dealSizeEl.classList.add('text-text-muted', 'text-lg');
        }
    }

    // Update EBITDA multiple
    const multipleEl = document.getElementById('deal-multiple');
    if (multipleEl) {
        if (deal.dealSize && deal.ebitda) {
            const multiple = (deal.dealSize / deal.ebitda).toFixed(1);
            multipleEl.textContent = `~${multiple}x EBITDA Multiple`;
        } else {
            multipleEl.textContent = 'Add via Edit Deal';
            multipleEl.classList.add('italic', 'opacity-50');
        }
    }

    // Update IRR
    const irrEl = document.getElementById('deal-irr');
    if (irrEl) {
        if (deal.irrProjected) {
            irrEl.textContent = deal.irrProjected.toFixed(1) + '%';
            irrEl.classList.remove('text-text-muted', 'text-lg');
            irrEl.classList.add('text-text-main', 'text-2xl');
            const irrBadge = document.getElementById('irr-target-badge');
            if (irrBadge) irrBadge.classList.remove('hidden');
        } else {
            irrEl.textContent = 'Not available';
            irrEl.classList.remove('text-text-main', 'text-2xl');
            irrEl.classList.add('text-text-muted', 'text-lg');
        }
    }

    // Update MoM
    const momEl = document.getElementById('deal-mom');
    if (momEl) {
        if (deal.mom) {
            momEl.textContent = deal.mom.toFixed(1) + 'x';
        } else {
            momEl.textContent = '\u2014';
        }
    }

    // Update last updated
    const lastUpdated = document.getElementById('deal-updated');
    if (lastUpdated) lastUpdated.textContent = formatRelativeTime(deal.updatedAt);

    // Update deal source
    const dealSource = document.getElementById('deal-source');
    if (dealSource) dealSource.textContent = deal.source || 'Proprietary';

    // Update lead partner and analyst from team members
    const teamMembers = deal.teamMembers || [];
    console.log('[Deal] Team members:', teamMembers);

    const leadPartner = teamMembers.find(m => m.role === 'LEAD');
    // Get the most recently added analyst (MEMBER role) - sort by addedAt descending
    const analysts = teamMembers.filter(m => m.role === 'MEMBER');
    const analyst = analysts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))[0];

    console.log('[Deal] Lead Partner:', leadPartner?.user?.name);
    console.log('[Deal] Analyst:', analyst?.user?.name);

    const leadPartnerName = document.getElementById('lead-partner-name');
    if (leadPartnerName) {
        leadPartnerName.textContent = leadPartner?.user?.name || '—';
    }

    const analystName = document.getElementById('analyst-name');
    if (analystName) {
        analystName.textContent = analyst?.user?.name || '—';
    }

    // Update AI Thesis in chat intro
    const aiIntro = document.getElementById('ai-intro');
    if (aiIntro && deal.aiThesis) {
        aiIntro.innerHTML = `<p>I've analyzed the documents for <strong>${deal.name}</strong>. ${deal.aiThesis}</p><p class="mt-3">What would you like to know about this deal?</p>`;
    }

    // Update documents list
    updateDocumentsList(deal.documents || []);

    // Update chat context documents
    updateChatContext(deal.documents || []);

    // Update activity feed
    renderActivityFeed(deal.activities || []);

    // Render deal progress timeline
    renderDealProgress(deal);

    // Render key risks from AI extraction
    renderKeyRisks(deal);

    // Render team avatars in header
    renderTeamAvatars(deal.teamMembers || []);
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

    let html = '<ul class="space-y-3">';

    risks.forEach((risk, i) => {
        const bgClass = i === 0
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-white dark:bg-white/5 border-border-subtle hover:border-primary/30';
        const iconClass = i === 0 ? 'text-amber-500' : 'text-text-muted';
        const icon = i === 0 ? 'error' : 'info';
        html += `
            <li class="${bgClass} border p-3 rounded-lg transition-colors shadow-sm">
                <div class="flex items-start gap-2">
                    <span class="material-symbols-outlined ${iconClass} text-sm mt-0.5">${icon}</span>
                    <p class="text-sm text-text-main font-bold">${escapeHtml(risk)}</p>
                </div>
            </li>
        `;
    });

    highlights.forEach(highlight => {
        html += `
            <li class="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg transition-colors shadow-sm">
                <div class="flex items-start gap-2">
                    <span class="material-symbols-outlined text-secondary text-sm mt-0.5">check_circle</span>
                    <p class="text-sm text-text-main font-bold">${escapeHtml(highlight)}</p>
                </div>
            </li>
        `;
    });

    html += '</ul>';
    container.innerHTML = html;
}

// Render team avatars in the header
function renderTeamAvatars(teamMembers) {
    const avatarStack = document.getElementById('team-avatar-stack');
    const moreCount = document.getElementById('team-more-count');
    const avatarContainer = document.getElementById('deal-team-avatars');

    if (!avatarStack) return;

    // Show up to 3 avatars, then show "+X" for the rest
    const maxVisible = 3;
    const visibleMembers = teamMembers.slice(0, maxVisible);
    const remainingCount = Math.max(0, teamMembers.length - maxVisible);

    if (teamMembers.length === 0) {
        // Show empty state - just the add button
        avatarStack.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors" title="Add team members">
                <span class="material-symbols-outlined text-[16px]">group_add</span>
            </div>
        `;
        moreCount.classList.add('hidden');
        return;
    }

    // Render visible avatars
    avatarStack.innerHTML = visibleMembers.map((member, index) => {
        const user = member.user;
        const zIndex = maxVisible - index;
        if (user?.avatar) {
            return `
                <img
                    src="${user.avatar}"
                    alt="${user.name}"
                    title="${user.name} (${member.role})"
                    class="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                    style="z-index: ${zIndex};"
                />
            `;
        } else {
            const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
            return `
                <div
                    class="w-8 h-8 rounded-full bg-primary/10 border-2 border-white flex items-center justify-center text-primary font-semibold text-xs shadow-sm"
                    style="z-index: ${zIndex};"
                    title="${user?.name || 'Unknown'} (${member.role})"
                >${initials}</div>
            `;
        }
    }).join('');

    // Show "+X" count if there are more
    if (remainingCount > 0) {
        moreCount.textContent = `+${remainingCount}`;
        moreCount.classList.remove('hidden');
    } else {
        moreCount.classList.add('hidden');
    }
}

// Open share modal
function openShareModal() {
    const dealId = getDealIdFromUrl();
    if (!dealId) {
        showNotification('Error', 'No deal ID available', 'error');
        return;
    }

    // Set callback to refresh avatars when modal closes
    window.onShareModalClose = () => {
        // Reload deal data to refresh team list
        loadDealData();
    };

    ShareModal.open(dealId);
}

function updateDocumentsList(documents) {
    const docsContainer = document.getElementById('documents-list');
    if (!docsContainer) return;
    if (!documents || documents.length === 0) {
        docsContainer.innerHTML = '<p class="text-sm text-text-muted py-2">No documents uploaded yet.</p>';
        return;
    }

    docsContainer.innerHTML = documents.map(doc => {
        const color = getDocColor(doc.name);
        const sizeText = doc.fileSize ? formatFileSize(doc.fileSize) : 'AI Generated';
        const isGenerated = !doc.fileUrl && (doc.name.includes('Deal Overview') || doc.name.includes('Web Research'));
        const badge = isGenerated ? '<span class="text-[9px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 rounded ml-1">AI</span>' : '';
        return `
        <div class="flex items-center gap-3 p-2 pr-4 bg-white dark:bg-white/5 rounded-lg border border-border-subtle shrink-0 hover:border-primary/50 hover:bg-primary-light/30 cursor-pointer transition-colors group shadow-sm doc-preview-item" data-doc-id="${doc.id}" data-doc-name="${doc.name}" data-doc-url="${doc.fileUrl || ''}" data-doc-analysis="${doc.aiAnalysis ? 'true' : ''}">
            <div class="size-10 bg-${color}-50 dark:bg-${color}-950/30 rounded flex items-center justify-center text-${color}-500 group-hover:bg-${color}-100 dark:group-hover:bg-${color}-900/30 transition-colors">
                <span class="material-symbols-outlined">${getDocIcon(doc.name)}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-sm font-bold text-text-main flex items-center">${doc.name}${badge}</span>
                <span class="text-xs text-text-muted">${sizeText} - Added ${formatRelativeTime(doc.createdAt)}</span>
            </div>
        </div>
    `}).join('');

    // Add click handlers for document preview
    docsContainer.querySelectorAll('.doc-preview-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const docName = item.dataset.docName;
            const docUrl = item.dataset.docUrl;
            const docId = item.dataset.docId;
            const hasAnalysis = item.dataset.docAnalysis === 'true';

            if (docUrl && window.PEDocPreview) {
                window.PEDocPreview.preview(docUrl, docName);
            } else if (hasAnalysis || docName.includes('Deal Overview')) {
                // AI-generated doc — fetch and show analysis text
                fetchAndShowAnalysis(docId, docName);
            } else if (docId) {
                fetchAndPreviewDocument(docId, docName);
            } else {
                showNotification('Info', 'This is an AI-generated document', 'info');
            }
        });
    });
}

async function fetchAndShowAnalysis(docId, docName) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/documents/${docId}`);
        if (!response.ok) throw new Error('Failed to fetch document');
        const doc = await response.json();
        const text = doc.aiAnalysis || doc.extractedText || 'No content available';

        // Show in a simple modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6';
        overlay.innerHTML = `
            <div class="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div class="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-purple-500">summarize</span>
                        <h3 class="text-lg font-bold text-text-main">${escapeHtml(docName)}</h3>
                    </div>
                    <button class="close-modal size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
                        <span class="material-symbols-outlined text-text-muted">close</span>
                    </button>
                </div>
                <div class="p-6 overflow-y-auto custom-scrollbar">
                    <div class="prose dark:prose-invert max-w-none text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">${escapeHtml(text)}</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.close-modal').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (error) {
        console.error('Error fetching analysis:', error);
        showNotification('Error', 'Failed to load document', 'error');
    }
}

async function fetchAndPreviewDocument(docId, docName) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/documents/${docId}/download`);
        if (!response.ok) throw new Error('Failed to get document URL');

        const data = await response.json();
        if (data.url && window.PEDocPreview) {
            window.PEDocPreview.preview(data.url, docName);
        } else {
            showNotification('Error', 'Could not generate preview URL', 'error');
        }
    } catch (error) {
        console.error('Error fetching document:', error);
        showNotification('Error', 'Failed to load document', 'error');
    }
}

// ============================================================
// Activity Feed
// ============================================================
function renderActivityFeed(activities) {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    if (!activities || activities.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-3xl mb-2">inbox</span>
                <p class="text-sm">No activities yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activities.slice(0, 10).map(activity => {
        const { icon, color, bgColor } = getActivityIcon(activity.type);
        const timeAgo = formatRelativeTime(activity.createdAt);

        return `
            <div class="flex items-start gap-3 p-3 bg-white rounded-lg border border-border-subtle hover:border-primary/30 transition-colors">
                <div class="size-8 rounded-full ${bgColor} flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-sm ${color}">${icon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-text-main leading-tight">${activity.title}</p>
                    ${activity.description ? `<p class="text-xs text-text-muted mt-0.5 line-clamp-2">${activity.description}</p>` : ''}
                    <div class="flex items-center gap-2 mt-1.5">
                        <span class="text-[10px] text-text-muted font-medium">${timeAgo}</span>
                        ${activity.user?.name ? `
                            <span class="text-[10px] text-text-muted">•</span>
                            <span class="text-[10px] text-text-muted">${activity.user.name}</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getActivityIcon(type) {
    const icons = {
        'DOCUMENT_UPLOADED': { icon: 'upload_file', color: 'text-blue-600', bgColor: 'bg-blue-100' },
        'STAGE_CHANGED': { icon: 'swap_horiz', color: 'text-purple-600', bgColor: 'bg-purple-100' },
        'NOTE_ADDED': { icon: 'sticky_note_2', color: 'text-amber-600', bgColor: 'bg-amber-100' },
        'MEETING_SCHEDULED': { icon: 'event', color: 'text-green-600', bgColor: 'bg-green-100' },
        'CALL_LOGGED': { icon: 'call', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
        'EMAIL_SENT': { icon: 'mail', color: 'text-red-600', bgColor: 'bg-red-100' },
        'STATUS_UPDATED': { icon: 'update', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
        'TEAM_MEMBER_ADDED': { icon: 'person_add', color: 'text-secondary', bgColor: 'bg-secondary-light' },
    };
    return icons[type] || { icon: 'info', color: 'text-gray-600', bgColor: 'bg-gray-100' };
}

async function loadActivities() {
    if (!state.dealId) return;

    const container = document.getElementById('activity-feed');
    if (container) {
        container.innerHTML = `
            <div class="flex items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined animate-spin text-primary mr-2">sync</span>
                Loading activities...
            </div>
        `;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/activities?limit=10`);
        if (!response.ok) throw new Error('Failed to fetch activities');

        const result = await response.json();
        renderActivityFeed(result.data || result);
    } catch (error) {
        console.error('Error loading activities:', error);
        if (container) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-red-500">
                    <span class="material-symbols-outlined text-2xl mb-2">error</span>
                    <p class="text-sm">Failed to load activities</p>
                </div>
            `;
        }
    }
}

function initActivityFeed() {
    // Refresh button handler
    const refreshBtn = document.getElementById('refresh-activities-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadActivities);
    }

    // Add note handlers
    const noteInput = document.getElementById('note-input');
    const addNoteBtn = document.getElementById('add-note-btn');

    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => addNote());
    }

    if (noteInput) {
        noteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addNote();
            }
        });
    }
}

async function addNote() {
    const noteInput = document.getElementById('note-input');
    const note = noteInput?.value?.trim();

    if (!note) {
        showNotification('Error', 'Please enter a note', 'error');
        return;
    }

    if (!state.dealId) {
        showNotification('Error', 'No deal loaded', 'error');
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'NOTE_ADDED',
                title: 'Note added',
                description: note,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to add note');
        }

        const newActivity = await response.json();

        // Clear input
        noteInput.value = '';

        // Reload activities to show the new note
        loadActivities();

        showNotification('Note Added', 'Your note has been saved', 'success');

    } catch (error) {
        console.error('Error adding note:', error);
        showNotification('Error', 'Failed to add note', 'error');
    }
}

function updateChatContext(documents) {
    const contextDocs = document.getElementById('context-docs');
    if (!contextDocs || documents.length === 0) return;

    const colors = ['red', 'secondary', 'blue', 'purple'];
    const bgColors = ['red-100', 'secondary-light', 'blue-100', 'purple-100'];
    const textColors = ['red-700', 'secondary', 'blue-700', 'purple-700'];
    const icons = { pdf: 'P', xlsx: 'X', csv: 'C' };

    contextDocs.innerHTML = documents.slice(0, 3).map((doc, i) => {
        const ext = doc.name.split('.').pop()?.toLowerCase() || '';
        const icon = icons[ext] || 'D';
        return `<div class="size-6 rounded-full bg-${bgColors[i % bgColors.length]} border border-white flex items-center justify-center text-[10px] text-${textColors[i % textColors.length]} font-bold z-${20 - i * 10} shadow-sm" title="${doc.name}">${icon}</div>`;
    }).join('') + (documents.length > 3 ? `<div class="size-6 rounded-full bg-background-body border border-white flex items-center justify-center text-[10px] text-text-secondary z-0 shadow-sm">+${documents.length - 3}</div>` : '');
}

// ============================================================
// DOM Ready
// ============================================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('PE OS Deal Intelligence page initialized');

    // Initialize auth and check if user is logged in
    await PEAuth.initSupabase();
    const auth = await PEAuth.checkAuth();
    if (!auth) return; // Will redirect to login

    // Initialize shared layout with collapsible sidebar
    PELayout.init('deals', { collapsible: true });

    // Load deal data first (sets state.dealId needed by chat)
    await loadDealData();
    initializeFeatures();
});

function initializeFeatures() {
    initChatInterface();
    initFileAttachments();
    initActionButtons();
    initStagePipeline();
    initActivityFeed();
    initCitationButtons();
    initDocumentPreviews();
    initAIResponseActions();
    initContextSettings();
    initBreadcrumbNavigation();
    initShareLink();
}

// ============================================================
// Share Link
// ============================================================
function initShareLink() {
    const shareLinkBtn = document.getElementById('share-link-btn');
    const shareLinkPopup = document.getElementById('share-link-popup');
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');

    if (!shareLinkBtn || !shareLinkPopup) return;

    // Set the current URL as the share link
    if (shareLinkInput) {
        shareLinkInput.value = window.location.href;
    }

    // Position and toggle popup on button click
    shareLinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (!shareLinkPopup.classList.contains('hidden')) {
            shareLinkPopup.classList.add('hidden');
            return;
        }

        // Position popup below the button, aligned to the right
        const btnRect = shareLinkBtn.getBoundingClientRect();
        shareLinkPopup.style.top = (btnRect.bottom + 8) + 'px';
        shareLinkPopup.style.right = (window.innerWidth - btnRect.right) + 'px';
        shareLinkPopup.classList.remove('hidden');
    });

    // Copy link functionality
    if (copyLinkBtn && shareLinkInput) {
        copyLinkBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareLinkInput.value);
                copyLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">check</span> Copied!';
                copyLinkBtn.classList.remove('bg-primary', 'hover:bg-primary-hover');
                copyLinkBtn.classList.add('bg-secondary');
                setTimeout(() => {
                    copyLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">content_copy</span> Copy';
                    copyLinkBtn.classList.add('bg-primary', 'hover:bg-primary-hover');
                    copyLinkBtn.classList.remove('bg-secondary');
                    shareLinkPopup.classList.add('hidden');
                }, 1500);
            } catch (err) {
                // Fallback for older browsers
                shareLinkInput.select();
                shareLinkInput.setSelectionRange(0, 99999);
                navigator.clipboard.writeText(shareLinkInput.value);
            }
        });
    }

    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (!shareLinkPopup.contains(e.target) && !shareLinkBtn.contains(e.target)) {
            shareLinkPopup.classList.add('hidden');
        }
    });
}

// ============================================================
// Stage Pipeline
// ============================================================
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

// ============================================================
// Chat Interface
// ============================================================
function initChatInterface() {
    const textarea = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message-btn');
    const chatContainer = document.getElementById('chat-messages');

    if (!textarea || !sendButton) return;

    // Load chat history from database
    loadChatHistory();

    // Auto-resize textarea
    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 128) + 'px';
    });

    // Send message on Enter (Shift+Enter for new line)
    textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button click
    sendButton.addEventListener('click', sendMessage);

    // Clear chat history button — opens styled confirmation modal
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const clearChatModal = document.getElementById('clear-chat-modal');
    const clearChatCancel = document.getElementById('clear-chat-cancel');
    const clearChatConfirm = document.getElementById('clear-chat-confirm');
    const clearChatBackdrop = document.getElementById('clear-chat-modal-backdrop');

    if (clearChatBtn && clearChatModal) {
        clearChatBtn.addEventListener('click', () => {
            if (!state.dealId) return;
            clearChatModal.classList.remove('hidden');
        });

        const closeClearModal = () => clearChatModal.classList.add('hidden');
        clearChatCancel.addEventListener('click', closeClearModal);
        clearChatBackdrop.addEventListener('click', closeClearModal);

        clearChatConfirm.addEventListener('click', async () => {
            closeClearModal();
            try {
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/chat/history`, { method: 'DELETE' });
                if (response.ok) {
                    state.messages = [];
                    chatContainer.innerHTML = '';
                    // Restore intro message
                    chatContainer.innerHTML = `
                        <div class="ai-intro-message flex gap-4 max-w-[90%]">
                            <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                                <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="text-xs font-bold text-text-muted ml-1">PE OS AI</span>
                                <div class="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                                    <p>I'm ready to help analyze this deal. Ask me about financials, risks, or any uploaded documents.</p>
                                    <p class="mt-2">What would you like to know?</p>
                                </div>
                            </div>
                        </div>`;
                    showNotification('Chat Cleared', 'Conversation history has been cleared', 'success');
                }
            } catch (error) {
                console.error('[Chat] Failed to clear history:', error);
                showNotification('Error', 'Failed to clear chat history', 'error');
            }
        });
    }

    async function sendMessage() {
        const message = textarea.value.trim();
        if (!message) return;

        // Add user message to chat
        addUserMessage(message);
        textarea.value = '';
        textarea.style.height = 'auto';

        // Show typing indicator
        showTypingIndicator();

        // Try real AI API first
        if (state.dealId) {
            try {
                console.log('[Chat] Sending request to API...');
                const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: state.messages.slice(-10).map(m => ({
                            role: m.role,
                            content: m.content,
                        })),
                    }),
                });

                console.log('[Chat] Response status:', response.status, response.ok);

                if (response.ok) {
                    const data = await response.json();
                    console.log('[Chat] AI response received:', data.model, data.action ? '(with action)' : '');
                    removeTypingIndicator();

                    // Pass action to the render function if present
                    addAIResponseFromAPI(data.response, data.action);

                    // Store message in history
                    state.messages.push({ role: 'user', content: message });
                    state.messages.push({ role: 'assistant', content: data.response, action: data.action });

                    // If there were updates, refresh the deal data
                    if (data.updates && data.updates.length > 0) {
                        console.log('[Chat] Deal updates detected:', data.updates);
                        showNotification('Deal Updated', 'Changes have been applied', 'success');
                        // Refresh deal data to show updated values
                        try {
                            await loadDealData();
                            console.log('[Chat] Deal data refreshed successfully');
                        } catch (refreshError) {
                            console.error('[Chat] Failed to refresh deal data:', refreshError);
                        }
                    }
                    return;
                } else {
                    // Log the error response
                    const errorData = await response.json().catch(() => ({}));
                    console.error('[Chat] API error response:', response.status, errorData);
                }
            } catch (error) {
                console.error('[Chat] API request failed:', error);
            }
        }

        // Fall back to mock response if API fails
        console.log('[Chat] Falling back to mock response');
        setTimeout(() => {
            removeTypingIndicator();
            addAIResponse(message);
        }, 1000);
    }
}

// Load chat history from database
async function loadChatHistory() {
    if (!state.dealId) {
        console.log('[Chat] No dealId, skipping chat history load');
        return;
    }

    try {
        console.log('[Chat] Loading chat history for deal:', state.dealId);
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/chat/history`);
        console.log('[Chat] History response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log(`[Chat] Loaded ${data.count} messages from history`, data);

            if (data.messages && data.messages.length > 0) {
                const chatContainer = document.getElementById('chat-messages');

                // Clear the default intro message and any hardcoded content
                chatContainer.querySelectorAll('.ai-intro-message').forEach(el => el.remove());

                // Add conversation history divider
                const headerDiv = document.createElement('div');
                headerDiv.className = 'flex items-center gap-3 py-1';
                headerDiv.innerHTML = `<div class="flex-1 h-px bg-border-subtle"></div><span class="text-[11px] text-text-muted/60 font-medium uppercase tracking-wider">Chat History</span><div class="flex-1 h-px bg-border-subtle"></div>`;
                chatContainer.appendChild(headerDiv);

                // Render each message
                data.messages.forEach(msg => {
                    if (msg.role === 'user') {
                        addUserMessageFromHistory(msg.content);
                    } else if (msg.role === 'assistant') {
                        addAIResponseFromHistory(msg.content);
                    }
                    // Store in local state for context
                    state.messages.push({ role: msg.role, content: msg.content });
                });

                scrollToBottom();
            } else {
                console.log('[Chat] No messages in history');
                // Show intro message when there's no history
                chatContainer.querySelectorAll('.ai-intro-message').forEach(el => el.classList.remove('hidden'));
            }
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Chat] Failed to load history:', response.status, errorData);
            // Show intro on error too
            const chatContainer = document.getElementById('chat-messages');
            chatContainer?.querySelectorAll('.ai-intro-message').forEach(el => el.classList.remove('hidden'));
        }
    } catch (error) {
        console.error('[Chat] Failed to load chat history:', error);
        // Show intro on error
        const chatContainer = document.getElementById('chat-messages');
        chatContainer?.querySelectorAll('.ai-intro-message').forEach(el => el.classList.remove('hidden'));
    }
}

// Add user message from history (no animation)
function addUserMessageFromHistory(content) {
    const chatContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[80%] self-end flex-row-reverse';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-full bg-border-subtle border border-white shrink-0 overflow-hidden shadow-sm">
            <img alt="User" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDztZZcBzY1SDBiF6rrZUV2Uq3M3sq3RNYyna4KXazODqpygVamoT478nqKsofGUiklF7LO4vfeblawPKJND10QK_mGWph7pQy_KzS-ARWQcZhjgKy925pPcsmKqIfnvj0-wNcUIwMIkWVQBCow5BMpnm3C0q_hFoQSgJ5r5aNZit5hjEU9gA0GFz7UQvGfnIwMVEl_mnRGag2umDcEHXDI8dLtE0WeR46Q64G6mwDZu99lbfgscGOi36kf77BFEZOeFx1nCs8uuGk"/>
        </div>
        <div class="flex flex-col gap-1 items-end">
            <span class="text-xs font-bold text-text-muted mr-1">You</span>
            <div class="bg-white text-text-main border border-border-subtle rounded-2xl rounded-tr-none p-4 text-sm shadow-sm">
                <p>${escapeHtml(content)}</p>
            </div>
        </div>
    `;
    chatContainer.appendChild(messageDiv);
}

// Add AI response from history (no animation)
function addAIResponseFromHistory(content) {
    const chatContainer = document.getElementById('chat-messages');
    const formattedResponse = parseMarkdown(content);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[90%]';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-xs font-bold text-text-muted ml-1">PE OS AI <span class="text-primary/60 font-normal">• GPT-4</span></span>
            <div class="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                ${formattedResponse}
            </div>
        </div>
    `;
    chatContainer.appendChild(messageDiv);
}

function addUserMessage(message) {
    const chatContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[80%] self-end flex-row-reverse animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-full bg-border-subtle border border-white shrink-0 overflow-hidden shadow-sm">
            <img alt="User" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDztZZcBzY1SDBiF6rrZUV2Uq3M3sq3RNYyna4KXazODqpygVamoT478nqKsofGUiklF7LO4vfeblawPKJND10QK_mGWph7pQy_KzS-ARWQcZhjgKy925pPcsmKqIfnvj0-wNcUIwMIkWVQBCow5BMpnm3C0q_hFoQSgJ5r5aNZit5hjEU9gA0GFz7UQvGfnIwMVEl_mnRGag2umDcEHXDI8dLtE0WeR46Q64G6mwDZu99lbfgscGOi36kf77BFEZOeFx1nCs8uuGk"/>
        </div>
        <div class="flex flex-col gap-1 items-end">
            <span class="text-xs font-bold text-text-muted mr-1">You</span>
            <div class="bg-white text-text-main border border-border-subtle rounded-2xl rounded-tr-none p-4 text-sm shadow-sm">
                <p>${escapeHtml(message)}</p>
            </div>
        </div>
    `;

    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const chatContainer = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'flex gap-4 max-w-[90%] animate-fadeIn';
    typingDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1 justify-center">
            <div class="bg-white border border-border-subtle rounded-2xl rounded-tl-none px-4 py-3 text-sm text-text-secondary shadow-sm w-16">
                <div class="flex gap-1">
                    <div class="size-1.5 bg-text-muted rounded-full animate-bounce"></div>
                    <div class="size-1.5 bg-text-muted rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
                    <div class="size-1.5 bg-text-muted rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
                </div>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

function addSystemMessage(message, icon = 'info') {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-center my-3 animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="flex items-center gap-2 bg-slate-100 text-slate-600 rounded-full px-4 py-2 text-xs">
            <span class="material-symbols-outlined text-sm">${icon}</span>
            ${message}
        </div>
    `;
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addAIResponseFromAPI(responseText, action = null) {
    const chatContainer = document.getElementById('chat-messages');

    // Format the response with markdown parsing
    const formattedResponse = responseText.startsWith('<')
        ? responseText
        : parseMarkdown(responseText);

    // Build action button HTML if action is present
    let actionButtonHtml = '';
    if (action && action.url && action.label) {
        const iconMap = {
            'create_memo': 'edit_note',
            'open_data_room': 'folder_open',
            'upload_document': 'upload_file',
            'view_financials': 'analytics',
            'change_stage': 'swap_horiz',
        };
        const icon = iconMap[action.type] || 'arrow_forward';

        actionButtonHtml = `
            <div class="mt-3 pt-3 border-t border-border-subtle/50">
                <a href="${action.url}" class="ai-action-btn inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-hover text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all group">
                    <span class="material-symbols-outlined text-lg">${icon}</span>
                    ${escapeHtml(action.label)}
                    <span class="material-symbols-outlined text-lg group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                </a>
                ${action.description ? `<p class="text-xs text-text-muted mt-1.5 ml-1">${escapeHtml(action.description)}</p>` : ''}
            </div>
        `;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[90%] animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-xs font-bold text-text-muted ml-1">PE OS AI <span class="text-primary/60 font-normal">• GPT-4</span></span>
            <div class="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                ${formattedResponse}
                ${actionButtonHtml}
            </div>
            <div class="flex gap-2 ml-1 mt-1">
                <button class="ai-helpful-btn text-[10px] text-text-muted hover:text-primary flex items-center gap-1 transition-colors font-medium">
                    <span class="material-symbols-outlined text-sm">thumb_up</span> Helpful
                </button>
                <button class="ai-copy-btn text-[10px] text-text-muted hover:text-primary flex items-center gap-1 transition-colors font-medium">
                    <span class="material-symbols-outlined text-sm">content_copy</span> Copy
                </button>
            </div>
        </div>
    `;

    chatContainer.appendChild(messageDiv);

    // Add event listeners to new buttons
    messageDiv.querySelector('.ai-helpful-btn').addEventListener('click', function () {
        this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
        this.classList.add('text-primary');
        showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
    });

    messageDiv.querySelector('.ai-copy-btn').addEventListener('click', function () {
        const text = messageDiv.querySelector('.ai-bubble-gradient').innerText;
        navigator.clipboard.writeText(text);
        this.innerHTML = '<span class="material-symbols-outlined text-sm">check</span> Copied';
        this.classList.add('text-primary');
        setTimeout(() => {
            this.innerHTML = '<span class="material-symbols-outlined text-sm">content_copy</span> Copy';
            this.classList.remove('text-primary');
        }, 2000);
    });

    scrollToBottom();
}

function addAIResponse(userMessage) {
    const chatContainer = document.getElementById('chat-messages');

    // Generate contextual response (fallback mock)
    const responses = generateAIResponse(userMessage);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[90%] animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-xs font-bold text-text-muted ml-1">PE OS AI</span>
            <div class="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                ${responses}
            </div>
            <div class="flex gap-2 ml-1 mt-1">
                <button class="ai-helpful-btn text-[10px] text-text-muted hover:text-primary flex items-center gap-1 transition-colors font-medium">
                    <span class="material-symbols-outlined text-sm">thumb_up</span> Helpful
                </button>
                <button class="ai-copy-btn text-[10px] text-text-muted hover:text-primary flex items-center gap-1 transition-colors font-medium">
                    <span class="material-symbols-outlined text-sm">content_copy</span> Copy
                </button>
            </div>
        </div>
    `;

    chatContainer.appendChild(messageDiv);

    // Add event listeners to new buttons
    messageDiv.querySelector('.ai-helpful-btn').addEventListener('click', function () {
        this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
        this.classList.add('text-primary');
        showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
    });

    messageDiv.querySelector('.ai-copy-btn').addEventListener('click', function () {
        const text = messageDiv.querySelector('.ai-bubble-gradient').innerText;
        navigator.clipboard.writeText(text);
        this.innerHTML = '<span class="material-symbols-outlined text-sm">check</span> Copied';
        this.classList.add('text-primary');
        setTimeout(() => {
            this.innerHTML = '<span class="material-symbols-outlined text-sm">content_copy</span> Copy';
            this.classList.remove('text-primary');
        }, 2000);
    });

    scrollToBottom();
}

function generateAIResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    const deal = state.dealData;
    const dealName = deal?.name || 'this deal';
    const revenue = deal?.revenue ? formatCurrency(deal.revenue) : '$120M';
    const ebitda = deal?.ebitda ? formatCurrency(deal.ebitda) : '$26M';
    const dealSize = deal?.dealSize ? formatCurrency(deal.dealSize) : '$450M';
    const irr = deal?.irrProjected ? deal.irrProjected.toFixed(1) + '%' : '24%';
    const mom = deal?.mom ? deal.mom.toFixed(1) + 'x' : '3.5x';
    const stage = deal?.stage ? getStageLabel(deal.stage) : 'Due Diligence';
    const industry = deal?.industry || 'Technology';
    const thesis = deal?.aiThesis || 'Strong fundamentals with growth potential.';

    // Keyword-based responses with real data
    if (lowerMessage.includes('risk') || lowerMessage.includes('concern')) {
        return `
            <p class="leading-relaxed">Based on the analysis of <strong>${dealName}</strong>, here are the key risk factors:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-amber-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Key Risk Factors:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Market Position:</strong> Competitive pressure in ${industry} sector</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Valuation:</strong> ${dealSize} ask price requires validation</span>
                    </li>
                </ul>
            </div>
            <p>The projected IRR of <strong>${irr}</strong> and MoM of <strong>${mom}</strong> suggest ${deal?.irrProjected > 20 ? 'attractive returns if risks are mitigated' : 'moderate return potential'}.</p>
        `;
    } else if (lowerMessage.includes('valuation') || lowerMessage.includes('price') || lowerMessage.includes('multiple')) {
        const evEbitda = deal?.dealSize && deal?.ebitda ? (deal.dealSize / deal.ebitda).toFixed(1) : '17';
        const revMultiple = deal?.dealSize && deal?.revenue ? (deal.dealSize / deal.revenue).toFixed(2) : '3.75';
        return `
            <p class="leading-relaxed">Valuation analysis for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Valuation Metrics:</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Deal Size</div>
                        <div class="font-bold text-primary">${dealSize}</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">EV/EBITDA</div>
                        <div class="font-bold text-slate-900">~${evEbitda}x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Revenue Multiple</div>
                        <div class="font-bold text-slate-900">${revMultiple}x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Projected IRR</div>
                        <div class="font-bold text-slate-900">${irr}</div>
                    </div>
                </div>
            </div>
            <p>Based on the ${industry} sector, this valuation ${parseFloat(evEbitda) > 15 ? 'represents a premium' : 'appears reasonable'}.</p>
        `;
    } else if (lowerMessage.includes('revenue') || lowerMessage.includes('growth') || lowerMessage.includes('financial')) {
        const ebitdaMargin = deal?.revenue && deal?.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) : '22';
        return `
            <p class="leading-relaxed">Financial overview for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Financial Metrics:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>Revenue: <strong>${revenue}</strong></span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>EBITDA: <strong>${ebitda}</strong> (${ebitdaMargin}% margin)</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>MoM Multiple: <strong>${mom}</strong></span>
                    </li>
                </ul>
            </div>
            <p>The company operates in the <strong>${industry}</strong> sector with ${deal?.ebitda > 0 ? 'positive profitability' : 'growth-stage economics'}.</p>
        `;
    } else if (lowerMessage.includes('thesis') || lowerMessage.includes('summary') || lowerMessage.includes('overview')) {
        return `
            <p class="leading-relaxed">Investment thesis for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-purple-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">AI-Generated Thesis:</p>
                <p class="text-slate-600">${thesis}</p>
            </div>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Quick Facts:</p>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-slate-500">Stage:</span> <strong>${stage}</strong></div>
                    <div><span class="text-slate-500">Industry:</span> <strong>${industry}</strong></div>
                    <div><span class="text-slate-500">Deal Size:</span> <strong>${dealSize}</strong></div>
                    <div><span class="text-slate-500">IRR:</span> <strong>${irr}</strong></div>
                </div>
            </div>
        `;
    } else {
        // Generic helpful response with real data
        return `
            <p class="leading-relaxed">Here's what I know about <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Deal Overview:</p>
                <ul class="space-y-2 text-slate-600 text-sm">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Stage:</strong> ${stage} | <strong>Industry:</strong> ${industry}</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Financials:</strong> ${revenue} revenue, ${ebitda} EBITDA</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Returns:</strong> ${irr} projected IRR, ${mom} MoM</span>
                    </li>
                </ul>
            </div>
            <p>Try asking about <em>risks, valuation, financials, or thesis</em> for more details.</p>
        `;
    }
}

function scrollToBottom() {
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// File Attachments
// ============================================================
function initFileAttachments() {
    const attachButton = document.getElementById('attach-file-btn');
    if (!attachButton) return;

    attachButton.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.xlsx,.xls,.csv,.doc,.docx';

        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                uploadFile(file);
            });
        });

        input.click();
    });

    // Remove file buttons
    document.querySelectorAll('.flex.items-center.gap-2.bg-slate-50 button').forEach(btn => {
        btn.addEventListener('click', function () {
            const fileChip = this.closest('.flex.items-center.gap-2');
            fileChip.style.transition = 'opacity 0.3s';
            fileChip.style.opacity = '0';
            setTimeout(() => fileChip.remove(), 300);
            showNotification('File Removed', 'Document removed from context', 'info');
        });
    });
}

async function uploadFile(file) {
    const container = document.getElementById('attached-files');
    const dealId = state.dealId;

    if (!dealId) {
        showNotification('Error', 'No deal selected', 'error');
        return;
    }

    // Create uploading indicator
    const uploadChip = document.createElement('div');
    uploadChip.className = 'flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 text-xs text-blue-600 animate-pulse';
    uploadChip.innerHTML = `
        <span class="material-symbols-outlined text-sm animate-spin">sync</span>
        Uploading ${file.name}...
    `;
    container.appendChild(uploadChip);

    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name);

        // Upload to deal documents API
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/documents`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
        }

        const uploadedDoc = await response.json();

        // Update chip to show success
        uploadChip.classList.remove('animate-pulse', 'bg-blue-50', 'text-blue-600', 'border-blue-100');
        uploadChip.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');

        const fileIcon = file.name.endsWith('.pdf') ? 'picture_as_pdf' :
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'table_chart' :
                file.name.endsWith('.csv') ? 'table_view' : 'description';
        const iconColor = file.name.endsWith('.pdf') ? 'red' :
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'emerald' : 'blue';

        uploadChip.innerHTML = `
            <span class="material-symbols-outlined text-${iconColor}-500 text-sm">${fileIcon}</span>
            ${file.name}
            <span class="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
        `;

        // Add to state's attached files
        state.attachedFiles.push({
            id: uploadedDoc.id,
            name: uploadedDoc.name,
            type: uploadedDoc.type
        });

        showNotification('Document Uploaded', `${file.name} uploaded and being processed for AI context`, 'success');

        // Show system message in chat
        addSystemMessage(`📄 ${file.name} uploaded. You can now ask questions about this document.`, 'attach_file');

        // Refresh the documents section after a brief delay (for embedding to complete)
        setTimeout(() => {
            loadDealData();
        }, 3000);

    } catch (error) {
        console.error('Upload error:', error);

        // Show error state
        uploadChip.classList.remove('animate-pulse', 'bg-blue-50', 'text-blue-600', 'border-blue-100');
        uploadChip.classList.add('bg-red-50', 'text-red-600', 'border-red-200');
        uploadChip.innerHTML = `
            <span class="material-symbols-outlined text-red-500 text-sm">error</span>
            Failed: ${file.name}
            <button class="hover:text-red-700 ml-1 transition-colors"><span class="material-symbols-outlined text-sm">close</span></button>
        `;

        uploadChip.querySelector('button').addEventListener('click', function () {
            uploadChip.style.transition = 'opacity 0.3s';
            uploadChip.style.opacity = '0';
            setTimeout(() => uploadChip.remove(), 300);
        });

        showNotification('Upload Failed', error.message || 'Could not upload file', 'error');
    }
}

// ============================================================
// Action Buttons
// ============================================================
function initActionButtons() {
    // Share button
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', showShareModal);
    }

    // Edit Deal button
    const editBtn = document.getElementById('edit-deal-btn');
    if (editBtn) {
        editBtn.addEventListener('click', showEditDealModal);
    }
}

async function showShareModal() {
    const deal = state.dealData;
    const teamMembers = deal?.teamMembers || [];

    // Fetch available users for invite
    let availableUsers = [];
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/users`);
        if (response.ok) {
            availableUsers = await response.json();
            // Filter out users already on the team
            const teamUserIds = new Set(teamMembers.map(m => m.user?.id));
            availableUsers = availableUsers.filter(u => !teamUserIds.has(u.id));
        }
    } catch (error) {
        console.error('Error fetching users:', error);
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.id = 'team-modal';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full animate-fadeIn max-h-[90vh] overflow-hidden flex flex-col">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">group</span>
                        Deal Team
                    </h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
                <!-- Current Team Members -->
                <div class="mb-6">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Current Team (${teamMembers.length})</h4>
                    <div id="team-list" class="space-y-2">
                        ${teamMembers.length === 0 ? `
                            <p class="text-sm text-slate-500 italic">No team members yet</p>
                        ` : teamMembers.map(member => `
                            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                                <div class="flex items-center gap-3">
                                    <div class="size-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                                        ${(member.user?.name || 'U').charAt(0)}
                                    </div>
                                    <div>
                                        <p class="text-sm font-medium text-slate-900">${member.user?.name || 'Unknown'}</p>
                                        <p class="text-xs text-slate-500">${member.user?.email || ''}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-0.5 rounded text-xs font-medium ${member.role === 'LEAD' ? 'bg-primary-light text-primary' : 'bg-slate-200 text-slate-600'}">${member.role}</span>
                                    <button onclick="removeTeamMember('${member.id}')" class="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                        <span class="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Add New Member -->
                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Add Team Member</h4>
                    <div class="flex gap-2">
                        <div class="flex-1 relative">
                            <select id="user-select" class="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                                <option value="">Select a user...</option>
                                ${availableUsers.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
                            </select>
                        </div>
                        <select id="role-select" class="px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            <option value="MEMBER">Member</option>
                            <option value="LEAD">Lead</option>
                            <option value="VIEWER">Viewer</option>
                        </select>
                    </div>
                    <button id="add-member-btn" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors">
                        <span class="material-symbols-outlined text-lg">person_add</span>
                        Add to Team
                    </button>
                </div>

                <!-- Share Link -->
                <div class="pt-4 border-t border-slate-200">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Share Link</h4>
                    <div class="flex gap-2">
                        <input type="text" id="share-link" value="${window.location.href}" class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50" readonly>
                        <button onclick="copyShareLink()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                            Copy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add member button handler
    document.getElementById('add-member-btn')?.addEventListener('click', async () => {
        await addTeamMember();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function addTeamMember() {
    if (!state.dealId) return;

    const userSelect = document.getElementById('user-select');
    const roleSelect = document.getElementById('role-select');
    const userId = userSelect.value;
    const role = roleSelect.value;

    if (!userId) {
        showNotification('Error', 'Please select a user to add', 'error');
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add team member');
        }

        const newMember = await response.json();

        // Update local state
        if (state.dealData) {
            state.dealData.teamMembers = [...(state.dealData.teamMembers || []), newMember];
        }

        // Close and reopen modal to refresh
        document.getElementById('team-modal')?.remove();
        showShareModal();

        showNotification('Team Updated', `${newMember.user?.name || 'User'} added to the team`, 'success');

    } catch (error) {
        console.error('Error adding team member:', error);
        showNotification('Error', error.message, 'error');
    }
}

async function removeTeamMember(memberId) {
    if (!state.dealId || !memberId) return;

    if (!confirm('Are you sure you want to remove this team member?')) {
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/team/${memberId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to remove team member');
        }

        // Update local state
        if (state.dealData) {
            state.dealData.teamMembers = (state.dealData.teamMembers || []).filter(m => m.id !== memberId);
        }

        // Close and reopen modal to refresh
        document.getElementById('team-modal')?.remove();
        showShareModal();

        showNotification('Team Updated', 'Team member removed', 'success');

    } catch (error) {
        console.error('Error removing team member:', error);
        showNotification('Error', 'Failed to remove team member', 'error');
    }
}

// Convert a value stored in millions to its most natural {value, unit} for editing
function millionsToNatural(valueInMillions) {
    if (valueInMillions == null) return { value: '', unit: '$' };
    const abs = Math.abs(valueInMillions);
    if (abs >= 1000) return { value: (valueInMillions / 1000), unit: 'B' };
    if (abs >= 1) return { value: valueInMillions, unit: 'M' };
    if (abs >= 0.001) return { value: (valueInMillions * 1000), unit: 'K' };
    return { value: (valueInMillions * 1000000), unit: '$' };
}

// Convert a user-entered value + unit back to millions for storage
function naturalToMillions(value, unit) {
    if (value === '' || value == null || isNaN(parseFloat(value))) return null;
    const num = parseFloat(value);
    switch (unit) {
        case 'B': return num * 1000;
        case 'M': return num;
        case 'K': return num / 1000;
        case '$': return num / 1000000;
        default: return num;
    }
}

// Build a currency input with value + unit selector
function buildCurrencyInput(id, label, valueInMillions, placeholder) {
    const natural = millionsToNatural(valueInMillions);
    const displayVal = natural.value !== '' ? (typeof natural.value === 'number' ? parseFloat(natural.value.toPrecision(10)) : natural.value) : '';
    return `
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">${label}</label>
            <div class="flex gap-1.5">
                <select id="${id}-unit" class="px-2 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm bg-slate-50 font-medium text-slate-600 shrink-0" style="width: 60px">
                    <option value="$" ${natural.unit === '$' ? 'selected' : ''}>$</option>
                    <option value="K" ${natural.unit === 'K' ? 'selected' : ''}>$K</option>
                    <option value="M" ${natural.unit === 'M' ? 'selected' : ''}>$M</option>
                    <option value="B" ${natural.unit === 'B' ? 'selected' : ''}>$B</option>
                </select>
                <input type="number" id="${id}" value="${displayVal}" step="any" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="${placeholder}">
            </div>
            <p class="text-[10px] text-slate-400 mt-1">${displayVal !== '' ? 'Currently: ' + formatCurrency(valueInMillions) : 'No value set'}</p>
        </div>
    `;
}

function showEditDealModal() {
    const deal = state.dealData || {};

    // Build stage options
    const allStages = [...DEAL_STAGES, ...TERMINAL_STAGES];
    const stageOptions = allStages.map(s =>
        `<option value="${s.key}" ${deal.stage === s.key ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.id = 'edit-deal-modal';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8 animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg">Edit Deal Details</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Deal Name</label>
                        <input type="text" id="edit-deal-name" value="${deal.name || ''}" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Stage</label>
                        <select id="edit-deal-stage" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            ${stageOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Industry</label>
                        <input type="text" id="edit-deal-industry" value="${deal.industry || ''}" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    ${buildCurrencyInput('edit-deal-revenue', 'Revenue', deal.revenue, 'e.g., 1800')}
                    ${buildCurrencyInput('edit-deal-ebitda', 'EBITDA', deal.ebitda, 'e.g., 500')}
                    ${buildCurrencyInput('edit-deal-size', 'Deal Size', deal.dealSize, 'e.g., 6000')}
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Projected IRR (%)</label>
                        <input type="number" id="edit-deal-irr" value="${deal.irrProjected || ''}" step="0.1" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="e.g., 24">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">MoM Multiple</label>
                        <input type="number" id="edit-deal-mom" value="${deal.mom || ''}" step="0.1" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="e.g., 3.5">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                        <textarea id="edit-deal-description" rows="2" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="Brief description of the deal...">${deal.description || ''}</textarea>
                    </div>
                </div>
            </div>
            <div class="p-6 border-t border-slate-200 flex gap-3">
                <button id="save-deal-btn" class="flex-1 bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">save</span>
                    Save Changes
                </button>
                <button onclick="this.closest('.fixed').remove()" class="px-6 py-2.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add save handler
    document.getElementById('save-deal-btn').addEventListener('click', async () => {
        await saveDealChangesFromModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function saveDealChangesFromModal() {
    if (!state.dealId) {
        showNotification('Error', 'No deal loaded', 'error');
        return;
    }

    const oldStage = state.dealData?.stage;
    const newStage = document.getElementById('edit-deal-stage').value;

    const irrVal = document.getElementById('edit-deal-irr').value;
    const momVal = document.getElementById('edit-deal-mom').value;

    const updateData = {
        name: document.getElementById('edit-deal-name').value,
        stage: newStage,
        industry: document.getElementById('edit-deal-industry').value || null,
        revenue: naturalToMillions(document.getElementById('edit-deal-revenue').value, document.getElementById('edit-deal-revenue-unit').value),
        ebitda: naturalToMillions(document.getElementById('edit-deal-ebitda').value, document.getElementById('edit-deal-ebitda-unit').value),
        dealSize: naturalToMillions(document.getElementById('edit-deal-size').value, document.getElementById('edit-deal-size-unit').value),
        irrProjected: irrVal !== '' ? parseFloat(irrVal) : null,
        mom: momVal !== '' ? parseFloat(momVal) : null,
        description: document.getElementById('edit-deal-description').value || null,
    };

    // Strip undefined/NaN values
    Object.keys(updateData).forEach(k => {
        if (updateData[k] !== null && typeof updateData[k] === 'number' && isNaN(updateData[k])) {
            updateData[k] = null;
        }
    });

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
        });

        // Read actual error from API
        if (!response.ok) {
            let errMsg = 'Failed to update deal';
            try {
                const errData = await response.json();
                errMsg = errData.error || errData.message || errMsg;
                if (errData.details) {
                    errMsg += ': ' + JSON.stringify(errData.details);
                }
            } catch { }
            throw new Error(errMsg);
        }

        const updatedDeal = await response.json();
        state.dealData = updatedDeal;

        // Update page with new data
        populateDealPage(updatedDeal);

        // Close modal
        document.getElementById('edit-deal-modal')?.remove();

        // Show success notification
        if (oldStage !== newStage) {
            showNotification(
                'Deal Updated',
                `Deal updated and stage changed to ${getStageLabel(newStage)}`,
                'success'
            );
        } else {
            showNotification('Deal Updated', 'Deal details have been saved', 'success');
        }

    } catch (error) {
        console.error('Error saving deal:', error);
        showNotification('Error', error.message || 'Failed to save deal changes', 'error');
    }
}

// ============================================================
// Citation Buttons
// ============================================================
function initCitationButtons() {
    document.addEventListener('click', function (e) {
        const citationBtn = e.target.closest('.citation-btn, button[class*="Page"], button[class*="Section"]');
        if (citationBtn) {
            showDocumentReference(citationBtn);
        }
    });
}

function showDocumentReference(button) {
    const docType = button.getAttribute('data-doc') || 'document';
    const reference = button.textContent.trim();

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden animate-fadeIn">
            <div class="p-6 border-b border-slate-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">description</span>
                    <div>
                        <h3 class="font-bold text-slate-900">Document Reference</h3>
                        <p class="text-sm text-slate-600">${reference}</p>
                    </div>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                <div class="bg-slate-50 rounded-lg p-6 border border-slate-200">
                    <div class="bg-amber-50 border-l-4 border-amber-500 p-4 rounded mb-4">
                        <p class="text-sm text-amber-800 font-medium">Referenced Section: ${reference}</p>
                    </div>
                    <div class="prose prose-sm max-w-none">
                        <h4 class="font-bold text-slate-900 mb-3">Customer Concentration Analysis</h4>
                        <p class="text-slate-700 mb-3">
                            The company's revenue base shows moderate concentration risk. The top three customers
                            account for approximately <strong>45%</strong> of total recurring revenue as of Q3 2023.
                        </p>
                        <div class="bg-white rounded p-4 border border-slate-200 my-4">
                            <table class="w-full text-sm">
                                <thead class="border-b border-slate-200">
                                    <tr>
                                        <th class="text-left py-2">Customer</th>
                                        <th class="text-right py-2">% of Revenue</th>
                                        <th class="text-right py-2">Contract End</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b border-slate-100">
                                        <td class="py-2">GlobalShip Inc.</td>
                                        <td class="text-right">18%</td>
                                        <td class="text-right">Q2 2025</td>
                                    </tr>
                                    <tr class="border-b border-slate-100">
                                        <td class="py-2">FreightMax Corp</td>
                                        <td class="text-right">15%</td>
                                        <td class="text-right">Q4 2024</td>
                                    </tr>
                                    <tr>
                                        <td class="py-2">LogiPro Systems</td>
                                        <td class="text-right">12%</td>
                                        <td class="text-right">Q1 2025</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p class="text-slate-700 mb-3">
                            Management has indicated that all three key accounts have multi-year contracts with
                            auto-renewal clauses. Historical retention for enterprise customers exceeds 98%,
                            mitigating immediate churn risk.
                        </p>
                        <p class="text-slate-600 text-sm italic">
                            Source: Management Presentation v2, Page 14 | Q3 Financial Model, Tab "Customer Segmentation"
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// Document Previews
// ============================================================
function initDocumentPreviews() {
    document.querySelectorAll('.flex.items-center.gap-3.p-2').forEach(doc => {
        if (doc.classList.contains('cursor-pointer')) {
            doc.addEventListener('click', function () {
                const docName = this.querySelector('.text-sm.font-bold').textContent;
                showDocumentPreview(docName);
            });
        }
    });
}

function showDocumentPreview(docName) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden animate-fadeIn">
            <div class="p-6 border-b border-slate-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">${docName.endsWith('.pdf') ? 'picture_as_pdf' : 'table_view'}</span>
                    <div>
                        <h3 class="font-bold text-slate-900">${docName}</h3>
                        <p class="text-sm text-slate-600">Document Preview</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="downloadDocument('${docName}')" class="px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-[18px]">download</span>
                        Download
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)] bg-slate-50">
                <div class="bg-white rounded-lg shadow-inner p-8 max-w-4xl mx-auto">
                    <div class="prose prose-sm max-w-none">
                        <h2 class="text-2xl font-bold text-slate-900 mb-4">Q3 2023 Financial Summary</h2>
                        <p class="text-slate-600 mb-6"><em>Project Apex Logistics - Confidential</em></p>

                        <h3 class="text-lg font-bold text-slate-900 mt-6 mb-3">Revenue Performance</h3>
                        <p class="text-slate-700">
                            Q3 2023 revenue reached $32.5M, representing a 15% year-over-year increase.
                            The growth was primarily driven by enterprise customer expansion and new logo acquisition.
                        </p>

                        <div class="bg-slate-50 rounded p-4 my-4 border border-slate-200">
                            <p class="font-semibold text-slate-900 mb-2">Key Metrics:</p>
                            <ul class="space-y-1 text-sm text-slate-700">
                                <li>• LTM Revenue: $120M (+15% YoY)</li>
                                <li>• ARR: $115M (+18% YoY)</li>
                                <li>• EBITDA Margin: 22% (flat vs. Q2)</li>
                                <li>• Net Dollar Retention: 112%</li>
                            </ul>
                        </div>

                        <p class="text-slate-700 mt-4">
                            Customer retention remains strong at 94%, with enterprise segment showing 98% retention.
                            The slight decline in overall retention is attributed to planned migration of legacy SMB customers.
                        </p>

                        <p class="text-xs text-slate-500 mt-8 italic">
                            This is a preview. Download the full document for complete analysis.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// AI Response Actions
// ============================================================
function initAIResponseActions() {
    document.querySelectorAll('.ai-helpful-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
            this.classList.add('text-primary');
            showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
        });
    });

    document.querySelectorAll('.ai-copy-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const bubble = this.closest('.flex.flex-col').querySelector('.ai-bubble-gradient');
            const text = bubble.innerText;
            navigator.clipboard.writeText(text);
            this.innerHTML = '<span class="material-symbols-outlined text-sm">check</span> Copied';
            this.classList.add('text-primary');
            setTimeout(() => {
                this.innerHTML = '<span class="material-symbols-outlined text-sm">content_copy</span> Copy';
                this.classList.remove('text-primary');
            }, 2000);
        });
    });
}

// ============================================================
// Context Settings
// ============================================================
function initContextSettings() {
    const settingsBtn = document.getElementById('ai-settings-btn');
    if (!settingsBtn) return;

    settingsBtn.addEventListener('click', showContextSettings);
}

function showContextSettings() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg">AI Context Settings</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">AI Model</label>
                        <select class="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm">
                            <option selected>GPT-4 Turbo (Recommended)</option>
                            <option>GPT-4</option>
                            <option>Claude 3 Opus</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Response Style</label>
                        <select class="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm">
                            <option selected>Detailed Analysis</option>
                            <option>Concise Summaries</option>
                            <option>Executive Briefing</option>
                        </select>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked class="rounded border-slate-300 text-primary">
                            <span class="text-sm text-slate-700">Include citations</span>
                        </label>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked class="rounded border-slate-300 text-primary">
                            <span class="text-sm text-slate-700">Auto-analyze new documents</span>
                        </label>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="rounded border-slate-300 text-primary">
                            <span class="text-sm text-slate-700">Enable voice input</span>
                        </label>
                    </div>
                </div>
                <button onclick="this.closest('.fixed').remove(); showNotification('Settings Saved', 'AI context settings updated', 'success');" class="w-full mt-6 bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors">
                    Save Settings
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// Breadcrumb Navigation
// ============================================================
function initBreadcrumbNavigation() {
    const breadcrumbs = document.querySelectorAll('nav a[href="#"]');
    breadcrumbs.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const text = link.textContent.trim();
            if (text === 'Portfolio') {
                window.location.href = 'dashboard.html';
            } else if (text === 'Technology') {
                showNotification('Navigation', `Navigating to ${text} category...`, 'info');
            }
        });
    });
}

// ============================================================
// Utility Functions
// ============================================================
function showNotification(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-6 bg-white border border-slate-200 rounded-lg shadow-2xl p-4 z-50 min-w-[320px] animate-slideIn';

    const icons = {
        info: 'info',
        success: 'check_circle',
        warning: 'warning',
        error: 'error'
    };

    const colors = {
        info: 'text-blue-600 bg-blue-50',
        success: 'text-emerald-600 bg-emerald-50',
        warning: 'text-orange-600 bg-orange-50',
        error: 'text-red-600 bg-red-50'
    };

    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="p-2 ${colors[type]} rounded-lg">
                <span class="material-symbols-outlined text-[20px]">${icons[type]}</span>
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-slate-900 text-sm">${title}</h4>
                <p class="text-xs text-slate-600 mt-0.5">${message}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function copyShareLink() {
    navigator.clipboard.writeText('https://dealos.app/deals/apex-logistics-2023');
    showNotification('Link Copied', 'Share link copied to clipboard', 'success');
}

function shareWithTeam() {
    showNotification('Deal Shared', 'Team members have been notified', 'success');
}

function saveDealChanges() {
    // Legacy function - now handled by saveDealChangesFromModal
    saveDealChangesFromModal();
}

function downloadDocument(docName) {
    showNotification('Download Started', `Downloading ${docName}...`, 'info');
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .animate-slideIn {
        animation: slideIn 0.3s ease-out;
    }
`;
document.head.appendChild(style);

console.log('PE OS Deal Intelligence page fully initialized');
