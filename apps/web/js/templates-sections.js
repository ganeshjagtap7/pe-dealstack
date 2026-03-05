/**
 * PE OS - Template Manager: Sections Module
 * Section rendering, inline editing, CRUD operations, and drag-and-drop reordering.
 * Globals: renderSections, addSection, resetAddSectionForm, editSection,
 *          cancelEditSection, saveSection, deleteSection,
 *          initDragAndDrop, initSectionDragAndDrop
 *
 * Depends on globals from templates.js: selectedTemplate, editingSection, draggedSection,
 *          templates, renderTemplates, renderEditor, deepClone
 * Depends on globals from templates-api.js: addSectionAPI, updateSectionAPI,
 *          deleteSectionAPI, reorderSectionsAPI
 */

// ============================================================
// Section Rendering
// ============================================================

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
