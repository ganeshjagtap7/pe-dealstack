/**
 * PE OS — Onboarding Task Modal Bodies
 *
 * Renders the content for each of the 3 onboarding task modals:
 * 1. Firm info  2. CIM upload  3. Team invite
 */

/**
 * Apply enrichment results to the form — pre-fills AUM buttons + sector chips.
 * Called when user clicks "Use this profile".
 */
function applyEnrichmentToForm(state, profile) {
  // Pre-fill fund size
  if (profile.checkSizeRange || profile.aum) {
    const sizeStr = (profile.checkSizeRange || profile.aum || '').toLowerCase();
    let matchAum = '';
    if (sizeStr.includes('1b') || sizeStr.includes('billion')) matchAum = '$1B+';
    else if (sizeStr.includes('500m') || sizeStr.includes('500')) matchAum = '$500M-1B';
    else if (sizeStr.includes('100m') || sizeStr.includes('100')) matchAum = '$100-500M';
    else matchAum = '<$100M';

    if (matchAum) {
      document.querySelectorAll('[data-aum]').forEach(b => b.classList.remove('selected'));
      const btn = document.querySelector(`[data-aum="${matchAum}"]`);
      if (btn) { btn.classList.add('selected'); state.data.firm.aum = matchAum; }
    }
  }

  // Pre-fill sectors
  if (profile.sectors && profile.sectors.length > 0) {
    const sectorMap = {
      'healthcare': 'Healthcare', 'industrials': 'Industrials', 'software': 'Software',
      'consumer': 'Consumer', 'financial': 'Financial', 'tech': 'Tech-enabled services',
      'energy': 'Energy',
    };
    profile.sectors.forEach(s => {
      const lower = s.toLowerCase();
      for (const [key, label] of Object.entries(sectorMap)) {
        if (lower.includes(key)) {
          const btn = document.querySelector(`[data-sector="${label}"]`);
          if (btn && !btn.classList.contains('selected')) {
            btn.classList.add('selected');
            if (!state.data.sectors.includes(label)) state.data.sectors.push(label);
          }
        }
      }
    });
  }
}

/**
 * Auto-enrich firm profile from website + LinkedIn.
 * Calls POST /api/onboarding/enrich-firm, pre-fills fund size + sectors.
 */
async function triggerEnrichment(state) {
  if (state._enriching || state._enriched) return;
  state._enriching = true;

  // Show loading indicator on the form
  const statusEl = document.getElementById('ob-enrich-status');
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="flex items-center gap-2 text-[12px] text-primary font-medium">
        <div class="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Researching your firm — scanning website, searching news &amp; deals...
      </div>
    `;
    statusEl.classList.remove('hidden');
  }

  try {
    const resp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/enrich-firm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteUrl: state.data.firm.url,
        linkedinUrl: state.data.firm.linkedin,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error('Enrichment API error:', resp.status, errBody);
      throw new Error(`Enrichment failed (${resp.status})`);
    }
    const result = await resp.json();

    if (result.success && result.firmProfile) {
      const profile = result.firmProfile;

      // Store the full result for preview
      state._enrichmentResult = result;

      // Build preview card with collected data
      if (statusEl) {
        const person = result.personProfile;
        let previewHtml = `
          <div class="rounded-lg border border-secondary/30 bg-secondary-light/20 p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2 text-[12px] text-secondary font-semibold">
                <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">check_circle</span>
                Profile researched${profile.confidence === 'low' ? ' <span class="text-amber-600">(low confidence)</span>' : ''}
              </div>
              <button id="ob-use-profile" class="text-[11px] font-semibold text-white px-3 py-1 rounded-md" style="background:#003366">
                Use this profile
              </button>
            </div>
            <div class="text-[12px] text-text-main space-y-1">`;

        if (profile.description) previewHtml += `<div><span class="text-text-muted">Firm:</span> ${profile.description}</div>`;
        if (profile.strategy) previewHtml += `<div><span class="text-text-muted">Strategy:</span> ${profile.strategy}</div>`;
        if (profile.sectors?.length) previewHtml += `<div><span class="text-text-muted">Sectors:</span> ${profile.sectors.join(', ')}</div>`;
        if (profile.checkSizeRange) previewHtml += `<div><span class="text-text-muted">Check size:</span> ${profile.checkSizeRange}</div>`;
        if (profile.aum) previewHtml += `<div><span class="text-text-muted">AUM:</span> ${profile.aum}</div>`;
        if (profile.headquarters) previewHtml += `<div><span class="text-text-muted">HQ:</span> ${profile.headquarters}</div>`;
        if (profile.portfolioCompanies?.length) previewHtml += `<div><span class="text-text-muted">Portfolio:</span> ${profile.portfolioCompanies.map(c => c.name).join(', ')}</div>`;
        if (person?.title) previewHtml += `<div class="mt-1 pt-1 border-t border-secondary/20"><span class="text-text-muted">You:</span> ${person.title}${person.bio ? ' — ' + person.bio : ''}</div>`;
        if (person?.expertise?.length) previewHtml += `<div><span class="text-text-muted">Expertise:</span> ${person.expertise.join(', ')}</div>`;

        previewHtml += `</div>
            <div id="ob-phase2-status" class="mt-2 pt-2 border-t border-secondary/20">
              <div class="flex items-center gap-2 text-[11px] text-primary font-medium">
                <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                Researching deeper — following leads, checking press, social...
              </div>
            </div>
          </div>`;
        statusEl.innerHTML = previewHtml;

        // Start polling to update Phase 2 status inside preview card
        if (window._startDeepResearchPolling) window._startDeepResearchPolling();

        // Safety timeout — stop spinner after 90s regardless
        setTimeout(() => {
          const phase2El = document.getElementById('ob-phase2-status');
          if (phase2El && phase2El.querySelector('.animate-spin')) {
            phase2El.innerHTML = `
              <div class="flex items-center gap-2 text-[11px] text-secondary font-medium">
                <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">check_circle</span>
                Deep research saved — more insights will appear in your dashboard.
              </div>`;
          }
        }, 90000);

        window._onDeepResearchComplete = (insightsCount) => {
          const phase2El = document.getElementById('ob-phase2-status');
          if (phase2El && insightsCount > 0) {
            phase2El.innerHTML = `
              <div class="flex items-center gap-2 text-[11px] text-secondary font-semibold">
                <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">auto_awesome</span>
                Deep research complete — ${insightsCount} additional insight${insightsCount > 1 ? 's' : ''} found and saved
              </div>`;
          } else if (phase2El) {
            phase2El.innerHTML = `
              <div class="flex items-center gap-2 text-[11px] text-secondary font-medium">
                <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">check_circle</span>
                Deep research complete
              </div>`;
          }
        };

        // "Use this profile" button saves to memory and pre-fills form
        const useBtn = document.getElementById('ob-use-profile');
        if (useBtn) {
          useBtn.addEventListener('click', () => {
            state._enriched = true;
            applyEnrichmentToForm(state, profile);
            statusEl.innerHTML = `
              <div class="flex items-center gap-2 text-[12px] text-secondary font-medium">
                <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">check_circle</span>
                Profile saved — AI will use this context across your deals.
              </div>`;
          });
        }
      }
    } else {
      if (statusEl) {
        statusEl.innerHTML = `
          <div class="text-[12px] text-text-muted">${result.error || 'Could not auto-fill from website. Fill in manually.'}</div>
        `;
      }
    }
  } catch (err) {
    console.error('Enrichment error:', err);
    if (statusEl) {
      statusEl.innerHTML = `<div class="text-[12px] text-text-muted">Enrichment failed — fill in manually below.</div>`;
    }
  } finally {
    state._enriching = false;
  }
}

window.OnboardingTasks = {

  renderBody(id) {
    const renderer = this._renderers[id];
    return renderer ? renderer() : '<p class="text-text-muted">Unknown task.</p>';
  },

  hydrate(id, state) {
    const hydrator = this._hydrators[id];
    if (hydrator) hydrator(state);
  },

  _renderers: {
    firm() {
      const aumOptions = ['<$100M', '$100-500M', '$500M-1B', '$1B+'];
      const sectors = ['Healthcare', 'Industrials', 'Software', 'Consumer', 'Financial', 'Tech-enabled services', 'Energy'];

      return `
        <p class="text-[13.5px] text-text-secondary mb-4">Help us tailor AI findings to your strategy. This takes 30 seconds.</p>
        <label class="block text-[12px] font-medium text-text-secondary mb-1.5">Firm website</label>
        <div class="relative mb-4">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" style="font-size:16px">link</span>
          <input id="ob-firm-url" type="url" placeholder="yourfirm.com" class="w-full pl-10 pr-3 py-2.5 text-[14px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none">
        </div>
        <label class="block text-[12px] font-medium text-text-secondary mb-1.5">LinkedIn</label>
        <div class="relative mb-4">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" style="font-size:16px">person</span>
          <input id="ob-linkedin" type="url" placeholder="https://linkedin.com/in/yourprofile" class="w-full pl-10 pr-3 py-2.5 text-[14px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none">
        </div>
        <div id="ob-enrich-status" class="hidden mb-4 p-2.5 rounded-lg bg-primary-light/40"></div>
        <label class="block text-[12px] font-medium text-text-secondary mb-1.5">Fund size</label>
        <div class="grid grid-cols-4 gap-2 mb-4">
          ${aumOptions.map(v => `<button data-aum="${v}" class="opt justify-center !p-2.5 text-[12.5px]">${v}</button>`).join('')}
        </div>
        <label class="block text-[12px] font-medium text-text-secondary mb-1.5">Sectors you focus on</label>
        <div class="flex flex-wrap gap-2">
          ${sectors.map(v => `<button class="chip" data-sector="${v}">${v}</button>`).join('')}
        </div>
      `;
    },

    cim() {
      return `
        <p class="text-[13.5px] text-text-secondary mb-4">Drop a CIM, teaser, or balance sheet. We'll parse every table and chart.</p>
        <div id="ob-dropzone" class="border-2 border-dashed border-border-subtle rounded-xl p-6 text-center hover:border-primary transition cursor-pointer">
          <div class="w-12 h-12 rounded-xl bg-primary mx-auto flex items-center justify-center mb-3">
            <span class="material-symbols-outlined text-white" style="font-size:24px">upload</span>
          </div>
          <div class="text-[14px] font-semibold text-text-main">Drop your CIM here</div>
          <div class="text-[12px] text-text-muted mt-1">PDF &middot; XLSX &middot; DOCX &middot; up to 50MB</div>
          <input type="file" id="ob-cim-file" class="hidden" accept=".pdf,.xlsx,.docx">
        </div>
        <div class="text-[12px] text-text-muted text-center my-3">&mdash; or try one of these &mdash;</div>
        <div class="space-y-2">
          <button class="opt w-full" data-sample="luktara">
            <span class="material-symbols-outlined text-text-muted" style="font-size:18px">description</span>
            <div class="flex-1 text-left">
              <div class="text-[13.5px] font-semibold">Luktara Industries</div>
              <div class="text-[12px] text-text-muted">Specialty chemicals &middot; $28M EBITDA &middot; 11 red flags</div>
            </div>
            <span class="text-[11px] text-secondary font-semibold uppercase tracking-wider">Demo</span>
          </button>
          <button class="opt w-full" data-sample="pinecrest">
            <span class="material-symbols-outlined text-text-muted" style="font-size:18px">description</span>
            <div class="flex-1 text-left">
              <div class="text-[13.5px] font-semibold">Pinecrest Dermatology</div>
              <div class="text-[12px] text-text-muted">Healthcare roll-up &middot; $160M revenue</div>
            </div>
          </button>
        </div>
      `;
    },

    team() {
      return `
        <p class="text-[13.5px] text-text-secondary mb-4">Invite your deal team. They'll see the same AI findings and can comment on any cell.</p>
        <div id="ob-team-rows" class="space-y-2 mb-3"></div>
        <button id="ob-add-team" class="text-[13px] text-primary font-semibold flex items-center gap-1 hover:text-primary-hover bg-transparent border-none cursor-pointer">
          <span class="material-symbols-outlined" style="font-size:16px">add</span> Add another
        </button>
      `;
    },
  },

  _hydrators: {
    firm(state) {
      document.querySelectorAll('[data-aum]').forEach(btn => {
        if (state.data.firm.aum === btn.dataset.aum) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-aum]').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.data.firm.aum = btn.dataset.aum;
        });
      });

      document.querySelectorAll('[data-sector]').forEach(btn => {
        if (state.data.sectors.includes(btn.dataset.sector)) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          btn.classList.toggle('selected');
          const s = btn.dataset.sector;
          const idx = state.data.sectors.indexOf(s);
          if (idx >= 0) state.data.sectors.splice(idx, 1);
          else state.data.sectors.push(s);
        });
      });

      const urlInput = document.getElementById('ob-firm-url');
      const linkedinInput = document.getElementById('ob-linkedin');
      if (urlInput && state.data.firm.url) urlInput.value = state.data.firm.url;
      if (linkedinInput && state.data.firm.linkedin) linkedinInput.value = state.data.firm.linkedin;
      if (urlInput) urlInput.addEventListener('input', () => { state.data.firm.url = urlInput.value; });
      if (linkedinInput) linkedinInput.addEventListener('input', () => { state.data.firm.linkedin = linkedinInput.value; });

      // Auto-enrich when user tabs out of website URL or LinkedIn
      if (urlInput) {
        urlInput.addEventListener('blur', () => {
          const url = urlInput.value.trim();
          if (url && url.length > 3 && !state._enriching) {
            state._enriched = false; // Allow re-enrichment
            triggerEnrichment(state);
          }
        });
      }
      if (linkedinInput) {
        linkedinInput.addEventListener('blur', () => {
          const li = linkedinInput.value.trim();
          if (li && li.includes('linkedin.com') && !state._enriching) {
            state._enriched = false; // Re-enrich with LinkedIn data
            triggerEnrichment(state);
          }
        });
      }
    },

    cim(state) {
      const dropzone = document.getElementById('ob-dropzone');
      const fileInput = document.getElementById('ob-cim-file');

      if (dropzone) {
        dropzone.addEventListener('click', () => fileInput && fileInput.click());
      }
      if (fileInput) {
        fileInput.addEventListener('change', () => {
          if (fileInput.files && fileInput.files[0]) {
            state.data.cimFile = fileInput.files[0];
            dropzone.querySelector('.text-[14px]').textContent = fileInput.files[0].name;
            dropzone.classList.add('border-primary');
          }
        });
      }

      document.querySelectorAll('[data-sample]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-sample]').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.data.sampleDeal = btn.dataset.sample;

          // Update dropzone to show selected sample deal
          const sampleNames = {
            luktara: 'Luktara Industries — Specialty Chemicals CIM',
            pinecrest: 'Pinecrest Dermatology — Healthcare Roll-up',
          };
          if (dropzone) {
            dropzone.innerHTML = `
              <div class="flex items-center gap-3 text-left">
                <div class="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-secondary" style="font-size:20px;font-variation-settings:'FILL' 1">check_circle</span>
                </div>
                <div>
                  <div class="text-[13.5px] font-semibold text-text-main">${sampleNames[btn.dataset.sample] || 'Sample deal selected'}</div>
                  <div class="text-[12px] text-text-muted">Demo data will be loaded into your workspace</div>
                </div>
              </div>
            `;
            dropzone.classList.remove('border-dashed');
            dropzone.classList.add('border-secondary/30', 'bg-secondary-light/10');
          }
        });
      });
    },

    team() {
      const addRow = () => {
        const wrap = document.getElementById('ob-team-rows');
        if (!wrap) return;
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        row.innerHTML = `
          <input type="email" placeholder="name@firm.com" class="flex-1 px-3 py-2 text-[13.5px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none">
          <select class="px-2.5 py-2 text-[13px] rounded-lg border border-border-subtle bg-white">
            <option>Analyst</option><option>VP</option><option>Partner</option><option>Admin</option>
          </select>
          <button class="text-text-muted hover:text-red-500 p-1 ob-remove-row bg-transparent border-none cursor-pointer">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
          </button>
        `;
        row.querySelector('.ob-remove-row').addEventListener('click', () => row.remove());
        wrap.appendChild(row);
      };

      addRow();
      addRow();

      const addBtn = document.getElementById('ob-add-team');
      if (addBtn) addBtn.addEventListener('click', addRow);
    },
  },
};
