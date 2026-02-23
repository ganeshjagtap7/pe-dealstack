/**
 * Invite Team Members Modal
 * Allows firm admins/members to invite new users to their organization
 * Design: Multi-user invite form with role and workspace assignment
 */

const InviteModal = (function () {
  const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

  // XSS prevention - escape HTML entities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

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

  // Add custom styles for the modal
  function addStyles() {
    if (document.getElementById('invite-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'invite-modal-styles';
    style.textContent = `
      .invite-modal-select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
        background-position: right 0.5rem center;
        background-repeat: no-repeat;
        background-size: 1.5em 1.5em;
        padding-right: 2.5rem;
        appearance: none;
      }
      .invite-tag {
        animation: tagIn 0.2s ease-out;
      }
      @keyframes tagIn {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }
      .invite-row {
        animation: rowIn 0.25s ease-out;
      }
      @keyframes rowIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // Create modal HTML
  function createModalHTML() {
    const modal = document.createElement('div');
    modal.id = 'invite-modal';
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/10 backdrop-blur-[2px]" id="invite-modal-backdrop"></div>

      <!-- Modal -->
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-[960px] max-h-[90vh] flex flex-col bg-[#FAFAFA] border border-[#EBEBEB] rounded-2xl shadow-2xl overflow-hidden" style="animation: slideIn 0.3s ease-out;">

          <!-- Header -->
          <div class="px-8 pt-8 pb-4 flex justify-between items-start">
            <div class="flex flex-col gap-1">
              <h3 class="text-[#343A40] tracking-tight text-2xl font-bold leading-tight">Invite Team Members</h3>
              <p class="text-[#868E96] text-base font-normal leading-normal">Add colleagues to your organization and assign deal access.</p>
            </div>
            <button id="invite-modal-close" class="text-[#868E96] hover:text-[#343A40] transition-colors p-2 rounded-full hover:bg-black/5">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-8 py-2" id="invite-modal-content">
            <!-- Invite Rows Container -->
            <div id="invite-rows-container" class="space-y-4">
              <!-- Rows will be rendered here -->
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-6 gap-4 border-t border-[#EBEBEB] pt-6 pb-2">
              <button id="add-invite-row-btn" class="flex items-center gap-2 text-[#1269e2] hover:text-blue-700 font-medium text-sm transition-colors group px-2 py-1 rounded-md hover:bg-[#1269e2]/10">
                <span class="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">add_circle</span>
                Add another team member
              </button>
              <button id="bulk-import-btn" class="flex items-center gap-2 text-[#868E96] hover:text-[#343A40] font-medium text-sm transition-colors px-2 py-1 rounded-md hover:bg-black/5">
                <span class="material-symbols-outlined text-xl">upload_file</span>
                Bulk import via CSV
              </button>
            </div>

            <!-- Access Control Info -->
            <div class="mt-4 bg-[#1269e2]/5 border border-[#1269e2]/10 rounded-lg p-3 flex gap-3 items-start">
              <span class="material-symbols-outlined text-[#1269e2] text-xl mt-0.5">info</span>
              <div class="text-sm text-[#868E96]">
                <span class="text-[#343A40] font-medium">Access Control:</span> Analysts have <span class="text-[#343A40]">view-only</span> access to assigned deal workspaces. Associates can edit models but cannot invite external guests.
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-8 py-6 bg-white border-t border-[#EBEBEB] flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="text-sm text-[#868E96] hidden sm:block" id="invite-summary">
              Inviting <span class="text-[#343A40] font-semibold" id="invite-count-display">0 users</span> to organization
            </div>
            <div class="flex gap-3 w-full sm:w-auto">
              <button id="invite-modal-cancel" class="flex-1 sm:flex-none px-6 py-3 rounded-lg border border-[#EBEBEB] text-[#343A40] font-medium text-sm hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-black/10">
                Cancel
              </button>
              <button id="invite-submit-btn" class="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-[#1269e2] hover:bg-blue-600 text-white font-medium text-sm shadow-lg shadow-[#1269e2]/20 transition-all transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-[#1269e2] flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-lg">send</span>
                Send Invitations
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return modal;
  }

  // Render a single invite row
  function renderInviteRow(row, isFirst = false) {
    const roleOptions = roles.map(r =>
      `<option value="${r.value}" ${row.role === r.value ? 'selected' : ''}>${r.label}</option>`
    ).join('');

    const dealTags = row.deals.map(deal => `
      <div class="invite-tag bg-[#1269e2]/10 border border-[#1269e2]/20 text-[#1269e2] font-medium px-2 py-1 rounded-md flex items-center gap-1 text-xs">
        <span>${escapeHtml(deal.name)}</span>
        <button onclick="InviteModal.removeDealFromRow(${row.id}, '${escapeHtml(deal.id)}')" class="hover:text-[#1269e2]/70 text-[#1269e2]/50">
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
              class="invite-email-input form-input block w-full rounded-lg border-[#EBEBEB] bg-white text-[#343A40] placeholder-[#868E96]/60 focus:border-[#1269e2] focus:ring-1 focus:ring-[#1269e2] h-12 px-4 text-sm transition-all"
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
            class="invite-modal-select invite-role-select block w-full rounded-lg border-[#EBEBEB] bg-white text-[#343A40] focus:border-[#1269e2] focus:ring-1 focus:ring-[#1269e2] h-12 px-4 text-sm transition-all cursor-pointer"
            data-row-id="${row.id}"
          >
            ${roleOptions}
          </select>
        </div>

        <!-- Workspaces/Deals -->
        <div class="flex-[2]">
          ${isFirst ? '<label class="block mb-2 text-sm font-medium text-[#868E96]">Workspaces</label>' : ''}
          <div class="relative w-full rounded-lg border border-[#EBEBEB] bg-white min-h-[48px] px-2 py-1.5 flex items-center flex-wrap gap-2 focus-within:ring-1 focus-within:ring-[#1269e2] focus-within:border-[#1269e2] transition-all cursor-text group">
            ${dealTags}
            <input
              type="text"
              class="invite-deals-input bg-transparent border-none focus:ring-0 text-[#343A40] text-sm placeholder-[#868E96]/40 p-0 h-6 min-w-[60px] flex-1"
              placeholder="${row.deals.length > 0 ? 'Add deal...' : 'Search workspaces...'}"
              data-row-id="${row.id}"
            />
            <span class="material-symbols-outlined absolute right-3 text-[#868E96]/60 pointer-events-none text-lg group-focus-within:text-[#1269e2] transition-colors">search</span>
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
          class="w-full text-left px-4 py-2 text-sm hover:bg-[#1269e2]/5 text-[#343A40] transition-colors"
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
          class="w-full text-left px-4 py-2 text-sm hover:bg-[#1269e2]/5 text-[#343A40] transition-colors"
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

    addStyles();
    modalElement = createModalHTML();
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
        showNotification('Warning', `${successCount} invitation${successCount > 1 ? 's' : ''} created but email delivery failed. Check email service configuration.`, 'error');
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
