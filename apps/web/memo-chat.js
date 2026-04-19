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
// Simple Markdown → HTML converter for AI chat responses
// ============================================================
function mdToHtml(text) {
    if (!text) return '';
    if (text.trim().startsWith('<')) return text; // Already HTML
    return text
        .replace(/### (.+)/g, '<h4 class="font-bold text-slate-800 mt-3 mb-1">$1</h4>')
        .replace(/## (.+)/g, '<h3 class="font-bold text-slate-800 mt-3 mb-1">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul class="list-disc pl-5 my-1">$1</ul>')
        .replace(/^\d+\. (.+)/gm, '<li>$1</li>')
        .replace(/\n{2,}/g, '</p><p class="mt-2">')
        .replace(/\n/g, '<br>')
        .replace(/^(?!<)/, '<p>')
        .replace(/(?!>)$/, '</p>');
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
                <div class="size-8 shrink-0 rounded-full bg-[#003366] border border-white flex items-center justify-center mt-1">
                    <span class="text-[11px] text-white font-bold">${typeof USER !== 'undefined' && USER?.name ? USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U'}</span>
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
    const apiResponse = await sendChatMessageAPI(content, state.activeSection);

    // Hide typing indicator
    hideTypingIndicator();

    if (apiResponse) {
        const action = apiResponse.action;

        if (action === 'applied') {
            // Render AI message then refresh the affected section and show undo toast
            const aiMsg = {
                id: apiResponse.id || `m${Date.now()}`,
                role: 'assistant',
                content: (() => {
                    const text = apiResponse.content || apiResponse.message || '';
                    return mdToHtml(text);
                })(),
                timestamp: apiResponse.timestamp ? formatTime(new Date(apiResponse.timestamp)) : 'Just now'
            };
            state.messages.push(aiMsg);
            renderMessages();

            const sectionId = apiResponse.sectionId;
            if (sectionId) {
                if (typeof pushUndo === 'function') {
                    pushUndo(sectionId, apiResponse.previousContent, apiResponse.previousTableData, apiResponse.previousChartConfig);
                }
                await refreshSection(sectionId);
            }
            showUndoToast('Section updated');

        } else if (action === 'confirm') {
            // Render confirm message with Apply/Discard buttons (do NOT push to state.messages)
            renderMessages();
            renderConfirmMessage(apiResponse);

        } else {
            // info / undefined — render normally
            const aiMsg = {
                id: apiResponse.id || `m${Date.now()}`,
                role: 'assistant',
                content: (() => {
                    const text = apiResponse.content || apiResponse.message || '';
                    return mdToHtml(text);
                })(),
                timestamp: apiResponse.timestamp ? formatTime(new Date(apiResponse.timestamp)) : 'Just now'
            };
            state.messages.push(aiMsg);
            renderMessages();
        }
    } else {
        // AI unavailable — show offline message instead of simulated response
        const offlineMsg = {
            id: `m${Date.now()}`,
            role: 'assistant',
            content: `<p class="text-amber-700"><span class="material-symbols-outlined text-[16px] align-middle mr-1">cloud_off</span> <strong>AI Analyst is offline.</strong></p>
            <p class="mt-1 text-sm text-amber-600">The AI service is currently unavailable. Check that your OpenAI API key is configured and try again.</p>`,
            timestamp: 'Just now'
        };
        state.messages.push(offlineMsg);
        renderMessages();
    }
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

// ============================================================
// Confirm Message (Apply / Discard)
// ============================================================
function renderConfirmMessage(response) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-3 max-w-[85%]';

    const typeLabel = response.type === 'table' ? 'table' :
                      response.type === 'chart' ? 'chart' :
                      response.type === 'new_section' ? 'new section' : 'content';

    messageDiv.innerHTML =
        '<div class="size-8 rounded-full bg-[#003366] shrink-0 flex items-center justify-center">' +
            '<span class="material-symbols-rounded text-white text-sm">smart_toy</span>' +
        '</div>' +
        '<div class="flex flex-col gap-2">' +
            '<span class="text-xs font-medium text-gray-500">AI Analyst</span>' +
            '<div class="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm">' +
                '<div class="text-sm text-gray-800 mb-3">' + mdToHtml(response.content || response.message || '') + '</div>' +
                '<div class="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600 border">' +
                    '<span class="font-medium">Proposed ' + typeLabel + '</span>' +
                '</div>' +
                '<div class="flex gap-2">' +
                    '<button class="memo-apply-btn px-3 py-1.5 text-xs font-medium text-white rounded-lg" style="background-color: #003366">Apply</button>' +
                    '<button class="memo-discard-btn px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Discard</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Wire up buttons
    const applyBtn = messageDiv.querySelector('.memo-apply-btn');
    const discardBtn = messageDiv.querySelector('.memo-discard-btn');

    applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying...';
        await applyConfirmedAction(response.sectionId, response);
        applyBtn.textContent = 'Applied';
        discardBtn.remove();
    });

    discardBtn.addEventListener('click', () => {
        const actions = messageDiv.querySelector('.flex.gap-2');
        if (actions) actions.innerHTML = '<span class="text-xs text-gray-400">Discarded</span>';
    });
}

// ============================================================
// Apply / Undo Helpers
// ============================================================
async function applyConfirmedAction(sectionId, response) {
    if (!state.memo?.id) return;

    // Handle new section creation (add_section tool returns no sectionId)
    if (response.type === 'new_section' || !sectionId) {
        const sectionType = response.sectionType || 'CUSTOM';
        const title = response.title || 'New Section';
        try {
            const createResp = await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: sectionType,
                    title: title,
                    content: '<p><em>Generating content...</em></p>',
                    aiGenerated: true,
                }),
            });
            if (createResp.ok) {
                const savedSection = await createResp.json();
                await refreshSection(null);
                showUndoToast('Section added — generating content...');

                // Auto-generate AI content in background (don't block UI)
                if (savedSection.id && typeof regenerateSectionAPI === 'function') {
                    regenerateSectionAPI(savedSection.id).then(async (generated) => {
                        if (generated) {
                            await refreshSection(savedSection.id);
                            showUndoToast(`${title} content generated`);
                        } else {
                            // Generation failed — update section with fallback message
                            await applySectionActionAPI(state.memo.id, savedSection.id, {
                                content: `<p><em>AI content generation failed. Click the refresh icon (<span class="material-symbols-outlined text-[14px] align-middle">refresh</span>) to try again, or type your content directly.</em></p>`,
                                insertPosition: 'replace',
                            });
                            await refreshSection(savedSection.id);
                        }
                    }).catch(async () => {
                        await refreshSection(savedSection.id);
                    });
                }
            }
        } catch (error) {
            console.error('[Memo] Failed to create new section:', error);
        }
        return;
    }

    const result = await applySectionActionAPI(state.memo.id, sectionId, {
        content: response.preview,
        tableData: response.tableData,
        chartConfig: response.chartConfig,
        insertPosition: response.insertPosition || 'replace',
    });
    if (result) {
        if (typeof pushUndo === 'function') {
            pushUndo(sectionId, result.previousContent, result.previousTableData, result.previousChartConfig);
        }
        await refreshSection(sectionId);
        showUndoToast('Section updated');
    }
}

async function refreshSection(sectionId) {
    if (state.memo?.id) {
        await loadMemoFromAPI(state.memo.id);
        if (typeof renderSections === 'function') renderSections();
        // Delay chart rendering slightly to let DOM settle after renderSections
        setTimeout(() => {
            if (typeof renderChartsForAllSections === 'function') renderChartsForAllSections();
        }, 150);
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof updatePageCount === 'function') updatePageCount();
    }
}

function showUndoToast(message) {
    const existing = document.getElementById('undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'undo-toast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#003366] text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-50 text-sm';
    toast.innerHTML = '<span>' + escapeHtml(message) + '</span>' +
        '<button id="undo-btn" class="underline font-medium hover:text-blue-200">Undo</button>';
    document.body.appendChild(toast);

    document.getElementById('undo-btn').addEventListener('click', handleUndo);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 30000);
}

async function handleUndo() {
    const undo = typeof popUndo === 'function' ? popUndo() : null;
    if (!undo || !state.memo?.id) return;
    await applySectionActionAPI(state.memo.id, undo.sectionId, {
        content: undo.previousContent,
        tableData: undo.previousTableData,
        chartConfig: undo.previousChartConfig,
        insertPosition: 'replace',
    });
    await refreshSection(undo.sectionId);
    const toast = document.getElementById('undo-toast');
    if (toast) toast.remove();
    if (typeof showNotification === 'function') {
        showNotification('Undo', 'Section reverted', 'success');
    }
}

console.log('PE OS Memo Chat module loaded');
