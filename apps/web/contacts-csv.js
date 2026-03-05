// ============================================================
// CRM Contacts — CSV Export & Import
// Depends on: API_BASE, PEAuth, escapeHtml (from shared modules)
// Depends on: currentFilter, importedContacts, loadContacts (from contacts.js)
// ============================================================

var importedContacts = [];

async function exportContacts() {
    try {
        const params = new URLSearchParams();
        if (currentFilter.search) params.set('search', currentFilter.search);
        if (currentFilter.type) params.set('type', currentFilter.type);
        params.set('sortBy', currentFilter.sortBy);
        params.set('sortOrder', currentFilter.sortOrder);

        const res = await PEAuth.authFetch(`${API_BASE}/contacts/export?${params.toString()}`);
        if (!res.ok) throw new Error('Export failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Export error:', err);
        alert('Failed to export contacts. Please try again.');
    }
}

function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    resetImportModal();
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    importedContacts = [];
}

function resetImportModal() {
    importedContacts = [];
    document.getElementById('import-step-upload').classList.remove('hidden');
    document.getElementById('import-step-preview').classList.add('hidden');
    document.getElementById('import-step-result').classList.add('hidden');
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-error-msg').classList.add('hidden');
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse header — handle quoted fields
    const parseRow = (line) => {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        fields.push(current.trim());
        return fields;
    };

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

    // Map common header names to our fields
    const fieldMap = {};
    headers.forEach((h, i) => {
        if (['firstname', 'first', 'fname'].includes(h)) fieldMap.firstName = i;
        else if (['lastname', 'last', 'lname', 'surname'].includes(h)) fieldMap.lastName = i;
        else if (['email', 'emailaddress', 'mail'].includes(h)) fieldMap.email = i;
        else if (['phone', 'phonenumber', 'mobile', 'tel'].includes(h)) fieldMap.phone = i;
        else if (['title', 'jobtitle', 'position', 'role'].includes(h)) fieldMap.title = i;
        else if (['company', 'organization', 'org', 'companyname'].includes(h)) fieldMap.company = i;
        else if (['type', 'contacttype', 'category'].includes(h)) fieldMap.type = i;
        else if (['linkedin', 'linkedinurl', 'linkedinprofile'].includes(h)) fieldMap.linkedinUrl = i;
    });

    if (fieldMap.firstName === undefined && fieldMap.lastName === undefined) {
        // Try "name" as full name
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'fullname');
        if (nameIdx >= 0) fieldMap.fullName = nameIdx;
    }

    const contacts = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i]);
        if (cols.every(c => !c)) continue; // skip empty rows

        let firstName = '', lastName = '';
        if (fieldMap.fullName !== undefined) {
            const parts = (cols[fieldMap.fullName] || '').split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
        } else {
            firstName = cols[fieldMap.firstName] || '';
            lastName = cols[fieldMap.lastName] || '';
        }

        if (!firstName && !lastName) continue;

        const validTypes = ['BANKER', 'ADVISOR', 'EXECUTIVE', 'LP', 'LEGAL', 'OTHER'];
        let type = (cols[fieldMap.type] || '').toUpperCase();
        if (!validTypes.includes(type)) type = 'OTHER';

        contacts.push({
            firstName,
            lastName,
            email: cols[fieldMap.email] || '',
            phone: cols[fieldMap.phone] || '',
            title: cols[fieldMap.title] || '',
            company: cols[fieldMap.company] || '',
            type,
            linkedinUrl: cols[fieldMap.linkedinUrl] || '',
        });
    }
    return contacts;
}

function handleImportFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
        alert('Please select a CSV file.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        importedContacts = parseCSV(e.target.result);
        if (importedContacts.length === 0) {
            alert('No valid contacts found in CSV. Make sure it has First Name and Last Name columns.');
            return;
        }

        // Show preview
        document.getElementById('import-step-upload').classList.add('hidden');
        document.getElementById('import-step-preview').classList.remove('hidden');
        document.getElementById('import-count').textContent = importedContacts.length;

        const tbody = document.getElementById('import-preview-body');
        const preview = importedContacts.slice(0, 50); // show max 50 rows
        tbody.innerHTML = preview.map(c => `
            <tr class="border-b border-border-subtle">
                <td class="py-2 text-text-main font-medium">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</td>
                <td class="py-2 text-text-muted">${escapeHtml(c.email || '—')}</td>
                <td class="py-2 text-text-muted">${escapeHtml(c.company || '—')}</td>
                <td class="py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-text-muted">${escapeHtml(c.type)}</span></td>
            </tr>
        `).join('') + (importedContacts.length > 50 ? `<tr><td colspan="4" class="py-2 text-xs text-text-muted text-center">...and ${importedContacts.length - 50} more</td></tr>` : '');
    };
    reader.readAsText(file);
}

async function submitImport() {
    const btn = document.getElementById('import-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Importing...';

    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: importedContacts }),
        });

        const data = await res.json();

        // Show result
        document.getElementById('import-step-preview').classList.add('hidden');
        document.getElementById('import-step-result').classList.remove('hidden');

        if (data.imported > 0) {
            document.getElementById('import-result-icon').textContent = 'check_circle';
            document.getElementById('import-result-icon').className = 'material-symbols-outlined text-secondary text-5xl mb-3';
            document.getElementById('import-result-title').textContent = `${data.imported} contacts imported!`;
            document.getElementById('import-result-detail').textContent = data.failed > 0
                ? `${data.failed} contact${data.failed > 1 ? 's' : ''} failed to import.`
                : 'All contacts were imported successfully.';
        } else {
            document.getElementById('import-result-icon').textContent = 'error';
            document.getElementById('import-result-icon').className = 'material-symbols-outlined text-red-500 text-5xl mb-3';
            document.getElementById('import-result-title').textContent = 'Import failed';
            document.getElementById('import-result-detail').textContent = data.errors?.[0] || 'No contacts could be imported.';
        }
    } catch (err) {
        console.error('Import error:', err);
        document.getElementById('import-error-msg').textContent = 'Import failed. Please try again.';
        document.getElementById('import-error-msg').classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">upload</span> Import All';
    }
}
