/**
 * PE OS - Template Manager: Editor, Modals & Preview
 * Handles the right-panel editor, template CRUD (create/duplicate/delete),
 * modal open/close, and the full-page template preview overlay.
 * Globals: renderEditor, initEditor, initModals, openNewTemplateModal,
 *          closeNewTemplateModalFn, openModal, closeModal, createTemplate,
 *          duplicateTemplate, deleteTemplateById, openTemplatePreview,
 *          useSelectedTemplate
 *
 * Depends on globals from templates.js: selectedTemplate, templates, lastSavedSnapshot,
 *          renderTemplates, ensureValidSelection, deepClone, normalizeTemplate
 * Depends on globals from templates-api.js: createTemplateAPI, updateTemplateAPI
 * Depends on globals from templates-sections.js: renderSections
 */

// ============================================================
// Editor Rendering
// ============================================================

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

// ============================================================
// Editor Initialization
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

    const useBtn = document.getElementById('use-template-btn');
    useBtn?.addEventListener('click', () => {
        if (!selectedTemplate) return;
        useSelectedTemplate();
    });
}

// ============================================================
// Modal Management
// ============================================================

function initModals() {
    // New Template Modal
    const newTemplateBtn = document.getElementById('new-template-btn');
    const newTemplateModal = document.getElementById('new-template-modal');
    const closeNewTemplateModalBtn = document.getElementById('close-new-template-modal');
    const cancelNewTemplate = document.getElementById('cancel-new-template');
    const newTemplateBackdrop = document.getElementById('new-template-backdrop');
    const createTemplateBtn = document.getElementById('create-template-btn');

    newTemplateBtn?.addEventListener('click', openNewTemplateModal);
    closeNewTemplateModalBtn?.addEventListener('click', closeNewTemplateModalFn);
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

// ============================================================
// Template Preview
// ============================================================

function openTemplatePreview(template) {
    const sections = [...(template.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder);

    const modal = document.getElementById('template-preview-modal');
    const title = document.getElementById('preview-modal-title');
    const content = document.getElementById('preview-modal-content');
    if (!modal || !title || !content) return;

    title.textContent = template.name;

    content.innerHTML = `
        <div class="mb-6">
            <h1 class="text-2xl font-bold text-text-main mb-1">${template.name}</h1>
            <p class="text-sm text-text-muted">${template.description || 'No description'}</p>
            <div class="flex items-center gap-3 mt-3">
                ${template.isGoldStandard ? '<span class="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">Gold Standard</span>' : ''}
                <span class="text-xs text-text-muted">${sections.length} sections</span>
                <span class="text-xs text-text-muted">${template.usageCount || 0} uses</span>
            </div>
        </div>
        <hr class="border-border-subtle mb-6" />
        ${sections.map((s, i) => `
            <div class="mb-4 pl-4 border-l-2 ${s.mandatory ? 'border-primary' : 'border-border-subtle'}">
                <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-sm font-bold text-text-main">${i + 1}. ${s.title}</h3>
                    ${s.aiEnabled ? '<span class="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium">AI</span>' : ''}
                    ${s.mandatory ? '<span class="bg-background-body text-text-muted text-[10px] px-1.5 py-0.5 rounded font-medium border border-border-subtle">Required</span>' : ''}
                </div>
                <p class="text-xs text-text-muted">${s.description || 'No description'}</p>
            </div>
        `).join('')}
    `;

    modal.classList.remove('hidden');

    // Wire up buttons
    const closePreviewModal = () => modal.classList.add('hidden');
    document.getElementById('preview-use-template-btn').onclick = () => {
        closePreviewModal();
        window.location.href = '/memo-builder.html?new=true&templateId=' + template.id;
    };
    document.getElementById('close-preview-modal').onclick = closePreviewModal;
    document.getElementById('preview-close-btn').onclick = closePreviewModal;
    document.getElementById('template-preview-backdrop').onclick = closePreviewModal;
}

function useSelectedTemplate() {
    if (!selectedTemplate) return;
    window.location.href = '/memo-builder.html?new=true&templateId=' + selectedTemplate.id;
}
