/**
 * PE OS - Memo Builder Chat Module
 * Chat rendering, events, typing indicator, message display, prompt chips, AI status.
 * Depends on: js/config.js (API_BASE_URL), js/auth.js (PEAuth), js/formatters.js (escapeHtml),
 *             memo-api.js (sendChatMessageAPI, checkAIStatus), memo-builder.js (state, renderSections)
 */

// ============================================================
// Prompt Chips (Dynamic)
// ============================================================
function renderPromptChips() {
    const container = document.getElementById('prompt-chips');
    if (!container) return;

    const chips = [];

    // Always include generic useful chips
    chips.push({ icon: 'edit_note', label: 'Rewrite for Tone', prompt: 'Rewrite the active section for a more formal, investment-committee-ready tone' });

    // Deal-specific chips when a deal is linked
    const dealName = state.memo?.projectName || '';
    if (dealName && dealName !== 'New Investment Memo') {
        chips.push({ icon: 'bar_chart', label: 'EBITDA Bridge', prompt: `Add an EBITDA bridge analysis for ${dealName}` });
        chips.push({ icon: 'trending_up', label: 'Revenue Growth', prompt: `Analyze the revenue growth trajectory and key drivers for ${dealName}` });
    } else {
        chips.push({ icon: 'bar_chart', label: 'Add EBITDA Bridge', prompt: 'Add an EBITDA bridge analysis' });
    }

    // Section-aware chips
    const sectionTypes = state.sections.map(s => s.type);
    if (sectionTypes.includes('RISK_ASSESSMENT')) {
        chips.push({ icon: 'warning', label: 'Summarize Risks', prompt: 'Summarize the key risks identified in this memo with severity ratings' });
    }
    if (!sectionTypes.includes('COMPETITIVE_LANDSCAPE')) {
        chips.push({ icon: 'groups', label: 'Add Competitors', prompt: 'Generate a competitive landscape analysis section for this memo' });
    }

    // Chip for first empty section
    const emptySection = state.sections.find(s => !s.content || s.content.length < 50);
    if (emptySection) {
        chips.push({ icon: 'auto_awesome', label: `Draft ${emptySection.title}`, prompt: `Generate professional content for the "${emptySection.title}" section based on available deal data` });
    }

    // Render (max 5)
    container.innerHTML = chips.slice(0, 5).map((chip, i) => `
        <button class="prompt-chip shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full ${i === 0 ? 'bg-primary-light text-primary border-primary/20' : 'bg-slate-100 text-slate-600 border-slate-200'} text-xs font-medium hover:bg-primary/20 hover:text-primary transition-colors border" data-prompt="${escapeHtml(chip.prompt)}">
            <span class="material-symbols-outlined text-[14px]">${chip.icon}</span>
            ${chip.label}
        </button>
    `).join('');

    // Bind click handlers
    container.querySelectorAll('.prompt-chip').forEach(chipEl => {
        chipEl.addEventListener('click', () => {
            const chatInput = document.getElementById('chat-input');
            chatInput.value = chipEl.dataset.prompt;
            chatInput.focus();
        });
    });
}

// ============================================================
// Chat Rendering
// ============================================================
function renderMessages() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = state.messages.map(msg => renderMessage(msg)).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Add quick action handlers
    container.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            handleQuickAction(action);
        });
    });
}

function renderMessage(msg) {
    if (msg.role === 'assistant') {
        return `
            <div class="flex gap-3">
                <div class="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
                    <span class="material-symbols-outlined text-[16px]">smart_toy</span>
                </div>
                <div class="flex flex-col gap-1 max-w-[85%]">
                    <span class="text-[11px] font-semibold text-slate-500 ml-1">AI Analyst • ${msg.timestamp}</span>
                    <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 leading-relaxed">
                        ${msg.content}
                        ${msg.sourceDoc ? renderSourceDoc(msg.sourceDoc) : ''}
                    </div>
                    ${msg.quickActions ? renderQuickActions(msg.quickActions) : ''}
                </div>
            </div>
        `;
    } else {
        return `
            <div class="flex gap-3 flex-row-reverse">
                <div class="size-8 shrink-0 rounded-full bg-slate-200 border border-white flex items-center justify-center overflow-hidden mt-1">
                    <img alt="User avatar" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAV31Zl0-ZHzKDQvgazCW09de1WLUDQN-81rWj2ffRFZEpC4pPGzSYaSdT7A1axfBKmDIPC_3wiFDo4hTwQUDd-Ow7ZB50lrLV6MND55clVnnmWDRPX5SP0WNJYU2gHNkEn3rjPdRqwEHupH8qrLotpj-EJeIorbNlmchrTJXBVY7i2VtoVmtfPMZwmtMwgh3Exr08j8jkjaax18yKkqArKfWdLvLyKwvXFjkY4llIT2uuMAPzxsJEd4m3heiJghB3yRKAFlV8cxus"/>
                </div>
                <div class="flex flex-col gap-1 items-end max-w-[85%]">
                    <span class="text-[11px] font-semibold text-slate-500 mr-1">You • ${msg.timestamp}</span>
                    <div class="bg-primary text-white rounded-2xl rounded-tr-none p-3 shadow-sm text-sm leading-relaxed">
                        ${msg.content}
                    </div>
                </div>
            </div>
        `;
    }
}

function renderSourceDoc(doc) {
    return `
        <div class="mt-3 bg-slate-50 border border-slate-200 rounded p-2 flex items-center gap-3">
            <div class="size-8 bg-white border border-slate-200 rounded flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-red-500 text-[18px]">${doc.icon}</span>
            </div>
            <div class="flex flex-col overflow-hidden">
                <span class="text-xs font-semibold text-slate-800 truncate">${doc.name}</span>
                <span class="text-[10px] text-slate-500">Page ${doc.page} • ${doc.table}</span>
            </div>
            <button class="ml-auto text-slate-400 hover:text-primary">
                <span class="material-symbols-outlined text-[18px]">visibility</span>
            </button>
        </div>
    `;
}

function renderQuickActions(actions) {
    return `
        <div class="flex gap-2 mt-1 ml-1">
            ${actions.map(a => `
                <button class="quick-action-btn text-xs bg-white border border-slate-200 px-2 py-1 rounded-full text-slate-600 hover:text-primary hover:border-primary transition-colors" data-action="${a.action}">
                    ${a.label}
                </button>
            `).join('')}
        </div>
    `;
}

// ============================================================
// Send Message
// ============================================================
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;

    // Add user message
    const userMsg = {
        id: `m${Date.now()}`,
        role: 'user',
        content: `<p>${escapeHtml(content)}</p>`,
        timestamp: formatTime(new Date())
    };
    state.messages.push(userMsg);
    input.value = '';
    renderMessages();

    // Show typing indicator
    showTypingIndicator();

    // Try real API first
    const apiResponse = await sendChatMessageAPI(content);

    // Hide typing indicator
    hideTypingIndicator();

    if (apiResponse) {
        // Use real API response
        const aiMsg = {
            id: apiResponse.id || `m${Date.now()}`,
            role: 'assistant',
            content: apiResponse.content.startsWith('<') ? apiResponse.content : `<p>${apiResponse.content}</p>`,
            timestamp: apiResponse.timestamp ? formatTime(new Date(apiResponse.timestamp)) : 'Just now'
        };
        state.messages.push(aiMsg);
    } else {
        // Fall back to simulated response
        const aiResponse = generateAIResponse(content);
        state.messages.push(aiResponse);
    }

    renderMessages();
}

// ============================================================
// Typing Indicator
// ============================================================
function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'flex gap-3';
    indicator.innerHTML = `
        <div class="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
            <span class="material-symbols-outlined text-[16px]">smart_toy</span>
        </div>
        <div class="flex flex-col gap-1">
            <span class="text-[11px] font-semibold text-slate-500 ml-1">AI Analyst • typing...</span>
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3 shadow-sm">
                <div class="flex gap-1">
                    <span class="size-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                    <span class="size-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                    <span class="size-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                </div>
            </div>
        </div>
    `;
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

// ============================================================
// AI Response (Simulated fallback)
// ============================================================
function generateAIResponse(userInput) {
    const lowercaseInput = userInput.toLowerCase();

    let response = {
        id: `m${Date.now()}`,
        role: 'assistant',
        timestamp: 'Just now'
    };

    if (lowercaseInput.includes('tone') || lowercaseInput.includes('rewrite')) {
        response.content = `<p>I've rewritten the section with a more formal tone, emphasizing quantitative data and removing subjective language.</p>
        <p class="mt-2">The revised version now uses industry-standard PE terminology and maintains objectivity throughout. Should I apply this to other sections as well?</p>`;
    } else if (lowercaseInput.includes('ebitda') || lowercaseInput.includes('bridge')) {
        response.content = `<p>I've added an EBITDA bridge analysis showing the walk from FY22 to FY23:</p>
        <ul class="list-disc list-inside mt-2 text-slate-600">
            <li>FY22 EBITDA: $43.5M</li>
            <li>Revenue growth impact: +$6.5M</li>
            <li>Margin expansion: +$3.4M</li>
            <li>FY23 EBITDA: $53.4M</li>
        </ul>
        <p class="mt-2">Shall I insert this as a new visual in the Financial Performance section?</p>`;
        response.quickActions = [
            { label: 'Yes, add visual', action: 'add_ebitda_visual' },
            { label: 'Add as text only', action: 'add_ebitda_text' }
        ];
    } else if (lowercaseInput.includes('risk')) {
        response.content = `<p>Here's a summary of the key risks identified:</p>
        <ul class="list-disc list-inside mt-2 text-slate-600">
            <li><strong>High:</strong> Customer concentration (35% in top 3)</li>
            <li><strong>Medium:</strong> Technology obsolescence, integration complexity</li>
            <li><strong>Low:</strong> Regulatory changes, market competition</li>
        </ul>
        <p class="mt-2">All risks have documented mitigants in the full Risk Assessment section.</p>`;
    } else if (lowercaseInput.includes('chart') || lowercaseInput.includes('visual')) {
        response.content = `<p>I can create several visualizations for this memo:</p>
        <ul class="list-disc list-inside mt-2 text-slate-600">
            <li>Revenue waterfall chart</li>
            <li>Competitive market share comparison</li>
            <li>IRR sensitivity analysis</li>
            <li>Exit valuation scenarios</li>
        </ul>
        <p class="mt-2">Which would you like me to generate?</p>`;
    } else {
        response.content = `<p>I understand you'd like help with "${escapeHtml(userInput.substring(0, 50))}${userInput.length > 50 ? '...' : ''}"</p>
        <p class="mt-2">I can help you refine this section, add supporting data, or generate additional analysis. What specific aspect would you like me to focus on?</p>`;
    }

    return response;
}

// ============================================================
// Quick Actions
// ============================================================
function handleQuickAction(action) {
    console.log('Quick action:', action);

    // Simulate AI processing the action
    setTimeout(() => {
        let response;
        switch (action) {
            case 'add_breakdown':
                response = {
                    id: `m${Date.now()}`,
                    role: 'assistant',
                    content: `<p>I've added a detailed breakdown of the cost-saving initiatives:</p>
                    <ul class="list-disc list-inside mt-2 text-slate-600">
                        <li>Operational efficiency gains: $2.1M</li>
                        <li>Vendor consolidation: $0.8M</li>
                        <li>Automation investments: $1.5M</li>
                    </ul>
                    <p class="mt-2">This has been inserted into the Financial Performance section.</p>`,
                    timestamp: 'Just now'
                };
                break;
            default:
                response = {
                    id: `m${Date.now()}`,
                    role: 'assistant',
                    content: `<p>Got it! I've processed your request.</p>`,
                    timestamp: 'Just now'
                };
        }
        state.messages.push(response);
        renderMessages();
    }, 1000);
}

// ============================================================
// Mode Indicators (AI Status)
// ============================================================
async function updateModeIndicators() {
    // Check real AI connectivity
    const aiEnabled = await checkAIStatus();
    updateAIPanelStatus(aiEnabled);

    // If AI is not enabled, show a notice in chat
    if (!aiEnabled && state.messages.length === 0) {
        state.messages.push({
            id: 'ai-notice',
            role: 'assistant',
            content: `<p class="text-amber-600 font-medium">AI Not Connected</p>
            <p class="mt-2 text-amber-700">OpenAI API key is not configured. Chat responses will be simulated.</p>
            <p class="mt-2 text-xs text-slate-500">To enable AI, set OPENAI_API_KEY in your .env file.</p>`,
            timestamp: formatTime(new Date()),
        });
        renderMessages();
    }
}

function updateAIPanelStatus(isConnected) {
    // Update the AI panel header to show status
    const aiHeader = document.querySelector('#ai-panel .p-3.border-b');
    if (!aiHeader) return;

    const statusIndicator = aiHeader.querySelector('.ai-status-indicator');
    if (statusIndicator) {
        statusIndicator.remove();
    }

    const indicator = document.createElement('span');
    indicator.className = 'ai-status-indicator ml-auto mr-2 flex items-center gap-1 text-xs';

    if (isConnected) {
        indicator.innerHTML = `
            <span class="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-emerald-600 font-medium">AI Connected</span>
        `;
    } else {
        indicator.innerHTML = `
            <span class="size-2 rounded-full bg-slate-400"></span>
            <span class="text-slate-500 font-medium">AI Offline</span>
        `;
    }

    const closeBtn = aiHeader.querySelector('#close-ai-panel');
    if (closeBtn) {
        closeBtn.parentNode.insertBefore(indicator, closeBtn);
    }
}

// ============================================================
// File Attachment
// ============================================================
function handleFileAttachment(e) {
    const files = e.target.files;
    if (!files.length) return;

    const fileNames = Array.from(files).map(f => f.name).join(', ');

    state.messages.push({
        id: `m${Date.now()}`,
        role: 'user',
        content: `<p>Attached: ${escapeHtml(fileNames)}</p>`,
        timestamp: formatTime(new Date())
    });

    state.messages.push({
        id: `m${Date.now() + 1}`,
        role: 'assistant',
        content: `<p>I've received the file(s). Analyzing the content to extract relevant data for the memo...</p>`,
        timestamp: 'Just now'
    });

    renderMessages();

    // Reset file input
    e.target.value = '';
}

console.log('PE OS Memo Chat module loaded');
