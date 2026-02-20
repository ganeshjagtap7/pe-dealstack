/**
 * PE OS - Template Manager
 * Firm-wide template management for memos, checklists, and sequences
 */

// Wait for layout to be ready before initializing
window.addEventListener('pe-layout-ready', function() {
    initTemplateManager();
});

// API Configuration
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

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

// Sample templates for fallback when API is not available
const SAMPLE_TEMPLATES = [
    {
        id: 'sample-1',
        name: 'SaaS LBO Standard Memo',
        description: 'Standardized investment committee memorandum for Series B+ SaaS companies.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: true,
        isLegacy: false,
        isActive: true,
        usageCount: 142,
        createdAt: '2023-10-24',
        sections: [
            { id: 's1', title: 'Executive Summary', description: 'High-level overview of the investment opportunity.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's2', title: 'Business Overview', description: 'Company background, products, and market position.', aiEnabled: true, mandatory: true, aiPrompt: 'Summarize the CIM provided by the target, focusing on ARR growth, net retention, and customer churn analysis.', sortOrder: 1 },
            { id: 's3', title: 'Market Analysis', description: 'TAM/SAM/SOM breakdown and competitive landscape.', aiEnabled: true, mandatory: false, aiPrompt: '', sortOrder: 2 },
            { id: 's4', title: 'Financial Performance', description: 'Historical financials and key metrics.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 3 },
            { id: 's5', title: 'Risk Assessment', description: 'Key risks and mitigating factors.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 4 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-2',
        name: 'Healthcare Services Bolt-on',
        description: 'Short-form memo template for add-on acquisitions under $50M EV.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 89,
        createdAt: '2023-09-12',
        sections: [
            { id: 's6', title: 'Executive Summary', description: 'Overview of the add-on opportunity.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's7', title: 'Strategic Rationale', description: 'Synergies and integration plan.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's8', title: 'Valuation', description: 'Purchase price and deal terms.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-3',
        name: 'Consumer Growth Equity',
        description: 'Focus on D2C metrics, CAC/LTV analysis, and brand sentiment.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 56,
        createdAt: '2023-11-02',
        sections: [
            { id: 's9', title: 'Executive Summary', description: 'Investment thesis summary.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's10', title: 'Brand Analysis', description: 'Brand positioning and customer sentiment.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's11', title: 'Unit Economics', description: 'CAC, LTV, and cohort analysis.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-4',
        name: 'Distressed Asset IC',
        description: 'Turnaround strategy outline including debt restructuring proposals.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: true,
        isActive: true,
        usageCount: 23,
        createdAt: '2023-06-15',
        sections: [
            { id: 's12', title: 'Situation Overview', description: 'Current state of the asset.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's13', title: 'Turnaround Plan', description: 'Operational and financial restructuring.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 1 },
        ],
        permissions: 'PARTNERS_ONLY'
    },
    {
        id: 'sample-5',
        name: 'Infra / Energy Transition',
        description: 'Focus on CAPEX requirements, regulatory approvals, and long-term yield.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 41,
        createdAt: '2023-08-30',
        sections: [
            { id: 's14', title: 'Project Overview', description: 'Infrastructure asset summary.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's15', title: 'Regulatory Analysis', description: 'Permits, approvals, and compliance.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's16', title: 'Financial Model', description: 'Cash flow projections and returns.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    }
];

// ============================================================
// API Functions
// ============================================================

async function fetchTemplates() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates`);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return data;
            }
            console.info('Templates API returned empty list, using sample templates for better UX');
            return SAMPLE_TEMPLATES;
        }
        throw new Error('Failed to fetch templates');
    } catch (error) {
        console.warn('Could not fetch templates from API, using samples:', error);
        return SAMPLE_TEMPLATES;
    }
}

async function createTemplateAPI(templateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to create template');
    } catch (error) {
        console.error('Error creating template:', error);
        return null;
    }
}

async function updateTemplateAPI(templateId, updateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to update template');
    } catch (error) {
        console.error('Error updating template:', error);
        return null;
    }
}

async function deleteTemplateAPI(templateId) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (error) {
        console.error('Error deleting template:', error);
        return false;
    }
}

async function addSectionAPI(templateId, sectionData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sectionData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to add section');
    } catch (error) {
        console.error('Error adding section:', error);
        return null;
    }
}

async function updateSectionAPI(templateId, sectionId, updateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to update section');
    } catch (error) {
        console.error('Error updating section:', error);
        return null;
    }
}

async function deleteSectionAPI(templateId, sectionId) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/${sectionId}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (error) {
        console.error('Error deleting section:', error);
        return false;
    }
}

async function reorderSectionsAPI(templateId, sections) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections })
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to reorder sections');
    } catch (error) {
        console.error('Error reordering sections:', error);
        return null;
    }
}

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
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const templateId = btn.dataset.templateId;
            const action = window.prompt('Type action: "duplicate" or "delete"');
            if (!action) return;
            const normalized = action.trim().toLowerCase();
            if (normalized === 'duplicate') {
                await duplicateTemplate(templateId);
            } else if (normalized === 'delete') {
                await deleteTemplateById(templateId);
            } else {
                showNotification('Unknown action', 'error');
            }
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

function renderEditor() {
    if (!selectedTemplate) return;

    // Update template name
    const nameInput = document.getElementById('editor-template-name');
    if (nameInput) {
        nameInput.value = selectedTemplate.name;
    }

    // Update active toggle
    const toggle = document.getElementById('template-active-toggle');
    if (toggle) {
        const knob = toggle.querySelector('span');
        if (selectedTemplate.isActive) {
            toggle.classList.remove('bg-border-subtle');
            toggle.classList.add('bg-secondary');
            knob.classList.remove('translate-x-1');
            knob.classList.add('translate-x-5');
        } else {
            toggle.classList.remove('bg-secondary');
            toggle.classList.add('bg-border-subtle');
            knob.classList.remove('translate-x-5');
            knob.classList.add('translate-x-1');
        }
    }

    // Update category
    const categorySelect = document.getElementById('template-category');
    if (categorySelect) {
        if (selectedTemplate.category === 'INVESTMENT_MEMO') categorySelect.selectedIndex = 0;
        else if (selectedTemplate.category === 'CHECKLIST') categorySelect.selectedIndex = 1;
        else if (selectedTemplate.category === 'OUTREACH') categorySelect.selectedIndex = 2;
    }

    // Update permissions
    const permissionsSelect = document.getElementById('template-permissions');
    if (permissionsSelect) {
        if (selectedTemplate.permissions === 'FIRM_WIDE') permissionsSelect.selectedIndex = 0;
        else if (selectedTemplate.permissions === 'PARTNERS_ONLY') permissionsSelect.selectedIndex = 1;
        else if (selectedTemplate.permissions === 'ANALYSTS_ONLY') permissionsSelect.selectedIndex = 2;
    }

    renderSections();
}

function renderSections() {
    const container = document.getElementById('sections-list');
    if (!container || !selectedTemplate) return;

    // Sort sections by sortOrder
    const sortedSections = [...(selectedTemplate.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder);

    container.innerHTML = sortedSections.map((section, index) => {
        const isEditing = editingSection === section.id;

        if (isEditing) {
            return `
                <div class="p-4 bg-surface-card rounded-lg border-2 border-primary shadow-sm">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-[18px]">edit</span>
                            <span class="text-sm font-bold text-primary">${section.title}</span>
                        </div>
                    </div>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-xs font-medium text-text-muted mb-1">Section Title</label>
                            <input id="edit-section-title" class="w-full text-sm border-border-subtle rounded-md shadow-sm focus:border-primary focus:ring-primary bg-background-body text-text-main px-3 py-2" type="text" value="${section.title}"/>
                        </div>
                        <div>
                            <label class="flex items-center gap-1 text-xs font-medium text-secondary mb-1">
                                <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
                                AI Prompt Configuration
                            </label>
                            <textarea id="edit-section-prompt" class="w-full text-xs border-secondary/30 rounded-md shadow-sm focus:border-secondary focus:ring-secondary bg-secondary-light/30 text-text-main resize-none p-2" placeholder="Describe how AI should populate this..." rows="3">${section.aiPrompt || ''}</textarea>
                        </div>
                        <div class="flex items-center gap-4 pt-1">
                            <label class="inline-flex items-center">
                                <input id="edit-section-mandatory" type="checkbox" ${section.mandatory ? 'checked' : ''} class="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"/>
                                <span class="ml-2 text-xs text-text-secondary">Mandatory Field</span>
                            </label>
                            <label class="inline-flex items-center">
                                <input id="edit-section-approval" type="checkbox" ${section.requiresApproval ? 'checked' : ''} class="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"/>
                                <span class="ml-2 text-xs text-text-secondary">Requires Approval</span>
                            </label>
                        </div>
                        <div class="flex justify-end gap-2 pt-2">
                            <button onclick="cancelEditSection()" class="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors">Cancel</button>
                            <button onclick="saveSection('${section.id}')" class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary-hover transition-colors">Save</button>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="section-item flex items-start gap-3 p-3 bg-background-body rounded-lg border border-border-subtle group hover:border-primary/30 transition-colors cursor-grab"
                 data-section-id="${section.id}"
                 data-sort-order="${section.sortOrder}"
                 draggable="true">
                <span class="drag-handle material-symbols-outlined text-text-muted text-[18px] mt-1 cursor-grab">drag_indicator</span>
                <div class="flex-1">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm font-semibold text-text-main cursor-pointer hover:text-primary" onclick="editSection('${section.id}')">${section.title}</span>
                        <button onclick="deleteSection('${section.id}')" class="material-symbols-outlined text-text-muted text-[16px] cursor-pointer hover:text-accent-danger opacity-0 group-hover:opacity-100 transition-opacity">delete</button>
                    </div>
                    <p class="text-xs text-text-muted mb-2">${section.description || ''}</p>
                    <div class="flex items-center gap-2">
                        ${section.aiEnabled ? '<span class="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium">AI Enabled</span>' : ''}
                        ${section.mandatory ? '<span class="bg-background-body text-text-muted text-[10px] px-1.5 py-0.5 rounded font-medium border border-border-subtle">Mandatory</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Re-initialize drag and drop for sections
    initSectionDragAndDrop();
}

// ============================================================
// Drag and Drop
// ============================================================

function initDragAndDrop() {
    // Template cards drag (future feature)
}

function initSectionDragAndDrop() {
    const container = document.getElementById('sections-list');
    if (!container) return;

    const items = container.querySelectorAll('.section-item');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedSection = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.sectionId);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.section-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedSection = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedSection) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (this === draggedSection || !selectedTemplate) return;

    const draggedId = e.dataTransfer.getData('text/plain');
    const targetId = this.dataset.sectionId;

    // Find sections
    const sections = selectedTemplate.sections;
    const draggedIndex = sections.findIndex(s => s.id === draggedId);
    const targetIndex = sections.findIndex(s => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder in array
    const [removed] = sections.splice(draggedIndex, 1);
    sections.splice(targetIndex, 0, removed);

    // Update sortOrder values
    sections.forEach((section, index) => {
        section.sortOrder = index;
    });

    // Re-render
    renderSections();

    // Save to API
    const reorderData = sections.map((s, i) => ({ id: s.id, sortOrder: i }));

    // Only call API if not using sample data
    if (!selectedTemplate.id.startsWith('sample-')) {
        const result = await reorderSectionsAPI(selectedTemplate.id, reorderData);
        if (result) {
            showNotification('Sections reordered', 'success');
        }
    } else {
        showNotification('Sections reordered (demo mode)', 'success');
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
// Modal Management
// ============================================================

function initModals() {
    // New Template Modal
    const newTemplateBtn = document.getElementById('new-template-btn');
    const newTemplateModal = document.getElementById('new-template-modal');
    const closeNewTemplateModal = document.getElementById('close-new-template-modal');
    const cancelNewTemplate = document.getElementById('cancel-new-template');
    const newTemplateBackdrop = document.getElementById('new-template-backdrop');
    const createTemplateBtn = document.getElementById('create-template-btn');

    newTemplateBtn?.addEventListener('click', openNewTemplateModal);
    closeNewTemplateModal?.addEventListener('click', closeNewTemplateModalFn);
    cancelNewTemplate?.addEventListener('click', closeNewTemplateModalFn);
    newTemplateBackdrop?.addEventListener('click', closeNewTemplateModalFn);
    createTemplateBtn?.addEventListener('click', createTemplate);

    // Add Section Modal
    const addSectionBtn = document.getElementById('add-section-btn');
    const addSectionModal = document.getElementById('add-section-modal');
    const closeAddSectionModal = document.getElementById('close-add-section-modal');
    const cancelAddSection = document.getElementById('cancel-add-section');
    const addSectionBackdrop = document.getElementById('add-section-backdrop');
    const confirmAddSection = document.getElementById('confirm-add-section');

    addSectionBtn?.addEventListener('click', () => openModal(addSectionModal));
    closeAddSectionModal?.addEventListener('click', () => closeModal(addSectionModal));
    cancelAddSection?.addEventListener('click', () => closeModal(addSectionModal));
    addSectionBackdrop?.addEventListener('click', () => closeModal(addSectionModal));
    confirmAddSection?.addEventListener('click', addSection);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeNewTemplateModalFn();
            closeModal(addSectionModal);
        }
    });
}

function openNewTemplateModal() {
    const modal = document.getElementById('new-template-modal');
    openModal(modal);
}

function closeNewTemplateModalFn() {
    const modal = document.getElementById('new-template-modal');
    closeModal(modal);
    // Reset form
    document.getElementById('new-template-name').value = '';
    document.getElementById('new-template-description').value = '';
}

function openModal(modal) {
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modal) {
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ============================================================
// Template CRUD
// ============================================================

async function createTemplate() {
    const name = document.getElementById('new-template-name').value.trim();
    const categorySelect = document.getElementById('new-template-category');
    const description = document.getElementById('new-template-description').value.trim();

    if (!name) {
        showNotification('Please enter a template name', 'error');
        return;
    }

    const categoryMap = {
        'investment-memo': 'INVESTMENT_MEMO',
        'checklist': 'CHECKLIST',
        'outreach': 'OUTREACH'
    };

    const templateData = {
        name,
        description: description || 'New template',
        category: categoryMap[categorySelect.value] || 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isActive: true,
        permissions: 'FIRM_WIDE'
    };

    // Try API first
    const apiTemplate = await createTemplateAPI(templateData);

    if (apiTemplate) {
        templates.unshift(apiTemplate);
        closeNewTemplateModalFn();
        selectTemplate(apiTemplate.id);
        showNotification('Template created successfully', 'success');
    } else {
        // Fallback to local creation
        const newTemplate = {
            id: `local-${Date.now()}`,
            ...templateData,
            usageCount: 0,
            createdAt: new Date().toISOString().split('T')[0],
            sections: [
                { id: `s-${Date.now()}`, title: 'Executive Summary', description: 'High-level overview.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 }
            ]
        };
        templates.unshift(newTemplate);
        closeNewTemplateModalFn();
        selectTemplate(newTemplate.id);
        showNotification('Template created (demo mode)', 'success');
    }
}

// ============================================================
// Section CRUD
// ============================================================

async function addSection() {
    if (!selectedTemplate) return;

    const title = document.getElementById('new-section-title').value.trim();
    const description = document.getElementById('new-section-description').value.trim();
    const aiEnabled = document.getElementById('new-section-ai').checked;
    const mandatory = document.getElementById('new-section-mandatory').checked;

    if (!title) {
        showNotification('Please enter a section title', 'error');
        return;
    }

    const maxSortOrder = Math.max(...(selectedTemplate.sections?.map(s => s.sortOrder) || [-1]), -1);

    const sectionData = {
        title,
        description: description || '',
        aiEnabled,
        mandatory,
        aiPrompt: '',
        sortOrder: maxSortOrder + 1
    };

    // Try API first
    if (!selectedTemplate.id.startsWith('sample-') && !selectedTemplate.id.startsWith('local-')) {
        const apiSection = await addSectionAPI(selectedTemplate.id, sectionData);
        if (apiSection) {
            selectedTemplate.sections.push(apiSection);
            closeModal(document.getElementById('add-section-modal'));
            renderSections();
            showNotification('Section added', 'success');
            resetAddSectionForm();
            return;
        }
    }

    // Fallback to local
    const newSection = {
        id: `s-${Date.now()}`,
        ...sectionData
    };

    selectedTemplate.sections = selectedTemplate.sections || [];
    selectedTemplate.sections.push(newSection);
    closeModal(document.getElementById('add-section-modal'));
    renderSections();
    showNotification('Section added (demo mode)', 'success');
    resetAddSectionForm();
}

function resetAddSectionForm() {
    document.getElementById('new-section-title').value = '';
    document.getElementById('new-section-description').value = '';
    document.getElementById('new-section-ai').checked = false;
    document.getElementById('new-section-mandatory').checked = false;
}

window.editSection = function(sectionId) {
    editingSection = sectionId;
    renderSections();
};

window.cancelEditSection = function() {
    editingSection = null;
    renderSections();
};

window.saveSection = async function(sectionId) {
    if (!selectedTemplate) return;

    const section = selectedTemplate.sections.find(s => s.id === sectionId);
    if (!section) return;

    const updateData = {
        title: document.getElementById('edit-section-title').value.trim(),
        aiPrompt: document.getElementById('edit-section-prompt').value.trim(),
        mandatory: document.getElementById('edit-section-mandatory').checked,
        requiresApproval: document.getElementById('edit-section-approval')?.checked || false
    };

    // Update local
    Object.assign(section, updateData);

    // Try API
    if (!selectedTemplate.id.startsWith('sample-') && !selectedTemplate.id.startsWith('local-')) {
        await updateSectionAPI(selectedTemplate.id, sectionId, updateData);
    }

    editingSection = null;
    renderSections();
    showNotification('Section updated', 'success');
};

window.deleteSection = async function(sectionId) {
    if (!selectedTemplate) return;
    if (!confirm('Are you sure you want to delete this section?')) return;

    // Try API
    if (!selectedTemplate.id.startsWith('sample-') && !selectedTemplate.id.startsWith('local-')) {
        const success = await deleteSectionAPI(selectedTemplate.id, sectionId);
        if (!success) {
            showNotification('Failed to delete section', 'error');
            return;
        }
    }

    selectedTemplate.sections = selectedTemplate.sections.filter(s => s.id !== sectionId);
    renderSections();
    showNotification('Section deleted', 'success');
};

// ============================================================
// Editor
// ============================================================

function initEditor() {
    // Active toggle
    const toggle = document.getElementById('template-active-toggle');
    toggle?.addEventListener('click', async () => {
        if (!selectedTemplate) return;
        selectedTemplate.isActive = !selectedTemplate.isActive;

        if (!selectedTemplate.id.startsWith('sample-') && !selectedTemplate.id.startsWith('local-')) {
            await updateTemplateAPI(selectedTemplate.id, { isActive: selectedTemplate.isActive });
        }

        renderEditor();
    });

    // Save button
    const saveBtn = document.getElementById('save-template-btn');
    saveBtn?.addEventListener('click', async () => {
        if (!selectedTemplate) return;

        const updateData = {
            name: document.getElementById('editor-template-name').value.trim()
        };
        if (!updateData.name) {
            showNotification('Template name cannot be empty', 'error');
            return;
        }

        const categorySelect = document.getElementById('template-category');
        if (categorySelect.selectedIndex === 0) updateData.category = 'INVESTMENT_MEMO';
        else if (categorySelect.selectedIndex === 1) updateData.category = 'CHECKLIST';
        else updateData.category = 'OUTREACH';

        const permissionsSelect = document.getElementById('template-permissions');
        if (permissionsSelect.selectedIndex === 0) updateData.permissions = 'FIRM_WIDE';
        else if (permissionsSelect.selectedIndex === 1) updateData.permissions = 'PARTNERS_ONLY';
        else updateData.permissions = 'ANALYSTS_ONLY';

        // Update local
        Object.assign(selectedTemplate, updateData);

        // Try API
        if (!selectedTemplate.id.startsWith('sample-') && !selectedTemplate.id.startsWith('local-')) {
            await updateTemplateAPI(selectedTemplate.id, updateData);
        }

        lastSavedSnapshot = deepClone(selectedTemplate);
        renderTemplates();
        showNotification('Template saved successfully', 'success');
    });

    // Cancel button
    const cancelBtn = document.getElementById('cancel-edit-btn');
    cancelBtn?.addEventListener('click', () => {
        if (!selectedTemplate || !lastSavedSnapshot) return;
        const idx = templates.findIndex(t => t.id === selectedTemplate.id);
        if (idx >= 0) {
            templates[idx] = deepClone(lastSavedSnapshot);
            selectedTemplate = templates[idx];
        }
        renderEditor();
        renderTemplates();
    });

    const previewBtn = document.getElementById('preview-template-btn');
    previewBtn?.addEventListener('click', () => {
        if (!selectedTemplate) return;
        openTemplatePreview(selectedTemplate);
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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all duration-300 translate-y-full opacity-0`;

    if (type === 'success') {
        notification.classList.add('bg-secondary', 'text-white');
    } else if (type === 'error') {
        notification.classList.add('bg-accent-danger', 'text-white');
    } else {
        notification.classList.add('bg-primary', 'text-white');
    }

    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';

    notification.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${icon}</span>
        <span class="text-sm font-medium">${message}</span>
    `;

    document.body.appendChild(notification);

    requestAnimationFrame(() => {
        notification.classList.remove('translate-y-full', 'opacity-0');
    });

    setTimeout(() => {
        notification.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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

async function duplicateTemplate(templateId) {
    const source = templates.find(t => t.id === templateId);
    if (!source) return;

    if (!source.id.startsWith('sample-') && !source.id.startsWith('local-')) {
        try {
            const res = await PEAuth.authFetch(`${API_BASE}/templates/${source.id}/duplicate`, { method: 'POST' });
            if (res.ok) {
                const duplicated = normalizeTemplate(await res.json());
                templates.unshift(duplicated);
                selectTemplate(duplicated.id);
                showNotification('Template duplicated', 'success');
                return;
            }
        } catch (error) {
            console.error('API duplicate failed, using local fallback:', error);
        }
    }

    const clone = deepClone(source);
    clone.id = `local-${Date.now()}`;
    clone.name = `${source.name} (Copy)`;
    clone.createdAt = new Date().toISOString().split('T')[0];
    clone.usageCount = 0;
    clone.sections = (clone.sections || []).map((s, i) => ({ ...s, id: `s-${Date.now()}-${i}` }));
    templates.unshift(clone);
    selectTemplate(clone.id);
    showNotification('Template duplicated (local)', 'success');
}

async function deleteTemplateById(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    if (!window.confirm(`Delete template "${template.name}"?`)) return;

    if (!template.id.startsWith('sample-') && !template.id.startsWith('local-')) {
        const deleted = await deleteTemplateAPI(template.id);
        if (!deleted) {
            showNotification('Failed to delete template', 'error');
            return;
        }
    }

    templates = templates.filter(t => t.id !== templateId);
    showNotification('Template deleted', 'success');
    ensureValidSelection();
    renderTemplates();
    if (selectedTemplate) renderEditor();
}

function openTemplatePreview(template) {
    const sections = [...(template.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const previewHtml = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${template.name} Preview</title></head>
<body style="font-family: Inter, Arial, sans-serif; margin: 24px; color:#111827;">
  <h1 style="margin-bottom:4px;">${template.name}</h1>
  <p style="color:#4B5563;margin-top:0;">${template.description || 'No description'}</p>
  <hr style="border:0;border-top:1px solid #E5E7EB;margin:16px 0;" />
  ${sections.map((s, i) => `
    <section style="margin-bottom:16px;">
      <h3 style="margin:0 0 6px 0;">${i + 1}. ${s.title}</h3>
      <p style="margin:0;color:#4B5563;">${s.description || 'No description'}</p>
    </section>
  `).join('')}
</body>
</html>`;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
        showNotification('Popup blocked. Please allow popups for preview.', 'error');
        return;
    }
    popup.document.open();
    popup.document.write(previewHtml);
    popup.document.close();
}

// ============================================================
// CSS for Drag and Drop
// ============================================================
const dragStyles = document.createElement('style');
dragStyles.textContent = `
    .section-item.dragging {
        opacity: 0.5;
        background-color: #E6EEF5;
    }
    .section-item.drag-over {
        border-top: 2px solid #003366;
        padding-top: 11px;
    }
    .section-item {
        transition: all 0.15s ease;
    }
`;
document.head.appendChild(dragStyles);

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
