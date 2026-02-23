/**
 * PE OS - Deal Intake Modal
 * Full-featured deal intake overlay for the CRM page.
 * Supports: Upload File, Paste Text, Enter URL
 * Replaces both the old simple PDF modal and the separate deal-intake.html page.
 */

let modalSelectedFile = null;
let modalCreatedDealId = null;

// Format a value stored in millions USD to the most natural display unit
function formatCurrencyValue(valueInMillions) {
    if (valueInMillions == null) return '—';
    const abs = Math.abs(valueInMillions);
    const sign = valueInMillions < 0 ? '-' : '';
    if (abs >= 1000) {
        const b = abs / 1000;
        return `${sign}$${b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)}B`;
    }
    if (abs >= 1) {
        return `${sign}$${abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2)}M`;
    }
    const k = abs * 1000;
    if (k >= 1) {
        return `${sign}$${k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)}K`;
    }
    const dollars = abs * 1000000;
    return `${sign}$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Build and inject the deal intake modal HTML into the DOM.
 * Call this once during page init.
 */
function initDealIntakeModal(apiBaseURL) {
    if (document.getElementById('deal-intake-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'deal-intake-modal';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-surface-card rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-[slideIn_0.2s_ease-out]">
            <button id="close-intake-modal" class="absolute top-4 right-4 text-text-muted hover:text-text-main transition-colors z-10">
                <span class="material-symbols-outlined">close</span>
            </button>

            <div class="p-6">
                <!-- Header -->
                <div class="flex flex-col gap-1 mb-5">
                    <h3 class="text-xl font-bold text-text-main tracking-tight">Ingest Deal Data</h3>
                    <p class="text-text-secondary text-sm">Upload a document, paste text, or enter a company URL to create a new deal.</p>
                </div>

                <!-- Tab Navigation -->
                <div class="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
                    <button id="intake-tab-upload" class="intake-tab-btn flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all bg-white text-primary shadow-sm" onclick="switchIntakeTab('upload')">
                        <span class="material-symbols-outlined text-[18px]">upload_file</span>
                        Upload File
                    </button>
                    <button id="intake-tab-text" class="intake-tab-btn flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all text-text-secondary hover:text-text-main" onclick="switchIntakeTab('text')">
                        <span class="material-symbols-outlined text-[18px]">edit_note</span>
                        Paste Text
                    </button>
                    <button id="intake-tab-url" class="intake-tab-btn flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all text-text-secondary hover:text-text-main" onclick="switchIntakeTab('url')">
                        <span class="material-symbols-outlined text-[18px]">language</span>
                        Enter URL
                    </button>
                </div>

                <!-- Upload File Tab -->
                <div id="intake-panel-upload" class="intake-tab-panel">
                    <div class="rounded-lg border border-border-subtle bg-white p-6">
                        <div id="intake-drop-zone" class="relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border-subtle p-10 hover:border-primary/50 hover:bg-primary-light/30 transition-all cursor-pointer">
                            <span class="material-symbols-outlined text-4xl text-text-muted">cloud_upload</span>
                            <div class="text-center">
                                <p class="text-sm font-medium text-text-main">Drag & drop a file here, or <span class="text-primary font-semibold">browse</span></p>
                                <p class="text-xs text-text-muted mt-1">PDF, Word (.docx, .doc), Excel (.xlsx), or Text (.txt) — Max 50MB</p>
                            </div>
                            <input id="intake-file-input" type="file" class="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv" />
                        </div>
                        <div id="intake-file-info" class="hidden mt-4 flex items-center gap-3 rounded-lg bg-primary-light/50 border border-primary/20 px-4 py-3">
                            <span class="material-symbols-outlined text-primary">description</span>
                            <div class="flex-1 min-w-0">
                                <p id="intake-file-name" class="text-sm font-medium text-text-main truncate"></p>
                                <p id="intake-file-size" class="text-xs text-text-muted"></p>
                            </div>
                            <button onclick="clearIntakeFile()" class="p-1 rounded hover:bg-white/50 text-text-muted hover:text-red-500 transition-colors">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                        <button id="intake-upload-btn" onclick="intakeUploadFile()" disabled class="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
                            Extract & Create Deal
                        </button>
                    </div>
                </div>

                <!-- Paste Text Tab -->
                <div id="intake-panel-text" class="intake-tab-panel hidden">
                    <div class="rounded-lg border border-border-subtle bg-white p-6">
                        <label class="block text-sm font-medium text-text-main mb-2">Paste deal information</label>
                        <textarea id="intake-text-input" rows="8" class="w-full rounded-lg border border-border-subtle bg-white px-4 py-3 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none" placeholder="Paste deal memo, email, CIM summary, or any text containing company and financial information...&#10;&#10;Example:&#10;Acme Healthcare Services is a leading home healthcare provider in the Northeast US with $150M revenue and $30M EBITDA..."></textarea>
                        <div class="flex items-center justify-between mt-2">
                            <p class="text-xs text-text-muted"><span id="intake-text-char-count">0</span> characters (minimum 50)</p>
                            <select id="intake-text-source-type" class="rounded-md border border-border-subtle bg-white px-3 py-1.5 text-xs text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary/30">
                                <option value="other">Source: Other</option>
                                <option value="email">Email</option>
                                <option value="note">Note</option>
                                <option value="slack">Slack</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>
                        </div>
                        <button id="intake-text-btn" onclick="intakeExtractFromText()" disabled class="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
                            Extract & Create Deal
                        </button>
                    </div>
                </div>

                <!-- Enter URL Tab -->
                <div id="intake-panel-url" class="intake-tab-panel hidden">
                    <div class="rounded-lg border border-border-subtle bg-white p-6">
                        <label class="block text-sm font-medium text-text-main mb-2">Company website URL</label>
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">link</span>
                            <input id="intake-url-input" type="url" class="w-full rounded-lg border border-border-subtle bg-white pl-10 pr-4 py-2.5 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" placeholder="https://www.example.com" />
                        </div>
                        <label class="block text-sm font-medium text-text-main mt-4 mb-2">Company name <span class="text-text-muted font-normal">(optional override)</span></label>
                        <input id="intake-url-company-name" type="text" class="w-full rounded-lg border border-border-subtle bg-white px-4 py-2.5 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" placeholder="e.g. Acme Healthcare" />
                        <button id="intake-url-btn" onclick="intakeExtractFromURL()" disabled class="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
                            Scrape & Create Deal
                        </button>
                    </div>
                </div>

                <!-- Loading State -->
                <div id="intake-loading-state" class="hidden">
                    <div class="rounded-lg border border-primary/20 bg-primary-light/30 p-8 text-center">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-sm font-medium text-text-main">Extracting deal data...</p>
                        <p class="text-xs text-text-secondary mt-1">AI is analyzing the content and extracting company information</p>
                    </div>
                </div>

                <!-- Error State -->
                <div id="intake-error-state" class="hidden">
                    <div class="rounded-lg border border-red-200 bg-red-50 p-5">
                        <div class="flex items-start gap-3">
                            <span class="material-symbols-outlined text-red-500 mt-0.5">error</span>
                            <div class="flex-1">
                                <p class="text-sm font-medium text-red-800" id="intake-error-title">Extraction failed</p>
                                <p class="text-xs text-red-600 mt-1" id="intake-error-message"></p>
                            </div>
                            <button onclick="hideIntakeError()" class="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Extraction Preview -->
                <div id="intake-extraction-preview" class="hidden">
                    <div class="rounded-lg border border-secondary/30 bg-white p-6">
                        <div class="flex items-center justify-between mb-5">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary">check_circle</span>
                                <h4 class="text-lg font-bold text-text-main">Deal Created</h4>
                            </div>
                            <div id="intake-review-badge" class="hidden px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">warning</span>
                                Needs Review
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="col-span-full">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-medium text-text-secondary">Company Name</span>
                                    <span id="intake-conf-company" class="text-xs font-medium"></span>
                                </div>
                                <p id="intake-val-company" class="text-sm font-semibold text-text-main"></p>
                                <div class="w-full bg-gray-100 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                    <div id="intake-bar-company" class="h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-medium text-text-secondary">Industry</span>
                                    <span id="intake-conf-industry" class="text-xs font-medium"></span>
                                </div>
                                <p id="intake-val-industry" class="text-sm text-text-main"></p>
                                <div class="w-full bg-gray-100 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                    <div id="intake-bar-industry" class="h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-medium text-text-secondary">Overall Confidence</span>
                                    <span id="intake-conf-overall" class="text-xs font-medium"></span>
                                </div>
                                <p id="intake-val-overall" class="text-sm text-text-main"></p>
                                <div class="w-full bg-gray-100 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                    <div id="intake-bar-overall" class="h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-medium text-text-secondary">Revenue</span>
                                    <span id="intake-conf-revenue" class="text-xs font-medium"></span>
                                </div>
                                <p id="intake-val-revenue" class="text-sm text-text-main"></p>
                                <div class="w-full bg-gray-100 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                    <div id="intake-bar-revenue" class="h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-medium text-text-secondary">EBITDA</span>
                                    <span id="intake-conf-ebitda" class="text-xs font-medium"></span>
                                </div>
                                <p id="intake-val-ebitda" class="text-sm text-text-main"></p>
                                <div class="w-full bg-gray-100 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                    <div id="intake-bar-ebitda" class="h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                        <!-- Review Reasons -->
                        <div id="intake-review-reasons" class="hidden mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                            <p class="text-xs font-medium text-yellow-800 mb-1">Review needed:</p>
                            <ul id="intake-review-reasons-list" class="text-xs text-yellow-700 list-disc list-inside"></ul>
                        </div>
                        <!-- Actions -->
                        <div class="flex gap-3 mt-5">
                            <button id="intake-view-deal-btn" onclick="intakeGoToDeal()" class="flex-1 py-2.5 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-all flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                                View Deal
                            </button>
                            <button onclick="resetIntakeModal()" class="py-2.5 px-4 rounded-lg border border-border-subtle text-text-secondary text-sm font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[18px]">add</span>
                                Add Another
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal handler
    document.getElementById('close-intake-modal').addEventListener('click', closeDealIntakeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDealIntakeModal();
    });

    // ── File Upload handlers ──
    const dropZone = document.getElementById('intake-drop-zone');
    const fileInput = document.getElementById('intake-file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-primary', 'bg-primary-light/30');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-primary', 'bg-primary-light/30');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-primary', 'bg-primary-light/30');
        if (e.dataTransfer.files.length > 0) {
            handleIntakeFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            handleIntakeFileSelect(this.files[0]);
            setTimeout(() => { this.value = ''; }, 100);
        }
    });

    // ── Text input handler ──
    const textInput = document.getElementById('intake-text-input');
    const textBtn = document.getElementById('intake-text-btn');
    const charCount = document.getElementById('intake-text-char-count');

    if (textInput) {
        textInput.addEventListener('input', () => {
            const len = textInput.value.length;
            charCount.textContent = len;
            textBtn.disabled = len < 50;
        });
    }

    // ── URL input handler ──
    const urlInput = document.getElementById('intake-url-input');
    const urlBtn = document.getElementById('intake-url-btn');

    if (urlInput) {
        urlInput.addEventListener('input', () => {
            try {
                new URL(urlInput.value);
                urlBtn.disabled = false;
            } catch {
                urlBtn.disabled = true;
            }
        });
    }

    // Store API base URL for use in functions
    window._intakeAPIBase = apiBaseURL;
}

// ─── Open / Close ───

function openDealIntakeModal() {
    const modal = document.getElementById('deal-intake-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeDealIntakeModal() {
    const modal = document.getElementById('deal-intake-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        resetIntakeModal();
    }
}

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
}

function clearIntakeFile() {
    modalSelectedFile = null;
    const fi = document.getElementById('intake-file-input');
    if (fi) fi.value = '';
    document.getElementById('intake-file-info')?.classList.add('hidden');
    const btn = document.getElementById('intake-upload-btn');
    if (btn) btn.disabled = true;
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
    showIntakeLoading();
    try {
        const formData = new FormData();
        formData.append('file', modalSelectedFile);
        const isExcel = modalSelectedFile.name.match(/\.(xlsx|xls|csv)$/i);
        const endpoint = isExcel
            ? `${window._intakeAPIBase}/ingest/bulk`
            : `${window._intakeAPIBase}/ingest`;
        const response = await PEAuth.authFetch(endpoint, { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');
        if (isExcel) {
            showIntakeBulkResult(data);
        } else {
            showIntakeExtractionPreview(data);
        }
    } catch (error) {
        showIntakeError('Upload failed', error.message);
    }
}

// ─── Text Extraction ───

async function intakeExtractFromText() {
    const text = document.getElementById('intake-text-input').value.trim();
    if (text.length < 50) return;
    showIntakeLoading();
    try {
        const sourceType = document.getElementById('intake-text-source-type').value;
        const response = await PEAuth.authFetch(`${window._intakeAPIBase}/ingest/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, sourceType }),
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
    showIntakeLoading();
    try {
        const companyName = document.getElementById('intake-url-company-name').value.trim() || undefined;
        const response = await PEAuth.authFetch(`${window._intakeAPIBase}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, companyName }),
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

    setIntakeField('company', extraction.companyName?.value || data.deal?.name || 'Unknown', extraction.companyName?.confidence);
    setIntakeField('industry', extraction.industry?.value || '—', extraction.industry?.confidence);
    setIntakeField('revenue', formatCurrencyValue(extraction.revenue?.value), extraction.revenue?.confidence);
    setIntakeField('ebitda', formatCurrencyValue(extraction.ebitda?.value), extraction.ebitda?.confidence);
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

function setIntakeField(field, value, confidence) {
    const valEl = document.getElementById(`intake-val-${field}`);
    const confEl = document.getElementById(`intake-conf-${field}`);
    const barEl = document.getElementById(`intake-bar-${field}`);

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
}

function intakeGoToDeal() {
    if (modalCreatedDealId) {
        window.location.href = `/deal.html?id=${modalCreatedDealId}`;
    } else {
        closeDealIntakeModal();
    }
}

// ─── UI State Helpers ───

function showIntakeLoading() {
    document.querySelectorAll('.intake-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('intake-loading-state')?.classList.remove('hidden');
    document.getElementById('intake-extraction-preview')?.classList.add('hidden');
    hideIntakeError();
}

function hideIntakeLoading() {
    document.getElementById('intake-loading-state')?.classList.add('hidden');
    const activeTab = document.querySelector('.intake-tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('intake-tab-', '');
        document.getElementById(`intake-panel-${tabName}`)?.classList.remove('hidden');
    }
}

function showIntakeError(title, message) {
    hideIntakeLoading();
    const activeTab = document.querySelector('.intake-tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('intake-tab-', '');
        document.getElementById(`intake-panel-${tabName}`)?.classList.remove('hidden');
    }
    const titleEl = document.getElementById('intake-error-title');
    const msgEl = document.getElementById('intake-error-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    document.getElementById('intake-error-state')?.classList.remove('hidden');
}

function hideIntakeError() {
    document.getElementById('intake-error-state')?.classList.add('hidden');
}

function resetIntakeModal() {
    clearIntakeFile();
    modalCreatedDealId = null;

    // Reset text
    const textInput = document.getElementById('intake-text-input');
    const charCount = document.getElementById('intake-text-char-count');
    const textBtn = document.getElementById('intake-text-btn');
    if (textInput) textInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (textBtn) textBtn.disabled = true;

    // Reset URL
    const urlInput = document.getElementById('intake-url-input');
    const urlBtn = document.getElementById('intake-url-btn');
    const urlCompany = document.getElementById('intake-url-company-name');
    if (urlInput) urlInput.value = '';
    if (urlBtn) urlBtn.disabled = true;
    if (urlCompany) urlCompany.value = '';

    // Reset view deal button
    const viewBtn = document.getElementById('intake-view-deal-btn');
    if (viewBtn) {
        viewBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">open_in_new</span> View Deal';
        viewBtn.onclick = intakeGoToDeal;
    }

    // Reset confidence bars
    ['company', 'industry', 'revenue', 'ebitda', 'overall'].forEach(field => {
        const confEl = document.getElementById(`intake-conf-${field}`);
        const barEl = document.getElementById(`intake-bar-${field}`);
        if (confEl) { confEl.textContent = ''; confEl.className = 'text-xs font-medium'; }
        if (barEl) { barEl.style.width = '0%'; barEl.className = 'h-1.5 rounded-full transition-all'; }
    });

    // Hide preview and error, show upload tab
    document.getElementById('intake-extraction-preview')?.classList.add('hidden');
    hideIntakeError();
    switchIntakeTab('upload');
}
