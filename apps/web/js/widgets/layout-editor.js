/**
 * PE OS — Dashboard Layout Editor
 *
 * Drag-to-reorder for widgets in the right column. Toggled via the
 * "Customize Dashboard" button. Native HTML5 drag-and-drop, no library.
 *
 * Public API (window.LayoutEditor):
 *   enter()      — turn on edit mode (handles, outlines, banner)
 *   exit()       — turn off edit mode (saves layout, shows toast)
 *   isEditing()  — current state
 *
 * The editor knows nothing about widget contents. It finds elements with
 * `data-widget` inside the right column, attaches drag handlers, and fires
 * a callback on drop. Persistence + DOM reorder are handled by
 * dashboard-widgets.js (saveWidgetOrder + applyWidgetOrder).
 */

(function() {
    'use strict';

    let editing = false;
    let banner = null;
    let dragSrc = null;
    let onDropCallback = null;

    // ─── Helpers ──────────────────────────────────────────────

    function getDraggableWidgets() {
        // EVERY visible widget with data-widget. Widgets without a title bar
        // (e.g., stats-cards) get a floating handle instead — see decorateWidget.
        return Array.from(document.querySelectorAll('[data-widget]'))
            .filter(el => el.style.display !== 'none');
    }

    /** Heuristic: does this widget's first child look like a real title bar? */
    function findTitleBar(widget) {
        const first = widget.querySelector(':scope > div:first-child');
        if (!first) return null;
        // A real title bar has a heading element OR a bottom border styling class
        const looksLikeHeader = first.querySelector('h1, h2, h3, h4') ||
                                first.classList.contains('border-b') ||
                                /border-b/.test(first.className);
        return looksLikeHeader ? first : null;
    }

    // ─── Drag handlers ────────────────────────────────────────

    function onDragStart(e) {
        const widget = e.currentTarget;
        dragSrc = widget;
        widget.classList.add('opacity-50');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox requires data to be set or drag won't fire
        try { e.dataTransfer.setData('text/plain', widget.dataset.widget || ''); } catch (_) {}
    }

    function onDragOver(e) {
        if (!dragSrc) return;

        const target = e.currentTarget;
        if (target === dragSrc) return;

        // Cross-container reorder is intentionally NOT supported in v1 — column
        // widths differ (left col is 2/3, right col is 1/3) so dropping a narrow
        // widget into the wide column would break the layout. Restrict to siblings.
        if (target.parentNode !== dragSrc.parentNode) return;

        e.preventDefault(); // allow drop
        e.dataTransfer.dropEffect = 'move';

        // Insert dragSrc before or after the target based on cursor Y
        const rect = target.getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        const parent = target.parentNode;
        if (e.clientY < middle) {
            parent.insertBefore(dragSrc, target);
        } else {
            parent.insertBefore(dragSrc, target.nextSibling);
        }
    }

    function onDragEnd(e) {
        if (dragSrc) {
            dragSrc.classList.remove('opacity-50');
            dragSrc = null;
        }
        // Persist new order
        if (onDropCallback) {
            const ids = getDraggableWidgets().map(el => el.dataset.widget);
            onDropCallback(ids);
        }
    }

    function onDrop(e) {
        e.preventDefault(); // prevent default browser drop handling
    }

    // ─── Edit mode UI ─────────────────────────────────────────

    function decorateWidget(widget) {
        widget.classList.add('layout-edit-target');
        widget.setAttribute('draggable', 'true');
        widget.addEventListener('dragstart', onDragStart);
        widget.addEventListener('dragover', onDragOver);
        widget.addEventListener('drop', onDrop);
        widget.addEventListener('dragend', onDragEnd);

        const titleBar = findTitleBar(widget);

        if (titleBar && !titleBar.querySelector('.layout-edit-handle')) {
            // Inline handle inside the title bar (most widgets)
            const handle = document.createElement('span');
            handle.className = 'layout-edit-handle material-symbols-outlined ml-auto text-text-muted cursor-grab';
            handle.style.cssText = 'font-size:20px;';
            handle.title = 'Drag to reorder';
            handle.textContent = 'drag_indicator';
            titleBar.appendChild(handle);
        } else if (!titleBar && !widget.querySelector(':scope > .layout-edit-handle-floating')) {
            // Floating handle for widgets WITHOUT a title bar (e.g., stats-cards).
            // Positioned absolute top-right so it overlays the widget content.
            const handle = document.createElement('span');
            handle.className = 'layout-edit-handle-floating material-symbols-outlined cursor-grab';
            handle.style.cssText = 'position:absolute;top:8px;right:8px;font-size:18px;color:#003366;background:white;border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:20;';
            handle.title = 'Drag to reorder';
            handle.textContent = 'drag_indicator';

            // Ensure widget is a positioned ancestor so absolute handle anchors correctly
            const computedPos = window.getComputedStyle(widget).position;
            if (computedPos === 'static') {
                widget.dataset.layoutEditPosition = 'static';
                widget.style.position = 'relative';
            }
            widget.appendChild(handle);
        }
    }

    function undecorateWidget(widget) {
        widget.classList.remove('layout-edit-target', 'opacity-50');
        widget.removeAttribute('draggable');
        widget.removeEventListener('dragstart', onDragStart);
        widget.removeEventListener('dragover', onDragOver);
        widget.removeEventListener('drop', onDrop);
        widget.removeEventListener('dragend', onDragEnd);

        const inlineHandle = widget.querySelector(':scope > div:first-child > .layout-edit-handle');
        if (inlineHandle) inlineHandle.remove();

        const floatingHandle = widget.querySelector(':scope > .layout-edit-handle-floating');
        if (floatingHandle) floatingHandle.remove();

        // Restore position style if we mutated it
        if (widget.dataset.layoutEditPosition === 'static') {
            widget.style.position = '';
            delete widget.dataset.layoutEditPosition;
        }
    }

    function injectStyles() {
        if (document.getElementById('layout-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'layout-editor-styles';
        style.textContent = `
            .layout-edit-target {
                outline: 2px dashed #003366;
                outline-offset: 2px;
                transition: outline-color 0.15s;
            }
            .layout-edit-target:hover {
                outline-color: #004488;
            }
            .layout-edit-handle:hover {
                color: #003366 !important;
            }
            #layout-edit-banner {
                background: linear-gradient(90deg, #003366 0%, #004488 100%);
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 16px;
                box-shadow: 0 2px 8px rgba(0, 51, 102, 0.2);
            }
        `;
        document.head.appendChild(style);
    }

    function showBanner() {
        if (banner) return;
        banner = document.createElement('div');
        banner.id = 'layout-edit-banner';
        banner.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:18px;">drag_indicator</span>
            <span>Drag widgets by the handle to reorder · Click <strong>Done</strong> when finished</span>
        `;
        // Insert at the top of the dashboard content area
        const greeting = document.getElementById('greeting');
        const insertPoint = greeting?.parentElement;
        if (insertPoint && insertPoint.parentElement) {
            insertPoint.parentElement.insertBefore(banner, insertPoint.nextSibling);
        } else {
            document.body.appendChild(banner);
        }
    }

    function hideBanner() {
        if (banner) {
            banner.remove();
            banner = null;
        }
    }

    function updateButton(toEditMode) {
        const btn = document.getElementById('widget-settings-btn');
        if (!btn) return;
        if (toEditMode) {
            btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = `
                <span class="material-symbols-outlined text-[18px]">check</span>
                <span class="text-xs font-medium">Done</span>
            `;
            btn.style.backgroundColor = '#003366';
            btn.style.color = 'white';
            btn.style.borderColor = '#003366';
        } else if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            delete btn.dataset.originalHtml;
        }
    }

    // ─── Public API ───────────────────────────────────────────

    function enter() {
        if (editing) return;
        editing = true;
        injectStyles();
        showBanner();
        updateButton(true);

        // Wire the persistence callback to dashboard-widgets.js helpers
        onDropCallback = (orderedIds) => {
            if (typeof window.saveWidgetOrder === 'function') {
                window.saveWidgetOrder(orderedIds);
            }
        };

        getDraggableWidgets().forEach(decorateWidget);

        // Esc key to exit
        document.addEventListener('keydown', onKeyDown);
    }

    function exit() {
        if (!editing) return;
        editing = false;

        getDraggableWidgets().forEach(undecorateWidget);
        // Also undecorate any hidden widgets that might have been decorated earlier
        document.querySelectorAll('.layout-edit-target').forEach(undecorateWidget);

        hideBanner();
        updateButton(false);
        document.removeEventListener('keydown', onKeyDown);
        onDropCallback = null;

        if (window.showNotification) {
            showNotification('Layout Saved', 'Your dashboard layout has been saved.', 'success');
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') exit();
    }

    function isEditing() {
        return editing;
    }

    function toggle() {
        if (editing) exit();
        else enter();
    }

    window.LayoutEditor = { enter, exit, toggle, isEditing };
})();
