/**
 * PE OS - Deal Intake Modal: Template & Initialization
 * Builds the modal HTML, injects it into the DOM, and wires up event listeners.
 * Depends on: (none — this is loaded first)
 * Provides: initDealIntakeModal(), openDealIntakeModal(), closeDealIntakeModal()
 */

let modalSelectedFile = null;
let modalCreatedDealId = null;
let modalSelectedDealId = null; // For "Update Existing Deal" mode
let modalIntakeMode = 'new'; // 'new' or 'existing'
let modalDealSearchTimeout = null;

// Format a value stored in millions to the most natural display unit
// Uses Cr/L for INR, B/M/K for USD/EUR/others
function formatCurrencyValue(valueInMillions, currency) {
    if (valueInMillions == null) return '—';
    const sym = getCurrencySymbol(currency);
    const abs = Math.abs(valueInMillions);
    const sign = valueInMillions < 0 ? '-' : '';
    const code = (currency || 'USD').toUpperCase();

    if (code === 'INR') {
        const crores = abs / 10;
        if (crores >= 1) return `${sign}${sym}${crores >= 100 ? crores.toFixed(0) : crores >= 10 ? crores.toFixed(1) : crores.toFixed(2)}Cr`;
        const lakhs = abs * 10;
        if (lakhs >= 1) return `${sign}${sym}${lakhs >= 100 ? lakhs.toFixed(0) : lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2)}L`;
        const rupees = abs * 1000000;
        return `${sign}${sym}${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }

    if (abs >= 1000) {
        const b = abs / 1000;
        return `${sign}${sym}${b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)}B`;
    }
    if (abs >= 1) {
        return `${sign}${sym}${abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2)}M`;
    }
    const k = abs * 1000;
    if (k >= 1) {
        return `${sign}${sym}${k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)}K`;
    }
    const base = abs * 1000000;
    return `${sign}${sym}${base.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
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
                <div class="flex flex-col gap-1 mb-4">
                    <h3 class="text-xl font-bold text-text-main tracking-tight">Ingest Deal Data</h3>
                    <p id="intake-header-desc" class="text-text-secondary text-sm">Upload a document or paste text to create a new deal.</p>
                </div>

                <!-- Mode Toggle: New vs Update -->
                <div class="flex gap-2 mb-4">
                    <button id="intake-mode-new" onclick="setIntakeMode('new')" class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all bg-primary text-white">
                        <span class="material-symbols-outlined text-[16px]">add_circle</span>
                        Create New Deal
                    </button>
                    <button id="intake-mode-existing" onclick="setIntakeMode('existing')" class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all border border-border-subtle text-text-secondary hover:bg-gray-50">
                        <span class="material-symbols-outlined text-[16px]">update</span>
                        Update Existing Deal
                    </button>
                </div>

                <!-- Deal Picker (hidden by default) -->
                <div id="intake-deal-picker" class="hidden mb-4">
                    <div class="rounded-lg border border-border-subtle bg-white p-4">
                        <label class="block text-sm font-medium text-text-main mb-2">Select a deal to update</label>
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
                            <input id="intake-deal-search" type="text" class="w-full rounded-lg border border-border-subtle bg-white pl-10 pr-4 py-2.5 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" placeholder="Search deals by name..." />
                        </div>
                        <div id="intake-deal-results" class="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border-subtle hidden"></div>
                        <div id="intake-selected-deal" class="hidden mt-3 flex items-center gap-3 rounded-lg bg-primary-light/50 border border-primary/20 px-4 py-3">
                            <span class="material-symbols-outlined text-primary">handshake</span>
                            <div class="flex-1 min-w-0">
                                <p id="intake-selected-deal-name" class="text-sm font-medium text-text-main truncate"></p>
                                <p id="intake-selected-deal-info" class="text-xs text-text-muted"></p>
                            </div>
                            <button onclick="clearSelectedDeal()" class="p-1 rounded hover:bg-white/50 text-text-muted hover:text-red-500 transition-colors">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    </div>
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
                        <!-- Deal Context Questions (optional) -->
                        <div id="intake-context-section" class="hidden mt-4">
                            <button type="button" onclick="document.getElementById('intake-context-fields').classList.toggle('hidden');this.querySelector('.ctx-chevron').classList.toggle('rotate-180');" class="w-full flex items-center gap-2 text-left text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors py-1">
                                <span class="material-symbols-outlined text-sm">question_answer</span>
                                Add context about this deal <span class="text-gray-400 font-normal">(optional)</span>
                                <span class="material-symbols-outlined text-sm ml-auto ctx-chevron transition-transform">expand_more</span>
                            </button>
                            <div id="intake-context-fields" class="hidden mt-3 space-y-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                <div>
                                    <label class="block text-[11px] font-medium text-gray-500 mb-1">How did you source this deal?</label>
                                    <select id="intake-ctx-source" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-primary/30 focus:border-primary bg-white">
                                        <option value="">Select...</option>
                                        <option value="Proprietary">Proprietary / Direct</option>
                                        <option value="Broker">Broker / Intermediary</option>
                                        <option value="Network">Network / Referral</option>
                                        <option value="Cold Outreach">Cold Outreach</option>
                                        <option value="Inbound">Inbound</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-medium text-gray-500 mb-1">What's your initial take on this deal?</label>
                                    <textarea id="intake-ctx-thesis" rows="2" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-primary/30 focus:border-primary resize-none" placeholder="e.g., Strong margins, interesting market position, founder looking to exit..."></textarea>
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-[11px] font-medium text-gray-500 mb-1">Priority</label>
                                        <select id="intake-ctx-priority" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-primary/30 focus:border-primary bg-white">
                                            <option value="">Select...</option>
                                            <option value="HIGH">High — review ASAP</option>
                                            <option value="MEDIUM">Medium — standard review</option>
                                            <option value="LOW">Low — when time permits</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-[11px] font-medium text-gray-500 mb-1">Target close timeline</label>
                                        <select id="intake-ctx-timeline" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-primary/30 focus:border-primary bg-white">
                                            <option value="">Select...</option>
                                            <option value="30 days">30 days</option>
                                            <option value="60 days">60 days</option>
                                            <option value="90 days">90 days</option>
                                            <option value="6 months">6 months</option>
                                            <option value="No timeline">No specific timeline</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-medium text-gray-500 mb-1">Any specific concerns or questions?</label>
                                    <input type="text" id="intake-ctx-concerns" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-primary/30 focus:border-primary" placeholder="e.g., Customer concentration, regulatory risk, management depth..." />
                                </div>
                            </div>
                        </div>

                        <button id="intake-upload-btn" onclick="intakeUploadFile()" disabled class="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
                            Extract & Create Deal
                        </button>
                        <button id="intake-upload-direct-btn" onclick="intakeUploadDirect()" disabled class="mt-2 w-full py-2.5 px-4 rounded-lg border border-border-subtle text-text-secondary text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 hidden">
                            <span class="material-symbols-outlined text-[18px]">upload_file</span>
                            Upload to Data Room Only
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

                <!-- Warning State (file size, format issues) -->
                <div id="intake-warning-state" class="hidden">
                    <div class="rounded-lg border border-amber-300 bg-amber-50 p-5">
                        <div class="flex items-start gap-3">
                            <span class="material-symbols-outlined text-amber-500 mt-0.5">warning</span>
                            <div class="flex-1">
                                <p class="text-sm font-medium text-amber-800" id="intake-warning-title">File too large</p>
                                <p class="text-xs text-amber-600 mt-1" id="intake-warning-message"></p>
                            </div>
                            <button onclick="hideIntakeWarning()" class="text-amber-400 hover:text-amber-600">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
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
                                <p id="intake-source-company" class="hidden mt-1.5 text-[11px] text-text-muted italic border-l-2 border-primary/30 pl-2 leading-relaxed"></p>
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
                                <p id="intake-source-industry" class="hidden mt-1.5 text-[11px] text-text-muted italic border-l-2 border-primary/30 pl-2 leading-relaxed"></p>
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
                                <p id="intake-source-revenue" class="hidden mt-1.5 text-[11px] text-text-muted italic border-l-2 border-primary/30 pl-2 leading-relaxed"></p>
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
                                <p id="intake-source-ebitda" class="hidden mt-1.5 text-[11px] text-text-muted italic border-l-2 border-primary/30 pl-2 leading-relaxed"></p>
                            </div>
                        </div>
                        <!-- Review Reasons -->
                        <div id="intake-review-reasons" class="hidden mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                            <p class="text-xs font-medium text-yellow-800 mb-1">Review needed:</p>
                            <ul id="intake-review-reasons-list" class="text-xs text-yellow-700 list-disc list-inside"></ul>
                        </div>

                        <!-- AI Follow-Up Questions -->
                        <div id="intake-followup-section" class="hidden mt-5">
                            <div class="h-px bg-gray-100 mb-5"></div>
                            <div class="flex items-center gap-2 mb-4">
                                <span class="material-symbols-outlined text-base" style="color:#003366;">psychology</span>
                                <p class="text-xs font-semibold tracking-wide uppercase" style="color:#003366;">Quick context</p>
                                <span class="text-[10px] text-gray-400 font-normal normal-case ml-0.5">helps AI serve you better</span>
                            </div>
                            <div id="intake-followup-questions" class="space-y-5"></div>
                            <div id="intake-followup-loading" class="hidden py-4 flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-gray-300 text-sm animate-spin">progress_activity</span>
                                <span class="text-[11px] text-gray-400">Generating questions...</span>
                            </div>
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

    // ── Deal search handler for Update Existing mode ──
    const dealSearch = document.getElementById('intake-deal-search');
    if (dealSearch) {
        dealSearch.addEventListener('input', () => {
            clearTimeout(modalDealSearchTimeout);
            const query = dealSearch.value.trim();
            if (query.length < 2) {
                document.getElementById('intake-deal-results')?.classList.add('hidden');
                return;
            }
            modalDealSearchTimeout = setTimeout(() => searchDealsForPicker(query), 300);
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
