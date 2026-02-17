/**
 * Document Preview Utility
 * Handles PDF and Excel file previews in a modal
 */

window.PEDocPreview = (function() {
    // XSS prevention - escape HTML entities
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    // PDF.js library URL
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // SheetJS for Excel
    const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';

    // Mammoth.js for Word docs
    const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

    let pdfLoaded = false;
    let xlsxLoaded = false;
    let mammothLoaded = false;

    // Dynamically load script
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Load PDF.js library
    async function loadPdfJs() {
        if (pdfLoaded) return;
        await loadScript(PDF_JS_URL);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        pdfLoaded = true;
    }

    // Load SheetJS library
    async function loadXlsx() {
        if (xlsxLoaded) return;
        await loadScript(XLSX_URL);
        xlsxLoaded = true;
    }

    // Load Mammoth.js library
    async function loadMammoth() {
        if (mammothLoaded) return;
        await loadScript(MAMMOTH_URL);
        mammothLoaded = true;
    }

    // Get file extension
    function getFileExtension(filename) {
        return filename?.split('.').pop()?.toLowerCase() || '';
    }

    // Get file type icon
    function getFileIcon(filename) {
        const ext = getFileExtension(filename);
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

    // Get file type color
    function getFileColor(filename) {
        const ext = getFileExtension(filename);
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

    // Create modal container
    function createModal(title, filename) {
        const color = getFileColor(filename);
        const icon = getFileIcon(filename);

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

        // Close handlers
        document.getElementById('doc-close-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', handleEscape);

        return modal;
    }

    function handleEscape(e) {
        if (e.key === 'Escape') closeModal();
    }

    function closeModal() {
        const modal = document.getElementById('doc-preview-modal');
        if (modal) {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    }

    // Show error in modal
    function showError(message) {
        const content = document.getElementById('doc-preview-content');
        if (content) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center p-8">
                    <span class="material-symbols-outlined text-red-500 text-4xl mb-3">error</span>
                    <p class="text-gray-900 font-medium mb-1">Preview Not Available</p>
                    <p class="text-gray-500 text-sm">${escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    // Render PDF
    async function renderPdf(url, filename) {
        const modal = createModal('PDF Document', filename);
        const content = document.getElementById('doc-preview-content');
        const footer = document.getElementById('doc-preview-footer');

        try {
            await loadPdfJs();

            const loadingTask = window.pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;

            let currentPage = 1;
            const totalPages = pdf.numPages;

            // Show footer for multi-page PDFs
            if (totalPages > 1) {
                footer.classList.remove('hidden');
                document.getElementById('pdf-total-pages').textContent = totalPages;
            }

            // Create canvas container
            content.innerHTML = '<div class="flex justify-center"><canvas id="pdf-canvas" class="shadow-lg rounded"></canvas></div>';

            async function renderPage(pageNum) {
                const page = await pdf.getPage(pageNum);
                const canvas = document.getElementById('pdf-canvas');
                const ctx = canvas.getContext('2d');

                // Scale to fit container width
                const containerWidth = content.clientWidth - 32;
                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(containerWidth / viewport.width, 1.5);
                const scaledViewport = page.getViewport({ scale });

                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;

                await page.render({
                    canvasContext: ctx,
                    viewport: scaledViewport
                }).promise;

                document.getElementById('pdf-current-page').textContent = pageNum;
                document.getElementById('pdf-prev-btn').disabled = pageNum <= 1;
                document.getElementById('pdf-next-btn').disabled = pageNum >= totalPages;
            }

            // Navigation handlers
            document.getElementById('pdf-prev-btn')?.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderPage(currentPage);
                }
            });

            document.getElementById('pdf-next-btn')?.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderPage(currentPage);
                }
            });

            // Keyboard navigation
            const keyHandler = (e) => {
                if (e.key === 'ArrowLeft' && currentPage > 1) {
                    currentPage--;
                    renderPage(currentPage);
                } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
                    currentPage++;
                    renderPage(currentPage);
                }
            };
            document.addEventListener('keydown', keyHandler);

            // Cleanup on close
            const observer = new MutationObserver((mutations) => {
                if (!document.getElementById('doc-preview-modal')) {
                    document.removeEventListener('keydown', keyHandler);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true });

            await renderPage(1);

            // Download handler
            document.getElementById('doc-download-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            });

        } catch (error) {
            console.error('PDF render error:', error);
            showError('Unable to load PDF. The file may be corrupted or inaccessible.');
        }
    }

    // Render Excel
    async function renderExcel(url, filename) {
        const modal = createModal('Excel Spreadsheet', filename);
        const content = document.getElementById('doc-preview-content');

        try {
            await loadXlsx();

            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });

            // Get first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (data.length === 0) {
                showError('The spreadsheet appears to be empty.');
                return;
            }

            // Build sheet tabs if multiple sheets
            let tabsHtml = '';
            if (workbook.SheetNames.length > 1) {
                tabsHtml = `
                    <div class="flex gap-1 mb-4 overflow-x-auto pb-2">
                        ${workbook.SheetNames.map((name, i) => `
                            <button class="sheet-tab px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${i === 0 ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}" data-sheet="${escapeHtml(name)}">
                                ${escapeHtml(name)}
                            </button>
                        `).join('')}
                    </div>
                `;
            }

            // Build table
            function buildTable(sheetData) {
                const headers = sheetData[0] || [];
                const rows = sheetData.slice(1);

                return `
                    <div class="bg-white rounded-lg shadow overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="bg-gray-50 border-b border-gray-200">
                                        ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">${escapeHtml(h) || ''}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100">
                                    ${rows.slice(0, 100).map(row => `
                                        <tr class="hover:bg-gray-50">
                                            ${headers.map((_, i) => `<td class="px-4 py-2.5 text-gray-600 whitespace-nowrap">${escapeHtml(row[i]) ?? ''}</td>`).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${rows.length > 100 ? `
                            <div class="px-4 py-3 bg-amber-50 text-amber-700 text-xs text-center border-t">
                                Showing first 100 rows of ${rows.length} total. Download the file for full data.
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            content.innerHTML = tabsHtml + '<div id="sheet-content">' + buildTable(data) + '</div>';

            // Tab switching
            content.querySelectorAll('.sheet-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    content.querySelectorAll('.sheet-tab').forEach(t => {
                        t.classList.remove('bg-primary', 'text-white');
                        t.classList.add('bg-white', 'text-gray-600');
                    });
                    tab.classList.add('bg-primary', 'text-white');
                    tab.classList.remove('bg-white', 'text-gray-600');

                    const sheetData = window.XLSX.utils.sheet_to_json(
                        workbook.Sheets[tab.dataset.sheet],
                        { header: 1 }
                    );
                    document.getElementById('sheet-content').innerHTML = buildTable(sheetData);
                });
            });

            // Download handler
            document.getElementById('doc-download-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            });

        } catch (error) {
            console.error('Excel render error:', error);
            showError('Unable to load spreadsheet. The file may be corrupted or inaccessible.');
        }
    }

    // Render Word Document (.docx)
    async function renderDocx(url, filename) {
        const modal = createModal('Word Document', filename);
        const content = document.getElementById('doc-preview-content');

        try {
            await loadMammoth();

            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const result = await window.mammoth.convertToHtml({ arrayBuffer });

            const html = result.value;
            const warnings = result.messages.filter(m => m.type === 'warning');

            if (!html || html.trim() === '') {
                showError('The document appears to be empty.');
                return;
            }

            content.innerHTML = `
                <div class="bg-white rounded-lg shadow overflow-hidden">
                    <div class="docx-content p-8 md:p-12 max-w-4xl mx-auto prose prose-sm prose-gray" style="
                        font-family: 'Inter', 'Segoe UI', sans-serif;
                        line-height: 1.7;
                        color: #374151;
                    ">${html}</div>
                </div>
                <style>
                    .docx-content h1 { font-size: 1.5rem; font-weight: 700; color: #111827; margin: 1.5rem 0 0.75rem; }
                    .docx-content h2 { font-size: 1.25rem; font-weight: 700; color: #1f2937; margin: 1.25rem 0 0.5rem; }
                    .docx-content h3 { font-size: 1.1rem; font-weight: 600; color: #374151; margin: 1rem 0 0.5rem; }
                    .docx-content p { margin: 0.5rem 0; }
                    .docx-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
                    .docx-content th, .docx-content td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
                    .docx-content th { background: #f9fafb; font-weight: 600; color: #374151; }
                    .docx-content tr:hover td { background: #f9fafb; }
                    .docx-content ul, .docx-content ol { margin: 0.5rem 0; padding-left: 1.5rem; }
                    .docx-content li { margin: 0.25rem 0; }
                    .docx-content img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 1rem 0; }
                    .docx-content strong { font-weight: 600; color: #111827; }
                    .docx-content a { color: #003366; text-decoration: underline; }
                </style>
            `;

            // Download handler
            document.getElementById('doc-download-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            });

        } catch (error) {
            console.error('DOCX render error:', error);
            showError('Unable to load Word document. The file may be corrupted or inaccessible.');
        }
    }

    // Render CSV
    async function renderCsv(url, filename) {
        const modal = createModal('CSV File', filename);
        const content = document.getElementById('doc-preview-content');

        try {
            const response = await fetch(url);
            const text = await response.text();

            // Parse CSV
            const rows = text.split('\n').map(row => {
                const cells = [];
                let current = '';
                let inQuotes = false;

                for (let char of row) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        cells.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cells.push(current.trim());
                return cells;
            }).filter(row => row.some(cell => cell));

            if (rows.length === 0) {
                showError('The CSV file appears to be empty.');
                return;
            }

            const headers = rows[0];
            const dataRows = rows.slice(1);

            content.innerHTML = `
                <div class="bg-white rounded-lg shadow overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="bg-gray-50 border-b border-gray-200">
                                    ${headers.map(h => `<th class="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">${escapeHtml(h)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${dataRows.slice(0, 100).map(row => `
                                    <tr class="hover:bg-gray-50">
                                        ${headers.map((_, i) => `<td class="px-4 py-2.5 text-gray-600 whitespace-nowrap">${escapeHtml(row[i]) || ''}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${dataRows.length > 100 ? `
                        <div class="px-4 py-3 bg-amber-50 text-amber-700 text-xs text-center border-t">
                            Showing first 100 rows of ${dataRows.length} total. Download the file for full data.
                        </div>
                    ` : ''}
                </div>
            `;

            // Download handler
            document.getElementById('doc-download-btn')?.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            });

        } catch (error) {
            console.error('CSV render error:', error);
            showError('Unable to load CSV file.');
        }
    }

    // Main preview function
    async function preview(url, filename) {
        if (!url || !filename) {
            console.error('Preview requires URL and filename');
            return;
        }

        const ext = getFileExtension(filename);

        switch (ext) {
            case 'pdf':
                await renderPdf(url, filename);
                break;
            case 'xlsx':
            case 'xls':
                await renderExcel(url, filename);
                break;
            case 'csv':
                await renderCsv(url, filename);
                break;
            case 'doc':
            case 'docx':
                await renderDocx(url, filename);
                break;
            default:
                createModal('Document', filename);
                showError(`Preview is not available for .${ext} files. Click Download to view the file.`);
                document.getElementById('doc-download-btn')?.addEventListener('click', () => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    link.click();
                });
        }
    }

    // Public API
    return {
        preview,
        closeModal,
        getFileIcon,
        getFileColor,
        getFileExtension
    };
})();

console.log('PEDocPreview loaded successfully');
