// ============================================================
// Deal Chat — File Attachment Support
// Depends on: state (global), API_BASE_URL, PEAuth, escapeHtml, showNotification
// Used by: deal-chat.js (calls initChatFileAttachment)
// ============================================================

// Tracks files attached in current chat message (shared with deal-chat.js)
// eslint-disable-next-line no-unused-vars
let _chatAttachedFiles = [];

function initChatFileAttachment() {
    const attachBtn = document.getElementById('attach-file-btn');
    if (!attachBtn) return;

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'chat-file-input';
    fileInput.accept = '.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt';
    fileInput.style.display = 'none';
    fileInput.multiple = false;
    document.body.appendChild(fileInput);

    attachBtn.addEventListener('click', () => {
        if (!state.dealId) {
            showNotification('Error', 'No deal selected', 'error');
            return;
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        fileInput.value = ''; // Reset so same file can be re-selected

        await handleChatFileAttachment(file);
    });
}

async function handleChatFileAttachment(file) {
    const attachedFilesContainer = document.getElementById('attached-files');
    const attachBtn = document.getElementById('attach-file-btn');

    // Validate file size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
        showNotification('File Too Large', 'Maximum file size is 25MB', 'error');
        return;
    }

    // Show uploading chip
    const chipId = `chat-file-${Date.now()}`;
    const chip = document.createElement('div');
    chip.id = chipId;
    chip.className = 'flex items-center gap-2 bg-primary-light border border-primary/20 rounded-lg px-3 py-1.5 text-xs';
    chip.innerHTML = `
        <span class="material-symbols-outlined text-primary text-sm animate-spin">sync</span>
        <span class="text-text-secondary font-medium truncate max-w-[150px]">${escapeHtml(file.name)}</span>
    `;
    attachedFilesContainer.appendChild(chip);

    // Disable attach button while uploading
    if (attachBtn) attachBtn.disabled = true;

    try {
        // Upload to VDR via existing document upload endpoint
        const formData = new FormData();
        formData.append('file', file);

        const response = await PEAuth.authFetch(
            `${API_BASE_URL}/deals/${state.dealId}/documents`,
            { method: 'POST', body: formData }
        );

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Upload failed (${response.status})`);
        }

        const result = await response.json();
        const docName = result.document?.name || file.name;

        // Update chip to show success + remove button
        chip.innerHTML = `
            <span class="material-symbols-outlined text-green-600 text-sm">check_circle</span>
            <span class="text-text-secondary font-medium truncate max-w-[150px]">${escapeHtml(docName)}</span>
            <button onclick="removeChatAttachment('${chipId}', '${escapeHtml(docName)}')" class="text-text-muted hover:text-red-500 transition-colors ml-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;

        // Track the attachment
        _chatAttachedFiles.push({ chipId, name: docName, documentId: result.document?.id });

        showNotification('File Attached', `${docName} uploaded to Data Room`, 'success');
    } catch (err) {
        chip.innerHTML = `
            <span class="material-symbols-outlined text-red-500 text-sm">error</span>
            <span class="text-red-600 font-medium truncate max-w-[150px]">${escapeHtml(file.name)} — failed</span>
            <button onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-500 transition-colors ml-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        showNotification('Upload Failed', err.message, 'error');
    } finally {
        if (attachBtn) attachBtn.disabled = false;
    }
}

function removeChatAttachment(chipId, docName) {
    const chip = document.getElementById(chipId);
    if (chip) chip.remove();
    _chatAttachedFiles = _chatAttachedFiles.filter(f => f.chipId !== chipId);
}
