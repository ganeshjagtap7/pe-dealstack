// Deal Documents — Document list, file uploads, previews, citations
// PE OS - AI-Powered Deal Analysis
// Depends on: state (from deal.js), showNotification (js/notifications.js), PEAuth (js/auth.js),
//   API_BASE_URL (js/config.js), formatFileSize/getDocIcon/getDocColor/escapeHtml/formatRelativeTime (js/formatters.js)

function updateDocumentsList(documents) {
    const docsContainer = document.getElementById('documents-list');
    if (!docsContainer) return;
    if (!documents || documents.length === 0) {
        docsContainer.innerHTML = '<p class="text-sm text-text-muted py-2">No documents uploaded yet.</p>';
        return;
    }

    docsContainer.innerHTML = documents.map(doc => {
        const color = getDocColor(doc.name);
        const sizeText = doc.fileSize ? formatFileSize(doc.fileSize) : 'AI Generated';
        const isGenerated = !doc.fileUrl && (doc.name.includes('Deal Overview') || doc.name.includes('Web Research'));
        const badge = isGenerated ? '<span class="text-[9px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 rounded ml-1">AI</span>' : '';
        return `
        <div class="flex items-center gap-3 p-2 pr-4 bg-white dark:bg-white/5 rounded-lg border border-border-subtle shrink-0 hover:border-primary/50 hover:bg-primary-light/30 cursor-pointer transition-colors group shadow-sm doc-preview-item" data-doc-id="${doc.id}" data-doc-name="${doc.name}" data-doc-url="${doc.fileUrl || ''}" data-doc-analysis="${doc.aiAnalysis ? 'true' : ''}">
            <div class="size-10 bg-${color}-50 dark:bg-${color}-950/30 rounded flex items-center justify-center text-${color}-500 group-hover:bg-${color}-100 dark:group-hover:bg-${color}-900/30 transition-colors">
                <span class="material-symbols-outlined">${getDocIcon(doc.name)}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-sm font-bold text-text-main flex items-center">${doc.name}${badge}</span>
                <span class="text-xs text-text-muted">${sizeText} - Added ${formatRelativeTime(doc.createdAt)}</span>
            </div>
        </div>
    `}).join('');

    // Add click handlers for document preview
    docsContainer.querySelectorAll('.doc-preview-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const docName = item.dataset.docName;
            const docUrl = item.dataset.docUrl;
            const docId = item.dataset.docId;
            const hasAnalysis = item.dataset.docAnalysis === 'true';

            if (docUrl && window.PEDocPreview) {
                window.PEDocPreview.preview(docUrl, docName);
            } else if (hasAnalysis || docName.includes('Deal Overview')) {
                // AI-generated doc — fetch and show analysis text
                fetchAndShowAnalysis(docId, docName);
            } else if (docId) {
                fetchAndPreviewDocument(docId, docName);
            } else {
                showNotification('Info', 'This is an AI-generated document', 'info');
            }
        });
    });
}

async function fetchAndShowAnalysis(docId, docName) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/documents/${docId}`);
        if (!response.ok) throw new Error('Failed to fetch document');
        const doc = await response.json();
        const text = doc.aiAnalysis || doc.extractedText || 'No content available';

        // Show in a simple modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6';
        overlay.innerHTML = `
            <div class="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div class="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-purple-500">summarize</span>
                        <h3 class="text-lg font-bold text-text-main">${escapeHtml(docName)}</h3>
                    </div>
                    <button class="close-modal size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
                        <span class="material-symbols-outlined text-text-muted">close</span>
                    </button>
                </div>
                <div class="p-6 overflow-y-auto custom-scrollbar">
                    <div class="prose dark:prose-invert max-w-none text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">${escapeHtml(text)}</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.close-modal').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (error) {
        console.error('Error fetching analysis:', error);
        showNotification('Error', 'Failed to load document', 'error');
    }
}

async function fetchAndPreviewDocument(docId, docName) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/documents/${docId}/download`);
        if (!response.ok) throw new Error('Failed to get document URL');

        const data = await response.json();
        if (data.url && window.PEDocPreview) {
            window.PEDocPreview.preview(data.url, docName);
        } else {
            showNotification('Error', 'Could not generate preview URL', 'error');
        }
    } catch (error) {
        console.error('Error fetching document:', error);
        showNotification('Error', 'Failed to load document', 'error');
    }
}

// ============================================================
// File Attachments
// ============================================================
function initFileAttachments() {
    const attachButton = document.getElementById('attach-file-btn');
    if (!attachButton) return;

    attachButton.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.xlsx,.xls,.csv,.doc,.docx';

        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                uploadFile(file);
            });
        });

        input.click();
    });

    // Remove file buttons
    document.querySelectorAll('.flex.items-center.gap-2.bg-slate-50 button').forEach(btn => {
        btn.addEventListener('click', function () {
            const fileChip = this.closest('.flex.items-center.gap-2');
            fileChip.style.transition = 'opacity 0.3s';
            fileChip.style.opacity = '0';
            setTimeout(() => fileChip.remove(), 300);
            showNotification('File Removed', 'Document removed from context', 'info');
        });
    });
}

async function uploadFile(file) {
    const container = document.getElementById('attached-files');
    const dealId = state.dealId;

    if (!dealId) {
        showNotification('Error', 'No deal selected', 'error');
        return;
    }

    // Create uploading indicator
    const uploadChip = document.createElement('div');
    uploadChip.className = 'flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 text-xs text-blue-600 animate-pulse';
    uploadChip.innerHTML = `
        <span class="material-symbols-outlined text-sm animate-spin">sync</span>
        Uploading ${file.name}...
    `;
    container.appendChild(uploadChip);

    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name);

        // Upload to deal documents API
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/documents`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
        }

        const uploadedDoc = await response.json();

        // Update chip to show success
        uploadChip.classList.remove('animate-pulse', 'bg-blue-50', 'text-blue-600', 'border-blue-100');
        uploadChip.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');

        const fileIcon = file.name.endsWith('.pdf') ? 'picture_as_pdf' :
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'table_chart' :
                file.name.endsWith('.csv') ? 'table_view' : 'description';
        const iconColor = file.name.endsWith('.pdf') ? 'red' :
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'emerald' : 'blue';

        uploadChip.innerHTML = `
            <span class="material-symbols-outlined text-${iconColor}-500 text-sm">${fileIcon}</span>
            ${file.name}
            <span class="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
        `;

        // Add to state's attached files
        state.attachedFiles.push({
            id: uploadedDoc.id,
            name: uploadedDoc.name,
            type: uploadedDoc.type
        });

        showNotification('Document Uploaded', `${file.name} uploaded and being processed for AI context`, 'success');

        // Show system message in chat
        addSystemMessage(`📄 ${file.name} uploaded. You can now ask questions about this document.`, 'attach_file');

        // Auto-extract financials if this is a financial document
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
        const isFinancialType = uploadedDoc.type === 'FINANCIALS' || uploadedDoc.type === 'CIM';
        if (isExcel || isFinancialType) {
            showNotification('Extracting Financials', `Running financial extraction on ${file.name}…`, 'info');
            // Small delay to let the DB record settle before extraction
            setTimeout(() => {
                if (typeof handleExtract === 'function') {
                    handleExtract(uploadedDoc.id);
                }
            }, 1500);
        }

        // Refresh the documents section after a brief delay (for embedding to complete)
        setTimeout(() => {
            loadDealData();
        }, 3000);

    } catch (error) {
        console.error('Upload error:', error);

        // Show error state
        uploadChip.classList.remove('animate-pulse', 'bg-blue-50', 'text-blue-600', 'border-blue-100');
        uploadChip.classList.add('bg-red-50', 'text-red-600', 'border-red-200');
        uploadChip.innerHTML = `
            <span class="material-symbols-outlined text-red-500 text-sm">error</span>
            Failed: ${file.name}
            <button class="hover:text-red-700 ml-1 transition-colors"><span class="material-symbols-outlined text-sm">close</span></button>
        `;

        uploadChip.querySelector('button').addEventListener('click', function () {
            uploadChip.style.transition = 'opacity 0.3s';
            uploadChip.style.opacity = '0';
            setTimeout(() => uploadChip.remove(), 300);
        });

        showNotification('Upload Failed', error.message || 'Could not upload file', 'error');
    }
}

// ============================================================
// Citation Buttons
// ============================================================
function initCitationButtons() {
    document.addEventListener('click', function (e) {
        const citationBtn = e.target.closest('.citation-btn, button[class*="Page"], button[class*="Section"]');
        if (citationBtn) {
            showDocumentReference(citationBtn);
        }
    });
}

function showDocumentReference(button) {
    const docType = button.getAttribute('data-doc') || 'document';
    const reference = button.textContent.trim();

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden animate-fadeIn">
            <div class="p-6 border-b border-slate-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">description</span>
                    <div>
                        <h3 class="font-bold text-slate-900">Document Reference</h3>
                        <p class="text-sm text-slate-600">${reference}</p>
                    </div>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                <div class="bg-slate-50 rounded-lg p-6 border border-slate-200">
                    <div class="bg-amber-50 border-l-4 border-amber-500 p-4 rounded mb-4">
                        <p class="text-sm text-amber-800 font-medium">Referenced Section: ${reference}</p>
                    </div>
                    <div class="prose prose-sm max-w-none">
                        <h4 class="font-bold text-slate-900 mb-3">Customer Concentration Analysis</h4>
                        <p class="text-slate-700 mb-3">
                            The company's revenue base shows moderate concentration risk. The top three customers
                            account for approximately <strong>45%</strong> of total recurring revenue as of Q3 2023.
                        </p>
                        <div class="bg-white rounded p-4 border border-slate-200 my-4">
                            <table class="w-full text-sm">
                                <thead class="border-b border-slate-200">
                                    <tr>
                                        <th class="text-left py-2">Customer</th>
                                        <th class="text-right py-2">% of Revenue</th>
                                        <th class="text-right py-2">Contract End</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b border-slate-100">
                                        <td class="py-2">GlobalShip Inc.</td>
                                        <td class="text-right">18%</td>
                                        <td class="text-right">Q2 2025</td>
                                    </tr>
                                    <tr class="border-b border-slate-100">
                                        <td class="py-2">FreightMax Corp</td>
                                        <td class="text-right">15%</td>
                                        <td class="text-right">Q4 2024</td>
                                    </tr>
                                    <tr>
                                        <td class="py-2">LogiPro Systems</td>
                                        <td class="text-right">12%</td>
                                        <td class="text-right">Q1 2025</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p class="text-slate-700 mb-3">
                            Management has indicated that all three key accounts have multi-year contracts with
                            auto-renewal clauses. Historical retention for enterprise customers exceeds 98%,
                            mitigating immediate churn risk.
                        </p>
                        <p class="text-slate-600 text-sm italic">
                            Source: Management Presentation v2, Page 14 | Q3 Financial Model, Tab "Customer Segmentation"
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// Document Previews
// ============================================================
function initDocumentPreviews() {
    document.querySelectorAll('.flex.items-center.gap-3.p-2').forEach(doc => {
        if (doc.classList.contains('cursor-pointer')) {
            doc.addEventListener('click', function () {
                const docName = this.querySelector('.text-sm.font-bold').textContent;
                showDocumentPreview(docName);
            });
        }
    });
}

function showDocumentPreview(docName) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden animate-fadeIn">
            <div class="p-6 border-b border-slate-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">${docName.endsWith('.pdf') ? 'picture_as_pdf' : 'table_view'}</span>
                    <div>
                        <h3 class="font-bold text-slate-900">${docName}</h3>
                        <p class="text-sm text-slate-600">Document Preview</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="downloadDocument('${docName}')" class="px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-[18px]">download</span>
                        Download
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)] bg-slate-50">
                <div class="bg-white rounded-lg shadow-inner p-8 max-w-4xl mx-auto">
                    <div class="prose prose-sm max-w-none">
                        <h2 class="text-2xl font-bold text-slate-900 mb-4">Q3 2023 Financial Summary</h2>
                        <p class="text-slate-600 mb-6"><em>Project Apex Logistics - Confidential</em></p>

                        <h3 class="text-lg font-bold text-slate-900 mt-6 mb-3">Revenue Performance</h3>
                        <p class="text-slate-700">
                            Q3 2023 revenue reached $32.5M, representing a 15% year-over-year increase.
                            The growth was primarily driven by enterprise customer expansion and new logo acquisition.
                        </p>

                        <div class="bg-slate-50 rounded p-4 my-4 border border-slate-200">
                            <p class="font-semibold text-slate-900 mb-2">Key Metrics:</p>
                            <ul class="space-y-1 text-sm text-slate-700">
                                <li>• LTM Revenue: $120M (+15% YoY)</li>
                                <li>• ARR: $115M (+18% YoY)</li>
                                <li>• EBITDA Margin: 22% (flat vs. Q2)</li>
                                <li>• Net Dollar Retention: 112%</li>
                            </ul>
                        </div>

                        <p class="text-slate-700 mt-4">
                            Customer retention remains strong at 94%, with enterprise segment showing 98% retention.
                            The slight decline in overall retention is attributed to planned migration of legacy SMB customers.
                        </p>

                        <p class="text-xs text-slate-500 mt-8 italic">
                            This is a preview. Download the full document for complete analysis.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function downloadDocument(docName) {
    showNotification('Download Started', `Downloading ${docName}...`, 'info');
}
