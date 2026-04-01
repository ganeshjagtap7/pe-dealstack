/**
 * PE OS - Template Manager (Core)
 * State management, initialization, template grid rendering, tab/search/toolbar controls,
 * and shared utilities. Extracted modules:
 *   - js/templates-api.js      — SAMPLE_TEMPLATES + all API functions
 *   - js/templates-sections.js — Section rendering, CRUD, drag-and-drop
 *   - js/templates-editor.js   — Editor panel, modals, preview, template CRUD
 */

// Wait for layout to be ready before initializing
window.addEventListener('pe-layout-ready', function() {
    initTemplateManager();
});

// API_BASE_URL loaded from js/config.js
const API_BASE = API_BASE_URL;

// State
let templates = [];
let selectedTemplate = null;
let activeTab = 'investment-memos';
let editingSection = null;
let draggedSection = null;
let isLoading = false;
let searchQuery = '';
let showOnlyActive = false;
let sortByUsage = true;
let lastSavedSnapshot = null;

// ============================================================
// Initialization
// ============================================================

async function initTemplateManager() {
    showLoadingState();

    // Fetch templates from API
    templates = (await fetchTemplates()).map(normalizeTemplate);

    renderTemplates();
    initTabs();
    initModals();
    initEditor();
    initSearch();
    initToolbarControls();
    initDragAndDrop();

    selectFirstVisibleTemplate();

    hideLoadingState();
}

function showLoadingState() {
    isLoading = true;
    const grid = document.getElementById('templates-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-3 flex flex-col items-center justify-center py-12">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
                <p class="text-text-muted text-sm">Loading templates...</p>
            </div>
        `;
    }
}

function hideLoadingState() {
    isLoading = false;
}

// ============================================================
// Render Functions
// ============================================================

function renderTemplates() {
    const grid = document.getElementById('templates-grid');
    if (!grid) return;

    const visibleTemplates = getVisibleTemplates();

    let html = visibleTemplates.map(template => `
        <div class="template-card group bg-surface-card rounded-xl ${selectedTemplate?.id === template.id ? 'border-2 border-primary shadow-card-hover' : 'border border-border-subtle shadow-card hover:shadow-card-hover hover:border-primary/30'} overflow-hidden transition-all cursor-pointer relative"
             data-template-id="${template.id}">
            <div class="absolute top-3 right-3 z-10 ${selectedTemplate?.id === template.id ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                <button class="template-menu-btn h-8 w-8 bg-surface-card/90 backdrop-blur rounded-full flex items-center justify-center text-text-muted hover:text-primary transition-colors shadow-sm border border-border-subtle" data-template-id="${template.id}">
                    <span class="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
            </div>
            <div class="h-32 bg-background-body flex items-center justify-center relative overflow-hidden">
                <div class="w-3/4 h-[120%] bg-surface-card ${selectedTemplate?.id === template.id ? 'shadow-lg' : 'shadow-sm'} ${template.isGoldStandard ? 'rotate-[-2deg]' : ''} translate-y-4 rounded-t-sm border border-border-subtle p-3 ${selectedTemplate?.id === template.id ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'} transition-opacity">
                    <div class="h-2 w-1/3 bg-border-subtle rounded-sm mb-2"></div>
                    <div class="h-2 w-full bg-background-body rounded-sm mb-1"></div>
                    <div class="h-2 w-full bg-background-body rounded-sm mb-1"></div>
                    <div class="h-2 w-2/3 bg-background-body rounded-sm"></div>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
            </div>
            <div class="p-4">
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-semibold text-text-main text-base">${template.name}</h3>
                    ${template.isGoldStandard ? '<span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Gold Std</span>' : ''}
                    ${template.isLegacy ? '<span class="bg-accent-warning/10 text-accent-warning text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Legacy</span>' : ''}
                </div>
                <p class="text-xs text-text-muted mb-4 line-clamp-2">${template.description || ''}</p>
                <div class="flex items-center justify-between pt-3 border-t border-border-subtle">
                    <div class="flex items-center gap-1.5 text-xs text-text-muted">
                        <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                        ${formatDate(template.createdAt)}
                    </div>
                    <div class="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                        <span class="material-symbols-outlined text-[14px]">bar_chart</span>
                        ${template.usageCount || 0} Uses
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    if (visibleTemplates.length === 0) {
        html = `
            <div class="col-span-3 flex flex-col items-center justify-center py-14 text-center">
                <span class="material-symbols-outlined text-4xl text-text-muted mb-2">folder_open</span>
                <p class="text-sm font-medium text-text-main mb-1">No templates found</p>
                <p class="text-xs text-text-muted mb-4">Try a different tab/filter or create a new template.</p>
            </div>
        `;
    }

    // Add "Create from Scratch" card
    html += `
        <div id="create-from-scratch" class="group border-2 border-dashed border-border-subtle rounded-xl flex flex-col items-center justify-center text-text-muted hover:border-primary hover:text-primary hover:bg-primary-light/30 transition-all cursor-pointer min-h-[280px]">
            <div class="bg-background-body p-3 rounded-full mb-3 group-hover:bg-primary-light group-hover:text-primary transition-colors">
                <span class="material-symbols-outlined text-[24px]">add</span>
            </div>
            <span class="font-medium text-sm">Create from Scratch</span>
        </div>
    `;

    grid.innerHTML = html;

    // Add click handlers
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.template-menu-btn')) {
                selectTemplate(card.dataset.templateId);
            }
        });
    });

    document.querySelectorAll('.template-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const templateId = btn.dataset.templateId;

            // Remove any existing action menu
            document.getElementById('template-action-menu')?.remove();

            const rect = btn.getBoundingClientRect();
            const menu = document.createElement('div');
            menu.id = 'template-action-menu';
            menu.className = 'fixed z-[9999]';
            menu.style.top = `${rect.bottom + 4}px`;
            menu.style.left = `${rect.left - 100}px`;
            menu.innerHTML = `
                <div class="bg-white rounded-xl shadow-xl border border-gray-200 py-1 w-44 overflow-hidden">
                    <button data-action="duplicate" class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">content_copy</span>
                        Duplicate
                    </button>
                    <button data-action="delete" class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                        Delete
                    </button>
                </div>
            `;
            document.body.appendChild(menu);

            menu.querySelector('[data-action="duplicate"]').addEventListener('click', async () => {
                menu.remove();
                await duplicateTemplate(templateId);
            });
            menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                menu.remove();
                await deleteTemplateById(templateId);
            });

            // Close menu on outside click
            const closeMenu = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu, true);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
        });
    });

    document.getElementById('create-from-scratch')?.addEventListener('click', openNewTemplateModal);
}

function selectTemplate(templateId) {
    selectedTemplate = templates.find(t => t.id === templateId || t.id === String(templateId));
    if (!selectedTemplate) return;
    lastSavedSnapshot = deepClone(selectedTemplate);

    renderTemplates();
    renderEditor();

    // Show editor panel on mobile
    const editor = document.getElementById('template-editor');
    if (editor) {
        editor.classList.remove('hidden');
        editor.classList.add('flex');
    }
}

// ============================================================
// Tab Management
// ============================================================

function initTabs() {
    document.querySelectorAll('.template-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.template-tab').forEach(t => {
                t.classList.remove('border-primary', 'text-primary', 'font-semibold');
                t.classList.add('border-transparent', 'text-text-muted', 'font-medium');
            });
            tab.classList.remove('border-transparent', 'text-text-muted', 'font-medium');
            tab.classList.add('border-primary', 'text-primary', 'font-semibold');
            activeTab = tab.dataset.tab;
            renderTemplates();
            selectFirstVisibleTemplate();
        });
    });
}

// ============================================================
// Search
// ============================================================

function initSearch() {
    const searchInput = document.getElementById('template-search');

    searchInput?.addEventListener('input', (e) => {
        searchQuery = (e.target.value || '').toLowerCase().trim();
        renderTemplates();
        ensureValidSelection();
    });
}

function initToolbarControls() {
    const filterBtn = document.getElementById('filter-active-btn');
    const sortBtn = document.getElementById('sort-usage-btn');

    filterBtn?.addEventListener('click', () => {
        showOnlyActive = !showOnlyActive;
        filterBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">filter_list</span>Filter: ${showOnlyActive ? 'Active' : 'All'}`;
        renderTemplates();
        ensureValidSelection();
    });

    sortBtn?.addEventListener('click', () => {
        sortByUsage = !sortByUsage;
        sortBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">sort</span>Sort: ${sortByUsage ? 'Usage' : 'Newest'}`;
        renderTemplates();
        ensureValidSelection();
    });
}

// ============================================================
// Utilities
// ============================================================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getVisibleTemplates() {
    const categoryMap = {
        'investment-memos': 'INVESTMENT_MEMO',
        'diligence-checklists': 'CHECKLIST',
        'outreach-sequences': 'OUTREACH'
    };
    const targetCategory = categoryMap[activeTab];

    return templates
        .filter(t => t.category === targetCategory)
        .filter(t => !showOnlyActive || t.isActive)
        .filter(t => !searchQuery || t.name.toLowerCase().includes(searchQuery) || (t.description || '').toLowerCase().includes(searchQuery))
        .sort((a, b) => sortByUsage ? (b.usageCount || 0) - (a.usageCount || 0) : (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
}

function ensureValidSelection() {
    const visible = getVisibleTemplates();
    if (!selectedTemplate || !visible.some(t => t.id === selectedTemplate.id)) {
        if (visible.length > 0) selectTemplate(visible[0].id);
    }
}

function selectFirstVisibleTemplate() {
    const visible = getVisibleTemplates();
    if (visible.length > 0) {
        selectTemplate(visible[0].id);
    } else {
        selectedTemplate = null;
    }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeTemplate(template) {
    return {
        ...template,
        id: String(template.id),
        name: template.name || 'Untitled Template',
        description: template.description || '',
        category: template.category || 'INVESTMENT_MEMO',
        usageCount: Number(template.usageCount || 0),
        isActive: template.isActive !== false,
        permissions: template.permissions || 'FIRM_WIDE',
        sections: (template.sections || []).map((section, index) => ({
            ...section,
            id: String(section.id || `s-${Date.now()}-${index}`),
            title: section.title || `Section ${index + 1}`,
            description: section.description || '',
            aiEnabled: !!section.aiEnabled,
            mandatory: !!section.mandatory,
            sortOrder: Number(section.sortOrder ?? index),
        })),
    };
}

// ============================================================
// Export
// ============================================================
window.TemplateManager = {
    templates,
    selectedTemplate,
    selectTemplate,
    createTemplate,
    fetchTemplates
};
