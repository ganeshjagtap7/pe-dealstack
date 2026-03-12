/**
 * Document Preview — Modal Template & File Type Helpers
 * Extracted from docPreview.js. Pure functions, no state.
 * Globals: getDocFileExtension, getDocFileIcon, getDocFileColor, createDocPreviewModal
 */

function getDocFileExtension(filename) {
    return filename?.split('.').pop()?.toLowerCase() || '';
}

function getDocFileIcon(filename) {
    const ext = getDocFileExtension(filename);
    switch (ext) {
        case 'pdf': return 'picture_as_pdf';
        case 'xlsx':
        case 'xls':
        case 'csv': return 'table_chart';
        case 'doc':
        case 'docx': return 'description';
        case 'ppt':
        case 'pptx': return 'slideshow';
        case 'msg':
        case 'eml': return 'mail';
        default: return 'insert_drive_file';
    }
}

function getDocFileColor(filename) {
    const ext = getDocFileExtension(filename);
    switch (ext) {
        case 'pdf': return 'red';
        case 'xlsx':
        case 'xls': return 'emerald';
        case 'csv': return 'blue';
        case 'doc':
        case 'docx': return 'blue';
        case 'ppt':
        case 'pptx': return 'orange';
        default: return 'slate';
    }
}

function createDocPreviewModal(title, filename) {
    const color = getDocFileColor(filename);
    const icon = getDocFileIcon(filename);

    const modal = document.createElement('div');
    modal.id = 'doc-preview-modal';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-lg bg-${color}-100 flex items-center justify-center text-${color}-600">
                        <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900 text-sm">${escapeHtml(title || filename)}</h3>
                        <p class="text-xs text-gray-500">${escapeHtml(filename)}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="doc-download-btn" class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                        <span class="material-symbols-outlined text-[18px]">download</span>
                        Download
                    </button>
                    <button id="doc-close-btn" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <!-- Content -->
            <div id="doc-preview-content" class="flex-1 overflow-auto bg-gray-100 p-4">
                <div class="flex items-center justify-center h-full">
                    <span class="material-symbols-outlined text-primary text-3xl animate-spin">sync</span>
                </div>
            </div>
            <!-- Footer (for PDF pagination) -->
            <div id="doc-preview-footer" class="hidden p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-center gap-4">
                <button id="pdf-prev-btn" class="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-40">
                    <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <span class="text-sm text-gray-600">
                    Page <span id="pdf-current-page">1</span> of <span id="pdf-total-pages">1</span>
                </span>
                <button id="pdf-next-btn" class="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-40">
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}
