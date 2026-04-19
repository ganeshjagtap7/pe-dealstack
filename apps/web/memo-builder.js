/**
 * PE OS - Automated Investment Memo Builder
 * Main entry point: demo data, state, initialization, data loading,
 * sidebar rendering, event handlers, and drag & drop.
 *
 * Companion modules (loaded before this file):
 *   memo-api.js      — API call functions
 *   memo-chat.js     — Chat rendering and events
 *   memo-sections.js — Section rendering and section actions
 *   memo-editor.js   — Modal logic, export, AI panel resize/toggle
 */

// API_BASE_URL loaded from js/config.js

// ============================================================
// Demo Data (Project Apollo)
// ============================================================
const DEMO_MEMO = {
    id: 'demo-memo-1',
    title: 'Investment Committee Memo',
    projectName: 'Project Apollo',
    type: 'IC_MEMO',
    status: 'DRAFT',
    lastEdited: '2m ago',
    sponsor: 'J. Smith (MD)',
    date: 'October 24, 2023',
    collaborators: [
        { id: 'u1', name: 'Sarah Chen', avatar: null },
        { id: 'u2', name: 'Michael Torres', avatar: null },
    ],
    sections: [
        {
            id: 's1',
            type: 'EXECUTIVE_SUMMARY',
            title: 'Executive Summary',
            sortOrder: 0,
            aiGenerated: true,
            content: `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
                Project Apollo represents a unique opportunity to acquire a market-leading provider of enterprise SaaS solutions in the logistics vertical. The Company has demonstrated robust financial performance with a
                <span class="font-semibold text-slate-900">3-year revenue CAGR of 22%</span>
                <button class="citation-btn inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-blue-100 hover:text-blue-800 transition-colors align-top mx-0.5 border border-blue-100/50" data-source="CIM" data-page="14" title="Source: Confidential Information Memorandum p.14">
                    <span>CIM p.14</span>
                    <span class="material-symbols-outlined text-[10px]">open_in_new</span>
                </button>
                and industry-leading retention rates.
            </p>
            <p class="text-slate-800 leading-relaxed text-[15px]">
                We propose acquiring 100% of the equity for an enterprise value of <span class="font-semibold text-slate-900">$500M</span>, representing a 12.5x multiple on FY23 EBITDA. The transaction is expected to be funded through a combination of $250M of senior debt and $250M of equity from Fund IV.
            </p>`
        },
        {
            id: 's2',
            type: 'FINANCIAL_PERFORMANCE',
            title: 'Financial Performance',
            sortOrder: 1,
            aiGenerated: false,
            isActive: true,
            content: `<p class="text-slate-800 leading-relaxed text-[15px] mb-6">
                The Company has consistently outperformed budget expectations. Revenue increased by 15% in FY23, driven primarily by expansion into the APAC region and successful cross-selling of the new analytics module. EBITDA margins have expanded from 28% to 32% over the last 24 months.
            </p>`,
            hasTable: true,
            tableData: {
                headers: ['($ in Millions)', 'FY21A', 'FY22A', 'FY23E', 'FY24P'],
                rows: [
                    { metric: 'Total Revenue', values: ['$120.5', '$145.2', '$167.0', '$192.0'], highlight: 'FY23E' },
                    { metric: 'Growth %', values: ['-', '20.5%', '15.0%', '15.0%'], isSubMetric: true, highlight: 'FY23E' },
                    { metric: 'Gross Profit', values: ['$84.3', '$104.5', '$123.5', '$144.0'], highlight: 'FY23E' },
                    { metric: 'EBITDA', values: ['$33.7', '$43.5', '$53.4', '$63.4'], isBold: true, highlight: 'FY23E' },
                    { metric: 'Margin %', values: ['28.0%', '30.0%', '32.0%', '33.0%'], isSubMetric: true, highlight: 'FY23E' },
                ],
                footnote: 'Source: Management Presentation, Model V4.2'
            },
            hasChart: true,
            chartImage: null,
            chartCaption: 'Figure 1.2: Quarterly Revenue Growth',
            chartNote: 'Note: Q4 figures are projected.'
        },
        {
            id: 's3',
            type: 'MARKET_DYNAMICS',
            title: 'Market Dynamics',
            sortOrder: 2,
            aiGenerated: false,
            content: `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
                The global supply chain software market is expected to grow at a CAGR of 11.2% through 2028. Project Apollo operates in the highly fragmented "Last Mile" segment.
            </p>`,
            hasPlaceholder: true,
            placeholderText: 'Add Competitive Landscape Analysis'
        },
        {
            id: 's4',
            type: 'RISK_ASSESSMENT',
            title: 'Risk Assessment',
            sortOrder: 3,
            aiGenerated: false,
            content: `<p class="text-slate-800 leading-relaxed text-[15px]">
                Key risks include customer concentration (top 3 customers represent 35% of revenue), technology obsolescence risk, and integration complexity. Mitigants have been identified for each risk category.
            </p>`
        },
        {
            id: 's5',
            type: 'DEAL_STRUCTURE',
            title: 'Deal Structure',
            sortOrder: 4,
            aiGenerated: false,
            content: `<p class="text-slate-800 leading-relaxed text-[15px]">
                Proposed structure includes $250M senior secured debt (5.0x EBITDA) and $250M equity from Fund IV. Management rollover of 20% is expected, with standard reps, warranties, and indemnification provisions.
            </p>`
        }
    ]
};

const DEMO_MESSAGES = [
    {
        id: 'm1',
        role: 'assistant',
        content: `<p>I've drafted the <strong>Financial Performance</strong> section based on the Q3 Excel model ingestion. </p>
        <p class="mt-2">I noticed a significant margin expansion in Q3. Would you like me to add a breakdown of the cost-saving initiatives that drove this?</p>`,
        timestamp: '10:23 AM',
        quickActions: [
            { label: 'Yes, add breakdown', action: 'add_breakdown' },
            { label: 'No, keep it high-level', action: 'keep_highlevel' }
        ]
    },
    {
        id: 'm2',
        role: 'user',
        content: `<p>Please insert a chart comparing our Q3 growth against the key competitors mentioned in the CIM.</p>`,
        timestamp: '10:25 AM'
    },
    {
        id: 'm3',
        role: 'assistant',
        content: `<p>Done. I've pulled competitor data from Pitchbook and visualized the Q3 revenue growth comparison.</p>`,
        timestamp: 'Just now',
        sourceDoc: {
            name: 'Pitchbook_Competitive_Set_Q3.pdf',
            page: 4,
            table: 'Table 2.1',
            icon: 'picture_as_pdf'
        }
    }
];

// ============================================================
// State
// ============================================================
const state = {
    memo: null,
    sections: [],
    activeSection: null,
    messages: [],
    isDirty: false,
    isAIPanelOpen: true,
    draggedItem: null,
    editingSection: null,
    aiPanelWidth: 400, // Default width
    isResizing: false,
    undoStack: [],         // For undo on auto-applied changes (max 5)
    isGenerating: false,   // True during auto-generation
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('PE OS Memo Builder initialized');

    await PEAuth.initSupabase();
    const auth = await PEAuth.checkAuth();
    if (!auth) return;

    const urlParams = new URLSearchParams(window.location.search);
    const memoId = urlParams.get('id');
    const createNew = urlParams.get('new') === 'true';
    const dealId = urlParams.get('dealId');
    const projectName = urlParams.get('project');
    const templateId = urlParams.get('templateId');
    const demoMode = urlParams.get('demo') === 'true';

    if (demoMode) {
        loadDemoData();
    } else if (memoId) {
        showLoadingState('Loading memo...');
        let loaded = await loadMemoFromAPI(memoId);
        hideLoadingState();
        if (!loaded) {
            // The "id" might actually be a dealId (from deal chat link) — try to find/create memo for that deal
            console.log('[Memo] ID not found as memo, trying as dealId...');
            showLoadingState('Creating memo for deal...');
            const memos = await listMemosAPI({ dealId: memoId });
            if (memos.length > 0) {
                loaded = await loadMemoFromAPI(memos[0].id);
                hideLoadingState();
                if (loaded) {
                    updateURLWithMemoId(memos[0].id);
                } else {
                    showErrorState('Memo not found');
                    return;
                }
            } else {
                // No memo exists — create one with auto-generation
                hideLoadingState();
                showGeneratingOverlay();
                const created = await createNewMemo({ dealId: memoId, autoGenerate: true });
                hideGeneratingOverlay();
                if (!created) {
                    showErrorState('Failed to create memo');
                    return;
                }
            }
        }
    } else if (dealId) {
        showLoadingState('Loading memo...');
        const memos = await listMemosAPI({ dealId });
        hideLoadingState();

        if (memos.length > 1) {
            showMemoPicker(memos, dealId);
            return;
        } else if (memos.length === 1) {
            showLoadingState('Loading memo...');
            const loaded = await loadMemoFromAPI(memos[0].id);
            hideLoadingState();
            if (!loaded) {
                showErrorState('Failed to load memo');
                return;
            }
            updateURLWithMemoId(memos[0].id);
        } else {
            state.isGenerating = true;
            showGeneratingOverlay();
            const created = await createNewMemo({ dealId, autoGenerate: true });
            state.isGenerating = false;
            hideGeneratingOverlay();
            if (!created) {
                showErrorState('Failed to create memo. Make sure the memo database tables are set up.');
                return;
            }
        }
    } else if (createNew) {
        showLoadingState('Creating memo...');
        const created = await createNewMemo({
            projectName: projectName || 'New Investment Memo',
            templateId: templateId || undefined,
        });
        hideLoadingState();
        if (!created) {
            showErrorState('Failed to create memo');
            return;
        }
    } else {
        showErrorState('No deal or memo specified. Open this page from a deal.');
        return;
    }

    await autoGenerateIfEmpty();
    // Post proactive welcome with data completeness assessment
    await postProactiveWelcome();

    renderSidebar();
    renderSections();
    if (typeof renderChartsForAllSections === 'function') renderChartsForAllSections();
    renderMessages();
    renderPromptChips();

    setupEventHandlers();
    setupDragDrop();

    updateModeIndicators();
    // Calculate dynamic page count after content is rendered
    setTimeout(() => updatePageCount(), 300);
});

/**
 * Show a loading state overlay
 */
function showLoadingState(message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'fixed inset-0 bg-white/90 z-50 flex items-center justify-center';
    overlay.innerHTML = `
        <div class="flex flex-col items-center gap-4">
            <div class="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p class="text-slate-600 font-medium">${message}</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

/**
 * Hide the loading state overlay
 */
function hideLoadingState() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
}

function showErrorState(message = 'Failed to load memo') {
    const editor = document.getElementById('document-editor');
    if (editor) {
        editor.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center">
                <div class="size-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-red-500 text-3xl">error</span>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">${message}</h3>
                <p class="text-sm text-slate-500 mb-6 max-w-md">This could be because the memo tables haven't been set up yet, or the deal data is unavailable.</p>
                <div class="flex gap-3">
                    <button onclick="window.location.reload()" class="px-4 py-2 rounded-lg text-sm font-medium text-white" style="background:#003366">
                        <span class="material-symbols-outlined text-[16px] align-middle mr-1">refresh</span>Try Again
                    </button>
                    <button onclick="history.back()" class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Go Back
                    </button>
                </div>
            </div>
        `;
    }
}

function showMemoPicker(memos, dealId) {
    const overlay = document.createElement('div');
    overlay.id = 'memo-picker-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';

    const statusColors = {
        DRAFT: 'bg-amber-100 text-amber-700',
        REVIEW: 'bg-blue-100 text-blue-700',
        FINAL: 'bg-green-100 text-green-700',
        ARCHIVED: 'bg-gray-100 text-gray-500',
    };

    const memoCards = memos.map(m => {
        const sc = statusColors[m.status] || statusColors.DRAFT;
        const edited = m.updatedAt ? formatRelativeTime(new Date(m.updatedAt)) : 'Unknown';
        return `
            <button class="memo-pick-btn w-full text-left p-4 rounded-lg border border-slate-200 hover:border-primary/40 hover:shadow-sm transition-all group"
                    data-memo-id="${m.id}">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-slate-900 group-hover:text-primary transition-colors">${m.projectName || m.title || 'Untitled Memo'}</h4>
                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${sc}">${m.status}</span>
                </div>
                <p class="text-xs text-slate-500">${m.title || 'Investment Committee Memo'} &middot; Last edited ${edited}</p>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div class="px-6 py-5 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Select Memo</h3>
                <p class="text-sm text-slate-500 mt-1">This deal has ${memos.length} memos. Pick one to open or create a new one.</p>
            </div>
            <div class="p-6 flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
                ${memoCards}
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between">
                <button onclick="history.back()" class="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                <button id="create-new-memo-btn" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style="background:#003366">
                    <span class="material-symbols-outlined text-[16px]">add</span>
                    New Memo
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.memo-pick-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            overlay.remove();
            showLoadingState('Loading memo...');
            const loaded = await loadMemoFromAPI(btn.dataset.memoId);
            hideLoadingState();
            if (loaded) {
                updateURLWithMemoId(btn.dataset.memoId);
                renderSidebar();
                renderSections();
                renderMessages();
                renderPromptChips();
                setupEventHandlers();
                setupDragDrop();
                updateModeIndicators();
            } else {
                showErrorState('Failed to load memo');
            }
        });
    });

    document.getElementById('create-new-memo-btn').addEventListener('click', async () => {
        overlay.remove();
        state.isGenerating = true;
        showGeneratingOverlay();
        const created = await createNewMemo({ dealId });
        state.isGenerating = false;
        hideGeneratingOverlay();
        if (created) {
            renderSidebar();
            renderSections();
            renderMessages();
            renderPromptChips();
            setupEventHandlers();
            setupDragDrop();
            updateModeIndicators();
        } else {
            showErrorState('Failed to create memo');
        }
    });
}

// ============================================================
// Data Loading
// ============================================================
function loadDemoData() {
    state.memo = DEMO_MEMO;
    state.sections = [...DEMO_MEMO.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    state.messages = [...DEMO_MESSAGES];

    // Set active section
    const activeSection = state.sections.find(s => s.isActive) || state.sections[1];
    state.activeSection = activeSection?.id || null;

    // Update header
    updateHeader();
}

function updateHeader() {
    document.getElementById('memo-title').textContent = state.memo.projectName;
    document.getElementById('memo-type').textContent = state.memo.title;
    document.getElementById('memo-status').textContent = state.memo.status;
    document.getElementById('last-edited').textContent = `Last edited ${state.memo.lastEdited}`;
    document.getElementById('doc-title').textContent = state.memo.title;
    document.getElementById('doc-project').textContent = state.memo.projectName;
    document.getElementById('doc-date').textContent = `Date: ${state.memo.date}`;
    document.getElementById('doc-sponsor').textContent = `Sponsor: ${state.memo.sponsor}`;

    // Update breadcrumbs
    const trail = document.getElementById('breadcrumb-trail');
    if (trail) {
        const dealId = state.memo.dealId;
        const memoName = state.memo.projectName || 'Memo';
        if (dealId) {
            trail.innerHTML = `
                <a href="/crm.html" class="text-slate-400 hover:text-primary transition-colors">Deals</a>
                <span class="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                <a href="/deal.html?id=${dealId}" class="text-slate-500 hover:text-primary transition-colors">${memoName.split(' ')[0]}</a>
                <span class="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                <span class="text-slate-900 font-medium truncate max-w-[200px]">${memoName}</span>
            `;
        } else {
            trail.innerHTML = `
                <a href="/memo-builder.html" class="text-slate-400 hover:text-primary transition-colors">AI Reports</a>
                <span class="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                <span class="text-slate-900 font-medium truncate max-w-[200px]">${memoName}</span>
            `;
        }
    }
}

// ============================================================
// Sidebar Rendering
// ============================================================
function renderSidebar() {
    const container = document.getElementById('sections-outline');
    container.innerHTML = state.sections.map((section, index) => `
        <button class="section-item flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left group ${
            state.activeSection === section.id
                ? 'bg-white shadow-sm border border-slate-200 text-primary'
                : 'text-slate-700 hover:bg-slate-100'
        }"
        data-section-id="${section.id}"
        draggable="true">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined ${state.activeSection === section.id ? 'text-primary' : 'text-slate-400 group-hover:text-primary'} text-[18px]">drag_indicator</span>
                ${section.title}
            </div>
            ${state.activeSection === section.id ? '<div class="size-1.5 rounded-full bg-primary"></div>' : ''}
        </button>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.section-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.classList.contains('material-symbols-outlined')) return; // Ignore drag handle clicks
            const sectionId = btn.dataset.sectionId;
            setActiveSection(sectionId);
        });
    });
}

function setActiveSection(sectionId) {
    state.activeSection = sectionId;
    // Update sidebar highlighting
    document.querySelectorAll('[data-section-id]').forEach(el => {
        const isActive = el.dataset.sectionId === sectionId;
        el.classList.toggle('bg-blue-50', isActive);
        el.classList.toggle('border-l-2', isActive);
        el.classList.toggle('border-[#003366]', isActive);
    });
    // Update chat input placeholder
    const section = (state.sections || []).find(s => s.id === sectionId);
    const chatInput = document.getElementById('chat-input') || document.querySelector('textarea');
    if (chatInput && section) {
        chatInput.placeholder = `Ask about ${section.title}...`;
    }

    // Scroll to section in editor
    const sectionEl = document.querySelector(`[data-content-section="${sectionId}"]`);
    if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    renderSidebar();
}

// ============================================================
// Event Handlers
// ============================================================
function setupEventHandlers() {
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('close-ai-panel').addEventListener('click', toggleAIPanel);
    document.getElementById('expand-ai-panel').addEventListener('click', expandAIPanel);
    document.getElementById('export-btn').addEventListener('click', exportToPDF);
    document.getElementById('share-btn').addEventListener('click', shareMemo);
    setupExportDropdown();
    document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', handleFileAttachment);

    // Edit Data Modal
    ['close-edit-modal', 'cancel-edit-modal', 'edit-modal-backdrop'].forEach(id => document.getElementById(id).addEventListener('click', closeEditDataModal));
    document.getElementById('save-edit-modal').addEventListener('click', saveTableData);

    // Edit Section Content Modal
    ['close-edit-section', 'cancel-edit-section', 'edit-section-backdrop'].forEach(id => document.getElementById(id).addEventListener('click', closeEditSectionModal));
    document.getElementById('save-edit-section').addEventListener('click', saveSectionContent);

    // Add Section Modal
    document.getElementById('add-section-btn').addEventListener('click', showAddSectionModal);
    ['cancel-add-section', 'add-section-backdrop'].forEach(id => document.getElementById(id).addEventListener('click', closeAddSectionModal));
    document.getElementById('confirm-add-section').addEventListener('click', addNewSection);

    // Auto-fill title when section type changes
    document.getElementById('new-section-type').addEventListener('change', (e) => {
        const titleMap = { EXECUTIVE_SUMMARY: 'Executive Summary', COMPANY_OVERVIEW: 'Company Overview', FINANCIAL_PERFORMANCE: 'Financial Performance', MARKET_DYNAMICS: 'Market Dynamics', COMPETITIVE_LANDSCAPE: 'Competitive Landscape', RISK_ASSESSMENT: 'Risk Assessment', DEAL_STRUCTURE: 'Deal Structure', VALUE_CREATION: 'Value Creation', EXIT_STRATEGY: 'Exit Strategy', RECOMMENDATION: 'Recommendation', APPENDIX: 'Appendix', CUSTOM: '' };
        document.getElementById('new-section-title').value = titleMap[e.target.value] || '';
    });
    setupAIPanelResize();
}

// ============================================================
// Drag & Drop
// ============================================================
function setupDragDrop() {
    const container = document.getElementById('sections-outline');

    container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.section-item');
        if (!item) return;

        state.draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.section-item');
        if (item) {
            item.classList.remove('dragging');
        }
        state.draggedItem = null;

        // Remove all drag-over classes
        container.querySelectorAll('.section-item').forEach(el => {
            el.classList.remove('drag-over');
        });
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const dragging = container.querySelector('.dragging');

        if (!dragging) return;

        // Remove previous drag-over classes
        container.querySelectorAll('.section-item').forEach(el => {
            el.classList.remove('drag-over');
        });

        if (afterElement) {
            afterElement.classList.add('drag-over');
            container.insertBefore(dragging, afterElement);
        } else {
            container.appendChild(dragging);
        }
    });

    container.addEventListener('drop', async (e) => {
        e.preventDefault();

        // Update section order
        const items = container.querySelectorAll('.section-item');
        const newOrder = Array.from(items).map((item, index) => ({
            id: item.dataset.sectionId,
            sortOrder: index
        }));

        // Update state
        newOrder.forEach(({ id, sortOrder }) => {
            const section = state.sections.find(s => s.id === id);
            if (section) section.sortOrder = sortOrder;
        });

        state.sections.sort((a, b) => a.sortOrder - b.sortOrder);
        state.isDirty = true;

        // Re-render sections content
        renderSections();

        // Save to API
        await reorderSectionsAPI();

        console.log('Section order updated:', newOrder);
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.section-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ============================================================
// Generating Overlay
// ============================================================
function showGeneratingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'generating-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl p-8 shadow-2xl max-w-md text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-[#003366] border-t-transparent mx-auto mb-4"></div>
            <h3 class="text-lg font-semibold text-[#003366] mb-2">Generating Investment Memo</h3>
            <p class="text-sm text-gray-500" id="gen-status">Analyzing deal data and documents...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideGeneratingOverlay() {
    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.remove();
}

// ============================================================
// Undo Stack
// ============================================================
function pushUndo(sectionId, previousContent, previousTableData, previousChartConfig) {
    state.undoStack.push({ sectionId, previousContent, previousTableData, previousChartConfig, timestamp: Date.now() });
    if (state.undoStack.length > 5) state.undoStack.shift();
}

function popUndo() {
    return state.undoStack.pop();
}

// ============================================================
// Auto-generate content for empty sections
// ============================================================
async function autoGenerateIfEmpty() {
    if (!state.memo?.id || !state.memo?.dealId) return;

    // Trigger generation if no sections exist OR all sections are empty
    const allEmpty = state.sections.length === 0 || state.sections.every(s => !s.content || s.content.trim() === '');
    if (!allEmpty) return;

    console.log('[Memo] All sections empty — triggering auto-generation');
    state.isGenerating = true;
    showGeneratingOverlay();

    try {
        const result = await generateAllSectionsAPI(state.memo.id);
        if (result && result.completed > 0) {
            console.log('[Memo] Auto-generated', result.completed, 'sections');
            // Reload memo to get generated content
            await loadMemoFromAPI(state.memo.id);
        } else {
            console.log('[Memo] Auto-generation returned no content');
        }
    } catch (error) {
        console.error('[Memo] Auto-generation failed:', error);
    }

    state.isGenerating = false;
    hideGeneratingOverlay();
}

// ============================================================
// Proactive AI — Assess data completeness after memo load
// ============================================================
async function postProactiveWelcome() {
    if (!state.memo?.dealId) return;

    let deal = null;
    try {
        const resp = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.memo.dealId}`);
        if (resp.ok) deal = await resp.json();
    } catch (e) { /* ignore */ }

    if (!deal) return;

    const dealName = deal.name || state.memo.projectName || 'this deal';
    const docs = deal.documents || [];
    const docCount = docs.length;
    const hasRevenue = deal.revenue || deal.dealSize;
    const hasEbitda = deal.ebitda;

    const missing = [];
    if (!deal.industry) missing.push('**Industry** — needed for market dynamics section');
    if (!hasRevenue) missing.push('**Revenue / Deal Size** — needed for valuation analysis');
    if (!hasEbitda) missing.push('**EBITDA** — needed for financial performance and deal structure');
    if (docCount === 0) missing.push('**Documents** — upload CIMs, teasers, or models to the Data Room for richer analysis');

    const sectionCount = state.sections.filter(s => s.content && s.content.trim()).length;

    let messageHtml = `<p class="font-medium text-primary">Memo generated for ${dealName}</p>`;
    messageHtml += `<p class="mt-2">I've created <strong>${sectionCount} sections</strong>`;
    if (docCount > 0) messageHtml += ` using <strong>${docCount} documents</strong>`;
    messageHtml += ` from the deal data.</p>`;

    if (missing.length > 0) {
        messageHtml += `<p class="mt-3 font-medium text-amber-700">Missing data that would strengthen the memo:</p>`;
        messageHtml += `<ul class="mt-1 list-disc pl-5 text-sm text-slate-600">`;
        missing.forEach(m => { messageHtml += `<li>${m}</li>`; });
        messageHtml += `</ul>`;
        messageHtml += `<p class="mt-2 text-sm text-slate-500">You can add this data on the deal page or ask me to work with what we have.</p>`;
    } else {
        messageHtml += `<p class="mt-2 text-sm text-slate-500">All key data looks good. Ask me to refine sections, add charts, or rewrite for tone.</p>`;
    }

    if (state.messages.length <= 1) {
        state.messages = [{
            id: 'proactive-welcome',
            role: 'assistant',
            content: messageHtml,
            timestamp: formatTime(new Date()),
        }];
        renderMessages();
    }
}

// ============================================================
// Dynamic Page Count
// ============================================================
function updatePageCount() {
    const indicator = document.getElementById('page-indicator');
    if (!indicator) return;
    // Estimate pages based on content height (letter-size page ~1056px at 96 DPI)
    const content = document.getElementById('document-editor');
    if (!content) return;
    const pageHeight = 1056;
    const totalHeight = content.scrollHeight;
    const pageCount = Math.max(1, Math.ceil(totalHeight / pageHeight));
    indicator.textContent = `Page 1 of ${pageCount}`;
}

console.log('PE OS Memo Builder script loaded');
