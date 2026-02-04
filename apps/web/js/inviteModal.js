/**
 * Invite Team Members Modal
 * Allows firm admins/members to invite new users to their organization
 */

const InviteModal = (function() {
  const API_BASE_URL = 'http://localhost:3001/api';

  // State
  let isOpen = false;
  let invitations = [];
  let modalElement = null;

  // Role options
  const roles = [
    { value: 'MEMBER', label: 'Member', description: 'Can view and edit deals' },
    { value: 'VIEWER', label: 'Viewer', description: 'Can only view deals' },
    { value: 'ADMIN', label: 'Admin', description: 'Full access including user management' },
  ];

  // Create modal HTML
  function createModalHTML() {
    const modal = document.createElement('div');
    modal.id = 'invite-modal';
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="invite-modal-backdrop"></div>

      <!-- Modal -->
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" style="animation: slideIn 0.2s ease-out;">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">Invite Team Members</h2>
              <p class="text-sm text-gray-500 mt-0.5">Send invitations to colleagues at your firm</p>
            </div>
            <button id="invite-modal-close" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <span class="material-symbols-outlined text-gray-500">close</span>
            </button>
          </div>

          <!-- Invite Form -->
          <div class="px-6 py-4 border-b border-gray-100">
            <form id="invite-form" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  id="invite-email"
                  placeholder="colleague@yourfirm.com"
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  required
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  id="invite-role"
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                >
                  ${roles.map(r => `<option value="${r.value}">${r.label} - ${r.description}</option>`).join('')}
                </select>
              </div>
              <button
                type="submit"
                id="invite-submit-btn"
                class="w-full px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-2"
              >
                <span class="material-symbols-outlined text-[18px]">send</span>
                Send Invitation
              </button>
            </form>
          </div>

          <!-- Pending Invitations -->
          <div class="flex-1 overflow-y-auto">
            <div class="px-6 py-4">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Pending Invitations (<span id="invite-count">0</span>)
              </h3>
              <div id="invitations-list" class="space-y-2">
                <!-- Invitations will be rendered here -->
              </div>
              <div id="invitations-empty" class="hidden text-sm text-gray-500 py-4 text-center">
                <span class="material-symbols-outlined text-2xl text-gray-300 block mb-2">mail</span>
                No pending invitations
              </div>
              <div id="invitations-loading" class="hidden text-sm text-gray-500 py-4 flex items-center justify-center gap-2">
                <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Loading invitations...
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-500">
                <span class="material-symbols-outlined text-[14px] align-text-bottom">info</span>
                Invitations expire in 7 days
              </p>
              <button id="invite-modal-done" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return modal;
  }

  // Initialize modal
  function init() {
    if (modalElement) return;

    modalElement = createModalHTML();
    document.body.appendChild(modalElement);

    // Event listeners
    document.getElementById('invite-modal-backdrop').addEventListener('click', close);
    document.getElementById('invite-modal-close').addEventListener('click', close);
    document.getElementById('invite-modal-done').addEventListener('click', close);

    // Form submission
    document.getElementById('invite-form').addEventListener('submit', handleSubmit);

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  // Open modal
  async function open() {
    init();
    isOpen = true;

    modalElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Reset form
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-role').value = 'MEMBER';

    // Load invitations
    await loadInvitations();

    // Focus email input
    document.getElementById('invite-email').focus();
  }

  // Close modal
  function close() {
    if (!modalElement) return;

    isOpen = false;
    modalElement.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Load pending invitations
  async function loadInvitations() {
    const listEl = document.getElementById('invitations-list');
    const emptyEl = document.getElementById('invitations-empty');
    const loadingEl = document.getElementById('invitations-loading');
    const countEl = document.getElementById('invite-count');

    loadingEl.classList.remove('hidden');
    listEl.innerHTML = '';
    emptyEl.classList.add('hidden');

    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/invitations?status=PENDING`);
      if (!response.ok) throw new Error('Failed to load invitations');

      invitations = await response.json();
      countEl.textContent = invitations.length;

      if (invitations.length === 0) {
        emptyEl.classList.remove('hidden');
      } else {
        listEl.innerHTML = invitations.map(renderInvitation).join('');
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
      listEl.innerHTML = '<p class="text-sm text-red-500 py-2">Failed to load invitations</p>';
    } finally {
      loadingEl.classList.add('hidden');
    }
  }

  // Render a single invitation
  function renderInvitation(invitation) {
    const roleColors = {
      ADMIN: 'bg-red-50 text-red-600 border-red-200',
      MEMBER: 'bg-blue-50 text-blue-600 border-blue-200',
      VIEWER: 'bg-gray-50 text-gray-600 border-gray-200',
    };

    const expiresIn = getTimeUntil(new Date(invitation.expiresAt));

    return `
      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <span class="material-symbols-outlined text-[18px]">mail</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-medium text-gray-900 text-sm truncate">${invitation.email}</div>
            <div class="text-xs text-gray-500">Expires ${expiresIn}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs px-2 py-1 rounded-full border ${roleColors[invitation.role] || roleColors.MEMBER}">${invitation.role}</span>
          <button
            onclick="InviteModal.resendInvitation('${invitation.id}')"
            class="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Resend invitation"
          >
            <span class="material-symbols-outlined text-[18px]">refresh</span>
          </button>
          <button
            onclick="InviteModal.revokeInvitation('${invitation.id}')"
            class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Revoke invitation"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
    `;
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;
    const submitBtn = document.getElementById('invite-submit-btn');

    if (!email) return;

    // Disable button
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
      Sending...
    `;

    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      // Success
      showNotification('Invitation Sent', `Invitation sent to ${email}`, 'success');

      // Clear form and reload list
      document.getElementById('invite-email').value = '';
      await loadInvitations();
    } catch (error) {
      console.error('Error sending invitation:', error);
      showNotification('Error', error.message, 'error');
    } finally {
      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span class="material-symbols-outlined text-[18px]">send</span>
        Send Invitation
      `;
    }
  }

  // Resend invitation
  async function resendInvitation(id) {
    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/invitations/${id}/resend`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to resend');

      showNotification('Success', 'Invitation resent', 'success');
      await loadInvitations();
    } catch (error) {
      console.error('Error resending invitation:', error);
      showNotification('Error', 'Failed to resend invitation', 'error');
    }
  }

  // Revoke invitation
  async function revokeInvitation(id) {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/invitations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to revoke');

      showNotification('Success', 'Invitation revoked', 'success');
      await loadInvitations();
    } catch (error) {
      console.error('Error revoking invitation:', error);
      showNotification('Error', 'Failed to revoke invitation', 'error');
    }
  }

  // Helper: Calculate time until expiration
  function getTimeUntil(date) {
    const now = new Date();
    const diff = date - now;

    if (diff <= 0) return 'expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    return 'soon';
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
    resendInvitation,
    revokeInvitation,
    loadInvitations,
  };
})();

// Export for use in other files
window.InviteModal = InviteModal;
