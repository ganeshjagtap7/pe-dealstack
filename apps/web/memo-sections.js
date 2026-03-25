/**
 * PE OS - Memo Builder: Section Rendering & Actions
 * Handles document section rendering, table rendering, section buttons,
 * and all section CRUD actions (regenerate, edit, delete, add content, citations).
 *
 * Depends on: state (memo-builder.js), API functions (memo-api.js),
 *             renderMessages/renderPromptChips (memo-chat.js),
 *             showEditDataModal/showEditSectionModal/closeEditSectionModal (memo-editor.js)
 */

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
            content: `<p>I've regenerated the <strong>${section.title}</strong> section with updated analysis.</p>`,
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

async function showCitation(source, page) {
    // Try to open the actual document via authenticated download endpoint
    if (state.memo?.deal?.documents) {
        const doc = state.memo.deal.documents.find(d =>
            d.name.toLowerCase().includes(source.toLowerCase()) ||
            d.type.toLowerCase().includes(source.toLowerCase())
        );
        if (doc?.id && doc?.fileUrl) {
            try {
                const response = await PEAuth.authFetch(`${API_BASE_URL}/documents/${doc.id}/download`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.url) {
                        window.open(data.url, '_blank');
                        return;
                    }
                }
            } catch (err) {
                console.error('Failed to get signed URL for citation', err);
            }
        }
    }
    showNotification(`Source: ${source}, Page ${page} — Document viewer coming soon`, 'info');
}

console.log('PE OS Memo Sections module loaded');
