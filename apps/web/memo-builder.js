/**
 * PE OS - Automated Investment Memo Builder
 * Main JavaScript file for memo editing, AI chat, and document management
 */

const API_BASE_URL = 'http://localhost:3001/api';

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
        { id: 'u1', name: 'Sarah Chen', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDFSHjMJ9VxUdMFeXx4tKRpfKLJjL-H5Z8SZVtTFp9zX1rxtkTpy3KTkSdzabl2idECVCUKzNu9e10Pa4g3DFZvozoHAV4p0mzL0Elz-00J-Q8GNfm1AscvnzG8lYY6dD61u3QYMn8EAzJe2eybbh0HSMhhmQFUvL6mQyak72Pf31Wq8Ofh3nsp2li1W6-wtsnx-RmQNPGbvyYq1ui4C5tEVwCZ8b5NN97_1CyL2i76UgOcgLWJCT0h36fFKzEXWCNld0VG1kakYUA' },
        { id: 'u2', name: 'Michael Torres', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCuOCHCWbtO8KzFz5f8HO0E-uPd-FPegsqdkrbnj-5gNz_Mcmw9RomhrkKGPu1jDXAc4Qko9m-PP4voAYncq9h-jKps0BsTvzp6VlTkXkV3AGjjwCjXeHEJEnKv01lh1OT4_uwSd_XDrc1MbQxuX_VBZgaBcyFm3Rf1GpG0V9JWuXV2OU1h88eswvXO4xR7K41AM9Ljz28BI0BLsASYhMb0NB4P6-XdaxhVnA8KggpfXXnjfBmsC-GBfB-o9E_9iImbhgZOw6iXNOo' },
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
            chartImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcaI521dcrRKfCSoAHN-ltDG4p90UC1lCA0hfRQYs2XAiQuA7J_6EVFHBDz22ikOVZoV6jESQV0H2hpqtRtaZmwyTA2VZVLhNfmkR1Qy_CprLZ1tNvU80lKizEZj2Ab3ActdQeqUMhZ8pLYZeglfhzkSgw8WQDt46aUcIaEAMRZf8uf_ZMPAHjyabdDvrh_Ru03mwHw6nUOGOo0Kx9p3O1OI62Y_OdX68pwVaYXF4CE_ZpWH5f-GB8RPu6XBx-qvv7CMwD3gMiMPc',
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
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('PE OS Memo Builder initialized');

    // Initialize auth and check if user is logged in
    await PEAuth.initSupabase();
    const auth = await PEAuth.checkAuth();
    if (!auth) return; // Will redirect to login

    // Check for memo ID or action in URL
    const urlParams = new URLSearchParams(window.location.search);
    const memoId = urlParams.get('id');
    const createNew = urlParams.get('new') === 'true';
    const dealId = urlParams.get('dealId');
    const projectName = urlParams.get('project');

    if (memoId) {
        // Try to load memo from API
        const loaded = await loadMemoFromAPI(memoId);
        if (!loaded) {
            // Fall back to demo data
            console.log('Failed to load memo from API, using demo data');
            loadDemoData();
        }
    } else if (createNew) {
        // Create a new memo
        console.log('Creating new memo...');
        const created = await createNewMemo({
            dealId: dealId || undefined,
            projectName: projectName || (dealId ? undefined : 'New Project'),
        });
        if (!created) {
            console.log('Failed to create memo, using demo data');
            loadDemoData();
        }
    } else {
        // No ID or action provided, use demo data
        // In production, you might want to show a memo selector instead
        loadDemoData();
    }

    // Render UI
    renderSidebar();
    renderSections();
    renderMessages();

    // Setup event handlers
    setupEventHandlers();
    setupDragDrop();
});

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
                dealId: options.dealId || null,
                type: options.type || 'IC_MEMO',
                status: 'DRAFT',
                sponsor: options.sponsor || '',
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Failed to create memo:', error);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating memo:', error);
        return null;
    }
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
            state.messages = [];
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

async function sendChatMessageAPI(content) {
    if (!state.memo?.id || state.memo.id.startsWith('demo-')) {
        return null;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send message');
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending chat message:', error);
        return null;
    }
}

function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
    renderSidebar();

    // Scroll to section in editor
    const sectionEl = document.querySelector(`[data-content-section="${sectionId}"]`);
    if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================================
// Document Content Rendering
// ============================================================
function renderSections() {
    const container = document.getElementById('sections-content');
    container.innerHTML = state.sections.map((section, index) => renderSection(section, index)).join('');

    // Add event handlers for section buttons
    setupSectionButtons();
}

function renderSection(section, index) {
    const isActive = state.activeSection === section.id;

    let tableHtml = '';
    if (section.hasTable && section.tableData) {
        tableHtml = renderTable(section.tableData);
    }

    let chartHtml = '';
    if (section.hasChart) {
        chartHtml = `
            <div class="relative w-full h-64 rounded-lg bg-white border border-slate-200 overflow-hidden group/chart mb-2">
                <div class="absolute top-3 right-3 z-10 opacity-0 group-hover/chart:opacity-100 transition-opacity">
                    <button class="bg-white shadow border border-slate-200 rounded p-1.5 text-slate-500 hover:text-primary">
                        <span class="material-symbols-outlined text-[18px]">more_horiz</span>
                    </button>
                </div>
                <img alt="${section.chartCaption}" class="w-full h-full object-cover object-left-top opacity-90" src="${section.chartImage}"/>
                <div class="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-4 py-2 border-t border-slate-100">
                    <p class="text-xs font-semibold text-slate-700">${section.chartCaption}</p>
                </div>
            </div>
            ${section.chartNote ? `<p class="text-xs text-slate-400 italic mb-2">${section.chartNote}</p>` : ''}
        `;
    }

    let placeholderHtml = '';
    if (section.hasPlaceholder) {
        placeholderHtml = `
            <div class="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-center">
                <button class="add-content-btn inline-flex flex-col items-center gap-2 text-slate-400 hover:text-primary transition-colors group/add" data-section-id="${section.id}">
                    <div class="size-8 rounded-full bg-slate-200 flex items-center justify-center group-hover/add:bg-primary/10 transition-colors">
                        <span class="material-symbols-outlined group-hover/add:text-primary">add</span>
                    </div>
                    <span class="text-sm font-medium">${section.placeholderText}</span>
                </button>
            </div>
        `;
    }

    const sectionClasses = isActive
        ? 'border-l-2 border-primary/30 bg-primary/5 p-4 rounded-r-lg'
        : 'border-l-2 border-transparent hover:border-slate-200';

    return `
        <section class="group/section relative pl-4 -ml-4 ${sectionClasses} transition-colors" data-content-section="${section.id}">
            <div class="absolute -left-8 top-1 opacity-0 group-hover/section:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded">
                <span class="material-symbols-outlined text-slate-400 text-[20px]">drag_indicator</span>
            </div>

            <div class="flex justify-between items-start mb-3">
                <h2 class="text-xl font-bold text-[#0d131b] flex items-center gap-2">
                    ${index + 1}. ${section.title}
                    ${section.aiGenerated ? '<span class="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">AI Generated</span>' : ''}
                </h2>
                ${isActive ? `
                <div class="flex gap-1">
                    <button class="regenerate-btn p-1.5 rounded hover:bg-blue-100 text-primary hover:text-blue-800 transition-colors" data-section-id="${section.id}" title="Regenerate with AI">
                        <span class="material-symbols-outlined text-[16px]">refresh</span>
                    </button>
                    <button class="edit-content-btn p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors" data-section-id="${section.id}" title="Edit content">
                        <span class="material-symbols-outlined text-[16px]">edit_note</span>
                    </button>
                    ${section.hasTable ? `
                    <button class="edit-data-btn p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors" data-section-id="${section.id}" title="Edit table data">
                        <span class="material-symbols-outlined text-[16px]">table_chart</span>
                    </button>
                    ` : ''}
                    <button class="delete-section-btn p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" data-section-id="${section.id}" title="Delete section">
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                </div>
                ` : ''}
            </div>

            ${section.content}
            ${tableHtml}
            ${chartHtml}
            ${placeholderHtml}
        </section>
    `;
}

function renderTable(tableData) {
    const headerCells = tableData.headers.map((h, i) => {
        const isHighlight = h === 'FY23E';
        return `<th class="px-4 py-3 font-semibold ${i === 0 ? 'w-1/3' : 'text-right'} ${isHighlight ? 'text-primary bg-blue-50/50' : ''}">${h}</th>`;
    }).join('');

    const rows = tableData.rows.map(row => {
        const metricClass = row.isBold ? 'font-bold text-slate-900' : (row.isSubMetric ? 'pl-8 text-slate-500 italic' : 'font-medium text-slate-800');
        const rowClass = row.isBold ? 'hover:bg-slate-50/50 bg-slate-50/30' : 'hover:bg-slate-50/50';

        const valueCells = row.values.map((v, i) => {
            const isHighlightCol = tableData.headers[i + 1] === row.highlight;
            const valueClass = row.isBold ? 'text-slate-800' : (row.isSubMetric ? 'text-slate-500' : 'text-slate-600');
            return `<td class="px-4 py-2.5 text-right ${valueClass} font-mono ${isHighlightCol ? 'bg-blue-50/30' : ''} ${row.isBold && isHighlightCol ? 'font-bold text-slate-900' : ''}">${v}</td>`;
        }).join('');

        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2.5 ${metricClass}">${row.metric}</td>
                ${valueCells}
            </tr>
        `;
    }).join('');

    return `
        <div class="overflow-hidden border border-slate-200 rounded-lg bg-white shadow-sm mb-6">
            <table class="w-full text-sm text-left">
                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>${headerCells}</tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rows}
                </tbody>
            </table>
            <div class="bg-slate-50 border-t border-slate-200 px-4 py-2">
                <p class="text-[10px] text-slate-500">${tableData.footnote} <span class="underline cursor-pointer hover:text-primary ml-1">[Link to Source]</span></p>
            </div>
        </div>
    `;
}

function setupSectionButtons() {
    // Regenerate buttons
    document.querySelectorAll('.regenerate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.sectionId;
            regenerateSection(sectionId);
        });
    });

    // Edit content buttons
    document.querySelectorAll('.edit-content-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.sectionId;
            const section = state.sections.find(s => s.id === sectionId);
            if (section) {
                state.editingSection = section;
                showEditSectionModal(section);
            }
        });
    });

    // Edit data (table) buttons
    document.querySelectorAll('.edit-data-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.sectionId;
            editSectionData(sectionId);
        });
    });

    // Delete section buttons
    document.querySelectorAll('.delete-section-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.sectionId;
            deleteSection(sectionId);
        });
    });

    // Add content buttons (for placeholders)
    document.querySelectorAll('.add-content-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.sectionId;
            addSectionContent(sectionId);
        });
    });

    // Citation buttons
    document.querySelectorAll('.citation-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const source = btn.dataset.source;
            const page = btn.dataset.page;
            showCitation(source, page);
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
// Event Handlers
// ============================================================
function setupEventHandlers() {
    // Send message
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Prompt chips
    document.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.prompt;
            chatInput.value = prompt;
            chatInput.focus();
        });
    });

    // Close/Expand AI panel
    document.getElementById('close-ai-panel').addEventListener('click', toggleAIPanel);
    document.getElementById('expand-ai-panel').addEventListener('click', expandAIPanel);

    // Export PDF
    document.getElementById('export-btn').addEventListener('click', exportToPDF);

    // Share button
    document.getElementById('share-btn').addEventListener('click', () => {
        alert('Share functionality coming soon! This would open a modal to invite collaborators.');
    });

    // File attachment
    document.getElementById('attach-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', handleFileAttachment);

    // Edit Data Modal
    document.getElementById('close-edit-modal').addEventListener('click', closeEditDataModal);
    document.getElementById('cancel-edit-modal').addEventListener('click', closeEditDataModal);
    document.getElementById('edit-modal-backdrop').addEventListener('click', closeEditDataModal);
    document.getElementById('save-edit-modal').addEventListener('click', saveTableData);

    // Edit Section Content Modal
    document.getElementById('close-edit-section').addEventListener('click', closeEditSectionModal);
    document.getElementById('cancel-edit-section').addEventListener('click', closeEditSectionModal);
    document.getElementById('edit-section-backdrop').addEventListener('click', closeEditSectionModal);
    document.getElementById('save-edit-section').addEventListener('click', saveSectionContent);

    // Add Section Modal
    document.getElementById('add-section-btn').addEventListener('click', showAddSectionModal);
    document.getElementById('cancel-add-section').addEventListener('click', closeAddSectionModal);
    document.getElementById('add-section-backdrop').addEventListener('click', closeAddSectionModal);
    document.getElementById('confirm-add-section').addEventListener('click', addNewSection);

    // Auto-fill title when type changes
    document.getElementById('new-section-type').addEventListener('change', (e) => {
        const type = e.target.value;
        const titleMap = {
            'EXECUTIVE_SUMMARY': 'Executive Summary',
            'COMPANY_OVERVIEW': 'Company Overview',
            'FINANCIAL_PERFORMANCE': 'Financial Performance',
            'MARKET_DYNAMICS': 'Market Dynamics',
            'COMPETITIVE_LANDSCAPE': 'Competitive Landscape',
            'RISK_ASSESSMENT': 'Risk Assessment',
            'DEAL_STRUCTURE': 'Deal Structure',
            'VALUE_CREATION': 'Value Creation',
            'EXIT_STRATEGY': 'Exit Strategy',
            'RECOMMENDATION': 'Recommendation',
            'APPENDIX': 'Appendix',
            'CUSTOM': '',
        };
        document.getElementById('new-section-title').value = titleMap[type] || '';
    });

    // Setup AI panel resize
    setupAIPanelResize();
}

// ============================================================
// AI Panel Resize
// ============================================================
function setupAIPanelResize() {
    const resizeHandle = document.getElementById('ai-resize-handle');
    const aiPanel = document.getElementById('ai-panel');

    if (!resizeHandle || !aiPanel) return;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('aiPanelWidth');
    if (savedWidth) {
        state.aiPanelWidth = parseInt(savedWidth, 10);
        aiPanel.style.width = `${state.aiPanelWidth}px`;
    }

    let startX = 0;
    let startWidth = 0;

    const startResize = (e) => {
        e.preventDefault();
        state.isResizing = true;
        startX = e.clientX || e.touches?.[0]?.clientX || 0;
        startWidth = aiPanel.offsetWidth;

        document.body.classList.add('resizing-panel');
        aiPanel.classList.add('resizing');

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchmove', doResize);
        document.addEventListener('touchend', stopResize);
    };

    const doResize = (e) => {
        if (!state.isResizing) return;

        const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
        const diff = startX - clientX; // Inverted because we're dragging from right side
        let newWidth = startWidth + diff;

        // Constraints: min 280px, max 700px
        newWidth = Math.max(280, Math.min(700, newWidth));

        state.aiPanelWidth = newWidth;
        aiPanel.style.width = `${newWidth}px`;
    };

    const stopResize = () => {
        if (!state.isResizing) return;

        state.isResizing = false;
        document.body.classList.remove('resizing-panel');
        aiPanel.classList.remove('resizing');

        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('touchend', stopResize);

        // Save to localStorage
        localStorage.setItem('aiPanelWidth', state.aiPanelWidth.toString());
    };

    resizeHandle.addEventListener('mousedown', startResize);
    resizeHandle.addEventListener('touchstart', startResize);

    // Double-click to reset to default width
    resizeHandle.addEventListener('dblclick', () => {
        state.aiPanelWidth = 400;
        aiPanel.style.width = '400px';
        localStorage.setItem('aiPanelWidth', '400');
    });
}

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
// Section Actions
// ============================================================
async function regenerateSection(sectionId) {
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Show loading state
    const btn = document.querySelector(`.regenerate-btn[data-section-id="${sectionId}"]`);
    if (btn) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin">sync</span>`;
        btn.disabled = true;
    }

    // Add thinking message
    const thinkingMsgId = `m${Date.now()}`;
    state.messages.push({
        id: thinkingMsgId,
        role: 'assistant',
        content: `<p>Regenerating <strong>${section.title}</strong> content...</p>
        <div class="flex items-center gap-2 mt-2 text-slate-500">
            <span class="material-symbols-outlined text-[16px] animate-spin">sync</span>
            <span class="text-xs">Analyzing deal context and documents</span>
        </div>`,
        timestamp: 'Just now'
    });
    renderMessages();

    // Try real API first
    const apiResult = await regenerateSectionAPI(sectionId);

    // Remove thinking message
    state.messages = state.messages.filter(m => m.id !== thinkingMsgId);

    if (apiResult) {
        // Update section with API result
        section.content = apiResult.content;
        section.aiGenerated = true;
        renderSections();

        // Add success message
        state.messages.push({
            id: `m${Date.now()}`,
            role: 'assistant',
            content: `<p>Done! I've regenerated the <strong>${section.title}</strong> section using AI analysis of the available deal documents.</p>
            <p class="mt-2 text-xs text-slate-500">Review the content and use the edit button to make any adjustments.</p>`,
            timestamp: 'Just now'
        });
        renderMessages();
    } else {
        // Fall back to demo behavior with simulated content
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Generate demo content based on section type
        const demoContent = generateDemoContent(section.type, section.title);
        section.content = demoContent;
        section.aiGenerated = true;
        renderSections();

        state.messages.push({
            id: `m${Date.now()}`,
            role: 'assistant',
            content: `<p>I've regenerated the <strong>${section.title}</strong> section with updated analysis.</p>
            <p class="mt-2 text-xs text-amber-600">Note: Running in demo mode. Connect to API for real AI generation.</p>`,
            timestamp: 'Just now'
        });
        renderMessages();
    }
}

function generateDemoContent(type, title) {
    const contentMap = {
        'EXECUTIVE_SUMMARY': `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
            This opportunity represents a compelling investment thesis with strong fundamentals and attractive return potential.
            The company has demonstrated <strong>consistent growth</strong> and market leadership in its sector.
        </p>
        <p class="text-slate-800 leading-relaxed text-[15px]">
            Key highlights include robust revenue growth, expanding margins, and a defensible competitive position.
            The proposed transaction offers an attractive entry valuation with multiple value creation levers.
        </p>`,
        'FINANCIAL_PERFORMANCE': `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
            The company has delivered strong financial performance with revenue growing at a <strong>15-20% CAGR</strong> over the past three years.
            EBITDA margins have expanded from 25% to 32% through operational improvements.
        </p>
        <p class="text-slate-800 leading-relaxed text-[15px]">
            Cash flow generation remains robust, with conversion rates exceeding 90% of EBITDA.
            Working capital management has improved significantly.
        </p>`,
        'MARKET_DYNAMICS': `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
            The target market is large and growing, with an estimated TAM of <strong>$50B+</strong> and projected growth of 8-10% annually.
            Key growth drivers include digital transformation and increasing regulatory requirements.
        </p>
        <p class="text-slate-800 leading-relaxed text-[15px]">
            The competitive landscape remains fragmented, presenting consolidation opportunities.
        </p>`,
        'RISK_ASSESSMENT': `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
            Key risks have been identified and mitigants developed:
        </p>
        <ul class="list-disc pl-5 text-slate-700 space-y-2 text-[15px]">
            <li><strong>High:</strong> Customer concentration - top 3 customers represent 30% of revenue. Mitigant: Active pipeline diversification.</li>
            <li><strong>Medium:</strong> Technology obsolescence risk. Mitigant: Ongoing R&D investment roadmap.</li>
            <li><strong>Low:</strong> Regulatory changes. Mitigant: Compliance team in place.</li>
        </ul>`,
        'DEAL_STRUCTURE': `<p class="text-slate-800 leading-relaxed text-[15px] mb-4">
            Proposed transaction structure includes equity investment at an attractive multiple,
            with management rollover and appropriate governance rights.
        </p>
        <p class="text-slate-800 leading-relaxed text-[15px]">
            Debt financing package has been secured at competitive terms. Exit analysis suggests multiple paths to liquidity.
        </p>`,
    };

    return contentMap[type] || `<p class="text-slate-800 leading-relaxed text-[15px]">
        AI-generated content for "${title}" would be populated here based on deal data and documents.
        Click the edit button to customize this section.
    </p>`;
}

function editSectionData(sectionId) {
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    state.editingSection = section;

    // If section has table data, show table editor
    if (section.hasTable && section.tableData) {
        showEditDataModal(section);
    } else {
        // Otherwise show content editor
        showEditSectionModal(section);
    }
}

function showEditDataModal(section) {
    const modal = document.getElementById('edit-data-modal');
    const title = document.getElementById('edit-modal-title');
    const subtitle = document.getElementById('edit-modal-subtitle');
    const content = document.getElementById('edit-modal-content');

    title.textContent = `Edit ${section.title} Data`;
    subtitle.textContent = 'Modify table values below. Changes will be reflected in the memo.';

    // Render table editor
    const tableData = section.tableData;
    let tableHtml = `<div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse" id="edit-table">
            <thead>
                <tr class="bg-slate-100">
                    ${tableData.headers.map((h, i) => `
                        <th class="px-3 py-2 text-left font-semibold border border-slate-200 ${i === 0 ? 'bg-slate-50' : ''}">
                            ${i === 0 ? h : `<input type="text" value="${h}" class="w-full px-2 py-1 border border-slate-200 rounded text-center font-semibold bg-white" data-header="${i}">`}
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${tableData.rows.map((row, rowIdx) => `
                    <tr class="${row.isBold ? 'bg-slate-50 font-bold' : ''}">
                        <td class="px-3 py-2 border border-slate-200 bg-slate-50">
                            <input type="text" value="${row.metric}" class="w-full px-2 py-1 border border-slate-200 rounded ${row.isSubMetric ? 'pl-6 italic' : ''}" data-row="${rowIdx}" data-field="metric">
                        </td>
                        ${row.values.map((v, colIdx) => `
                            <td class="px-3 py-2 border border-slate-200">
                                <input type="text" value="${v}" class="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono" data-row="${rowIdx}" data-col="${colIdx}">
                            </td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    <div class="mt-4 flex gap-2">
        <button id="add-table-row" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-primary border border-slate-200 hover:border-primary rounded-lg transition-colors">
            <span class="material-symbols-outlined text-[14px]">add</span>
            Add Row
        </button>
    </div>
    <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Table Footnote</label>
        <input type="text" id="table-footnote" value="${tableData.footnote || ''}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
    </div>`;

    content.innerHTML = tableHtml;

    // Add row button handler
    document.getElementById('add-table-row')?.addEventListener('click', () => {
        const tbody = document.querySelector('#edit-table tbody');
        const colCount = tableData.headers.length;
        const newRowIdx = tableData.rows.length;
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td class="px-3 py-2 border border-slate-200 bg-slate-50">
                <input type="text" value="New Metric" class="w-full px-2 py-1 border border-slate-200 rounded" data-row="${newRowIdx}" data-field="metric">
            </td>
            ${Array(colCount - 1).fill(0).map((_, i) => `
                <td class="px-3 py-2 border border-slate-200">
                    <input type="text" value="$0" class="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono" data-row="${newRowIdx}" data-col="${i}">
                </td>
            `).join('')}
        `;
        tbody.appendChild(newRow);
    });

    modal.classList.remove('hidden');
}

function showEditSectionModal(section) {
    const modal = document.getElementById('edit-section-modal');
    const title = document.getElementById('edit-section-title');
    const textarea = document.getElementById('edit-section-content');

    title.textContent = `Edit: ${section.title}`;

    // Convert HTML to plain text for editing (or show raw HTML)
    textarea.value = section.content || '';

    modal.classList.remove('hidden');
}

function closeEditDataModal() {
    document.getElementById('edit-data-modal').classList.add('hidden');
    state.editingSection = null;
}

function closeEditSectionModal() {
    document.getElementById('edit-section-modal').classList.add('hidden');
    state.editingSection = null;
}

function saveTableData() {
    if (!state.editingSection) return;

    const section = state.editingSection;

    // Collect data from inputs
    const headerInputs = document.querySelectorAll('#edit-table thead input[data-header]');
    const newHeaders = [section.tableData.headers[0]]; // Keep first header
    headerInputs.forEach(input => {
        newHeaders.push(input.value);
    });

    const rowInputs = document.querySelectorAll('#edit-table tbody tr');
    const newRows = [];
    rowInputs.forEach((tr, rowIdx) => {
        const metricInput = tr.querySelector('[data-field="metric"]');
        const valueInputs = tr.querySelectorAll('[data-col]');
        const originalRow = section.tableData.rows[rowIdx] || {};

        newRows.push({
            metric: metricInput?.value || 'Metric',
            values: Array.from(valueInputs).map(input => input.value),
            isBold: originalRow.isBold || false,
            isSubMetric: originalRow.isSubMetric || false,
            highlight: originalRow.highlight,
        });
    });

    const footnote = document.getElementById('table-footnote')?.value || '';

    // Update section
    section.tableData = {
        headers: newHeaders,
        rows: newRows,
        footnote,
    };

    state.isDirty = true;

    // Re-render and close modal
    renderSections();
    closeEditDataModal();

    // Save to API if real memo
    saveSectionToAPI(section.id);

    // Show success message in chat
    state.messages.push({
        id: `m${Date.now()}`,
        role: 'assistant',
        content: `<p>I've updated the table data in the <strong>${section.title}</strong> section. The changes are now reflected in the memo.</p>`,
        timestamp: 'Just now'
    });
    renderMessages();
}

function saveSectionContent() {
    if (!state.editingSection) return;

    const section = state.editingSection;
    const textarea = document.getElementById('edit-section-content');
    const newContent = textarea.value;

    // Update section content
    section.content = newContent;
    state.isDirty = true;

    // Re-render
    renderSections();
    closeEditSectionModal();

    // Save to API
    saveSectionToAPI(section.id);

    // Show success in chat
    state.messages.push({
        id: `m${Date.now()}`,
        role: 'assistant',
        content: `<p>Content updated for <strong>${section.title}</strong>.</p>`,
        timestamp: 'Just now'
    });
    renderMessages();
}

// ============================================================
// Add Section Modal
// ============================================================
function showAddSectionModal() {
    const modal = document.getElementById('add-section-modal');
    document.getElementById('new-section-type').value = 'CUSTOM';
    document.getElementById('new-section-title').value = '';
    document.getElementById('new-section-ai').checked = false;
    modal.classList.remove('hidden');
}

function closeAddSectionModal() {
    document.getElementById('add-section-modal').classList.add('hidden');
}

async function addNewSection() {
    const type = document.getElementById('new-section-type').value;
    const title = document.getElementById('new-section-title').value.trim();
    const generateAI = document.getElementById('new-section-ai').checked;

    if (!title) {
        alert('Please enter a section title');
        return;
    }

    // Create new section
    const newSection = {
        id: `s${Date.now()}`,
        type,
        title,
        sortOrder: state.sections.length,
        aiGenerated: generateAI,
        content: generateAI ? '' : '<p>Enter your content here...</p>',
    };

    // Add to state
    state.sections.push(newSection);
    state.isDirty = true;

    // Close modal
    closeAddSectionModal();

    // Re-render
    renderSidebar();
    renderSections();

    // Set as active
    setActiveSection(newSection.id);

    // If not demo mode, save to API
    if (!state.memo.id.startsWith('demo-')) {
        try {
            const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    title,
                    content: newSection.content,
                    aiGenerated: generateAI,
                }),
            });

            if (response.ok) {
                const savedSection = await response.json();
                // Update local section with server ID
                newSection.id = savedSection.id;
                console.log('Section saved to API:', savedSection.id);

                // If AI generation requested, call generate endpoint
                if (generateAI) {
                    regenerateSection(savedSection.id);
                }
            }
        } catch (error) {
            console.error('Error saving section:', error);
        }
    } else if (generateAI) {
        // Demo mode AI generation
        setTimeout(() => {
            const section = state.sections.find(s => s.id === newSection.id);
            if (section) {
                section.content = `<p>AI-generated content for "${title}" would appear here. This is a demo preview.</p>
                <p>In production, this would call the AI API to generate professional content based on the deal context and data room documents.</p>`;
                section.aiGenerated = true;
                renderSections();
            }
        }, 1500);
    }

    // Show success in chat
    state.messages.push({
        id: `m${Date.now()}`,
        role: 'assistant',
        content: `<p>I've added a new <strong>${title}</strong> section to your memo.${generateAI ? ' Generating AI content...' : ' Click on it to add content.'}</p>`,
        timestamp: 'Just now'
    });
    renderMessages();
}

// ============================================================
// Delete Section
// ============================================================
async function deleteSection(sectionId) {
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    if (!confirm(`Are you sure you want to delete the "${section.title}" section? This cannot be undone.`)) {
        return;
    }

    // Remove from state
    state.sections = state.sections.filter(s => s.id !== sectionId);

    // Update sortOrders
    state.sections.forEach((s, i) => s.sortOrder = i);

    state.isDirty = true;

    // Set new active section
    if (state.activeSection === sectionId) {
        state.activeSection = state.sections[0]?.id || null;
    }

    // Re-render
    renderSidebar();
    renderSections();

    // Delete from API if not demo
    if (!state.memo.id.startsWith('demo-')) {
        try {
            await PEAuth.authFetch(`${API_BASE_URL}/memos/${state.memo.id}/sections/${sectionId}`, {
                method: 'DELETE',
            });
            console.log('Section deleted from API');
        } catch (error) {
            console.error('Error deleting section:', error);
        }
    }

    // Show in chat
    state.messages.push({
        id: `m${Date.now()}`,
        role: 'assistant',
        content: `<p>Removed the <strong>${section.title}</strong> section from the memo.</p>`,
        timestamp: 'Just now'
    });
    renderMessages();
}

function addSectionContent(sectionId) {
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Simulate adding content
    state.messages.push({
        id: `m${Date.now()}`,
        role: 'assistant',
        content: `<p>I'll generate a <strong>${section.placeholderText}</strong> for you. Analyzing competitor data from the CIM and Pitchbook...</p>`,
        timestamp: 'Just now'
    });
    renderMessages();

    setTimeout(() => {
        section.hasPlaceholder = false;
        section.content += `
            <div class="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-slate-800 mb-2">Competitive Landscape Analysis</h4>
                <p class="text-sm text-slate-600">The market includes 5 major competitors with Project Apollo holding the #2 position by revenue. Key differentiators include superior technology stack and customer retention rates 15% above industry average.</p>
            </div>
        `;
        section.aiGenerated = true;
        renderSections();

        state.messages.push({
            id: `m${Date.now()}`,
            role: 'assistant',
            content: `<p>Done! I've added a Competitive Landscape Analysis based on data from the CIM and Pitchbook reports.</p>`,
            timestamp: 'Just now'
        });
        renderMessages();
    }, 2500);
}

function showCitation(source, page) {
    alert(`Citation Source: ${source}\nPage: ${page}\n\nThis would open the source document viewer focused on page ${page}.`);
}

// ============================================================
// Export
// ============================================================
async function exportToPDF() {
    const btn = document.getElementById('export-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const element = document.getElementById('memo-content');
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `${state.memo.projectName}_IC_Memo.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(element).save();

        // Show success
        btn.textContent = 'Exported!';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('Export error:', error);
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Export failed. Please try again.');
    }
}

// ============================================================
// UI Helpers
// ============================================================
function toggleAIPanel() {
    const panel = document.getElementById('ai-panel');
    const collapsedPanel = document.getElementById('ai-panel-collapsed');
    const resizeHandle = document.getElementById('ai-resize-handle');
    state.isAIPanelOpen = !state.isAIPanelOpen;

    if (state.isAIPanelOpen) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        panel.style.width = `${state.aiPanelWidth}px`;
        collapsedPanel.classList.add('hidden');
        collapsedPanel.classList.remove('flex');
        if (resizeHandle) resizeHandle.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        collapsedPanel.classList.remove('hidden');
        collapsedPanel.classList.add('flex');
        if (resizeHandle) resizeHandle.classList.add('hidden');
    }
}

function expandAIPanel() {
    state.isAIPanelOpen = true;
    const panel = document.getElementById('ai-panel');
    const collapsedPanel = document.getElementById('ai-panel-collapsed');
    const resizeHandle = document.getElementById('ai-resize-handle');

    panel.classList.remove('hidden');
    panel.classList.add('flex');
    panel.style.width = `${state.aiPanelWidth}px`;
    collapsedPanel.classList.add('hidden');
    collapsedPanel.classList.remove('flex');
    if (resizeHandle) resizeHandle.classList.remove('hidden');
}

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
// Utility Functions
// ============================================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

console.log('PE OS Memo Builder script loaded');
