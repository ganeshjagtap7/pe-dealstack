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
    modalSelectedFile = file;
    document.getElementById('intake-file-name').textContent = file.name;
    document.getElementById('intake-file-size').textContent = formatIntakeFileSize(file.size);
    document.getElementById('intake-file-info').classList.remove('hidden');
    document.getElementById('intake-upload-btn').disabled = false;
    const directBtn = document.getElementById('intake-upload-direct-btn');
    if (directBtn) directBtn.disabled = false;
}

function clearIntakeFile() {
    modalSelectedFile = null;
    const fi = document.getElementById('intake-file-input');
    if (fi) fi.value = '';
    document.getElementById('intake-file-info')?.classList.add('hidden');
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
        const isExcel = modalSelectedFile.name.match(/\.(xlsx|xls|csv)$/i);
        // Bulk import only for creating NEW deals from a spreadsheet of deal data.
        // When updating an existing deal, always use regular ingest (handles financial models, CIMs, etc.)
        const useBulk = isExcel && modalIntakeMode !== 'existing';
        const endpoint = useBulk
            ? `${window._intakeAPIBase}/ingest/bulk`
            : `${window._intakeAPIBase}/ingest`;
        const response = await PEAuth.authFetch(endpoint, { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');
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
    setIntakeField('revenue',
        extraction.revenue?.value != null ? formatCurrencyValue(extraction.revenue.value) : (extraction.revenue?.confidence === 0 ? 'Not Found' : '—'),
        extraction.revenue?.confidence,
        extraction.revenue?.source
    );
    setIntakeField('ebitda',
        extraction.ebitda?.value != null ? formatCurrencyValue(extraction.ebitda.value) : (extraction.ebitda?.confidence === 0 ? 'Not Found' : '—'),
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
