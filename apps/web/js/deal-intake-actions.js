/**
 * PE OS - Deal Intake Modal: Submission & Preview
 * Handles file upload, text extraction, URL scraping, and result display.
 * Depends on: deal-intake-template.js (globals, formatCurrencyValue)
 * Provides: handleIntakeFileSelect(), clearIntakeFile(), intakeUploadFile(),
 *           intakeUploadDirect(), intakeExtractFromText(), intakeExtractFromURL(),
 *           showIntakeExtractionPreview(), showIntakeBulkResult(), setIntakeField()
 */

// ─── Tab switching ───

function switchIntakeTab(tabName) {
    document.querySelectorAll('.intake-tab-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-primary', 'shadow-sm');
        btn.classList.add('text-text-secondary');
    });
    const activeBtn = document.getElementById(`intake-tab-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-white', 'text-primary', 'shadow-sm');
        activeBtn.classList.remove('text-text-secondary');
    }

    document.querySelectorAll('.intake-tab-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`intake-panel-${tabName}`);
    if (panel) panel.classList.remove('hidden');

    hideIntakeError();
    document.getElementById('intake-extraction-preview')?.classList.add('hidden');
    document.getElementById('intake-loading-state')?.classList.add('hidden');
}

// ─── File Upload ───

function handleIntakeFileSelect(file) {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
    hideIntakeWarning();

    if (file.size > MAX_FILE_SIZE) {
        showIntakeWarning(
            'File too large',
            `This file is ${formatIntakeFileSize(file.size)}, but the maximum upload size is 50MB. Please compress the file or use a smaller version.`
        );
        modalSelectedFile = null;
        document.getElementById('intake-upload-btn').disabled = true;
        const directBtn = document.getElementById('intake-upload-direct-btn');
        if (directBtn) directBtn.disabled = true;
        return;
    }

    modalSelectedFile = file;
    document.getElementById('intake-file-name').textContent = file.name;
    document.getElementById('intake-file-size').textContent = formatIntakeFileSize(file.size);
    document.getElementById('intake-file-info').classList.remove('hidden');
    document.getElementById('intake-upload-btn').disabled = false;
    document.getElementById('intake-context-section')?.classList.remove('hidden');
    const directBtn = document.getElementById('intake-upload-direct-btn');
    if (directBtn) directBtn.disabled = false;
}

function showIntakeWarning(title, message) {
    const el = document.getElementById('intake-warning-state');
    if (!el) return;
    const titleEl = document.getElementById('intake-warning-title');
    const msgEl = document.getElementById('intake-warning-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    el.classList.remove('hidden');
}

function hideIntakeWarning() {
    document.getElementById('intake-warning-state')?.classList.add('hidden');
}

function clearIntakeFile() {
    modalSelectedFile = null;
    const fi = document.getElementById('intake-file-input');
    if (fi) fi.value = '';
    document.getElementById('intake-file-info')?.classList.add('hidden');
    document.getElementById('intake-context-section')?.classList.add('hidden');
    document.getElementById('intake-context-fields')?.classList.add('hidden');
    hideIntakeWarning();
    const btn = document.getElementById('intake-upload-btn');
    if (btn) btn.disabled = true;
    const directBtn = document.getElementById('intake-upload-direct-btn');
    if (directBtn) directBtn.disabled = true;
}

function formatIntakeFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function intakeUploadFile() {
    if (!modalSelectedFile) return;
    if (modalIntakeMode === 'existing' && !modalSelectedDealId) {
        showIntakeError('No deal selected', 'Please search and select a deal to update.');
        return;
    }
    showIntakeLoading();
    try {
        const formData = new FormData();
        formData.append('file', modalSelectedFile);
        if (modalIntakeMode === 'existing' && modalSelectedDealId) {
            formData.append('dealId', modalSelectedDealId);
        }
        // Append optional deal context
        const ctxSource = document.getElementById('intake-ctx-source')?.value;
        const ctxThesis = document.getElementById('intake-ctx-thesis')?.value?.trim();
        const ctxPriority = document.getElementById('intake-ctx-priority')?.value;
        const ctxTimeline = document.getElementById('intake-ctx-timeline')?.value;
        const ctxConcerns = document.getElementById('intake-ctx-concerns')?.value?.trim();
        if (ctxSource) formData.append('source', ctxSource);
        if (ctxThesis) formData.append('userThesis', ctxThesis);
        if (ctxPriority) formData.append('priority', ctxPriority);
        if (ctxTimeline) formData.append('targetTimeline', ctxTimeline);
        if (ctxConcerns) formData.append('concerns', ctxConcerns);
        const isExcel = modalSelectedFile.name.match(/\.(xlsx|xls|csv)$/i);
        // Bulk import only for creating NEW deals from a spreadsheet of deal data.
        // When updating an existing deal, always use regular ingest (handles financial models, CIMs, etc.)
        const useBulk = isExcel && modalIntakeMode !== 'existing';
        const endpoint = useBulk
            ? `${window._intakeAPIBase}/ingest/bulk`
            : `${window._intakeAPIBase}/ingest`;
        const response = await PEAuth.authFetch(endpoint, { method: 'POST', body: formData });
        if (response.status === 413) {
            hideIntakeLoading();
            showIntakeWarning('File too large', 'Maximum upload size is 50MB. Please compress the file or try a smaller version.');
            return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || 'Upload failed');
        if (useBulk) {
            showIntakeBulkResult(data);
        } else {
            showIntakeExtractionPreview(data);
        }
    } catch (error) {
        showIntakeError('Upload failed', error.message);
    }
}

// ─── Direct Upload to Data Room (no AI extraction) ───

async function intakeUploadDirect() {
    if (!modalSelectedFile) return;
    if (!modalSelectedDealId) {
        showIntakeError('No deal selected', 'Please search and select a deal to upload to.');
        return;
    }
    showIntakeLoading();
    try {
        const formData = new FormData();
        formData.append('file', modalSelectedFile);

        const response = await PEAuth.authFetch(
            `${window._intakeAPIBase}/deals/${modalSelectedDealId}/documents`,
            { method: 'POST', body: formData }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');

        // Reuse the extraction preview area to show upload success
        hideIntakeLoading();
        hideIntakeError();
        modalCreatedDealId = modalSelectedDealId;

        const previewHeader = document.querySelector('#intake-extraction-preview h4');
        const previewIcon = document.querySelector('#intake-extraction-preview .material-symbols-outlined');
        if (previewHeader) previewHeader.textContent = 'Document Uploaded';
        if (previewIcon) previewIcon.textContent = 'upload_file';

        // Hide the detailed extraction fields and review sections
        document.querySelectorAll('#intake-extraction-preview .grid').forEach(el => el.classList.add('hidden'));
        document.getElementById('intake-review-badge')?.classList.add('hidden');
        document.getElementById('intake-review-reasons')?.classList.add('hidden');

        // Insert a simple success message before the action buttons
        const actionsDiv = document.querySelector('#intake-extraction-preview .flex.gap-3.mt-5');
        let msgEl = document.getElementById('intake-direct-upload-msg');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'intake-direct-upload-msg';
            msgEl.className = 'text-center py-4';
            actionsDiv?.parentNode?.insertBefore(msgEl, actionsDiv);
        }
        msgEl.innerHTML = `
            <p class="text-sm font-medium text-text-main">${modalSelectedFile.name}</p>
            <p class="text-xs text-text-muted mt-1">Added to Data Room. Use <strong>Extract Financials</strong> on the deal page to process financial data.</p>
        `;

        document.getElementById('intake-extraction-preview')?.classList.remove('hidden');

        if (typeof loadDeals === 'function') loadDeals();
    } catch (error) {
        showIntakeError('Upload failed', error.message);
    }
}

// ─── Text Extraction ───

async function intakeExtractFromText() {
    const text = document.getElementById('intake-text-input').value.trim();
    if (text.length < 50) return;
    if (modalIntakeMode === 'existing' && !modalSelectedDealId) {
        showIntakeError('No deal selected', 'Please search and select a deal to update.');
        return;
    }
    showIntakeLoading();
    try {
        const sourceType = document.getElementById('intake-text-source-type').value;
        const body = { text, sourceType };
        if (modalIntakeMode === 'existing' && modalSelectedDealId) {
            body.dealId = modalSelectedDealId;
        }
        const response = await PEAuth.authFetch(`${window._intakeAPIBase}/ingest/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Text extraction failed');
        showIntakeExtractionPreview(data);
    } catch (error) {
        showIntakeError('Text extraction failed', error.message);
    }
}

// ─── URL Scraping ───

async function intakeExtractFromURL() {
    const url = document.getElementById('intake-url-input').value.trim();
    if (!url) return;
    if (modalIntakeMode === 'existing' && !modalSelectedDealId) {
        showIntakeError('No deal selected', 'Please search and select a deal to update.');
        return;
    }
    showIntakeLoading();
    try {
        const companyName = document.getElementById('intake-url-company-name').value.trim() || undefined;
        const body = { url, companyName };
        if (modalIntakeMode === 'existing' && modalSelectedDealId) {
            body.dealId = modalSelectedDealId;
        }
        const response = await PEAuth.authFetch(`${window._intakeAPIBase}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'URL scraping failed');
        showIntakeExtractionPreview(data);
    } catch (error) {
        showIntakeError('URL scraping failed', error.message);
    }
}

// ─── Extraction Preview ───

function showIntakeExtractionPreview(data) {
    hideIntakeLoading();
    hideIntakeError();
    const extraction = data.extraction || {};
    modalCreatedDealId = data.deal?.id;

    // Update header based on whether this was a create or update
    const previewHeader = document.querySelector('#intake-extraction-preview h4');
    const previewIcon = document.querySelector('#intake-extraction-preview .material-symbols-outlined');
    if (data.isUpdate) {
        if (previewHeader) previewHeader.textContent = 'Deal Updated';
        if (previewIcon) previewIcon.textContent = 'update';
    } else {
        if (previewHeader) previewHeader.textContent = 'Deal Created';
        if (previewIcon) previewIcon.textContent = 'check_circle';
    }

    setIntakeField('company',
        extraction.companyName?.value || data.deal?.name || 'Unknown',
        extraction.companyName?.confidence,
        extraction.companyName?.source
    );
    setIntakeField('industry',
        extraction.industry?.value || (extraction.industry?.confidence === 0 ? 'Not Found' : '—'),
        extraction.industry?.confidence,
        extraction.industry?.source
    );
    const detectedCurrency = extraction.currency || 'USD';
    setIntakeField('revenue',
        extraction.revenue?.value != null ? formatCurrencyValue(extraction.revenue.value, detectedCurrency) : (extraction.revenue?.confidence === 0 ? 'Not Found' : '—'),
        extraction.revenue?.confidence,
        extraction.revenue?.source
    );
    setIntakeField('ebitda',
        extraction.ebitda?.value != null ? formatCurrencyValue(extraction.ebitda.value, detectedCurrency) : (extraction.ebitda?.confidence === 0 ? 'Not Found' : '—'),
        extraction.ebitda?.confidence,
        extraction.ebitda?.source
    );
    setIntakeField('overall', `${extraction.overallConfidence || 0}%`, extraction.overallConfidence);

    const reviewBadge = document.getElementById('intake-review-badge');
    const reviewReasons = document.getElementById('intake-review-reasons');
    const reviewReasonsList = document.getElementById('intake-review-reasons-list');

    if (extraction.needsReview) {
        reviewBadge?.classList.remove('hidden');
        if (extraction.reviewReasons && extraction.reviewReasons.length > 0) {
            reviewReasons?.classList.remove('hidden');
            if (reviewReasonsList) {
                reviewReasonsList.innerHTML = extraction.reviewReasons.map(r => `<li>${r}</li>`).join('');
            }
        }
    } else {
        reviewBadge?.classList.add('hidden');
        reviewReasons?.classList.add('hidden');
    }

    document.getElementById('intake-extraction-preview')?.classList.remove('hidden');

    // Refresh deals list in background if available
    if (typeof loadDeals === 'function') loadDeals();

    // Fire follow-up questions in background (non-blocking)
    if (modalCreatedDealId && extraction) {
        setTimeout(() => fetchFollowUpQuestions(modalCreatedDealId, extraction), 800);
    }
}

// ─── AI Follow-Up Questions ───

let _followUpAnswers = {};

async function fetchFollowUpQuestions(dealId, extraction) {
    const section = document.getElementById('intake-followup-section');
    const loading = document.getElementById('intake-followup-loading');
    const container = document.getElementById('intake-followup-questions');
    if (!section || !container) return;

    section.classList.remove('hidden');
    loading?.classList.remove('hidden');

    try {
        const res = await PEAuth.authFetch(`${window._intakeAPIBase || API_BASE_URL}/deals/${dealId}/follow-up-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extraction: {
                    companyName: extraction.companyName?.value || null,
                    industry: extraction.industry?.value || null,
                    revenue: extraction.revenue?.value || null,
                    ebitda: extraction.ebitda?.value || null,
                    currency: extraction.currency || 'USD',
                    summary: extraction.summary || null,
                    keyRisks: extraction.keyRisks || [],
                    investmentHighlights: extraction.investmentHighlights || [],
                    overallConfidence: extraction.overallConfidence || 0,
                },
            }),
        });

        if (!res.ok) throw new Error('Failed to generate questions');
        const data = await res.json();
        loading?.classList.add('hidden');
        _followUpAnswers = {};
        renderFollowUpQuestions(data.questions || []);
    } catch (err) {
        console.warn('[FollowUp] Question generation failed', err);
        loading?.classList.add('hidden');
        section.classList.add('hidden');
    }
}

function renderFollowUpQuestions(questions) {
    const container = document.getElementById('intake-followup-questions');
    if (!container || !questions.length) return;

    // Inject animation style
    if (!document.getElementById('followup-anim-style')) {
        const s = document.createElement('style');
        s.id = 'followup-anim-style';
        s.textContent = `
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .followup-q { animation: fadeInUp 0.4s ease-out both; }
            .followup-q:nth-child(1) { animation-delay: 0.1s; }
            .followup-q:nth-child(2) { animation-delay: 0.2s; }
            .followup-q:nth-child(3) { animation-delay: 0.3s; }
            .followup-q:nth-child(4) { animation-delay: 0.4s; }
        `;
        document.head.appendChild(s);
    }

    container.innerHTML = questions.map(q => {
        if (q.type === 'choice') {
            const chips = (q.options || []).map(opt =>
                `<button type="button" class="followup-chip px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all cursor-pointer border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary" data-qid="${q.id}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
            ).join('');
            return `
                <div class="followup-q" data-qid="${q.id}">
                    <p class="text-[13px] text-gray-800 font-medium mb-1">${escapeHtml(q.question)}</p>
                    <p class="text-[10px] text-gray-400 italic mb-2.5">${escapeHtml(q.reason)}</p>
                    <div class="flex flex-wrap gap-2">${chips}</div>
                </div>`;
        } else {
            return `
                <div class="followup-q" data-qid="${q.id}">
                    <p class="text-[13px] text-gray-800 font-medium mb-1">${escapeHtml(q.question)}</p>
                    <p class="text-[10px] text-gray-400 italic mb-2.5">${escapeHtml(q.reason)}</p>
                    <input type="text" class="followup-text-input w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors" data-qid="${q.id}" placeholder="${escapeHtml(q.placeholder || 'Share your thoughts...')}" />
                </div>`;
        }
    }).join('');

    // Wire chip click handlers
    container.querySelectorAll('.followup-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const qid = chip.dataset.qid;
            // Deselect siblings
            container.querySelectorAll(`.followup-chip[data-qid="${qid}"]`).forEach(c => {
                c.classList.remove('text-white');
                c.classList.add('text-gray-600', 'border-gray-200');
                c.style.backgroundColor = '';
                c.style.borderColor = '';
            });
            // Select this one
            chip.classList.remove('text-gray-600', 'border-gray-200');
            chip.classList.add('text-white');
            chip.style.backgroundColor = '#003366';
            chip.style.borderColor = '#003366';
            _followUpAnswers[qid] = chip.dataset.value;
            updateFollowUpButtons();
        });
    });

    // Wire text input handlers
    container.querySelectorAll('.followup-text-input').forEach(input => {
        input.addEventListener('input', () => {
            const qid = input.dataset.qid;
            if (input.value.trim()) {
                _followUpAnswers[qid] = input.value.trim();
            } else {
                delete _followUpAnswers[qid];
            }
            updateFollowUpButtons();
        });
    });

    // Store questions for saving later
    container._questions = questions;
}

function updateFollowUpButtons() {
    const hasAnswers = Object.keys(_followUpAnswers).length > 0;
    const viewBtn = document.getElementById('intake-view-deal-btn');
    if (!viewBtn) return;

    if (hasAnswers) {
        viewBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Save & View Deal`;
        viewBtn.onclick = () => saveFollowUpAndGoToDeal();
        // Add skip link if not present
        if (!document.getElementById('intake-skip-link')) {
            const skip = document.createElement('p');
            skip.id = 'intake-skip-link';
            skip.className = 'text-center mt-2';
            skip.innerHTML = `<a onclick="intakeGoToDeal()" class="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">Skip — I'll add context later</a>`;
            viewBtn.closest('.flex')?.after(skip);
        }
    } else {
        viewBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">open_in_new</span> View Deal`;
        viewBtn.onclick = () => intakeGoToDeal();
        document.getElementById('intake-skip-link')?.remove();
    }
}

async function saveFollowUpAndGoToDeal() {
    if (!modalCreatedDealId || Object.keys(_followUpAnswers).length === 0) {
        intakeGoToDeal();
        return;
    }

    const container = document.getElementById('intake-followup-questions');
    const questions = container?._questions || [];

    try {
        await PEAuth.authFetch(`${window._intakeAPIBase || API_BASE_URL}/deals/${modalCreatedDealId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customFields: {
                    aiFollowUp: {
                        generatedAt: new Date().toISOString(),
                        questions: questions,
                        answers: _followUpAnswers,
                    },
                },
            }),
        });
    } catch (err) {
        console.warn('[FollowUp] Failed to save answers', err);
    }

    intakeGoToDeal();
}

function showIntakeBulkResult(data) {
    hideIntakeLoading();
    hideIntakeError();
    const summary = data.summary || {};

    setIntakeField('company', `${summary.imported || 0} deals imported`, null);
    setIntakeField('industry', `${summary.failed || 0} failed`, null);
    setIntakeField('revenue', `${summary.total || 0} total rows`, null);
    setIntakeField('ebitda', '—', null);
    setIntakeField('overall',
        summary.imported === summary.total ? '100%' : `${Math.round((summary.imported / summary.total) * 100)}%`,
        summary.imported === summary.total ? 100 : 60
    );

    document.getElementById('intake-review-badge')?.classList.add('hidden');
    document.getElementById('intake-review-reasons')?.classList.add('hidden');

    modalCreatedDealId = null;
    const viewBtn = document.getElementById('intake-view-deal-btn');
    if (viewBtn) {
        viewBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">list</span> View All Deals';
        viewBtn.onclick = () => { closeDealIntakeModal(); };
    }

    document.getElementById('intake-extraction-preview')?.classList.remove('hidden');
    if (typeof loadDeals === 'function') loadDeals();
}

function setIntakeField(field, value, confidence, source) {
    const valEl = document.getElementById(`intake-val-${field}`);
    const confEl = document.getElementById(`intake-conf-${field}`);
    const barEl = document.getElementById(`intake-bar-${field}`);
    const sourceEl = document.getElementById(`intake-source-${field}`);

    if (valEl) valEl.textContent = value;

    if (confidence != null && confEl && barEl) {
        confEl.textContent = `${confidence}%`;
        barEl.style.width = `${confidence}%`;
        confEl.className = 'text-xs font-medium';
        barEl.className = 'h-1.5 rounded-full transition-all';
        if (confidence >= 80) {
            confEl.classList.add('text-secondary');
            barEl.classList.add('bg-secondary');
        } else if (confidence >= 60) {
            confEl.classList.add('text-yellow-600');
            barEl.classList.add('bg-yellow-400');
        } else {
            confEl.classList.add('text-red-500');
            barEl.classList.add('bg-red-400');
        }
    } else if (confEl && barEl) {
        confEl.textContent = '';
        barEl.style.width = '0%';
    }

    // Show source quote if available
    if (sourceEl) {
        if (source) {
            sourceEl.textContent = `"${source}"`;
            sourceEl.classList.remove('hidden');
        } else {
            sourceEl.textContent = '';
            sourceEl.classList.add('hidden');
        }
    }
}
