// ============================================================
// CRM Contacts — Rendering & Insights
// Extracted from contacts.js for maintainability.
// Depends on globals from contacts.js: contacts, totalContacts,
// currentContact, currentFilter, contactScores, viewMode,
// groupByCompany, TYPE_CONFIG, INTERACTION_ICONS, STAGE_STYLES,
// SCORE_CONFIG, RELATIONSHIP_TYPE_CONFIG, getInitials,
// openDetail, loadContacts
// Depends on shared modules: API_BASE_URL, PEAuth, escapeHtml,
// timeAgo, showNotification
// ============================================================

// ============================================================
// Rendering — Contact Cards
// ============================================================

function renderContactCard(contact) {
    const tc = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
    const initials = getInitials(contact.firstName, contact.lastName);
    const fullName = escapeHtml((contact.firstName || '') + ' ' + (contact.lastName || ''));
    const title = escapeHtml(contact.title || '');
    const company = escapeHtml(contact.company || '');
    const email = escapeHtml(contact.email || '');
    const phone = escapeHtml(contact.phone || '');
    const tags = (contact.tags || []).slice(0, 4);
    const linkedDealsCount = contact.linkedDeals ? contact.linkedDeals.length : (contact._linkedDealsCount || 0);

    // Find last interaction date
    let lastContactedText = 'Never contacted';
    if (contact.interactions && contact.interactions.length > 0) {
        const sorted = [...contact.interactions].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
        lastContactedText = 'Contacted ' + timeAgo(sorted[0].date || sorted[0].createdAt);
    } else if (contact.lastInteractionAt) {
        lastContactedText = 'Contacted ' + timeAgo(contact.lastInteractionAt);
    }

    return `
        <div class="contact-card cursor-pointer" data-contact-id="${escapeHtml(contact.id)}" onclick="openDetail('${escapeHtml(contact.id)}')">
            <article class="bg-surface-card rounded-lg border border-border-subtle p-5 hover:border-primary/30 transition-all flex flex-col h-full shadow-card hover:shadow-card-hover relative overflow-hidden group">
                <!-- Top Row: Avatar + Name + Type badge -->
                <div class="flex items-start gap-3.5 mb-4">
                    <div class="size-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold shadow-sm" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                        ${escapeHtml(initials)}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-text-main font-bold text-[15px] leading-tight group-hover:text-primary transition-colors truncate">${fullName}</h3>
                        ${title ? `<p class="text-text-secondary text-xs mt-0.5 truncate">${title}</p>` : ''}
                    </div>
                    <span class="px-2 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-bold uppercase tracking-wider shrink-0">${escapeHtml(tc.label)}</span>
                </div>

                <!-- Company -->
                ${company ? `
                <div class="flex items-center gap-1.5 mb-3">
                    <span class="material-symbols-outlined text-text-muted text-[16px]">business</span>
                    <span class="text-sm text-text-secondary truncate">${company}</span>
                </div>
                ` : ''}

                <!-- Contact info -->
                <div class="flex flex-col gap-1.5 mb-3">
                    ${email ? `
                    <a href="mailto:${email}" onclick="event.stopPropagation();" class="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors truncate">
                        <span class="material-symbols-outlined text-[14px]">mail</span>
                        <span class="truncate">${email}</span>
                    </a>
                    ` : ''}
                    ${phone ? `
                    <a href="tel:${phone}" onclick="event.stopPropagation();" class="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[14px]">call</span>
                        ${phone}
                    </a>
                    ` : ''}
                </div>

                <!-- Tags -->
                ${tags.length > 0 ? `
                <div class="flex flex-wrap gap-1.5 mb-3">
                    ${tags.map(t => `<span class="px-2 py-0.5 rounded-full bg-background-body text-text-muted text-[10px] font-medium border border-border-subtle">${escapeHtml(t)}</span>`).join('')}
                    ${(contact.tags || []).length > 4 ? `<span class="text-[10px] text-text-muted">+${(contact.tags.length - 4)}</span>` : ''}
                </div>
                ` : ''}

                <!-- Footer: Last contacted + Score + Deals count -->
                <div class="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
                    <span class="text-[11px] text-text-muted font-medium">${escapeHtml(lastContactedText)}</span>
                    <div class="flex items-center gap-2">
                        ${(() => {
                            const sd = contactScores[contact.id];
                            if (!sd) return '';
                            const sc = SCORE_CONFIG[sd.label] || SCORE_CONFIG.Cold;
                            return `<span class="flex items-center gap-1 px-1.5 py-0.5 rounded-md ${sc.bg} ${sc.text} text-[10px] font-bold"><span class="w-1.5 h-1.5 rounded-full ${sc.dot}"></span>${sd.score}</span>`;
                        })()}
                        ${linkedDealsCount > 0 ? `
                        <span class="flex items-center gap-1 text-[11px] text-text-muted font-medium">
                            <span class="material-symbols-outlined text-[14px]">work</span>
                            ${linkedDealsCount}
                        </span>
                        ` : ''}
                    </div>
                </div>
            </article>
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <div class="size-20 rounded-full bg-primary-light/60 flex items-center justify-center mb-5">
                <span class="material-symbols-outlined text-primary text-4xl">groups</span>
            </div>
            <h3 class="text-lg font-bold text-text-main mb-2">Start building your network</h3>
            <p class="text-text-muted text-sm mb-6 text-center max-w-xs">Add contacts to track relationships with bankers, advisors, executives, and LPs.</p>
            <button onclick="openContactModal()" class="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg shadow-sm hover:bg-primary-hover transition-colors text-sm font-medium">
                <span class="material-symbols-outlined text-[18px]">person_add</span>
                Add Your First Contact
            </button>
        </div>
    `;
}

function renderContactRow(contact) {
    const tc = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
    const initials = getInitials(contact.firstName, contact.lastName);
    const fullName = escapeHtml((contact.firstName || '') + ' ' + (contact.lastName || ''));
    const company = escapeHtml(contact.company || '');
    const email = escapeHtml(contact.email || '');
    const title = escapeHtml(contact.title || '');

    let lastContactedText = '—';
    if (contact.interactions && contact.interactions.length > 0) {
        const sorted = [...contact.interactions].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
        lastContactedText = timeAgo(sorted[0].date || sorted[0].createdAt);
    } else if (contact.lastInteractionAt) {
        lastContactedText = timeAgo(contact.lastInteractionAt);
    }

    const sd = contactScores[contact.id];
    let scoreBadge = '';
    if (sd) {
        const sc = SCORE_CONFIG[sd.label] || SCORE_CONFIG.Cold;
        scoreBadge = `<span class="flex items-center gap-1 px-1.5 py-0.5 rounded-md ${sc.bg} ${sc.text} text-[10px] font-bold"><span class="w-1.5 h-1.5 rounded-full ${sc.dot}"></span>${sd.score}</span>`;
    }

    return `
        <tr class="hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-border-subtle" onclick="openDetail('${escapeHtml(contact.id)}')">
            <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                    <div class="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">${escapeHtml(initials)}</div>
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-text-main truncate">${fullName}</p>
                        ${title ? `<p class="text-xs text-text-muted truncate">${title}</p>` : ''}
                    </div>
                </div>
            </td>
            <td class="px-4 py-3 text-sm text-text-secondary truncate max-w-[180px]">${company || '—'}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-bold uppercase">${escapeHtml(tc.label)}</span></td>
            <td class="px-4 py-3 text-sm text-text-muted truncate max-w-[200px]">${email || '—'}</td>
            <td class="px-4 py-3 text-sm text-text-muted">${lastContactedText}</td>
            <td class="px-4 py-3">${scoreBadge || '<span class="text-text-muted text-xs">—</span>'}</td>
        </tr>
    `;
}

function renderListView(contactsList) {
    return `
        <div class="col-span-full bg-surface-card rounded-lg border border-border-subtle shadow-card overflow-hidden">
            <table class="w-full">
                <thead>
                    <tr class="border-b border-border-subtle bg-slate-50/50">
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Name</th>
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Company</th>
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Type</th>
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Email</th>
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Last Contact</th>
                        <th class="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${contactsList.map(c => renderContactRow(c)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function setViewMode(mode) {
    viewMode = mode;
    // Update toggle button styles
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    if (mode === 'grid') {
        gridBtn.className = 'flex items-center justify-center w-9 h-full transition-colors bg-primary/10 text-primary';
        listBtn.className = 'flex items-center justify-center w-9 h-full transition-colors bg-surface-card text-text-muted hover:text-text-secondary';
    } else {
        listBtn.className = 'flex items-center justify-center w-9 h-full transition-colors bg-primary/10 text-primary';
        gridBtn.className = 'flex items-center justify-center w-9 h-full transition-colors bg-surface-card text-text-muted hover:text-text-secondary';
    }
    // Re-render with current contacts
    renderContactsView();
}

function renderContactsView() {
    const grid = document.getElementById('contacts-grid');
    if (contacts.length === 0) return;

    if (groupByCompany) {
        grid.className = 'flex flex-col gap-6 pb-2';
        grid.innerHTML = renderGroupedByCompany(contacts);
    } else if (viewMode === 'list') {
        grid.className = 'pb-2';
        grid.innerHTML = renderListView(contacts);
    } else {
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-2';
        grid.innerHTML = contacts.map(c => renderContactCard(c)).join('');
    }
}

function toggleGroupByCompany() {
    groupByCompany = !groupByCompany;
    const label = document.getElementById('group-label');
    if (label) label.textContent = groupByCompany ? 'Ungroup Contacts' : 'Group by Company';
    renderContactsView();
}

function renderGroupedByCompany(contactsList) {
    // Group contacts by company
    const groups = {};
    for (const c of contactsList) {
        const key = (c.company || '').trim() || 'No Company';
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
    }

    // Sort groups: companies with most contacts first, "No Company" last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'No Company') return 1;
        if (b === 'No Company') return -1;
        return groups[b].length - groups[a].length;
    });

    return sortedKeys.map(company => {
        const companyContacts = groups[company];
        const cards = viewMode === 'list'
            ? `<div class="bg-surface-card rounded-lg border border-border-subtle shadow-card overflow-hidden">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-border-subtle bg-slate-50/50">
                            <th class="px-4 py-2 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Name</th>
                            <th class="px-4 py-2 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Type</th>
                            <th class="px-4 py-2 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Email</th>
                            <th class="px-4 py-2 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Last Contact</th>
                            <th class="px-4 py-2 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider">Score</th>
                        </tr>
                    </thead>
                    <tbody>${companyContacts.map(c => renderContactRow(c)).join('')}</tbody>
                </table>
               </div>`
            : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${companyContacts.map(c => renderContactCard(c)).join('')}</div>`;

        return `
            <div>
                <div class="flex items-center gap-3 mb-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-text-muted text-[18px]">corporate_fare</span>
                        <h3 class="text-sm font-bold text-text-main">${escapeHtml(company)}</h3>
                    </div>
                    <span class="px-2 py-0.5 rounded-full bg-slate-100 text-text-muted text-[11px] font-bold">${companyContacts.length}</span>
                    <div class="flex-1 border-t border-border-subtle"></div>
                </div>
                ${cards}
            </div>
        `;
    }).join('');
}

function renderLoadingState() {
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <span class="material-symbols-outlined text-primary text-4xl animate-spin mb-4">sync</span>
            <p class="text-text-muted text-sm font-medium">Loading contacts...</p>
        </div>
    `;
}

function renderErrorState(message) {
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <span class="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
            <p class="text-text-main font-medium mb-2">Failed to load contacts</p>
            <p class="text-text-muted text-sm mb-4">${escapeHtml(message)}</p>
            <button onclick="loadContacts()" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
                Try Again
            </button>
        </div>
    `;
}

// ============================================================
// Insights — Timeline, Duplicates, Stale Contacts, Network
// ============================================================

async function loadInsights() {
    loadTimeline();
    loadStaleContacts();
    loadDuplicates();
    loadNetworkStats();
}

async function loadNetworkStats() {
    const container = document.getElementById('network-stats-content');
    try {
        const data = await fetchNetworkInsights();
        if (!data) throw new Error('No data');

        const byType = data.byType || {};
        const mostConnected = (data.mostConnected || []).slice(0, 3);

        let typeBadges = Object.entries(byType)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => {
                const tc = TYPE_CONFIG[type] || TYPE_CONFIG.OTHER;
                return `<span class="px-2 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-bold">${escapeHtml(tc.label)} ${count}</span>`;
            }).join('');

        let topList = '';
        if (mostConnected.length > 0) {
            topList = `
                <div class="mt-2 pt-2 border-t border-border-subtle">
                    <p class="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Most Connected</p>
                    ${mostConnected.map(c => {
                        const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
                        const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
                        return `
                        <div class="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" onclick="openDetail('${escapeHtml(c.id)}')">
                            <div class="size-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                                ${escapeHtml(((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '')).toUpperCase()}
                            </div>
                            <span class="text-xs text-text-main truncate flex-1">${escapeHtml(name)}</span>
                            <span class="text-[10px] text-text-muted">${c.score || 0}</span>
                        </div>`;
                    }).join('')}
                </div>`;
        }

        container.innerHTML = `
            <div class="px-4 py-3">
                <div class="flex items-center gap-4 mb-2">
                    <div class="text-center">
                        <p class="text-lg font-bold text-text-main">${data.totalContacts || 0}</p>
                        <p class="text-[10px] text-text-muted">Contacts</p>
                    </div>
                    <div class="text-center">
                        <p class="text-lg font-bold text-emerald-600">${data.totalConnections || 0}</p>
                        <p class="text-[10px] text-text-muted">Connections</p>
                    </div>
                </div>
                ${typeBadges ? `<div class="flex flex-wrap gap-1">${typeBadges}</div>` : ''}
                ${topList}
            </div>`;
    } catch (err) {
        container.innerHTML = `<div class="px-4 py-4 text-xs text-text-muted text-center">Unable to load network stats</div>`;
    }
}

async function loadTimeline() {
    const list = document.getElementById('timeline-list');
    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/insights/timeline?limit=10`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const interactions = data.interactions || [];

        if (interactions.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-6 text-text-muted">
                    <span class="material-symbols-outlined text-2xl mb-1 opacity-40">history</span>
                    <p class="text-xs">No interactions yet</p>
                </div>`;
            return;
        }

        list.innerHTML = interactions.map(inter => {
            const contact = inter.Contact || {};
            const name = escapeHtml(`${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown');
            const icon = INTERACTION_ICONS[inter.type] || INTERACTION_ICONS.OTHER;
            const tc = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
            const interTitle = escapeHtml(inter.title || inter.type || 'Interaction');
            const ago = timeAgo(inter.date || inter.createdAt);

            return `
                <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors border-b border-border-subtle last:border-0" onclick="openDetail('${escapeHtml(contact.id)}')">
                    <div class="size-7 rounded-full flex items-center justify-center shrink-0" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                        <span class="material-symbols-outlined text-[14px]">${icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-text-main truncate">${interTitle}</p>
                        <p class="text-[10px] text-text-muted truncate">with ${name}${contact.company ? ' · ' + escapeHtml(contact.company) : ''}</p>
                    </div>
                    <span class="text-[10px] text-text-muted shrink-0">${escapeHtml(ago)}</span>
                </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<div class="px-4 py-4 text-xs text-text-muted text-center">Unable to load timeline</div>`;
    }
}

async function loadStaleContacts() {
    const list = document.getElementById('stale-list');
    const badge = document.getElementById('stale-count');
    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/insights/stale?days=30`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const stale = data.contacts || [];

        badge.textContent = stale.length;
        if (stale.length === 0) {
            badge.classList.add('hidden');
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-6 text-text-muted">
                    <span class="material-symbols-outlined text-2xl mb-1 text-secondary opacity-60">check_circle</span>
                    <p class="text-xs">All contacts are up to date!</p>
                </div>`;
            return;
        }

        list.innerHTML = stale.slice(0, 8).map(c => {
            const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
            const name = escapeHtml(`${c.firstName || ''} ${c.lastName || ''}`.trim());
            const initials = ((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '');

            return `
                <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/50 cursor-pointer transition-colors border-b border-border-subtle last:border-0" onclick="openDetail('${escapeHtml(c.id)}')">
                    <div class="size-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style="background-color: ${tc.avatarBg}; color: ${tc.avatarText};">
                        ${escapeHtml(initials.toUpperCase())}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-text-main truncate">${name}</p>
                        <p class="text-[10px] text-text-muted truncate">${c.company ? escapeHtml(c.company) + ' · ' : ''}${escapeHtml(c.reason)}</p>
                    </div>
                    <span class="material-symbols-outlined text-amber-500 text-[16px] shrink-0">schedule</span>
                </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<div class="px-4 py-4 text-xs text-text-muted text-center">Unable to load reminders</div>`;
    }
}

async function loadDuplicates() {
    const list = document.getElementById('dup-list');
    const badge = document.getElementById('dup-count');
    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/insights/duplicates`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const dups = data.duplicates || [];

        badge.textContent = dups.length;
        if (dups.length === 0) {
            badge.classList.add('hidden');
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-6 text-text-muted">
                    <span class="material-symbols-outlined text-2xl mb-1 text-secondary opacity-60">verified</span>
                    <p class="text-xs">No duplicates found</p>
                </div>`;
            return;
        }

        list.innerHTML = dups.map(dup => {
            const names = dup.contacts.map(c => escapeHtml(`${c.firstName} ${c.lastName}`)).join(', ');
            const icon = dup.reason === 'Same email' ? 'mail' : 'person';

            return `
                <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/50 transition-colors border-b border-border-subtle last:border-0">
                    <div class="size-7 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-red-500 text-[14px]">${icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-text-main truncate">${names}</p>
                        <p class="text-[10px] text-text-muted">${escapeHtml(dup.reason)}: ${escapeHtml(dup.key)}</p>
                    </div>
                    <span class="material-symbols-outlined text-red-400 text-[16px] shrink-0">warning</span>
                </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<div class="px-4 py-4 text-xs text-text-muted text-center">Unable to check duplicates</div>`;
    }
}
