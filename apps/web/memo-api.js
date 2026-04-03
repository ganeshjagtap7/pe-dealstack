/**
 * PE OS - Memo Builder API Functions
 * All API call functions for memo CRUD, sections, chat, and AI status.
 * Depends on: js/config.js (API_BASE_URL), js/auth.js (PEAuth), js/formatters.js (formatRelativeTime)
 */

// ============================================================
// API Integration
// ============================================================

/**
 * Create a new memo via API
 * @param {Object} options - Memo creation options
 * @returns {Object|null} Created memo or null on failure
 */
async function createMemoAPI(options = {}) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: options.title || 'Investment Committee Memo',
                projectName: options.projectName || 'New Project',
                ...(options.dealId ? { dealId: options.dealId } : {}),
                ...(options.templateId ? { templateId: options.templateId } : {}),
                type: options.type || 'IC_MEMO',
                status: 'DRAFT',
                sponsor: options.sponsor || '',
                autoGenerate: options.autoGenerate !== undefined ? options.autoGenerate : !!options.dealId,
                templatePreset: options.templatePreset || 'comprehensive',
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Failed to create memo:', error);

            // Check if the error is because the table doesn't exist
            if (error.error?.includes('relation') || error.error?.includes('does not exist')) {
                console.warn('Memo tables not found. Please run the SQL migration.');
                showDatabaseSetupNotice();
            }
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating memo:', error);
        return null;
    }
}

/**
 * Show a notice when database tables are missing
 */
function showDatabaseSetupNotice() {
    // Only show once
    if (document.getElementById('db-setup-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'db-setup-notice';
    notice.className = 'fixed bottom-4 right-4 max-w-md bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-lg z-50';
    notice.innerHTML = `
        <div class="flex gap-3">
            <span class="material-symbols-outlined text-amber-600 shrink-0">database</span>
            <div class="flex-1">
                <h4 class="font-bold text-amber-800 mb-1">Database Setup Required</h4>
                <p class="text-sm text-amber-700 mb-2">
                    Memo tables not found. Run the migration script in Supabase SQL Editor.
                </p>
                <p class="text-xs text-amber-600">
                    File: <code class="bg-amber-100 px-1 rounded">add_memo_tables.sql</code>
                </p>
                <button onclick="this.closest('#db-setup-notice').remove()" class="mt-2 text-xs text-amber-600 hover:text-amber-800 underline">Dismiss</button>
            </div>
        </div>
    `;
    document.body.appendChild(notice);
}

/**
 * List all memos from API
 * @param {Object} filters - Optional filters (dealId, status, type)
 * @returns {Array} List of memos
 */
async function listMemosAPI(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.dealId) params.append('dealId', filters.dealId);
        if (filters.status) params.append('status', filters.status);
        if (filters.type) params.append('type', filters.type);

        const url = `${API_BASE_URL}/memos${params.toString() ? '?' + params.toString() : ''}`;
        const response = await PEAuth.authFetch(url);

        if (!response.ok) {
            console.error('Failed to list memos:', response.status);
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error('Error listing memos:', error);
        return [];
    }
}

/**
 * Create a new memo and load it
 * @param {Object} options - Memo creation options
 */
async function createNewMemo(options = {}) {
    const memo = await createMemoAPI(options);
    if (memo) {
        await loadMemoFromAPI(memo.id);
        updateURLWithMemoId(memo.id);
        return true;
    }
    return false;
}

/**
 * Update URL with memo ID without page reload
 */
function updateURLWithMemoId(memoId) {
    const url = new URL(window.location.href);
    url.searchParams.set('id', memoId);
    window.history.pushState({ memoId }, '', url);
}

async function loadMemoFromAPI(memoId) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${memoId}`);
        if (!response.ok) {
            console.error('Failed to load memo:', response.status);
            return false;
        }

        const memo = await response.json();

        // Transform API data to match our state structure
        state.memo = {
            id: memo.id,
            dealId: memo.dealId || null,
            title: memo.title,
            projectName: memo.projectName || memo.deal?.name || 'Untitled Project',
            type: memo.type,
            status: memo.status,
            lastEdited: formatRelativeTime(new Date(memo.updatedAt)),
            sponsor: memo.sponsor || '',
            date: memo.memoDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            collaborators: [],
        };

        state.sections = (memo.sections || []).map(s => ({
            id: s.id,
            type: s.type,
            title: s.title,
            sortOrder: s.sortOrder,
            aiGenerated: s.aiGenerated,
            content: s.content || '',
            hasTable: !!s.tableData,
            tableData: s.tableData,
            hasChart: !!s.chartConfig,
            chartConfig: s.chartConfig,
            citations: s.citations || [],
        })).sort((a, b) => a.sortOrder - b.sortOrder);

        // Load messages from conversation
        if (memo.conversations?.length > 0) {
            const latestConv = memo.conversations[0];
            state.messages = (latestConv.messages || []).map(m => ({
                id: m.id,
                role: m.role,
                content: m.content.startsWith('<') ? m.content : `<p>${m.content}</p>`,
                timestamp: formatTime(new Date(m.createdAt)),
            }));
        } else {
            // Add welcome message - AI status will be checked and updated later
            state.messages = [{
                id: 'welcome',
                role: 'assistant',
                content: `<p class="font-medium text-primary">Welcome to the Memo Builder</p>
                <p class="mt-2">I'm your AI Analyst, ready to help you create an investment memo for <strong>${state.memo.projectName}</strong>.</p>
                <p class="mt-2">Here's what I can help with:</p>
                <ul class="mt-1 list-disc pl-5 text-slate-600 text-sm">
                    <li><strong>Generate content</strong> - Click the refresh icon on any section</li>
                    <li><strong>Analyze data</strong> - Ask questions about financials or market dynamics</li>
                    <li><strong>Write sections</strong> - Request specific content like executive summaries or risk assessments</li>
                    <li><strong>Edit & refine</strong> - Ask me to rewrite for tone or add more detail</li>
                </ul>
                <p class="mt-3 text-xs text-slate-500">Type a message below or use the quick prompts to get started.</p>`,
                timestamp: formatTime(new Date()),
            }];
        }

        // Set active section
        state.activeSection = state.sections[1]?.id || state.sections[0]?.id || null;

        // Update header
        updateHeader();

        console.log('Memo loaded from API:', memo.id);
        return true;
    } catch (error) {
        console.error('Error loading memo from API:', error);
        return false;
    }
}

async function saveMemoToAPI() {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        console.log('Demo memo, not saving to API');
        return;
    }

    try {
        await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: state.memo.title,
                projectName: state.memo.projectName,
                status: state.memo.status,
            }),
        });
        console.log('Memo saved');
    } catch (error) {
        console.error('Error saving memo:', error);
    }
}

async function saveSectionToAPI(sectionId) {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        return;
    }

    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    try {
        await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: section.content,
                sortOrder: section.sortOrder,
            }),
        });
        console.log('Section saved:', sectionId);
    } catch (error) {
        console.error('Error saving section:', error);
    }
}

async function reorderSectionsAPI() {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        return;
    }

    try {
        await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sections: state.sections.map(s => ({ id: s.id, sortOrder: s.sortOrder })),
            }),
        });
        console.log('Sections reordered');
    } catch (error) {
        console.error('Error reordering sections:', error);
    }
}

async function regenerateSectionAPI(sectionId, customPrompt = null) {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        return null;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections/${sectionId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customPrompt }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to regenerate');
        }

        return await response.json();
    } catch (error) {
        console.error('Error regenerating section:', error);
        return null;
    }
}

async function sendChatMessageAPI(content, activeSectionId) {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        return null;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                activeSectionId: activeSectionId || undefined,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            // Handle specific error cases
            if (response.status === 503) {
                // AI not enabled - show friendly message
                return {
                    role: 'assistant',
                    content: `<p class="text-amber-600">AI features are not available. Please ensure OPENAI_API_KEY is configured in your environment.</p>`,
                    timestamp: new Date().toISOString(),
                };
            }
            throw new Error(error.error || 'Failed to send message');
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending chat message:', error);
        return null;
    }
}

/**
 * Check if AI is enabled on the server
 */
async function checkAIStatus() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/ai/status`);
        if (response.ok) {
            const data = await response.json();
            return data.enabled;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Generate all sections for an existing memo
 * POST /api/memos/:id/generate-all
 */
async function generateAllSectionsAPI(memoId) {
    if (!memoId || memoId.startsWith('demo-')) return null;
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${memoId}/generate-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) return await response.json();
        const err = await response.json().catch(() => ({}));
        console.error('[Memo] Generate-all failed:', err);
        return null;
    } catch (error) {
        console.error('[Memo] Generate-all error:', error);
        return null;
    }
}

/**
 * Apply a confirmed chat action to a section
 * POST /api/memos/:id/sections/:sectionId/apply
 */
async function applySectionActionAPI(memoId, sectionId, data) {
    if (!memoId || memoId.startsWith('demo-')) return null;
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${memoId}/sections/${sectionId}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (response.ok) return await response.json();
        console.error('[Memo] Apply section failed:', response.status);
        return null;
    } catch (error) {
        console.error('[Memo] Apply section error:', error);
        return null;
    }
}

console.log('PE OS Memo API module loaded');
