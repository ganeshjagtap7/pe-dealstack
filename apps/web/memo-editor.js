/**
 * PE OS - Memo Builder: Editor Modals, Export & Panel Resize
 * Handles table data editing modal, section content editing modal,
 * add-section modal, PDF export, AI panel resize, and AI panel toggle.
 *
 * Depends on: state (memo-builder.js), renderSections/renderSidebar (memo-sections.js / memo-builder.js),
 *             renderMessages (memo-chat.js), saveSectionToAPI/regenerateSectionAPI (memo-api.js)
 */

// ============================================================
// Edit Data Modal (Table Editor)
// ============================================================
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

function closeEditDataModal() {
    document.getElementById('edit-data-modal').classList.add('hidden');
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

// ============================================================
// Edit Section Content Modal
// ============================================================
function showEditSectionModal(section) {
    const modal = document.getElementById('edit-section-modal');
    const title = document.getElementById('edit-section-title');
    const textarea = document.getElementById('edit-section-content');

    title.textContent = `Edit: ${section.title}`;

    // Convert HTML to plain text for editing (or show raw HTML)
    textarea.value = section.content || '';

    modal.classList.remove('hidden');
}

function closeEditSectionModal() {
    document.getElementById('edit-section-modal').classList.add('hidden');
    state.editingSection = null;
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

// ============================================================
// AI Panel Toggle
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

// ============================================================
// Export Dropdown
// ============================================================
function setupExportDropdown() {
    const dropdownBtn = document.getElementById('export-dropdown');
    const menu = document.getElementById('export-menu');
    if (!dropdownBtn || !menu) return;

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => menu.classList.add('hidden'));

    // Menu item handlers
    document.getElementById('export-pdf')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        exportToPDF();
    });
    document.getElementById('export-markdown')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        exportToMarkdown();
    });
    document.getElementById('export-clipboard')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        exportToClipboard();
    });
}

// ============================================================
// Export to PDF
// ============================================================
async function exportToPDF() {
    const btn = document.getElementById('export-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        if (typeof html2pdf === 'undefined') {
            throw new Error('PDF library not loaded. Please refresh and try again.');
        }

        const element = document.getElementById('memo-content');
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `${state.memo.projectName || 'IC_Memo'}_IC_Memo.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
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
        showNotification('Export Failed', error.message || 'Could not generate PDF. Please try again.', 'error');
    }
}

// ============================================================
// Export to Markdown
// ============================================================
function exportToMarkdown() {
    try {
        const sections = state.sections || [];
        const title = state.memo?.projectName || 'Investment Memo';
        let md = `# ${title} — Investment Committee Memo\n\n`;
        md += `**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n`;

        sections.forEach((section, i) => {
            md += `## ${i + 1}. ${section.title}\n\n`;
            if (section.content) {
                // Strip HTML tags for Markdown
                const text = section.content
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n\n')
                    .replace(/<\/li>/gi, '\n')
                    .replace(/<li>/gi, '- ')
                    .replace(/<\/h[1-6]>/gi, '\n')
                    .replace(/<h[1-6][^>]*>/gi, '### ')
                    .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
                    .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                md += text + '\n\n';
            }
            if (section.tableData) {
                const headers = section.tableData.headers || [];
                md += '| ' + headers.join(' | ') + ' |\n';
                md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
                (section.tableData.rows || []).forEach(row => {
                    md += '| ' + row.metric + ' | ' + (row.values || []).join(' | ') + ' |\n';
                });
                md += '\n';
            }
        });

        // Download as .md file
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}_IC_Memo.md`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Export Complete', 'Memo exported as Markdown.', 'success');
    } catch (error) {
        console.error('Markdown export error:', error);
        showNotification('Export Failed', 'Could not export Markdown.', 'error');
    }
}

// ============================================================
// Copy to Clipboard
// ============================================================
async function exportToClipboard() {
    try {
        const element = document.getElementById('memo-content');
        const text = element?.innerText || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        showNotification('Copied', 'Memo content copied to clipboard.', 'success');
    } catch (error) {
        console.error('Clipboard error:', error);
        showNotification('Copy Failed', 'Could not copy to clipboard.', 'error');
    }
}

// ============================================================
// Share Memo
// ============================================================
function shareMemo() {
    const memoUrl = window.location.href;
    const title = state.memo?.projectName || 'Investment Memo';

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(memoUrl).then(() => {
            showNotification('Link Copied', `Share link for "${title}" copied to clipboard.`, 'success');
        }).catch(() => {
            showNotification('Share', `Copy this link to share: ${memoUrl}`, 'info');
        });
    } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = memoUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Link Copied', `Share link for "${title}" copied to clipboard.`, 'success');
    }
}

// ============================================================
// Utility Functions
// ============================================================
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

console.log('PE OS Memo Editor module loaded');
