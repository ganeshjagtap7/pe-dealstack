// ============================================================
// CRM Contacts — Detail Panel, Modals & Interactions
// Extracted from contacts.js for maintainability.
// Depends on globals from contacts.js: currentContact, currentFilter,
// contactScores, selectedDealId, selectedConnectionContactId,
// TYPE_CONFIG, INTERACTION_ICONS, STAGE_STYLES, SCORE_CONFIG,
// RELATIONSHIP_TYPE_CONFIG, getInitials, loadContacts,
// createContact, updateContact, deleteContact
// Depends on shared modules: API_BASE_URL, PEAuth, escapeHtml,
// timeAgo, showNotification
// ============================================================

const API_BASE_DETAIL = API_BASE_URL; // alias for clarity

// ============================================================
// API Calls — Detail-specific
// ============================================================

async function fetchContactDetail(id) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${id}`);
    if (!res.ok) throw new Error(`Failed to load contact (${res.status})`);
    return await res.json();
}

async function addInteraction(contactId, body) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to add interaction (${res.status})`);
    }
    return await res.json();
}

async function linkDeal(contactId, dealId, role) {
    const body = { dealId };
    if (role) body.role = role;
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to link deal (${res.status})`);
    }
    return await res.json();
}

async function unlinkDeal(contactId, dealId) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/deals/${dealId}`, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to unlink deal (${res.status})`);
    }
    return true;
}

async function searchDeals(query) {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('limit', '20');
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/deals?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.deals || []);
}

async function fetchConnections(contactId) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/connections`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.connections || [];
}

async function createConnection(contactId, body) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create connection');
    }
    return await res.json();
}

async function deleteConnection(contactId, connectionId) {
    const res = await PEAuth.authFetch(`${API_BASE_DETAIL}/contacts/${contactId}/connections/${connectionId}`, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to remove connection');
    }
}

// ============================================================
// Detail Slide-Over Panel
// ============================================================

async function openDetail(contactId) {
    const backdrop = document.getElementById('detail-backdrop');
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('detail-body');

    // Show loading in panel
    backdrop.classList.remove('hidden');
    backdrop.classList.add('backdrop-enter');
    panel.classList.remove('hidden');
    panel.classList.add('slide-over-enter');
    panel.classList.remove('slide-over-leave');

    body.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16">
            <span class="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span>
            <p class="text-text-muted text-sm">Loading contact details...</p>
        </div>
    `;

    try {
        const contact = await fetchContactDetail(contactId);
        currentContact = contact;
        renderDetailPanel(contact);
    } catch (err) {
        console.error('Error loading contact detail:', err);
        body.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16">
                <span class="material-symbols-outlined text-red-500 text-3xl mb-3">error</span>
                <p class="text-text-main font-medium mb-1">Failed to load contact</p>
                <p class="text-text-muted text-sm">${escapeHtml(err.message)}</p>
            </div>
        `;
    }
}

function renderDetailPanel(contact) {
    const body = document.getElementById('detail-body');
    const tc = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
    const initials = getInitials(contact.firstName, contact.lastName);
    const fullName = escapeHtml((contact.firstName || '') + ' ' + (contact.lastName || ''));
    const title = escapeHtml(contact.title || '');
    const company = escapeHtml(contact.company || '');
    const email = escapeHtml(contact.email || '');
    const phone = escapeHtml(contact.phone || '');
    const linkedin = escapeHtml(contact.linkedinUrl || '');
    const notes = escapeHtml(contact.notes || '');
    const tags = contact.tags || [];
    const linkedDeals = contact.linkedDeals || [];
    const interactions = contact.interactions || [];

    // Sort interactions by date desc
    const sortedInteractions = [...interactions].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    let html = '';

    // Avatar + Name + Title + Company
    html += `
        <div class="flex items-start gap-4 mb-6">
            <div class="size-14 rounded-full flex items-center justify-center shrink-0 text-lg font-bold shadow-sm" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                ${escapeHtml(initials)}
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="text-xl font-bold text-text-main leading-tight">${fullName}</h3>
                ${title ? `<p class="text-text-secondary text-sm mt-0.5">${title}</p>` : ''}
                ${company ? `<p class="text-text-muted text-sm flex items-center gap-1 mt-0.5"><span class="material-symbols-outlined text-[14px]">business</span>${company}</p>` : ''}
                <span class="inline-block mt-2 px-2.5 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-bold uppercase tracking-wider">${escapeHtml(tc.label)}</span>
            </div>
        </div>
    `;

    // Contact Info Section
    html += `<div class="mb-6">`;
    html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Contact Information</h4>`;
    html += `<div class="flex flex-col gap-2">`;
    if (email) {
        html += `
            <a href="mailto:${email}" class="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50">
                <span class="material-symbols-outlined text-[18px] text-text-muted">mail</span>
                ${email}
            </a>
        `;
    }
    if (phone) {
        html += `
            <a href="tel:${phone}" class="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50">
                <span class="material-symbols-outlined text-[18px] text-text-muted">call</span>
                ${phone}
            </a>
        `;
    }
    if (linkedin) {
        html += `
            <a href="${linkedin}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50">
                <span class="material-symbols-outlined text-[18px] text-text-muted">open_in_new</span>
                LinkedIn Profile
            </a>
        `;
    }
    if (!email && !phone && !linkedin) {
        html += `<p class="text-text-muted text-sm italic p-2">No contact information added</p>`;
    }
    html += `</div></div>`;

    // Tags
    if (tags.length > 0) {
        html += `<div class="mb-6">`;
        html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Tags</h4>`;
        html += `<div class="flex flex-wrap gap-1.5">`;
        tags.forEach(t => {
            html += `<span class="px-2.5 py-1 rounded-full bg-background-body text-text-secondary text-xs font-medium border border-border-subtle">${escapeHtml(t)}</span>`;
        });
        html += `</div></div>`;
    }

    // Connections (loaded asynchronously)
    html += `<div class="mb-6" id="connections-section">`;
    html += `<div class="flex items-center justify-between mb-3">`;
    html += `  <h4 class="text-xs font-bold uppercase tracking-wider text-text-muted">Connections</h4>`;
    html += `  <button onclick="showAddConnectionModal()" class="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary-light transition-colors">`;
    html += `    <span class="material-symbols-outlined text-[14px]">add</span> Add`;
    html += `  </button>`;
    html += `</div>`;
    html += `<div id="connections-list" class="flex flex-col gap-2">`;
    html += `  <div class="flex items-center justify-center py-3"><span class="material-symbols-outlined text-text-muted text-sm animate-spin">sync</span></div>`;
    html += `</div></div>`;

    // Notes
    if (notes) {
        html += `<div class="mb-6">`;
        html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Notes</h4>`;
        html += `<div class="p-3 bg-background-body rounded-lg border border-border-subtle text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">${notes}</div>`;
        html += `</div>`;
    }

    // Linked Deals
    html += `<div class="mb-6">`;
    html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Linked Deals <span class="text-text-muted">(${linkedDeals.length})</span></h4>`;
    if (linkedDeals.length === 0) {
        html += `<p class="text-text-muted text-sm italic">No linked deals</p>`;
    } else {
        html += `<div class="flex flex-col gap-2">`;
        linkedDeals.forEach(d => {
            const deal = d.deal || d;
            const dealId = deal.id || d.dealId;
            const dealName = escapeHtml(deal.name || 'Unknown Deal');
            const dealStage = deal.stage || '';
            const ss = STAGE_STYLES[dealStage] || { bg: 'bg-gray-100', text: 'text-gray-600', label: dealStage };
            const role = escapeHtml(d.role || '');

            html += `
                <div class="flex items-center justify-between p-3 rounded-lg border border-border-subtle hover:border-primary/30 hover:bg-primary-light/30 transition-all group">
                    <a href="deal.html?id=${escapeHtml(dealId)}" class="flex items-center gap-2.5 flex-1 min-w-0">
                        <span class="material-symbols-outlined text-text-muted text-[18px] group-hover:text-primary">work</span>
                        <span class="text-sm font-medium text-text-main group-hover:text-primary truncate">${dealName}</span>
                        ${dealStage ? `<span class="px-2 py-0.5 rounded-md ${ss.bg} ${ss.text} text-[9px] font-bold uppercase tracking-wider shrink-0">${escapeHtml(ss.label)}</span>` : ''}
                    </a>
                    <div class="flex items-center gap-2 shrink-0 ml-2">
                        ${role ? `<span class="text-[10px] text-text-muted">${role}</span>` : ''}
                        <button onclick="handleUnlinkDeal('${escapeHtml(dealId)}')" class="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Unlink deal">
                            <span class="material-symbols-outlined text-[16px]">link_off</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += `</div>`;

    // Interaction Stats
    if (sortedInteractions.length > 0) {
        const typeCounts = { NOTE: 0, MEETING: 0, CALL: 0, EMAIL: 0, OTHER: 0 };
        for (const inter of sortedInteractions) {
            typeCounts[inter.type] = (typeCounts[inter.type] || 0) + 1;
        }
        const dates = sortedInteractions.map(i => new Date(i.date || i.createdAt).getTime());
        const oldest = Math.min(...dates);
        const newest = Math.max(...dates);
        const monthSpan = Math.max(1, (newest - oldest) / (30 * 86400000));
        const avgPerMonth = (sortedInteractions.length / monthSpan).toFixed(1);

        html += `<div class="mb-6">`;
        html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Interaction Stats</h4>`;
        html += `<div class="grid grid-cols-3 gap-2 mb-2">`;
        html += `<div class="p-2.5 rounded-lg bg-background-body border border-border-subtle text-center">
            <p class="text-lg font-bold text-text-main">${sortedInteractions.length}</p>
            <p class="text-[10px] text-text-muted font-medium uppercase">Total</p>
        </div>`;
        html += `<div class="p-2.5 rounded-lg bg-background-body border border-border-subtle text-center">
            <p class="text-lg font-bold text-text-main">~${avgPerMonth}</p>
            <p class="text-[10px] text-text-muted font-medium uppercase">Per Month</p>
        </div>`;
        const scoreData = contactScores[contact.id];
        if (scoreData) {
            const sc = SCORE_CONFIG[scoreData.label] || SCORE_CONFIG.Cold;
            html += `<div class="p-2.5 rounded-lg ${sc.bg} border border-border-subtle text-center">
                <p class="text-lg font-bold ${sc.text}">${scoreData.score}</p>
                <p class="text-[10px] ${sc.text} font-medium uppercase">${scoreData.label}</p>
            </div>`;
        } else {
            html += `<div class="p-2.5 rounded-lg bg-background-body border border-border-subtle text-center">
                <p class="text-lg font-bold text-text-muted">—</p>
                <p class="text-[10px] text-text-muted font-medium uppercase">Score</p>
            </div>`;
        }
        html += `</div>`;
        html += `<div class="flex flex-wrap gap-2">`;
        for (const [type, count] of Object.entries(typeCounts)) {
            if (count > 0) {
                const icon = INTERACTION_ICONS[type] || INTERACTION_ICONS.OTHER;
                html += `<span class="flex items-center gap-1 px-2 py-1 rounded-md bg-background-body border border-border-subtle text-[11px] text-text-secondary font-medium">
                    <span class="material-symbols-outlined text-[14px]">${icon}</span> ${count} ${type.charAt(0) + type.slice(1).toLowerCase()}${count !== 1 ? 's' : ''}
                </span>`;
            }
        }
        html += `</div></div>`;
    }

    // Interaction Timeline
    html += `<div class="mb-2">`;
    html += `<h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Interaction Timeline <span class="text-text-muted">(${sortedInteractions.length})</span></h4>`;

    // Inline add interaction form (hidden by default)
    html += `
        <div id="add-interaction-form" class="hidden mb-4 p-4 rounded-lg border border-primary/20 bg-primary-light/20">
            <div class="flex items-center justify-between mb-3">
                <h5 class="text-sm font-semibold text-text-main">New Interaction</h5>
                <button onclick="hideAddInteraction()" class="p-1 rounded hover:bg-white text-text-muted hover:text-text-main transition-colors">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>
            <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1">Type</label>
                        <select id="interaction-type"
                            class="w-full rounded-md border border-border-subtle bg-white px-2.5 py-1.5 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
                            <option value="NOTE">Note</option>
                            <option value="MEETING">Meeting</option>
                            <option value="CALL">Call</option>
                            <option value="EMAIL">Email</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1">Date</label>
                        <input type="date" id="interaction-date" value="${new Date().toISOString().split('T')[0]}"
                            class="w-full rounded-md border border-border-subtle bg-white px-2.5 py-1.5 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" />
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-medium text-text-secondary mb-1">Title</label>
                    <input type="text" id="interaction-title" placeholder="Brief summary..."
                        class="w-full rounded-md border border-border-subtle bg-white px-2.5 py-1.5 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" />
                </div>
                <div>
                    <label class="block text-xs font-medium text-text-secondary mb-1">Description</label>
                    <textarea id="interaction-description" rows="3" placeholder="Details about this interaction..."
                        class="w-full rounded-md border border-border-subtle bg-white px-2.5 py-1.5 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"></textarea>
                </div>
                <button onclick="submitInteraction()" class="self-end px-4 py-1.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">save</span>
                    Save
                </button>
            </div>
        </div>
    `;

    if (sortedInteractions.length === 0) {
        html += `<p class="text-text-muted text-sm italic">No interactions recorded</p>`;
    } else {
        html += `<div class="flex flex-col gap-0">`;
        sortedInteractions.forEach((inter, idx) => {
            const icon = INTERACTION_ICONS[inter.type] || INTERACTION_ICONS.OTHER;
            const interTitle = escapeHtml(inter.title || inter.type || 'Interaction');
            const interDesc = escapeHtml(inter.description || '');
            const interDate = inter.date || inter.createdAt;
            const isLast = idx === sortedInteractions.length - 1;

            html += `
                <div class="flex gap-3 relative">
                    <!-- Timeline line -->
                    ${!isLast ? `<div class="absolute left-[15px] top-[32px] bottom-0 w-px bg-border-subtle"></div>` : ''}
                    <!-- Icon circle -->
                    <div class="size-[30px] rounded-full bg-background-body border border-border-subtle flex items-center justify-center shrink-0 z-10">
                        <span class="material-symbols-outlined text-text-muted text-[16px]">${icon}</span>
                    </div>
                    <!-- Content -->
                    <div class="flex-1 pb-4 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <p class="text-sm font-medium text-text-main truncate">${interTitle}</p>
                            <span class="text-[11px] text-text-muted shrink-0">${escapeHtml(timeAgo(interDate))}</span>
                        </div>
                        ${interDesc ? `<p class="text-xs text-text-secondary mt-1 leading-relaxed">${interDesc}</p>` : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += `</div>`;

    body.innerHTML = html;

    // Load connections asynchronously
    loadConnectionsForDetail(contact.id);
}

async function loadConnectionsForDetail(contactId) {
    const list = document.getElementById('connections-list');
    if (!list) return;
    try {
        const connections = await fetchConnections(contactId);
        if (connections.length === 0) {
            list.innerHTML = `<p class="text-text-muted text-sm italic">No connections yet</p>`;
            return;
        }
        list.innerHTML = connections.map(conn => {
            const c = conn.contact || {};
            const rtc = RELATIONSHIP_TYPE_CONFIG[conn.type] || { label: conn.type, icon: 'link', bg: 'bg-gray-100', text: 'text-gray-700' };
            const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
            const name = escapeHtml(`${c.firstName || ''} ${c.lastName || ''}`.trim());
            const initials = getInitials(c.firstName, c.lastName);
            return `
                <div class="flex items-center gap-3 p-2.5 rounded-lg border border-border-subtle hover:border-primary/30 hover:bg-primary-light/30 transition-all group cursor-pointer" onclick="openDetail('${escapeHtml(c.id)}')">
                    <div class="size-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                        ${escapeHtml(initials)}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-main truncate group-hover:text-primary">${name}</p>
                        <p class="text-[10px] text-text-muted truncate">${escapeHtml(c.company || '')}${c.title ? ' · ' + escapeHtml(c.title) : ''}</p>
                    </div>
                    <span class="px-2 py-0.5 rounded-md ${rtc.bg} ${rtc.text} text-[9px] font-bold uppercase tracking-wider shrink-0">${escapeHtml(rtc.label)}</span>
                    <button onclick="event.stopPropagation(); handleDeleteConnection('${contactId}', '${escapeHtml(conn.id)}')" class="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Remove">
                        <span class="material-symbols-outlined text-[14px]">close</span>
                    </button>
                </div>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-text-muted text-xs">Unable to load connections</p>`;
    }
}

async function handleDeleteConnection(contactId, connectionId) {
    if (!confirm('Remove this connection?')) return;
    try {
        await deleteConnection(contactId, connectionId);
        showNotification('Connection Removed', 'Connection has been removed.', 'success');
        if (currentContact) openDetail(currentContact.id);
    } catch (err) {
        showNotification('Error', err.message, 'error');
    }
}

function closeDetail() {
    const backdrop = document.getElementById('detail-backdrop');
    const panel = document.getElementById('detail-panel');

    panel.classList.add('slide-over-leave');
    panel.classList.remove('slide-over-enter');

    setTimeout(() => {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('backdrop-enter');
        panel.classList.add('hidden');
        panel.classList.remove('slide-over-leave');
        currentContact = null;
    }, 200);
}

// openContactModal, closeContactModal, handleContactSubmit,
// editCurrentContact, deleteCurrentContact — moved to contacts-modals.js

// showAddInteraction, hideAddInteraction, submitInteraction — moved to contacts-modals.js

// showLinkDealModal, closeLinkDealModal, handleDealSearch,
// submitLinkDeal, handleUnlinkDeal — moved to contacts-modals.js

// showAddConnectionModal, closeConnectionModal, handleConnectionSearch,
// submitConnection — moved to contacts-modals.js
