// ============================================================
// CRM Contacts — Modals (Contact, Interaction, Deal Link, Connection)
// Extracted from contacts-detail.js for maintainability.
// Depends on globals from contacts.js: currentContact, currentFilter,
// contactScores, selectedDealId, selectedConnectionContactId,
// TYPE_CONFIG, INTERACTION_ICONS, STAGE_STYLES, SCORE_CONFIG,
// RELATIONSHIP_TYPE_CONFIG, getInitials, loadContacts,
// createContact, updateContact, deleteContact
// Depends on contacts-detail.js: openDetail, closeDetail
// Depends on shared modules: API_BASE_URL, PEAuth, escapeHtml,
// timeAgo, showNotification
// ============================================================

const API_BASE_MODALS = API_BASE_URL; // alias for clarity

// ============================================================
// Add / Edit Contact Modal
// ============================================================

function openContactModal(contact) {
    const modal = document.getElementById('contact-modal');
    const modalTitle = document.getElementById('modal-title');
    const submitText = document.getElementById('form-submit-text');

    // Reset form
    document.getElementById('contact-form').reset();
    document.getElementById('form-contact-id').value = '';

    if (contact) {
        modalTitle.textContent = 'Edit Contact';
        submitText.textContent = 'Update Contact';
        document.getElementById('form-contact-id').value = contact.id || '';
        document.getElementById('form-firstName').value = contact.firstName || '';
        document.getElementById('form-lastName').value = contact.lastName || '';
        document.getElementById('form-email').value = contact.email || '';
        document.getElementById('form-phone').value = contact.phone || '';
        document.getElementById('form-title').value = contact.title || '';
        document.getElementById('form-company').value = contact.company || '';
        document.getElementById('form-type').value = contact.type || '';
        document.getElementById('form-linkedinUrl').value = contact.linkedinUrl || '';
        document.getElementById('form-tags').value = (contact.tags || []).join(', ');
        document.getElementById('form-notes').value = contact.notes || '';
    } else {
        modalTitle.textContent = 'Add Contact';
        submitText.textContent = 'Save Contact';
    }

    modal.classList.remove('hidden');
}

function closeContactModal() {
    document.getElementById('contact-modal').classList.add('hidden');
}

async function handleContactSubmit(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('form-submit-btn');
    const submitText = document.getElementById('form-submit-text');
    const spinner = document.getElementById('form-submit-spinner');

    submitBtn.disabled = true;
    spinner.classList.remove('hidden');

    const contactId = document.getElementById('form-contact-id').value;
    const tagsRaw = document.getElementById('form-tags').value;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const body = {
        firstName: document.getElementById('form-firstName').value.trim(),
        lastName: document.getElementById('form-lastName').value.trim(),
        email: document.getElementById('form-email').value.trim() || undefined,
        phone: document.getElementById('form-phone').value.trim() || undefined,
        title: document.getElementById('form-title').value.trim() || undefined,
        company: document.getElementById('form-company').value.trim() || undefined,
        type: document.getElementById('form-type').value,
        linkedinUrl: (() => { const v = document.getElementById('form-linkedinUrl').value.trim(); return v && !v.startsWith('http') ? 'https://' + v : v || undefined; })(),
        tags: tags.length > 0 ? tags : undefined,
        notes: document.getElementById('form-notes').value.trim() || undefined,
    };

    // Remove undefined keys
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

    try {
        if (contactId) {
            await updateContact(contactId, body);
            showNotification('Contact Updated', `${escapeHtml(body.firstName)} ${escapeHtml(body.lastName)} has been updated.`, 'success');
        } else {
            await createContact(body);
            showNotification('Contact Created', `${escapeHtml(body.firstName)} ${escapeHtml(body.lastName)} has been added.`, 'success');
        }

        closeContactModal();
        await loadContacts();

        // If detail panel is open for this contact, refresh it
        if (currentContact && currentContact.id === contactId) {
            await openDetail(contactId);
        }
    } catch (err) {
        console.error('Error saving contact:', err);
        showNotification('Error', err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        spinner.classList.add('hidden');
    }
}

function editCurrentContact() {
    if (!currentContact) return;
    openContactModal(currentContact);
}

async function deleteCurrentContact() {
    if (!currentContact) return;
    const fullName = (currentContact.firstName || '') + ' ' + (currentContact.lastName || '');
    if (!confirm(`Are you sure you want to delete ${fullName.trim()}? This action cannot be undone.`)) return;

    try {
        await deleteContact(currentContact.id);
        showNotification('Contact Deleted', `${escapeHtml(fullName.trim())} has been removed.`, 'success');
        closeDetail();
        await loadContacts();
    } catch (err) {
        console.error('Error deleting contact:', err);
        showNotification('Error', err.message, 'error');
    }
}

// ============================================================
// Add Interaction (inline form in detail panel)
// ============================================================

function showAddInteraction() {
    const form = document.getElementById('add-interaction-form');
    if (form) {
        form.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('interaction-title')?.focus();
    }
}

function hideAddInteraction() {
    const form = document.getElementById('add-interaction-form');
    if (form) form.classList.add('hidden');
}

async function submitInteraction() {
    if (!currentContact) return;

    const type = document.getElementById('interaction-type').value;
    const title = document.getElementById('interaction-title').value.trim();
    const description = document.getElementById('interaction-description').value.trim();
    const date = document.getElementById('interaction-date').value;

    if (!title && !description) {
        showNotification('Error', 'Please enter a title or description.', 'error');
        return;
    }

    const body = { type };
    if (title) body.title = title;
    if (description) body.description = description;
    if (date) body.date = date;

    try {
        await addInteraction(currentContact.id, body);
        showNotification('Interaction Added', `${type.charAt(0) + type.slice(1).toLowerCase()} logged successfully.`, 'success');
        // Refresh detail panel
        await openDetail(currentContact.id);
        // Also refresh the contacts grid to update "last contacted"
        await loadContacts();
    } catch (err) {
        console.error('Error adding interaction:', err);
        showNotification('Error', err.message, 'error');
    }
}

// ============================================================
// Link Deal Modal
// ============================================================

function showLinkDealModal() {
    if (!currentContact) return;
    selectedDealId = null;

    const modal = document.getElementById('link-deal-modal');
    const results = document.getElementById('deal-search-results');
    const form = document.getElementById('link-deal-form');
    const searchInput = document.getElementById('deal-search-input');

    results.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
            <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search</span>
            Type to search for deals...
        </div>
    `;
    form.classList.add('hidden');
    searchInput.value = '';
    document.getElementById('link-deal-role').value = '';

    modal.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 100);
}

function closeLinkDealModal() {
    document.getElementById('link-deal-modal').classList.add('hidden');
    selectedDealId = null;
}

async function handleDealSearch(query) {
    const results = document.getElementById('deal-search-results');
    const form = document.getElementById('link-deal-form');

    if (!query || query.length < 2) {
        results.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
                <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search</span>
                Type to search for deals...
            </div>
        `;
        form.classList.add('hidden');
        selectedDealId = null;
        return;
    }

    results.innerHTML = `
        <div class="flex items-center justify-center py-6">
            <span class="material-symbols-outlined text-primary animate-spin text-xl">sync</span>
        </div>
    `;

    try {
        const deals = await searchDeals(query);

        // Filter out already linked deals
        const linkedIds = new Set((currentContact?.linkedDeals || []).map(d => (d.deal || d).id || d.dealId));
        const available = deals.filter(d => !linkedIds.has(d.id));

        if (available.length === 0) {
            results.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
                    <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search_off</span>
                    No matching deals found
                </div>
            `;
            return;
        }

        results.innerHTML = available.map(deal => {
            const ss = STAGE_STYLES[deal.stage] || { bg: 'bg-gray-100', text: 'text-gray-600', label: deal.stage || 'Unknown' };
            return `
                <button class="deal-search-result w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary-light/50 transition-colors" data-deal-id="${escapeHtml(deal.id)}" data-deal-name="${escapeHtml(deal.name || '')}">
                    <span class="material-symbols-outlined text-text-muted text-[20px]">work</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-main truncate">${escapeHtml(deal.name || 'Unnamed Deal')}</p>
                        <p class="text-xs text-text-muted">${escapeHtml(deal.industry || '')}</p>
                    </div>
                    <span class="px-2 py-0.5 rounded-md ${ss.bg} ${ss.text} text-[9px] font-bold uppercase tracking-wider shrink-0">${escapeHtml(ss.label)}</span>
                </button>
            `;
        }).join('');

        // Attach click handlers to results
        results.querySelectorAll('.deal-search-result').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedDealId = btn.dataset.dealId;
                document.getElementById('selected-deal-name').textContent = btn.dataset.dealName;
                form.classList.remove('hidden');

                // Highlight selected
                results.querySelectorAll('.deal-search-result').forEach(b => b.classList.remove('bg-primary-light/50', 'ring-1', 'ring-primary/30'));
                btn.classList.add('bg-primary-light/50', 'ring-1', 'ring-primary/30');
            });
        });
    } catch (err) {
        console.error('Error searching deals:', err);
        results.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-red-500 text-sm">
                <span class="material-symbols-outlined text-3xl mb-2">error</span>
                Failed to search deals
            </div>
        `;
    }
}

async function submitLinkDeal() {
    if (!currentContact || !selectedDealId) return;

    const role = document.getElementById('link-deal-role').value;

    try {
        await linkDeal(currentContact.id, selectedDealId, role);
        showNotification('Deal Linked', 'Deal has been linked to this contact.', 'success');
        closeLinkDealModal();
        // Refresh detail
        await openDetail(currentContact.id);
        await loadContacts();
    } catch (err) {
        console.error('Error linking deal:', err);
        showNotification('Error', err.message, 'error');
    }
}

async function handleUnlinkDeal(dealId) {
    if (!currentContact) return;
    if (!confirm('Remove this deal link?')) return;

    try {
        await unlinkDeal(currentContact.id, dealId);
        showNotification('Deal Unlinked', 'Deal has been removed from this contact.', 'success');
        await openDetail(currentContact.id);
        await loadContacts();
    } catch (err) {
        console.error('Error unlinking deal:', err);
        showNotification('Error', err.message, 'error');
    }
}

// ============================================================
// Add Connection Modal
// ============================================================

function showAddConnectionModal() {
    if (!currentContact) return;
    selectedConnectionContactId = null;
    const modal = document.getElementById('connection-modal');
    const results = document.getElementById('connection-search-results');
    const form = document.getElementById('connection-form');
    const searchInput = document.getElementById('connection-search-input');

    results.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
            <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search</span>
            Type to search for contacts...
        </div>`;
    form.classList.add('hidden');
    searchInput.value = '';
    document.getElementById('connection-type').value = 'KNOWS';
    document.getElementById('connection-notes').value = '';

    modal.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 100);
}

function closeConnectionModal() {
    document.getElementById('connection-modal').classList.add('hidden');
    selectedConnectionContactId = null;
}

async function handleConnectionSearch(query) {
    const results = document.getElementById('connection-search-results');
    const form = document.getElementById('connection-form');

    if (!query || query.length < 2) {
        results.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
                <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search</span>
                Type to search for contacts...
            </div>`;
        form.classList.add('hidden');
        selectedConnectionContactId = null;
        return;
    }

    results.innerHTML = `
        <div class="flex items-center justify-center py-6">
            <span class="material-symbols-outlined text-primary animate-spin text-xl">sync</span>
        </div>`;

    try {
        const params = new URLSearchParams({ search: query, limit: '20' });
        const res = await PEAuth.authFetch(`${API_BASE_MODALS}/contacts?${params.toString()}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        const allResults = Array.isArray(data) ? data : (data.contacts || []);

        // Exclude current contact
        const available = allResults.filter(c => c.id !== currentContact.id);

        if (available.length === 0) {
            results.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-text-muted text-sm">
                    <span class="material-symbols-outlined text-3xl mb-2 opacity-40">search_off</span>
                    No matching contacts found
                </div>`;
            return;
        }

        results.innerHTML = available.map(c => {
            const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
            const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
            const initials = getInitials(c.firstName, c.lastName);
            return `
                <button class="conn-search-result w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary-light/50 transition-colors"
                        data-contact-id="${escapeHtml(c.id)}" data-contact-name="${escapeHtml(name)}">
                    <div class="size-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                        ${escapeHtml(initials)}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-main truncate">${escapeHtml(name)}</p>
                        <p class="text-xs text-text-muted truncate">${c.company ? escapeHtml(c.company) + ' · ' : ''}${escapeHtml(tc.label)}</p>
                    </div>
                </button>`;
        }).join('');

        // Click handlers for search results
        results.querySelectorAll('.conn-search-result').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedConnectionContactId = btn.dataset.contactId;
                document.getElementById('selected-connection-name').textContent = btn.dataset.contactName;
                form.classList.remove('hidden');

                results.querySelectorAll('.conn-search-result').forEach(b => b.classList.remove('bg-primary-light/50', 'ring-1', 'ring-primary/30'));
                btn.classList.add('bg-primary-light/50', 'ring-1', 'ring-primary/30');
            });
        });
    } catch (err) {
        console.error('Error searching contacts for connection:', err);
        results.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-red-500 text-sm">
                <span class="material-symbols-outlined text-3xl mb-2">error</span>
                Failed to search contacts
            </div>`;
    }
}

async function submitConnection() {
    if (!currentContact || !selectedConnectionContactId) return;

    const type = document.getElementById('connection-type').value;
    const notes = document.getElementById('connection-notes').value.trim();

    try {
        await createConnection(currentContact.id, {
            relatedContactId: selectedConnectionContactId,
            type,
            notes: notes || undefined,
        });
        showNotification('Connection Added', 'Connection has been created.', 'success');
        closeConnectionModal();
        await openDetail(currentContact.id);
    } catch (err) {
        console.error('Error creating connection:', err);
        showNotification('Error', err.message, 'error');
    }
}
