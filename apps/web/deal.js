// Deal Intelligence & Chat Terminal Interactive Features
// PE OS - AI-Powered Deal Analysis
// API_BASE_URL, showNotification, formatters loaded from js/config.js, js/notifications.js, js/formatters.js
//
// Extracted modules (loaded before this file):
//   deal-activity.js  — activity feed
//   deal-chat.js      — chat interface
//   deal-stages.js    — stage pipeline, constants, modals, key risks, deal progress
//   deal-team.js      — team avatars, share modal, add/remove members
//   deal-documents.js — document list, file uploads, previews, citations
//   deal-edit.js      — edit deal modal, currency helpers, action buttons, AI settings, breadcrumbs

// ============================================================
// State Management
// ============================================================
const state = {
    messages: [],
    attachedFiles: [],
    uploadingFiles: [],
    dealData: null,
    dealId: null,
    contextDocuments: [],
    financials: {},
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

    // Headings: ### text, ## text, # text
    html = html.replace(/^#{3}\s+(.+)$/gm, '<h4 class="font-bold text-text-main text-sm mt-3 mb-1">$1</h4>');
    html = html.replace(/^#{2}\s+(.+)$/gm, '<h3 class="font-bold text-text-main text-base mt-3 mb-1">$1</h3>');
    html = html.replace(/^#{1}\s+(.+)$/gm, '<h3 class="font-bold text-text-main text-base mt-3 mb-1">$1</h3>');

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

        // Load financial statements (non-blocking)
        if (typeof loadFinancials === 'function') {
            loadFinancials(dealId);
        }

        // Load AI financial analysis (non-blocking)
        if (typeof loadAnalysis === 'function') {
            loadAnalysis(dealId);
        }
    } catch (error) {
        console.error('Error loading deal:', error);
        showNotification('Error', 'Failed to load deal data', 'error');
    }
}

// ============================================================
// Populate Deal Page
// ============================================================
function populateDealPage(deal) {
    // Update page title
    document.title = `${deal.name} - PE OS Deal Intelligence`;

    // Render stage pipeline
    renderStagePipeline(deal.stage);

    // Update breadcrumb
    const breadcrumbDeal = document.getElementById('breadcrumb-deal');
    if (breadcrumbDeal) breadcrumbDeal.textContent = deal.name || 'Untitled Deal';

    // Update deal header
    const dealTitle = document.getElementById('deal-title');
    if (dealTitle) dealTitle.textContent = deal.name;

    // Update icon
    const iconContainer = document.getElementById('deal-icon');
    if (iconContainer && deal.icon) iconContainer.textContent = deal.icon;

    // Dynamic financial metrics — only show cards with data, prioritized by relevance
    renderDynamicMetrics(deal);

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
    const leadPartnerDot = document.querySelector('#lead-partner-container .rounded-full');
    if (leadPartnerName) {
        const leadName = leadPartner?.user?.name || deal.assignedUser?.name || null;
        leadPartnerName.textContent = leadName || 'Not assigned';
        leadPartnerName.className = leadName ? 'text-sm text-text-main font-bold' : 'text-sm text-text-muted font-medium italic';
        if (leadPartnerDot) leadPartnerDot.style.display = leadName ? '' : 'none';
    }

    const analystName = document.getElementById('analyst-name');
    const analystDot = document.querySelector('#analyst-container .rounded-full');
    if (analystName) {
        // Fallback: if no MEMBER role, use deal creator as analyst
        const aName = analyst?.user?.name || deal.assignedUser?.name || null;
        analystName.textContent = aName || 'Not assigned';
        analystName.className = aName ? 'text-sm text-text-main font-bold' : 'text-sm text-text-muted font-medium italic';
        if (analystDot) analystDot.style.display = aName ? '' : 'none';
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

    // Initialize notifications (auth is ready now)
    if (window.PENotifications) PENotifications.init();

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

// ============================================================
// Dynamic Financial Metrics
// ============================================================
function renderDynamicMetrics(deal) {
    const grid = document.getElementById('deal-metrics-grid');
    if (!grid) return;

    // Define all possible metrics in priority order
    const allMetrics = [
        {
            key: 'revenue',
            label: 'Revenue (LTM)',
            value: deal.revenue,
            format: () => formatCurrency(deal.revenue, deal.currency || window.finState?.currency),
            color: 'secondary',
            extra: () => {
                // Mini bar chart
                return '<div class="h-8 mt-2 w-full flex items-end gap-1 opacity-80">' +
                    '<div class="flex-1 bg-secondary/60 h-[40%] rounded-t-sm"></div>' +
                    '<div class="flex-1 bg-secondary/60 h-[50%] rounded-t-sm"></div>' +
                    '<div class="flex-1 bg-secondary/60 h-[45%] rounded-t-sm"></div>' +
                    '<div class="flex-1 bg-secondary/60 h-[60%] rounded-t-sm"></div>' +
                    '<div class="flex-1 bg-secondary h-[80%] rounded-t-sm"></div></div>';
            }
        },
        {
            key: 'ebitdaMargin',
            label: 'EBITDA Margin',
            value: (deal.ebitda && deal.revenue) ? deal.ebitda : null,
            format: () => ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%',
            color: 'primary',
            extra: () => {
                const margin = Math.min(Math.round((deal.ebitda / deal.revenue) * 100), 100);
                return '<div class="h-8 mt-2 w-full flex items-center">' +
                    '<div class="w-full h-2 bg-border-subtle rounded-full overflow-hidden">' +
                    `<div class="h-full rounded-full transition-all" style="width:${margin}%;background-color:#003366;"></div>` +
                    '</div></div>';
            }
        },
        {
            key: 'ebitda',
            label: 'EBITDA',
            value: deal.ebitda,
            format: () => formatCurrency(deal.ebitda, deal.currency || window.finState?.currency),
            color: 'primary',
        },
        {
            key: 'dealSize',
            label: 'Deal Size',
            value: deal.dealSize,
            format: () => formatCurrency(deal.dealSize, deal.currency || window.finState?.currency),
            color: 'purple-500',
            extra: () => {
                if (deal.dealSize && deal.ebitda) {
                    const multiple = (deal.dealSize / deal.ebitda).toFixed(1);
                    return `<p class="text-xs text-text-muted font-medium mt-2">~${multiple}x EBITDA Multiple</p>`;
                }
                return '';
            }
        },
        {
            key: 'irr',
            label: 'Projected IRR',
            value: deal.irrProjected,
            format: () => deal.irrProjected.toFixed(1) + '%',
            color: 'secondary',
            badge: 'Target',
            extra: () => {
                if (deal.mom) {
                    return `<p class="text-xs text-text-muted font-medium mt-2">MoM: <span class="font-bold text-text-main">${deal.mom.toFixed(1)}x</span></p>`;
                }
                return '';
            }
        },
        {
            key: 'mom',
            label: 'Money Multiple',
            value: deal.mom,
            format: () => deal.mom.toFixed(1) + 'x',
            color: 'secondary',
        },
        {
            key: 'grossMargin',
            label: 'Gross Margin',
            value: (deal.revenue && deal.ebitda && deal.revenue > deal.ebitda) ? deal.revenue : null,
            format: () => {
                // Estimate: if we have EBITDA margin, gross is typically higher
                const ebitdaMargin = (deal.ebitda / deal.revenue) * 100;
                const estimated = Math.min(ebitdaMargin + 15, 95);
                return estimated.toFixed(0) + '%';
            },
            color: 'secondary',
            badge: 'Est.',
        },
    ];

    // Filter to only metrics with data, take up to 4
    const available = allMetrics.filter(m => m.value != null);

    // If EBITDA + revenue both exist, prefer ebitdaMargin over raw ebitda
    const hasMargin = available.some(m => m.key === 'ebitdaMargin');
    const filtered = available.filter(m => !(m.key === 'ebitda' && hasMargin));

    // If IRR exists, skip standalone MoM (it's shown as sub-text under IRR)
    const hasIRR = filtered.some(m => m.key === 'irr');
    const final = filtered.filter(m => !(m.key === 'mom' && hasIRR));

    // Skip estimated gross margin if we already have 4+ real metrics
    const realMetrics = final.filter(m => m.key !== 'grossMargin');
    const metrics = realMetrics.length >= 4 ? realMetrics.slice(0, 4) : final.slice(0, 4);

    if (metrics.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full glass-panel p-6 rounded-xl text-center">
                <span class="material-symbols-outlined text-text-muted text-3xl mb-2">analytics</span>
                <p class="text-text-muted text-sm">No financial metrics yet. Upload a CIM or edit the deal to add data.</p>
            </div>`;
        return;
    }

    // Adjust grid columns based on how many metrics we have
    const cols = metrics.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-' + Math.min(metrics.length, 4);
    grid.className = `grid ${cols} gap-4 mb-8 items-stretch`;

    grid.innerHTML = metrics.map(m => {
        const badgeHtml = m.badge
            ? `<span class="text-[10px] font-bold text-secondary bg-secondary-light border border-secondary/20 px-1.5 py-0.5 rounded">${m.badge}</span>`
            : '';
        const extraHtml = m.extra ? m.extra() : '';

        return `
            <div class="glass-panel p-4 rounded-xl relative overflow-hidden group">
                <div class="absolute -right-4 -top-4 size-20 bg-${m.color}/5 rounded-full blur-xl group-hover:bg-${m.color}/10 transition-all"></div>
                <p class="text-[11px] text-text-muted font-bold uppercase tracking-wide">${m.label}</p>
                <div class="flex items-center gap-2 mt-3">
                    <span class="text-2xl font-bold text-text-main leading-none">${m.format()}</span>
                    ${badgeHtml}
                </div>
                ${extraHtml}
            </div>`;
    }).join('');
}

// ============================================================
// Hash-scroll — when arriving with #section in URL, wait for
// dynamically rendered element then scroll to it smoothly.
// Used by the onboarding checklist (e.g. #financials-section).
// ============================================================
(function scrollToHashWhenReady() {
    const hash = window.location.hash?.slice(1);
    if (!hash) return;

    let attempts = 0;
    const maxAttempts = 40; // ~8 seconds
    const interval = setInterval(() => {
        const el = document.getElementById(hash);
        if (el) {
            clearInterval(interval);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (++attempts >= maxAttempts) {
            clearInterval(interval);
        }
    }, 200);
})();

console.log('PE OS Deal Intelligence page fully initialized');
