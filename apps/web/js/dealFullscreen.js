    (function() {
      const SECTIONS = {
        financials: { bodyId: 'financials-body', title: 'Financial Statements', icon: 'table_chart' },
        analysis:   { bodyId: 'analysis-body',   title: 'AI Financial Analysis', icon: 'insights' }
      };

      // Track state for restoring DOM on close
      let savedParent = null;
      let savedNext = null;
      let savedEl = null;
      let savedBg = '';
      let savedPad = '';

      window.openSectionFullscreen = function(key) {
        const cfg = SECTIONS[key];
        if (!cfg) return;
        const srcBody = document.getElementById(cfg.bodyId);
        if (!srcBody) return;

        // Remember original DOM position
        savedParent = srcBody.parentElement;
        savedNext = srcBody.nextSibling;
        savedEl = srcBody;
        savedBg = srcBody.style.background;
        savedPad = srcBody.style.padding;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'section-fullscreen-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);display:flex;flex-direction:column;animation:sfsOverlayIn 0.3s ease-out;';

        overlay.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:14px 28px;background:linear-gradient(135deg,#003366 0%,#004488 100%);flex-shrink:0;box-shadow:0 2px 12px rgba(0,0,0,0.2);">
            <span class="material-symbols-outlined" style="color:rgba(255,255,255,0.85);font-size:22px;">${cfg.icon}</span>
            <span style="color:#fff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-family:'Inter',system-ui,sans-serif;">${cfg.title}</span>
            <span style="color:rgba(255,255,255,0.4);font-size:11px;font-weight:500;margin-left:4px;font-family:'Inter',system-ui,sans-serif;">Full View</span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
              <span style="color:rgba(255,255,255,0.35);font-size:10px;font-family:'Inter',system-ui,sans-serif;">ESC to close</span>
              <button id="sfs-close" title="Close (Esc)" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.15)'">
                <span class="material-symbols-outlined" style="color:#fff;font-size:18px;">close</span>
              </button>
            </div>
          </div>
          <div id="sfs-content" style="flex:1;overflow:hidden;background:#F8FAFC;display:flex;"></div>
        `;

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const content = overlay.querySelector('#sfs-content');

        // MOVE (not clone) the actual DOM node — preserves all event listeners
        srcBody.style.background = 'transparent';
        srcBody.style.padding = '0';

        if (key === 'analysis') {
          // Build vertical sidebar layout for analysis
          content.innerHTML = `
            <div id="sfs-sidebar" style="width:200px;flex-shrink:0;background:#fff;border-right:1px solid #E5E7EB;display:flex;flex-direction:column;overflow-y:auto;"></div>
            <div id="sfs-main" style="flex:1;overflow-y:auto;padding:28px 36px;"></div>
          `;
          const sidebar = content.querySelector('#sfs-sidebar');
          const main = content.querySelector('#sfs-main');

          // Move the content into main area
          main.appendChild(srcBody);

          // Build sidebar tabs from the existing horizontal tab bar
          const tabBar = srcBody.querySelector('#analysis-content > div:first-child');
          if (tabBar) tabBar.style.display = 'none'; // hide horizontal tabs

          const tabData = [
            { id: 'overview',  label: 'Overview',       icon: 'dashboard' },
            { id: 'deepdive',  label: 'Deep Dive',      icon: 'analytics' },
            { id: 'cashcap',   label: 'Cash & Capital',  icon: 'payments' },
            { id: 'valuation', label: 'Valuation',      icon: 'rocket_launch' },
            { id: 'diligence', label: 'Diligence',      icon: 'verified' },
            { id: 'memo',      label: 'Memo',           icon: 'description' },
          ];

          // Determine active tab
          const activeTab = (typeof analysisState !== 'undefined' && analysisState.activeTab) || 'overview';

          sidebar.innerHTML = `
            <div style="padding:20px 16px 12px;border-bottom:1px solid #F1F5F9;">
              <div style="font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Navigation</div>
            </div>
            <div style="padding:8px;flex:1;">
              ${tabData.map(t => `
                <button class="sfs-nav-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}"
                  style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border:none;background:${t.id === activeTab ? '#E8EEF4' : 'transparent'};border-radius:8px;cursor:pointer;margin-bottom:2px;transition:all 0.15s;text-align:left;border-left:3px solid ${t.id === activeTab ? '#003366' : 'transparent'};"
                  onmouseover="if(!this.classList.contains('active'))this.style.background='#F8FAFC'"
                  onmouseout="if(!this.classList.contains('active'))this.style.background='transparent'">
                  <span class="material-symbols-outlined" style="font-size:18px;color:${t.id === activeTab ? '#003366' : '#94A3B8'};">${t.icon}</span>
                  <span style="font-size:12px;font-weight:${t.id === activeTab ? '700' : '500'};color:${t.id === activeTab ? '#003366' : '#6B7280'};font-family:'Inter',system-ui,sans-serif;">${t.label}</span>
                </button>
              `).join('')}
            </div>
            <div style="padding:12px 16px;border-top:1px solid #F1F5F9;">
              <div style="font-size:9px;color:#CBD5E1;text-align:center;">PE Analysis Suite</div>
            </div>
          `;

          // Wire sidebar tab clicks
          sidebar.querySelectorAll('.sfs-nav-btn').forEach(btn => {
            btn.addEventListener('click', function() {
              const tabId = this.dataset.tab;
              // Update sidebar active states
              sidebar.querySelectorAll('.sfs-nav-btn').forEach(b => {
                const isActive = b.dataset.tab === tabId;
                b.classList.toggle('active', isActive);
                b.style.background = isActive ? '#E8EEF4' : 'transparent';
                b.style.borderLeftColor = isActive ? '#003366' : 'transparent';
                b.querySelector('.material-symbols-outlined').style.color = isActive ? '#003366' : '#94A3B8';
                const label = b.querySelector('span:last-child');
                label.style.fontWeight = isActive ? '700' : '500';
                label.style.color = isActive ? '#003366' : '#6B7280';
              });
              // Call the real tab switch function
              if (typeof switchAnalysisTab === 'function') switchAnalysisTab(tabId);
              // Scroll main to top on tab switch
              main.scrollTop = 0;
            });
          });

          // Hide footer in fullscreen (the "Analyzed X periods" line)
          const footer = srcBody.querySelector('#analysis-content > div:last-child');
          if (footer && !footer.id) footer.style.display = 'none';

        } else {
          // Financials: full-width scrollable
          content.style.flexDirection = 'column';
          content.style.overflow = 'auto';
          content.style.padding = '28px 36px';
          content.appendChild(srcBody);
        }

        // Close handler
        function closeFull() {
          overlay.style.animation = 'sfsOverlayOut 0.2s ease-in forwards';
          document.body.style.overflow = '';

          if (key === 'analysis') {
            // Show horizontal tabs again & footer
            const tabBar = savedEl.querySelector('#analysis-content > div:first-child');
            if (tabBar) tabBar.style.display = '';
            const footer = savedEl.querySelector('#analysis-content > div:last-child');
            if (footer && !footer.id) footer.style.display = '';
          }

          // Restore original styles
          savedEl.style.background = savedBg;
          savedEl.style.padding = savedPad;

          // Move element back to original position
          if (savedNext) {
            savedParent.insertBefore(savedEl, savedNext);
          } else {
            savedParent.appendChild(savedEl);
          }

          setTimeout(function() { overlay.remove(); }, 200);
          document.removeEventListener('keydown', escHandler);
        }

        function escHandler(e) { if (e.key === 'Escape') closeFull(); }
        document.getElementById('sfs-close').addEventListener('click', closeFull);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeFull(); });
        document.addEventListener('keydown', escHandler);
      };

      // Inject animations
      var sfsStyle = document.createElement('style');
      sfsStyle.textContent = '@keyframes sfsOverlayIn{from{opacity:0}to{opacity:1}}@keyframes sfsOverlayOut{from{opacity:1}to{opacity:0}}';
      document.head.appendChild(sfsStyle);
    })();
