/**
 * Invite Team Members Modal
 * Allows firm admins/members to invite new users to their organization
 * Design: Multi-user invite form with role and workspace assignment
 * Template & styles loaded from js/inviteModal-template.js
 */

/* global addInviteModalStyles, createInviteModalHTML */

const InviteModal = (function () {
  // API_BASE_URL + escapeHtml loaded from js/config.js + js/formatters.js

  // State
  let isOpen = false;
  let inviteRows = [];
  let availableDeals = [];
  let modalElement = null;
  let nextRowId = 1;

  // Role options
  const roles = [
    { value: 'VIEWER', label: 'Analyst', description: 'View-only access' },
    { value: 'MEMBER', label: 'Associate', description: 'Can edit deals' },
    { value: 'ADMIN', label: 'Admin', description: 'Full access' },
  ];

  // Render a single invite row
  function renderInviteRow(row, isFirst = false) {
    const roleOptions = roles.map(r =>
      `<option value="${r.value}" ${row.role === r.value ? 'selected' : ''}>${r.label}</option>`
    ).join('');

    const dealTags = row.deals.map(deal => `
      <div class="invite-tag bg-[#E6EDF5] border border-[#C8D4E0] text-[#003366] font-medium px-2 py-1 rounded-md flex items-center gap-1 text-xs">
        <span>${escapeHtml(deal.name)}</span>
        <button onclick="InviteModal.removeDealFromRow(${row.id}, '${escapeHtml(deal.id)}')" class="hover:text-[#4A6D8A] text-[#8099B3]">
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    `).join('');

    return `
      <div class="invite-row flex flex-col lg:flex-row gap-4 ${!isFirst ? 'pt-4' : 'pt-2'}" data-row-id="${row.id}">
        <!-- Email -->
        <div class="flex-[2]">
          ${isFirst ? '<label class="block mb-2 text-sm font-medium text-[#868E96]">Email Address</label>' : ''}
          <div class="relative">
            <input
              type="email"
              class="invite-email-input form-input block w-full rounded-lg border-[#EBEBEB] bg-white text-[#343A40] placeholder-[#868E96]/60 focus:border-[#003366] focus:ring-1 focus:ring-[#003366] h-12 px-4 text-sm transition-all"
              placeholder="colleague@firm.com"
              value="${row.email}"
              data-row-id="${row.id}"
            />
            ${row.email && isValidEmail(row.email) ? `
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 material-symbols-outlined text-lg">check_circle</span>
            ` : ''}
          </div>
        </div>

        <!-- Role -->
        <div class="flex-1 min-w-[140px]">
          ${isFirst ? '<label class="block mb-2 text-sm font-medium text-[#868E96]">Role</label>' : ''}
          <select
            class="invite-modal-select invite-role-select block w-full rounded-lg border-[#EBEBEB] bg-white text-[#343A40] focus:border-[#003366] focus:ring-1 focus:ring-[#003366] h-12 px-4 text-sm transition-all cursor-pointer"
            data-row-id="${row.id}"
          >
            ${roleOptions}
          </select>
        </div>

        <!-- Workspaces/Deals -->
        <div class="flex-[2]">
          ${isFirst ? '<label class="block mb-2 text-sm font-medium text-[#868E96]">Workspaces</label>' : ''}
          <div class="relative w-full rounded-lg border border-[#EBEBEB] bg-white min-h-[48px] px-2 py-1.5 flex items-center flex-wrap gap-2 focus-within:ring-1 focus-within:ring-[#003366] focus-within:border-[#003366] transition-all cursor-text group">
            ${dealTags}
            <input
              type="text"
              class="invite-deals-input bg-transparent border-none focus:ring-0 text-[#343A40] text-sm placeholder-[#868E96]/40 p-0 h-6 min-w-[60px] flex-1"
              placeholder="${row.deals.length > 0 ? 'Add deal...' : 'Search workspaces...'}"
              data-row-id="${row.id}"
            />
            <span class="material-symbols-outlined absolute right-3 text-[#868E96]/60 pointer-events-none text-lg group-focus-within:text-[#003366] transition-colors">search</span>
          </div>
          <!-- Deals Dropdown -->
          <div class="invite-deals-dropdown hidden absolute z-10 mt-1 w-full max-w-[300px] bg-white border border-[#EBEBEB] rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto" data-row-id="${row.id}">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Delete Button -->
        <div class="flex items-${isFirst ? 'end pb-1' : 'center'} ${isFirst ? 'lg:pb-1' : ''}">
          <button
            onclick="InviteModal.removeRow(${row.id})"
            class="text-[#868E96] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-black/5 ${inviteRows.length === 1 ? 'opacity-30 cursor-not-allowed' : ''}"
            title="Remove"
            ${inviteRows.length === 1 ? 'disabled' : ''}
          >
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    `;
  }

  // Render all rows
  function renderRows() {
    const container = document.getElementById('invite-rows-container');
    if (!container) return;

    container.innerHTML = inviteRows.map((row, index) => renderInviteRow(row, index === 0)).join('');

    // Re-attach event listeners
    attachRowEventListeners();
    updateSummary();
  }

  // Attach event listeners to row inputs
  function attachRowEventListeners() {
    // Email inputs
    document.querySelectorAll('.invite-email-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const rowId = parseInt(e.target.dataset.rowId);
        const row = inviteRows.find(r => r.id === rowId);
        if (row) {
          row.email = e.target.value;
          updateSummary();
          // Update validation icon
          const parent = e.target.parentElement;
          const existingIcon = parent.querySelector('.text-green-600');
          if (isValidEmail(row.email)) {
            if (!existingIcon) {
              const icon = document.createElement('span');
              icon.className = 'absolute right-3 top-1/2 -translate-y-1/2 text-green-600 material-symbols-outlined text-lg';
              icon.textContent = 'check_circle';
              parent.appendChild(icon);
            }
          } else if (existingIcon) {
            existingIcon.remove();
          }
        }
      });
    });

    // Role selects
    document.querySelectorAll('.invite-role-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const rowId = parseInt(e.target.dataset.rowId);
        const row = inviteRows.find(r => r.id === rowId);
        if (row) row.role = e.target.value;
      });
    });

    // Deal search inputs
    document.querySelectorAll('.invite-deals-input').forEach(input => {
      input.addEventListener('focus', (e) => showDealsDropdown(parseInt(e.target.dataset.rowId)));
      input.addEventListener('input', (e) => filterDeals(parseInt(e.target.dataset.rowId), e.target.value));
      input.addEventListener('blur', (e) => {
        // Delay to allow click on dropdown
        setTimeout(() => hideDealsDropdown(parseInt(e.target.dataset.rowId)), 200);
      });
    });
  }

  // Show deals dropdown
  function showDealsDropdown(rowId) {
    const dropdown = document.querySelector(`.invite-deals-dropdown[data-row-id="${rowId}"]`);
    if (!dropdown) return;

    const row = inviteRows.find(r => r.id === rowId);
    const selectedIds = row ? row.deals.map(d => d.id) : [];

    const available = availableDeals.filter(d => !selectedIds.includes(d.id));

    if (available.length === 0) {
      dropdown.innerHTML = '<div class="px-4 py-2 text-sm text-[#868E96]">No more deals available</div>';
    } else {
      dropdown.innerHTML = available.map(deal => `
        <button
          class="w-full text-left px-4 py-2 text-sm hover:bg-[#F0F4F8] text-[#343A40] transition-colors"
          onclick="InviteModal.addDealToRow(${rowId}, '${escapeHtml(deal.id)}', '${escapeHtml(deal.name)}')"
        >
          ${escapeHtml(deal.name)}
        </button>
      `).join('');
    }

    dropdown.classList.remove('hidden');
  }

  // Filter deals in dropdown
  function filterDeals(rowId, query) {
    const dropdown = document.querySelector(`.invite-deals-dropdown[data-row-id="${rowId}"]`);
    if (!dropdown) return;

    const row = inviteRows.find(r => r.id === rowId);
    const selectedIds = row ? row.deals.map(d => d.id) : [];

    const filtered = availableDeals.filter(d =>
      !selectedIds.includes(d.id) &&
      d.name.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="px-4 py-2 text-sm text-[#868E96]">No matching deals</div>';
    } else {
      dropdown.innerHTML = filtered.map(deal => `
        <button
          class="w-full text-left px-4 py-2 text-sm hover:bg-[#F0F4F8] text-[#343A40] transition-colors"
          onclick="InviteModal.addDealToRow(${rowId}, '${escapeHtml(deal.id)}', '${escapeHtml(deal.name)}')"
        >
          ${escapeHtml(deal.name)}
        </button>
      `).join('');
    }
  }

  // Hide deals dropdown
  function hideDealsDropdown(rowId) {
    const dropdown = document.querySelector(`.invite-deals-dropdown[data-row-id="${rowId}"]`);
    if (dropdown) dropdown.classList.add('hidden');
  }

  // Add deal to row
  function addDealToRow(rowId, dealId, dealName) {
    const row = inviteRows.find(r => r.id === rowId);
    if (row && !row.deals.find(d => d.id === dealId)) {
      row.deals.push({ id: dealId, name: dealName });
      renderRows();
    }
  }

  // Remove deal from row
  function removeDealFromRow(rowId, dealId) {
    const row = inviteRows.find(r => r.id === rowId);
    if (row) {
      row.deals = row.deals.filter(d => d.id !== dealId);
      renderRows();
    }
  }

  // Add new row
  function addRow() {
    inviteRows.push({
      id: nextRowId++,
      email: '',
      role: 'MEMBER',
      deals: []
    });
    renderRows();
  }

  // Remove row
  function removeRow(rowId) {
    if (inviteRows.length <= 1) return;
    inviteRows = inviteRows.filter(r => r.id !== rowId);
    renderRows();
  }

  // Update summary text
  function updateSummary() {
    const validCount = inviteRows.filter(r => isValidEmail(r.email)).length;
    const countDisplay = document.getElementById('invite-count-display');
    if (countDisplay) {
      countDisplay.textContent = `${validCount} user${validCount !== 1 ? 's' : ''}`;
    }
  }

  // Email validation
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Initialize modal
  function init() {
    if (modalElement) return;

    addInviteModalStyles();
    modalElement = createInviteModalHTML();
    document.body.appendChild(modalElement);

    // Event listeners
    document.getElementById('invite-modal-backdrop').addEventListener('click', close);
    document.getElementById('invite-modal-close').addEventListener('click', close);
    document.getElementById('invite-modal-cancel').addEventListener('click', close);
    document.getElementById('add-invite-row-btn').addEventListener('click', addRow);
    document.getElementById('invite-submit-btn').addEventListener('click', handleSubmit);

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  // Load available deals
  async function loadDeals() {
    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/deals?status=ACTIVE`);
      if (response.ok) {
        const data = await response.json();
        availableDeals = data.map(d => ({ id: d.id, name: d.name }));
      }
    } catch (error) {
      console.error('Error loading deals:', error);
      availableDeals = [];
    }
  }

  // Open modal
  async function open() {
    init();
    isOpen = true;

    // Reset state
    nextRowId = 1;
    inviteRows = [{
      id: nextRowId++,
      email: '',
      role: 'MEMBER',
      deals: []
    }];

    modalElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Load deals and render
    await loadDeals();
    renderRows();

    // Focus first email input
    setTimeout(() => {
      const firstInput = document.querySelector('.invite-email-input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Close modal
  function close() {
    if (!modalElement) return;

    isOpen = false;
    modalElement.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Handle form submission
  async function handleSubmit() {
    const validRows = inviteRows.filter(r => isValidEmail(r.email));

    if (validRows.length === 0) {
      showNotification('Error', 'Please enter at least one valid email address', 'error');
      return;
    }

    const submitBtn = document.getElementById('invite-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
      Sending...
    `;

    let successCount = 0;
    let errorCount = 0;
    let emailFailCount = 0;
    let errorMessages = [];
    let lastInviteUrl = null;

    for (const row of validRows) {
      try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: row.email,
            role: row.role,
            // deals: row.deals.map(d => d.id) // For future: assign to specific deals
          }),
        });

        if (response.ok) {
          const data = await response.json();
          successCount++;
          if (data.emailSent === false) {
            emailFailCount++;
            if (data.inviteUrl) lastInviteUrl = data.inviteUrl;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.error || 'Failed to send invitation';
          console.error('Invitation error:', msg);
          errorMessages.push(`${row.email}: ${msg}`);
          errorCount++;
        }
      } catch (error) {
        console.error('Error sending invitation:', error);
        errorMessages.push(`${row.email}: Network error`);
        errorCount++;
      }
    }

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined text-lg">send</span>
      Send Invitations
    `;

    if (successCount > 0) {
      if (emailFailCount > 0 && emailFailCount === successCount) {
        // All emails failed — show invite link for manual sharing
        if (lastInviteUrl) {
          showNotification('Invitation Created', `Invitation created but email could not be sent. Copy the invite link to share manually.`, 'warning');
          promptCopyInviteLink(lastInviteUrl);
        } else {
          showNotification('Warning', `${successCount} invitation${successCount > 1 ? 's' : ''} created but email delivery failed. Check email service configuration.`, 'error');
        }
      } else if (emailFailCount > 0) {
        showNotification('Partial Success', `${successCount - emailFailCount} email${successCount - emailFailCount > 1 ? 's' : ''} sent. ${emailFailCount} email${emailFailCount > 1 ? 's' : ''} failed to deliver.`, 'warning');
      } else {
        showNotification('Success', `${successCount} invitation${successCount > 1 ? 's' : ''} sent successfully!`, 'success');
      }
      close();
    }

    if (errorCount > 0 && successCount === 0) {
      // All failed — show the specific error
      showNotification('Error', errorMessages[0] || 'Failed to send invitations', 'error');
    } else if (errorCount > 0) {
      // Some failed — show summary
      showNotification('Warning', errorMessages.join('. '), 'error');
    }
  }

  // Helper: Show notification
  function showNotification(title, message, type) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(title, message, type);
    } else {
      console.log(`[${type}] ${title}: ${message}`);
    }
  }

  // Show a copy-link prompt when email delivery fails
  function promptCopyInviteLink(url) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 z-[60] bg-white border border-[#EBEBEB] rounded-xl shadow-2xl p-4 max-w-md animate-in';
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="material-symbols-outlined text-amber-500 text-xl mt-0.5">link</span>
        <div class="flex-1">
          <p class="text-sm font-semibold text-[#343A40] mb-2">Share Invite Link Manually</p>
          <div class="flex gap-2">
            <input type="text" readonly value="${url}" class="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 select-all" />
            <button onclick="navigator.clipboard.writeText('${url}').then(() => { this.textContent = 'Copied!'; setTimeout(() => this.closest('.fixed').remove(), 1500); })"
              class="px-3 py-2 text-xs font-medium text-white rounded-lg whitespace-nowrap" style="background-color: #003366;">
              Copy
            </button>
          </div>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
          <span class="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 30000);
  }

  // Public API
  return {
    open,
    close,
    addRow,
    removeRow,
    addDealToRow,
    removeDealFromRow,
  };
})();

// Export for use in other files
window.InviteModal = InviteModal;
