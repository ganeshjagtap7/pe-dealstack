// ============================================================
// Deal Activity Feed — extracted from deal.js
// Depends on: state (global), API_BASE_URL, PEAuth, formatRelativeTime, showNotification
// ============================================================

function renderActivityFeed(activities) {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    if (!activities || activities.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-3xl mb-2">inbox</span>
                <p class="text-sm">No activities yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activities.slice(0, 10).map(activity => {
        const { icon, color, bgColor } = getActivityIcon(activity.type);
        const timeAgoStr = formatRelativeTime(activity.createdAt);

        return `
            <div class="flex items-start gap-3 p-3 bg-white rounded-lg border border-border-subtle hover:border-primary/30 transition-colors">
                <div class="size-8 rounded-full ${bgColor} flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-sm ${color}">${icon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-text-main leading-tight">${activity.title}</p>
                    ${activity.description ? `<p class="text-xs text-text-muted mt-0.5 line-clamp-2">${activity.description}</p>` : ''}
                    <div class="flex items-center gap-2 mt-1.5">
                        <span class="text-[10px] text-text-muted font-medium">${timeAgoStr}</span>
                        ${activity.user?.name ? `
                            <span class="text-[10px] text-text-muted">•</span>
                            <span class="text-[10px] text-text-muted">${activity.user.name}</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getActivityIcon(type) {
    const icons = {
        'DOCUMENT_UPLOADED': { icon: 'upload_file', color: 'text-blue-600', bgColor: 'bg-blue-100' },
        'STAGE_CHANGED': { icon: 'swap_horiz', color: 'text-purple-600', bgColor: 'bg-purple-100' },
        'NOTE_ADDED': { icon: 'sticky_note_2', color: 'text-amber-600', bgColor: 'bg-amber-100' },
        'MEETING_SCHEDULED': { icon: 'event', color: 'text-green-600', bgColor: 'bg-green-100' },
        'CALL_LOGGED': { icon: 'call', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
        'EMAIL_SENT': { icon: 'mail', color: 'text-red-600', bgColor: 'bg-red-100' },
        'STATUS_UPDATED': { icon: 'update', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
        'TEAM_MEMBER_ADDED': { icon: 'person_add', color: 'text-secondary', bgColor: 'bg-secondary-light' },
    };
    return icons[type] || { icon: 'info', color: 'text-gray-600', bgColor: 'bg-gray-100' };
}

async function loadActivities() {
    if (!state.dealId) return;

    const container = document.getElementById('activity-feed');
    if (container) {
        container.innerHTML = `
            <div class="flex items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined animate-spin text-primary mr-2">sync</span>
                Loading activities...
            </div>
        `;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/activities?limit=10`);
        if (!response.ok) throw new Error('Failed to fetch activities');

        const result = await response.json();
        renderActivityFeed(result.data || result);
    } catch (error) {
        console.error('Error loading activities:', error);
        if (container) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-red-500">
                    <span class="material-symbols-outlined text-2xl mb-2">error</span>
                    <p class="text-sm">Failed to load activities</p>
                </div>
            `;
        }
    }
}

function initActivityFeed() {
    // Refresh button handler
    const refreshBtn = document.getElementById('refresh-activities-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadActivities);
    }

    // Add note handlers
    const noteInput = document.getElementById('note-input');
    const addNoteBtn = document.getElementById('add-note-btn');

    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => addNote());
    }

    if (noteInput) {
        noteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addNote();
            }
        });
        initMentionAutocomplete(noteInput);
    }
}

// ─── @Mention Autocomplete ──────────────────────────────────
let _mentionUsers = null;
let _mentionActive = false;
let _mentionStart = -1;
let _mentionSelectedIdx = 0;

async function fetchOrgUsers() {
    if (_mentionUsers) return _mentionUsers;
    try {
        const res = await PEAuth.authFetch(`${API_BASE_URL}/users`);
        if (res.ok) {
            const data = await res.json();
            _mentionUsers = (data.users || data || []).map(u => ({
                id: u.id,
                name: u.name || u.email?.split('@')[0] || 'Unknown',
                email: u.email || '',
                initials: (u.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
            }));
        }
    } catch (e) { console.warn('Failed to fetch users for mentions', e); }
    return _mentionUsers || [];
}

function initMentionAutocomplete(input) {
    const dropdown = document.getElementById('mention-dropdown');
    if (!dropdown) return;

    input.addEventListener('input', async () => {
        const val = input.value;
        const cursor = input.selectionStart;
        // Find @ before cursor
        const before = val.slice(0, cursor);
        const atIdx = before.lastIndexOf('@');

        if (atIdx === -1 || (atIdx > 0 && before[atIdx - 1] !== ' ')) {
            closeMentionDropdown();
            return;
        }

        const query = before.slice(atIdx + 1).toLowerCase();
        _mentionStart = atIdx;
        _mentionActive = true;

        const users = await fetchOrgUsers();
        const filtered = users.filter(u =>
            u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
        ).slice(0, 6);

        if (filtered.length === 0) {
            closeMentionDropdown();
            return;
        }

        _mentionSelectedIdx = 0;
        dropdown.innerHTML = filtered.map((u, i) => `
            <button type="button" class="mention-option w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-primary/5 transition-colors ${i === 0 ? 'bg-primary/5' : ''}" data-idx="${i}" data-name="${escapeHtml(u.name)}">
                <span class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style="background:#003366;">${u.initials}</span>
                <div class="min-w-0">
                    <p class="text-xs font-semibold text-gray-800 truncate">${escapeHtml(u.name)}</p>
                    <p class="text-[10px] text-gray-400 truncate">${escapeHtml(u.email)}</p>
                </div>
            </button>
        `).join('');
        dropdown.classList.remove('hidden');

        // Click handler
        dropdown.querySelectorAll('.mention-option').forEach(opt => {
            opt.addEventListener('mousedown', (e) => {
                e.preventDefault();
                insertMention(input, opt.dataset.name);
            });
        });
    });

    input.addEventListener('keydown', (e) => {
        if (!_mentionActive) return;
        const options = dropdown.querySelectorAll('.mention-option');
        if (!options.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _mentionSelectedIdx = Math.min(_mentionSelectedIdx + 1, options.length - 1);
            updateMentionSelection(options);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _mentionSelectedIdx = Math.max(_mentionSelectedIdx - 1, 0);
            updateMentionSelection(options);
        } else if (e.key === 'Enter' && _mentionActive) {
            e.preventDefault();
            const selected = options[_mentionSelectedIdx];
            if (selected) insertMention(input, selected.dataset.name);
        } else if (e.key === 'Escape') {
            closeMentionDropdown();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(closeMentionDropdown, 200);
    });
}

function updateMentionSelection(options) {
    options.forEach((opt, i) => {
        opt.classList.toggle('bg-primary/5', i === _mentionSelectedIdx);
    });
}

function insertMention(input, name) {
    const val = input.value;
    const before = val.slice(0, _mentionStart);
    const after = val.slice(input.selectionStart);
    input.value = before + '@' + name + ' ' + after;
    const newCursor = before.length + name.length + 2;
    input.setSelectionRange(newCursor, newCursor);
    input.focus();
    closeMentionDropdown();
}

function closeMentionDropdown() {
    _mentionActive = false;
    document.getElementById('mention-dropdown')?.classList.add('hidden');
}

async function addNote() {
    const noteInput = document.getElementById('note-input');
    const note = noteInput?.value?.trim();

    if (!note) {
        showNotification('Error', 'Please enter a note', 'error');
        return;
    }

    if (!state.dealId) {
        showNotification('Error', 'No deal loaded', 'error');
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'NOTE_ADDED',
                title: 'Note added',
                description: note,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to add note');
        }

        const newActivity = await response.json();

        // Clear input
        noteInput.value = '';

        // Reload activities to show the new note
        loadActivities();

        showNotification('Note Added', 'Your note has been saved', 'success');

    } catch (error) {
        console.error('Error adding note:', error);
        showNotification('Error', 'Failed to add note', 'error');
    }
}

function updateChatContext(documents) {
    const contextDocs = document.getElementById('context-docs');
    if (!contextDocs || documents.length === 0) return;

    const colors = ['red', 'secondary', 'blue', 'purple'];
    const bgColors = ['red-100', 'secondary-light', 'blue-100', 'purple-100'];
    const textColors = ['red-700', 'secondary', 'blue-700', 'purple-700'];
    const icons = { pdf: 'P', xlsx: 'X', csv: 'C' };

    contextDocs.innerHTML = documents.slice(0, 3).map((doc, i) => {
        const ext = doc.name.split('.').pop()?.toLowerCase() || '';
        const icon = icons[ext] || 'D';
        return `<div class="size-6 rounded-full bg-${bgColors[i % bgColors.length]} border border-white flex items-center justify-center text-[10px] text-${textColors[i % textColors.length]} font-bold z-${20 - i * 10} shadow-sm" title="${doc.name}">${icon}</div>`;
    }).join('') + (documents.length > 3 ? `<div class="size-6 rounded-full bg-background-body border border-white flex items-center justify-center text-[10px] text-text-secondary z-0 shadow-sm">+${documents.length - 3}</div>` : '');
}
