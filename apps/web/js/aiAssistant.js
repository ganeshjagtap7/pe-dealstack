/**
 * PE OS — Contextual AI Assistant
 * Floating "Ask AI" button + slide-out chat drawer.
 * Context-aware: uses deal chat on deal page, portfolio chat on dashboard.
 */

(function () {
    let isOpen = false;
    let messages = [];
    let isLoading = false;
    let currentContext = null; // { type: 'deal', dealId, dealName } | { type: 'dashboard' } | { type: 'contacts' } | { type: 'general' }

    // ── Detect page context ─────────────────────────────
    function detectContext() {
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);

        if (path.includes('deal.html') && params.get('id')) {
            const dealName = document.getElementById('deal-title')?.textContent?.trim() || 'this deal';
            return { type: 'deal', dealId: params.get('id'), dealName };
        }
        if (path.includes('dashboard')) return { type: 'dashboard' };
        if (path.includes('contacts')) return { type: 'contacts' };
        if (path.includes('crm')) return { type: 'deals' };
        if (path.includes('memo-builder')) return { type: 'memo' };
        return { type: 'general' };
    }

    function getPlaceholder() {
        if (!currentContext) return 'Ask AI anything...';
        switch (currentContext.type) {
            case 'deal': return `Ask about ${currentContext.dealName}...`;
            case 'dashboard': return 'Ask about your portfolio...';
            case 'contacts': return 'Ask about relationships...';
            case 'deals': return 'Ask about your deal pipeline...';
            case 'memo': return 'Ask about this memo...';
            default: return 'Ask AI anything...';
        }
    }

    function getWelcomeMessage() {
        if (!currentContext) return "Hi! I'm your AI assistant. How can I help?";
        switch (currentContext.type) {
            case 'deal': return `I have full context on **${currentContext.dealName}** — financials, documents, team, and activity. What would you like to know?`;
            case 'dashboard': return "I can help you analyze your portfolio, spot trends, and surface insights across all your deals. What would you like to explore?";
            case 'contacts': return "I can help with relationship insights, suggest follow-ups, and analyze your network. What do you need?";
            case 'deals': return "I can help analyze your deal pipeline, compare deals, and identify patterns. What are you looking for?";
            default: return "Hi! I'm your AI assistant. Ask me anything about your deals, portfolio, or contacts.";
        }
    }

    function getContextIcon() {
        switch (currentContext?.type) {
            case 'deal': return 'work';
            case 'dashboard': return 'dashboard';
            case 'contacts': return 'groups';
            case 'deals': return 'filter_alt';
            case 'memo': return 'description';
            default: return 'auto_awesome';
        }
    }

    function getContextLabel() {
        switch (currentContext?.type) {
            case 'deal': return currentContext.dealName;
            case 'dashboard': return 'Portfolio';
            case 'contacts': return 'Contacts';
            case 'deals': return 'Deal Pipeline';
            case 'memo': return 'Memo';
            default: return 'General';
        }
    }

    // ── Styles ──────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('ai-assist-styles')) return;
        const style = document.createElement('style');
        style.id = 'ai-assist-styles';
        style.textContent = `
            #ai-assist-fab {
                position: fixed; bottom: 24px; right: 24px; z-index: 9970;
                width: 52px; height: 52px; border-radius: 16px;
                background: #003366; color: #fff; border: none;
                box-shadow: 0 4px 16px rgba(0,51,102,0.35), 0 0 0 0 rgba(0,51,102,0.2);
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #ai-assist-fab:hover {
                transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,51,102,0.4);
            }
            #ai-assist-fab:active { transform: scale(0.95); }
            #ai-assist-fab .material-symbols-outlined { font-size: 24px; }

            /* Pulse ring animation */
            #ai-assist-fab::before {
                content: ''; position: absolute; inset: -3px;
                border-radius: 19px; border: 2px solid rgba(0,51,102,0.3);
                animation: aiFabPulse 3s ease-in-out infinite;
            }
            @keyframes aiFabPulse {
                0%, 100% { opacity: 0; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
            }

            /* Drawer */
            #ai-assist-overlay {
                position: fixed; inset: 0; z-index: 9971;
                background: rgba(0,0,0,0.2); backdrop-filter: blur(2px);
                animation: aiFadeIn 0.15s ease-out;
            }
            @keyframes aiFadeIn { from { opacity: 0; } to { opacity: 1; } }

            #ai-assist-drawer {
                position: fixed; bottom: 24px; right: 24px; z-index: 9972;
                width: 400px; max-width: calc(100vw - 48px);
                height: 560px; max-height: calc(100vh - 48px);
                background: #fff; border-radius: 16px;
                box-shadow: 0 25px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05);
                display: flex; flex-direction: column; overflow: hidden;
                animation: aiDrawerIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes aiDrawerIn {
                from { opacity: 0; transform: translateY(16px) scale(0.95); }
                to { opacity: 1; transform: none; }
            }

            .ai-drawer-header {
                padding: 16px 16px 12px; border-bottom: 1px solid #E5E7EB;
                display: flex; align-items: center; justify-content: space-between;
                background: linear-gradient(135deg, #003366 0%, #004488 100%);
                color: #fff; border-radius: 16px 16px 0 0;
            }
            .ai-drawer-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
            .ai-drawer-context {
                font-size: 11px; font-weight: 500; opacity: 0.8;
                display: flex; align-items: center; gap: 4px; margin-top: 2px;
            }
            .ai-drawer-close {
                background: rgba(255,255,255,0.15); border: none; color: #fff;
                width: 28px; height: 28px; border-radius: 8px;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: background 0.15s;
            }
            .ai-drawer-close:hover { background: rgba(255,255,255,0.25); }

            .ai-messages {
                flex: 1; overflow-y: auto; padding: 16px;
                display: flex; flex-direction: column; gap: 12px;
            }
            .ai-messages::-webkit-scrollbar { width: 4px; }
            .ai-messages::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 2px; }

            .ai-msg {
                max-width: 85%; padding: 10px 14px;
                border-radius: 12px; font-size: 13px; line-height: 1.5;
                animation: aiMsgIn 0.2s ease-out;
            }
            @keyframes aiMsgIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            .ai-msg.assistant {
                align-self: flex-start; background: #F3F4F6; color: #111827;
                border-bottom-left-radius: 4px;
            }
            .ai-msg.user {
                align-self: flex-end; background: #003366; color: #fff;
                border-bottom-right-radius: 4px;
            }
            .ai-msg.assistant strong { color: #003366; }

            .ai-typing {
                align-self: flex-start; background: #F3F4F6;
                padding: 10px 18px; border-radius: 12px; border-bottom-left-radius: 4px;
                display: flex; gap: 4px;
            }
            .ai-typing span {
                width: 6px; height: 6px; background: #9CA3AF;
                border-radius: 50%; animation: aiTypingDot 1.4s ease-in-out infinite;
            }
            .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
            .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes aiTypingDot {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                30% { transform: translateY(-4px); opacity: 1; }
            }

            .ai-input-bar {
                padding: 12px 16px; border-top: 1px solid #E5E7EB;
                display: flex; gap: 8px; align-items: center;
                background: #FAFAFA;
            }
            .ai-input-bar input {
                flex: 1; border: 1px solid #E5E7EB; border-radius: 10px;
                padding: 10px 14px; font-size: 13px; color: #111827;
                background: #fff; outline: none; font-family: 'Inter', sans-serif;
                transition: border-color 0.15s;
            }
            .ai-input-bar input:focus { border-color: #003366; }
            .ai-input-bar input::placeholder { color: #9CA3AF; }
            .ai-send {
                width: 36px; height: 36px; border-radius: 10px;
                background: #003366; color: #fff; border: none;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all 0.15s; flex-shrink: 0;
            }
            .ai-send:hover { background: #004488; }
            .ai-send:disabled { opacity: 0.4; cursor: not-allowed; }
            .ai-send .material-symbols-outlined { font-size: 18px; }

            /* Hide FAB when drawer is open */
            #ai-assist-fab.hidden { display: none; }
        `;
        document.head.appendChild(style);
    }

    // ── Create FAB ──────────────────────────────────────
    function createFAB() {
        if (document.getElementById('ai-assist-fab')) return;
        injectStyles();

        const fab = document.createElement('button');
        fab.id = 'ai-assist-fab';
        fab.title = 'Ask AI (Shift+Space)';
        fab.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span>';
        fab.addEventListener('click', toggleDrawer);
        document.body.appendChild(fab);

        // Don't overlap with Feedback button — always position above it
        fab.style.bottom = '84px';
    }

    // ── Drawer ──────────────────────────────────────────
    function toggleDrawer() {
        if (isOpen) closeDrawer();
        else openDrawer();
    }

    function openDrawer() {
        currentContext = detectContext();
        isOpen = true;
        document.getElementById('ai-assist-fab')?.classList.add('hidden');

        // If no messages, add welcome
        if (messages.length === 0) {
            messages.push({ role: 'assistant', content: getWelcomeMessage() });
        }

        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'ai-assist-overlay';
        overlay.addEventListener('click', closeDrawer);
        document.body.appendChild(overlay);

        // Drawer
        const drawer = document.createElement('div');
        drawer.id = 'ai-assist-drawer';
        drawer.innerHTML = `
            <div class="ai-drawer-header">
                <div>
                    <div class="ai-drawer-title">
                        <span class="material-symbols-outlined" style="font-size:20px">auto_awesome</span>
                        AI Assistant
                    </div>
                    <div class="ai-drawer-context">
                        <span class="material-symbols-outlined" style="font-size:14px">${getContextIcon()}</span>
                        ${esc(getContextLabel())}
                    </div>
                </div>
                <button class="ai-drawer-close" id="ai-drawer-close">
                    <span class="material-symbols-outlined" style="font-size:16px">close</span>
                </button>
            </div>
            <div class="ai-messages" id="ai-messages">
                ${renderMessages()}
            </div>
            <div class="ai-input-bar">
                <input id="ai-input" type="text" placeholder="${getPlaceholder()}" autocomplete="off" />
                <button class="ai-send" id="ai-send" ${isLoading ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">send</span>
                </button>
            </div>
        `;
        document.body.appendChild(drawer);

        // Wire events
        document.getElementById('ai-drawer-close').addEventListener('click', closeDrawer);
        const input = document.getElementById('ai-input');
        const sendBtn = document.getElementById('ai-send');

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        sendBtn.addEventListener('click', sendMessage);

        setTimeout(() => input.focus(), 100);
        scrollToBottom();

        // Escape key
        document.addEventListener('keydown', handleDrawerEscape);
    }

    function closeDrawer() {
        const drawer = document.getElementById('ai-assist-drawer');
        const overlay = document.getElementById('ai-assist-overlay');
        if (drawer) drawer.remove();
        if (overlay) overlay.remove();
        isOpen = false;
        document.getElementById('ai-assist-fab')?.classList.remove('hidden');
        document.removeEventListener('keydown', handleDrawerEscape);
    }

    function handleDrawerEscape(e) {
        if (e.key === 'Escape') closeDrawer();
    }

    // ── Messages ────────────────────────────────────────
    function renderMessages() {
        return messages.map(m => {
            const content = m.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            return `<div class="ai-msg ${m.role}">${content}</div>`;
        }).join('');
    }

    function scrollToBottom() {
        const container = document.getElementById('ai-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function addMessage(role, content) {
        messages.push({ role, content });
        const container = document.getElementById('ai-messages');
        if (container) {
            container.innerHTML = renderMessages();
            scrollToBottom();
        }
    }

    function showTyping() {
        const container = document.getElementById('ai-messages');
        if (container) {
            container.insertAdjacentHTML('beforeend', '<div class="ai-typing" id="ai-typing"><span></span><span></span><span></span></div>');
            scrollToBottom();
        }
    }

    function hideTyping() {
        document.getElementById('ai-typing')?.remove();
    }

    // ── Send message ────────────────────────────────────
    async function sendMessage() {
        const input = document.getElementById('ai-input');
        const sendBtn = document.getElementById('ai-send');
        if (!input || isLoading) return;

        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        addMessage('user', text);
        isLoading = true;
        if (sendBtn) sendBtn.disabled = true;
        showTyping();

        try {
            let response;

            if (currentContext?.type === 'deal' && currentContext.dealId) {
                // Use deal chat API
                response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${currentContext.dealId}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text }),
                });
            } else {
                // Use portfolio/general AI endpoint
                response = await PEAuth.authFetch(`${API_BASE_URL}/ai/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, context: currentContext?.type || 'general' }),
                });
            }

            hideTyping();

            if (response.ok) {
                const data = await response.json();
                const aiText = data.response || data.message || data.reply || data.content || 'I received your message but couldn\'t generate a response.';
                addMessage('assistant', aiText);
            } else {
                const errData = await response.json().catch(() => ({}));
                addMessage('assistant', errData.error || 'Sorry, I encountered an error. Please try again.');
            }
        } catch (err) {
            hideTyping();
            addMessage('assistant', 'Sorry, I couldn\'t connect to the AI service. Please check your connection and try again.');
        } finally {
            isLoading = false;
            if (sendBtn) sendBtn.disabled = false;
            document.getElementById('ai-input')?.focus();
        }
    }

    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Keyboard shortcut ───────────────────────────────
    document.addEventListener('keydown', (e) => {
        // Shift+Space to toggle AI assistant (when not in an input)
        if (e.shiftKey && e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            toggleDrawer();
        }
    });

    // ── Init on page load ───────────────────────────────
    function init() {
        // Don't show on login/signup/onboarding pages
        const path = window.location.pathname;
        if (path.includes('login') || path.includes('signup') || path.includes('onboarding') ||
            path.includes('forgot-password') || path.includes('reset-password') ||
            path.includes('accept-invite') || path.includes('verify-email')) return;

        createFAB();
    }

    // Wait for layout to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

    window.AIAssistant = { open: openDrawer, close: closeDrawer, toggle: toggleDrawer };
})();
