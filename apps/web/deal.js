// Deal Intelligence & Chat Terminal Interactive Features
// DealOS - AI-Powered Deal Analysis

// ============================================================
// State Management
// ============================================================
const state = {
    messages: [],
    attachedFiles: [
        { id: 1, name: 'Q3_Financials.xlsx', type: 'excel', size: '850 KB', icon: 'table_chart', color: 'emerald' },
        { id: 2, name: 'Legal_DD_Memo.pdf', type: 'pdf', size: '2.4 MB', icon: 'picture_as_pdf', color: 'red' }
    ],
    uploadingFiles: [
        { name: 'Competitor_Analysis.csv', progress: 75 }
    ],
    dealData: {
        name: 'Project Apex Logistics',
        stage: 'Due Diligence',
        revenue: '$120M',
        ebitda: '22%',
        valuation: '$450M',
        retention: '94%'
    },
    contextDocuments: ['Q3 Financial Model', 'Management Presentation v2', 'Legal Due Diligence Memo']
};

// ============================================================
// DOM Ready
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Deal Intelligence page initialized');
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
    const textarea = document.querySelector('textarea[placeholder*="Ask about"]');
    const sendButton = document.querySelector('button[title="Send Message"]');
    const chatContainer = document.querySelector('.flex-1.overflow-y-auto.p-6');

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
    const chatContainer = document.querySelector('.flex-1.overflow-y-auto.p-6');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[80%] self-end flex-row-reverse animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-full bg-slate-200 border border-white shrink-0 overflow-hidden shadow-sm">
            <img alt="User" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDy08M_NHIgxHrLrDJI8Oyg9MLywBJz5HDJK6Ttc4ngRCsROyC6yy5k0lo7Hou2UzpZz6yjSrqTM9CNmzwziX498CkbZU_-euCW_wcNvxaKwsGs7NeaAB0YSvoC-XStJn7IU76cx6kq8-5z3W9bajxbGFhqhC9xK64RbXihdSxWA6Av67hhtrHEP6uq8TtV_j6YvwfcjotugYfZ9LSOCPhDQAFU-yXQywxWUuY2mtxBth8fhjI-QzUwqNrQg0HvU5LeFxB6Jo3dr84"/>
        </div>
        <div class="flex flex-col gap-1 items-end">
            <span class="text-xs font-bold text-slate-500 mr-1">You</span>
            <div class="bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-tr-none p-4 text-sm shadow-sm">
                <p>${escapeHtml(message)}</p>
            </div>
        </div>
    `;

    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const chatContainer = document.querySelector('.flex-1.overflow-y-auto.p-6');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'flex gap-4 max-w-[90%] animate-fadeIn';
    typingDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1 justify-center">
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-700 shadow-sm w-16">
                <div class="flex gap-1">
                    <div class="size-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    <div class="size-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
                    <div class="size-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
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
    const chatContainer = document.querySelector('.flex-1.overflow-y-auto.p-6');

    // Generate contextual response
    const responses = generateAIResponse(userMessage);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-4 max-w-[90%] animate-fadeIn';
    messageDiv.innerHTML = `
        <div class="size-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
            <span class="material-symbols-outlined text-white text-lg">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-xs font-bold text-slate-500 ml-1">DealOS AI</span>
            <div class="ai-bubble-gradient border border-slate-200 rounded-2xl rounded-tl-none p-4 text-sm text-slate-700 shadow-sm">
                ${responses}
            </div>
            <div class="flex gap-2 ml-1 mt-1">
                <button class="ai-helpful-btn text-[10px] text-slate-400 hover:text-primary flex items-center gap-1 transition-colors font-medium">
                    <span class="material-symbols-outlined text-sm">thumb_up</span> Helpful
                </button>
                <button class="ai-copy-btn text-[10px] text-slate-400 hover:text-primary flex items-center gap-1 transition-colors font-medium">
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

    // Keyword-based responses
    if (lowerMessage.includes('risk') || lowerMessage.includes('concern')) {
        return `
            <p class="leading-relaxed">Based on the due diligence documents, I've identified the following key risks:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-amber-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Key Risk Factors:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Customer Concentration:</strong> Top 3 clients = 45% revenue <button class="citation-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-colors ml-1 cursor-pointer shadow-sm" data-doc="financials">Q3 Report</button></span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Tech Debt:</strong> Platform modernization required post-acquisition</span>
                    </li>
                </ul>
            </div>
            <p>However, the strong <strong>94% retention rate</strong> and consistent revenue growth mitigate these concerns.</p>
        `;
    } else if (lowerMessage.includes('valuation') || lowerMessage.includes('price') || lowerMessage.includes('multiple')) {
        return `
            <p class="leading-relaxed">The valuation analysis shows:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Valuation Metrics:</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Ask Price</div>
                        <div class="font-bold text-primary">$450M</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">EV/EBITDA</div>
                        <div class="font-bold text-slate-900">~17x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Revenue Multiple</div>
                        <div class="font-bold text-slate-900">3.75x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">LTM EBITDA</div>
                        <div class="font-bold text-slate-900">$26.4M</div>
                    </div>
                </div>
            </div>
            <p>This represents a <strong>premium valuation</strong> for the logistics SaaS sector. Comparable companies trade at 12-15x EBITDA. <button class="citation-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-colors ml-1 cursor-pointer shadow-sm" data-doc="memo">Section 3.4</button></p>
        `;
    } else if (lowerMessage.includes('revenue') || lowerMessage.includes('growth') || lowerMessage.includes('financial')) {
        return `
            <p class="leading-relaxed">Financial performance shows strong momentum:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Revenue Analysis:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>LTM Revenue: <strong>$120M</strong> (+15% YoY) <button class="citation-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-colors ml-1 cursor-pointer shadow-sm" data-doc="financials">Tab 2</button></span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>EBITDA Margin: <strong>22%</strong> (stable, industry avg: 18-20%)</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>ARR Growth: <strong>18%</strong> quarter-over-quarter</span>
                    </li>
                </ul>
            </div>
            <p>The company demonstrates consistent growth with improving unit economics.</p>
        `;
    } else if (lowerMessage.includes('timeline') || lowerMessage.includes('next step') || lowerMessage.includes('schedule')) {
        return `
            <p class="leading-relaxed">Here's the current deal timeline:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Upcoming Milestones:</p>
                <div class="space-y-2 text-sm">
                    <div class="flex items-center gap-2">
                        <div class="size-2 rounded-full bg-primary animate-pulse"></div>
                        <strong>Commercial DD</strong> - In Progress (Due: Nov 20)
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="size-2 rounded-full bg-slate-300"></div>
                        <span>Investment Committee - Scheduled: Nov 28</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="size-2 rounded-full bg-slate-300"></div>
                        <span>Final Offer - Target: Dec 5</span>
                    </div>
                </div>
            </div>
            <p><strong>Next Action:</strong> Complete commercial due diligence review and prepare IC memo draft.</p>
        `;
    } else {
        // Generic helpful response
        return `
            <p class="leading-relaxed">I've analyzed the available documents for <strong>Project Apex Logistics</strong>. Here's what I found:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Key Highlights:</p>
                <ul class="space-y-2 text-slate-600 text-sm">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span>Strong financial performance with $120M revenue and 22% EBITDA margin</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span>Currently in Due Diligence phase, progressing well</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span>Main risks: customer concentration and legacy tech debt</span>
                    </li>
                </ul>
            </div>
            <p>Would you like me to dive deeper into any specific aspect? Try asking about <em>risks, valuation, financials, or timeline</em>.</p>
        `;
    }
}

function scrollToBottom() {
    const chatContainer = document.querySelector('.flex-1.overflow-y-auto.p-6');
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
    const attachButton = document.querySelector('button[title="Attach File"]');
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
    const container = document.querySelector('.flex.gap-2.mb-3');

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
    const shareBtn = document.querySelector('button[class*="Share"]');
    if (shareBtn) {
        shareBtn.addEventListener('click', showShareModal);
    }

    // Edit Deal button
    const editBtn = document.querySelector('button[class*="Edit Deal"]');
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
    const settingsBtn = document.querySelector('.flex.items-center.gap-3 button[class*="text-slate-400"]');
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

console.log('Deal Intelligence page fully initialized');
