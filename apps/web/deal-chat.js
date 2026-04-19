// ============================================================
// Deal Chat Interface — extracted from deal.js
// Depends on: state (global), parseMarkdown (deal.js), API_BASE_URL, PEAuth, escapeHtml, formatCurrency, showNotification
// Mock responses: deal-chat-responses.js (loaded before this file)
// ============================================================

// _chatAttachedFiles defined in deal-chat-attachments.js (loaded before this file)

// ─── Dynamic Suggestion Prompts ───────────────────────────────────
// Generates personalized prompts based on actual deal data

function buildSuggestionPrompts() {
    const deal = state.dealData;
    if (!deal) return getDefaultSuggestionPrompts();

    const name = deal.name || deal.company?.name || 'this company';
    const industry = deal.industry || null;
    const revenue = deal.revenue;
    const ebitda = deal.ebitda;
    const currency = deal.currency || 'USD';
    const hasDocs = (deal.documents?.length || 0) > 0;

    const prompts = [];

    // 1. Deal-specific risk analysis
    if (industry) {
        prompts.push({
            icon: 'warning',
            label: `Risks in ${industry}`,
            prompt: `What are the top 3 risks for ${name} in the ${industry} space? Flag anything from the uploaded documents that concerns you.`,
        });
    } else {
        prompts.push({
            icon: 'warning',
            label: 'Key risks & red flags',
            prompt: `What are the biggest risks and red flags for ${name}? Pull specific data points from the documents to support your analysis.`,
        });
    }

    // 2. Financial deep-dive
    if (revenue != null && ebitda != null) {
        const sym = typeof getCurrencySymbol === 'function' ? getCurrencySymbol(currency) : '$';
        const fmtRev = typeof formatCurrency === 'function' ? formatCurrency(revenue) : `${sym}${revenue}M`;
        const fmtEbitda = typeof formatCurrency === 'function' ? formatCurrency(ebitda) : `${sym}${ebitda}M`;
        const margin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : null;
        prompts.push({
            icon: 'analytics',
            label: 'Margin & valuation analysis',
            prompt: `${name} shows ${fmtRev} revenue and ${fmtEbitda} EBITDA${margin ? ` (${margin}% margin)` : ''}. How do these margins compare to ${industry || 'industry'} benchmarks? What valuation range would you estimate?`,
        });
    } else {
        prompts.push({
            icon: 'analytics',
            label: 'Financial health check',
            prompt: `Analyze the financial health of ${name}. What do the revenue, margins, and cash flow tell us? Compare to ${industry || 'industry'} benchmarks.`,
        });
    }

    // 3. Investment thesis
    prompts.push({
        icon: 'lightbulb',
        label: 'Build investment thesis',
        prompt: `Write a 3-paragraph investment thesis for ${name}. Cover: (1) why this is an attractive opportunity, (2) key value creation levers post-acquisition, and (3) primary risks and mitigants. Use specific data from the documents.`,
    });

    // 4. DD questions
    prompts.push({
        icon: 'checklist',
        label: 'Due diligence questions',
        prompt: `Generate 10 targeted due diligence questions for ${name}'s management team. Focus on areas where the documents are weak or data is missing. Organize by category (financial, operational, legal, commercial).`,
    });

    // 5. Deal-specific contextual prompt
    if (hasDocs) {
        prompts.push({
            icon: 'description',
            label: 'Summarize all documents',
            prompt: `Give me a structured summary of all uploaded documents for ${name}. For each document, list: key data points, anything surprising, and what's missing that we'd need for a full DD.`,
        });
    } else {
        prompts.push({
            icon: 'trending_up',
            label: 'Growth & exit potential',
            prompt: `What is the growth potential for ${name}${industry ? ` in ${industry}` : ''}? Outline 3 realistic exit scenarios with estimated timeline and return multiples.`,
        });
    }

    return prompts;
}

function getDefaultSuggestionPrompts() {
    return [
        { icon: 'warning', label: 'Key risks & red flags', prompt: 'What are the biggest risks and red flags for this deal? Pull specific data points from the documents.' },
        { icon: 'analytics', label: 'Financial health check', prompt: 'Analyze the financial health of this company. What do revenue, margins, and cash flow tell us?' },
        { icon: 'lightbulb', label: 'Build investment thesis', prompt: 'Write a 3-paragraph investment thesis covering: why it\'s attractive, value creation levers, and key risks with mitigants.' },
        { icon: 'checklist', label: 'Due diligence questions', prompt: 'Generate 10 targeted due diligence questions for management, organized by category (financial, operational, legal, commercial).' },
        { icon: 'trending_up', label: 'Growth & exit potential', prompt: 'Outline 3 realistic exit scenarios with estimated timeline and return multiples.' },
    ];
}

function renderSuggestionChips() {
    const container = document.getElementById('chat-suggestions');
    if (!container) return;

    const prompts = buildSuggestionPrompts();
    container.innerHTML = prompts.map(p => `
        <button class="chat-suggestion-chip group flex items-start gap-2 px-3.5 py-2.5 text-left text-xs font-medium rounded-xl border border-primary/15 text-primary bg-primary/[0.03] hover:bg-primary/10 hover:border-primary/30 transition-all" data-prompt="${escapeHtml(p.prompt)}">
            <span class="material-symbols-outlined text-sm mt-px shrink-0">${p.icon}</span>
            <span class="leading-relaxed">${escapeHtml(p.label)}</span>
        </button>
    `).join('');

    // Wire up click handlers
    container.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const textarea = document.getElementById('chat-input');
            if (textarea) {
                textarea.value = chip.dataset.prompt;
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
            }
            if (window.sendChatMessage) window.sendChatMessage();
        });
    });
}

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

    // Expose sendMessage globally for suggestion chips
    window.sendChatMessage = sendMessage;

    // Render personalized suggestion chips (will use default prompts until deal data loads)
    renderSuggestionChips();

    // File attachment button
    initChatFileAttachment();

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
                    // Re-show suggestion chips after clearing chat
                    const sugEl = document.getElementById('chat-suggestions');
                    if (sugEl) { sugEl.classList.remove('hidden'); renderSuggestionChips(); }
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

        // Build the full message — include attachment context if files were attached
        let fullMessage = message;
        if (_chatAttachedFiles.length > 0) {
            const fileNames = _chatAttachedFiles.map(f => f.name).join(', ');
            fullMessage = `[User attached document(s): ${fileNames}. Search for these documents to answer questions about them.]\n\n${message}`;
        }

        // Hide suggestion chips once user sends a message
        const suggestionsEl = document.getElementById('chat-suggestions');
        if (suggestionsEl) suggestionsEl.classList.add('hidden');

        // Add user message to chat (show only the user's typed text)
        addUserMessage(message);
        textarea.value = '';
        textarea.style.height = 'auto';

        // Clear attachment chips after sending
        if (_chatAttachedFiles.length > 0) {
            const attachedContainer = document.getElementById('attached-files');
            if (attachedContainer) attachedContainer.innerHTML = '';
            _chatAttachedFiles = [];
        }

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
                        message: fullMessage,
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

                    // Show error-styled message if agent returned an error
                    if (data.model === 'error') {
                        addAIResponseFromAPI(`⚠️ ${data.response}`, null, null);
                    } else {
                        addAIResponseFromAPI(data.response, data.action, data.model);
                        // Onboarding: mark tryDealChat step on first successful chat
                        if (window.OnboardingAPI) {
                            OnboardingAPI.completeStep('tryDealChat');
                        }
                    }

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

        console.error('[Chat] API request failed, showing error to user');
        removeTypingIndicator();
        const chatContainer = document.getElementById('chat-messages');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'flex gap-4 max-w-[90%]';
        errorDiv.innerHTML = `
            <div class="size-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-red-500 text-lg">error</span>
            </div>
            <div class="flex flex-col gap-1">
                <div class="border border-red-200 bg-red-50 rounded-2xl rounded-tl-none p-4 text-sm text-red-700 shadow-sm">
                    <p>Sorry, I couldn't process your request right now. Please try again.</p>
                </div>
            </div>
        `;
        chatContainer.appendChild(errorDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
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

            const chatContainer = document.getElementById('chat-messages');

            if (data.messages && data.messages.length > 0) {
                // Clear the default intro message and any hardcoded content
                chatContainer.querySelectorAll('.ai-intro-message').forEach(el => el.remove());

                // Hide suggestion chips when history exists
                const suggestionsEl = document.getElementById('chat-suggestions');
                if (suggestionsEl) suggestionsEl.classList.add('hidden');

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
                chatContainer?.querySelectorAll('.ai-intro-message').forEach(el => el.classList.remove('hidden'));
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
        <div class="size-8 rounded-full bg-[#003366] border border-white shrink-0 flex items-center justify-center shadow-sm">
            <span class="text-[11px] text-white font-bold">${typeof USER !== 'undefined' && USER?.name ? USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U'}</span>
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
            <span class="text-xs font-bold text-text-muted ml-1">PE OS AI</span>
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
        <div class="size-8 rounded-full bg-[#003366] border border-white shrink-0 flex items-center justify-center shadow-sm">
            <span class="text-[11px] text-white font-bold">${typeof USER !== 'undefined' && USER?.name ? USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U'}</span>
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

function addAIResponseFromAPI(responseText, action = null, modelName = null) {
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
            <span class="text-xs font-bold text-text-muted ml-1">PE OS AI${modelName ? ` <span class="text-primary/60 font-normal">• ${modelName}</span>` : ''}</span>
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

// generateAIResponse() is in deal-chat-responses.js (loaded before this file)

function scrollToBottom() {
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
    }
}

// File attachment functions in deal-chat-attachments.js (loaded before this file)
