// Deal Intelligence & Chat Terminal Interactive Features
// PE OS - AI-Powered Deal Analysis

const API_BASE_URL = 'http://localhost:3001/api';

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
// API Functions
// ============================================================
function getDealIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

async function loadDealData() {
    const dealId = getDealIdFromUrl();
    if (!dealId) {
        showNotification('Error', 'No deal ID provided', 'error');
        return;
    }

    state.dealId = dealId;

    try {
        const response = await fetch(`${API_BASE_URL}/deals/${dealId}`);
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
    return 'description';
}

function getDocColor(name) {
    if (!name) return 'slate';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'red';
    if (ext === 'xlsx' || ext === 'xls') return 'emerald';
    if (ext === 'csv') return 'blue';
    return 'slate';
}

function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    const absValue = Math.abs(value);
    if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}B`;
    return `$${value.toFixed(1)}M`;
}

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

function populateDealPage(deal) {
    // Update page title
    document.title = `${deal.name} - PE OS Deal Intelligence`;

    // Update breadcrumb
    const breadcrumbDeal = document.getElementById('breadcrumb-deal');
    if (breadcrumbDeal) breadcrumbDeal.textContent = deal.name;

    const breadcrumbIndustry = document.getElementById('breadcrumb-industry');
    if (breadcrumbIndustry && deal.industry) breadcrumbIndustry.textContent = deal.industry;

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

    // Update financial metrics
    const revenueEl = document.getElementById('deal-revenue');
    if (revenueEl) revenueEl.textContent = formatCurrency(deal.revenue);

    const ebitdaEl = document.getElementById('deal-ebitda');
    if (ebitdaEl && deal.ebitda) {
        const margin = deal.revenue ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) : 'N/A';
        ebitdaEl.textContent = margin + '%';
    }

    const dealSizeEl = document.getElementById('deal-size');
    if (dealSizeEl) dealSizeEl.textContent = formatCurrency(deal.dealSize);

    // Update EBITDA multiple
    const multipleEl = document.getElementById('deal-multiple');
    if (multipleEl && deal.dealSize && deal.ebitda) {
        const multiple = (deal.dealSize / deal.ebitda).toFixed(1);
        multipleEl.textContent = `~${multiple}x EBITDA Multiple`;
    }

    // Update IRR
    const irrEl = document.getElementById('deal-irr');
    if (irrEl && deal.irrProjected) {
        irrEl.textContent = deal.irrProjected.toFixed(1) + '%';
    }

    // Update MoM
    const momEl = document.getElementById('deal-mom');
    if (momEl && deal.mom) {
        momEl.textContent = deal.mom.toFixed(1) + 'x';
    }

    // Update last updated
    const lastUpdated = document.getElementById('deal-updated');
    if (lastUpdated) lastUpdated.textContent = formatRelativeTime(deal.updatedAt);

    // Update AI Thesis in chat intro
    const aiIntro = document.getElementById('ai-intro');
    if (aiIntro && deal.aiThesis) {
        aiIntro.innerHTML = `<p>I've analyzed the documents for <strong>${deal.name}</strong>. ${deal.aiThesis}</p><p class="mt-3">What would you like to know about this deal?</p>`;
    }

    // Update documents list
    updateDocumentsList(deal.documents || []);

    // Update chat context documents
    updateChatContext(deal.documents || []);
}

function updateDocumentsList(documents) {
    const docsContainer = document.getElementById('documents-list');
    if (!docsContainer || documents.length === 0) return;

    docsContainer.innerHTML = documents.map(doc => {
        const color = getDocColor(doc.name);
        const colorClass = color === 'emerald' ? 'secondary' : color;
        return `
        <div class="flex items-center gap-3 p-2 pr-4 bg-white rounded-lg border border-border-subtle shrink-0 hover:border-primary/50 hover:bg-primary-light/30 cursor-pointer transition-colors group shadow-sm" data-doc-id="${doc.id}">
            <div class="size-10 bg-${color}-50 rounded flex items-center justify-center text-${color}-500 group-hover:bg-${color}-100 transition-colors">
                <span class="material-symbols-outlined">${getDocIcon(doc.name)}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-sm font-bold text-text-main">${doc.name}</span>
                <span class="text-xs text-text-muted">${formatFileSize(doc.fileSize)} - Added ${formatRelativeTime(doc.createdAt)}</span>
            </div>
        </div>
    `}).join('');
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
        return `<div class="size-6 rounded-full bg-${bgColors[i % bgColors.length]} border border-white flex items-center justify-center text-[10px] text-${textColors[i % textColors.length]} font-bold z-${20-i*10} shadow-sm" title="${doc.name}">${icon}</div>`;
    }).join('') + (documents.length > 3 ? `<div class="size-6 rounded-full bg-background-body border border-white flex items-center justify-center text-[10px] text-text-secondary z-0 shadow-sm">+${documents.length - 3}</div>` : '');
}

// ============================================================
// DOM Ready
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('PE OS Deal Intelligence page initialized');

    // Initialize shared layout with collapsible sidebar
    PELayout.init('deals', { collapsible: true });

    loadDealData();
    initializeFeatures();
});

function initializeFeatures() {
    initChatInterface();
    initFileAttachments();
    initActionButtons();
    initCitationButtons();
    initDocumentPreviews();
    initAIResponseActions();
    initContextSettings();
    initBreadcrumbNavigation();
}

// ============================================================
// Chat Interface
// ============================================================
function initChatInterface() {
    const textarea = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message-btn');
    const chatContainer = document.getElementById('chat-messages');

    if (!textarea || !sendButton) return;

    // Auto-resize textarea
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 128) + 'px';
    });

    // Send message on Enter (Shift+Enter for new line)
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button click
    sendButton.addEventListener('click', sendMessage);

    function sendMessage() {
        const message = textarea.value.trim();
        if (!message) return;

        // Add user message to chat
        addUserMessage(message);
        textarea.value = '';
        textarea.style.height = 'auto';

        // Simulate AI typing
        setTimeout(() => {
            showTypingIndicator();
            setTimeout(() => {
                removeTypingIndicator();
                addAIResponse(message);
            }, 2000);
        }, 500);
    }
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

function addAIResponse(userMessage) {
    const chatContainer = document.getElementById('chat-messages');

    // Generate contextual response
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
    messageDiv.querySelector('.ai-helpful-btn').addEventListener('click', function() {
        this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
        this.classList.add('text-primary');
        showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
    });

    messageDiv.querySelector('.ai-copy-btn').addEventListener('click', function() {
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
        btn.addEventListener('click', function() {
            const fileChip = this.closest('.flex.items-center.gap-2');
            fileChip.style.transition = 'opacity 0.3s';
            fileChip.style.opacity = '0';
            setTimeout(() => fileChip.remove(), 300);
            showNotification('File Removed', 'Document removed from context', 'info');
        });
    });
}

function uploadFile(file) {
    const container = document.getElementById('attached-files');

    // Create uploading indicator
    const uploadChip = document.createElement('div');
    uploadChip.className = 'flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 text-xs text-blue-600 animate-pulse';
    uploadChip.innerHTML = `
        <span class="material-symbols-outlined text-sm animate-spin">sync</span>
        Uploading ${file.name}...
    `;
    container.appendChild(uploadChip);

    // Simulate upload
    setTimeout(() => {
        uploadChip.classList.remove('animate-pulse', 'bg-blue-50', 'text-blue-600');
        uploadChip.classList.add('bg-slate-50', 'text-slate-600');

        const fileIcon = file.name.endsWith('.pdf') ? 'picture_as_pdf' :
                         file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'table_chart' :
                         file.name.endsWith('.csv') ? 'table_view' : 'description';
        const iconColor = file.name.endsWith('.pdf') ? 'red' :
                          file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'emerald' : 'blue';

        uploadChip.innerHTML = `
            <span class="material-symbols-outlined text-${iconColor}-500 text-sm">${fileIcon}</span>
            ${file.name}
            <button class="hover:text-red-500 ml-1 transition-colors"><span class="material-symbols-outlined text-sm">close</span></button>
        `;

        uploadChip.querySelector('button').addEventListener('click', function() {
            uploadChip.style.transition = 'opacity 0.3s';
            uploadChip.style.opacity = '0';
            setTimeout(() => uploadChip.remove(), 300);
        });

        showNotification('File Uploaded', `${file.name} added to context`, 'success');
    }, 2000);
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

function showShareModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg">Share Deal</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6">
                <div class="mb-4">
                    <label class="block text-sm font-semibold text-slate-700 mb-2">Share with team members</label>
                    <input type="email" placeholder="Enter email address" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-semibold text-slate-700 mb-2">Permission</label>
                    <select class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                        <option>Can view</option>
                        <option>Can edit</option>
                        <option>Can comment</option>
                    </select>
                </div>
                <div class="bg-slate-50 rounded-lg p-3 mb-4">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-600">Copy link</span>
                        <button onclick="copyShareLink()" class="text-primary hover:text-blue-600 font-semibold">Copy</button>
                    </div>
                </div>
                <button onclick="shareWithTeam(); this.closest('.fixed').remove();" class="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors">
                    Share
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function showEditDealModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
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
                        <input type="text" value="Project Apex Logistics" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Stage</label>
                        <select class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            <option>Sourcing</option>
                            <option selected>Due Diligence</option>
                            <option>LOI / Offer</option>
                            <option>Closed</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Industry</label>
                        <input type="text" value="SaaS / Logistics" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Revenue (LTM)</label>
                        <input type="text" value="$120M" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">EBITDA Margin</label>
                        <input type="text" value="22%" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Valuation Ask</label>
                        <input type="text" value="$450M" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Retention Rate</label>
                        <input type="text" value="94%" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Lead Partner</label>
                        <input type="text" value="Sarah Jenkins" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Analyst</label>
                        <input type="text" value="Mike Ross" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                </div>
            </div>
            <div class="p-6 border-t border-slate-200 flex gap-3">
                <button onclick="saveDealChanges(); this.closest('.fixed').remove();" class="flex-1 bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors">
                    Save Changes
                </button>
                <button onclick="this.closest('.fixed').remove()" class="px-6 py-2.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-colors">
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

// ============================================================
// Citation Buttons
// ============================================================
function initCitationButtons() {
    document.addEventListener('click', function(e) {
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
            doc.addEventListener('click', function() {
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
        btn.addEventListener('click', function() {
            this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
            this.classList.add('text-primary');
            showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
        });
    });

    document.querySelectorAll('.ai-copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
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
    showNotification('Changes Saved', 'Deal details have been updated', 'success');
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
