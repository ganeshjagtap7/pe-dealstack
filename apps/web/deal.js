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

    const breadcrumbIndustry = document.getElementById('breadcrumb-industry');
    if (breadcrumbIndustry) breadcrumbIndustry.textContent = deal.industry || 'Deal';

    // Update deal header
    const dealTitle = document.getElementById('deal-title');
    if (dealTitle) dealTitle.textContent = deal.name;

    // Update icon
    const iconContainer = document.getElementById('deal-icon');
    if (iconContainer && deal.icon) iconContainer.textContent = deal.icon;

    // Stage and industry are shown in breadcrumb and pipeline — no duplicate badges needed

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
        leadPartnerName.textContent = leadPartner?.user?.name || '\u2014';
    }

    const analystName = document.getElementById('analyst-name');
    if (analystName) {
        analystName.textContent = analyst?.user?.name || '\u2014';
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

console.log('PE OS Deal Intelligence page fully initialized');
