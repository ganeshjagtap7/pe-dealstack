/**
 * Invite Modal — Styles & HTML Template
 * Extracted from inviteModal.js. Pure template functions, no state.
 * Globals: addInviteModalStyles, createInviteModalHTML
 */

function addInviteModalStyles() {
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

function createInviteModalHTML() {
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
            <button id="add-invite-row-btn" class="flex items-center gap-2 text-[#003366] hover:text-blue-700 font-medium text-sm transition-colors group px-2 py-1 rounded-md hover:bg-[#003366]/10">
              <span class="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">add_circle</span>
              Add another team member
            </button>
            <button id="bulk-import-btn" class="flex items-center gap-2 text-[#868E96] hover:text-[#343A40] font-medium text-sm transition-colors px-2 py-1 rounded-md hover:bg-black/5">
              <span class="material-symbols-outlined text-xl">upload_file</span>
              Bulk import via CSV
            </button>
          </div>

          <!-- Access Control Info -->
          <div class="mt-4 bg-[#003366]/5 border border-[#003366]/10 rounded-lg p-3 flex gap-3 items-start">
            <span class="material-symbols-outlined text-[#003366] text-xl mt-0.5">info</span>
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
            <button id="invite-submit-btn" class="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-[#003366] hover:bg-blue-600 text-white font-medium text-sm shadow-lg shadow-[#003366]/20 transition-all transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-[#003366] flex items-center justify-center gap-2">
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
