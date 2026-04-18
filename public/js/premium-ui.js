/* ============================================================
   PREMIUM UI/UX – Micro-Interaction Engine
   Version: 1.0.0
   NOTE: This file is PURELY visual. No backend logic is modified.
   ============================================================ */

(function () {
    'use strict';

    // ----------------------------------------------------------
    // 1. RIPPLE EFFECT ON BUTTONS
    // ----------------------------------------------------------
    function createRipple(e) {
        const btn = e.currentTarget;
        // Skip if not a real button click (e.g. programmatic)
        if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;

        const existingRipple = btn.querySelector('.ripple-effect');
        if (existingRipple) existingRipple.remove();

        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, [role="button"], a[onclick]');
        if (btn) createRipple(e);
    });

    // ----------------------------------------------------------
    // 2. PAGE TRANSITION ENHANCEMENT
    // ----------------------------------------------------------
    const originalShowPage = window.showPage;

    if (typeof originalShowPage === 'function') {
        window.showPage = function (pageId) {
            // Call original function first
            originalShowPage(pageId);

            // Apply entrance animation to the newly visible view
            const view = document.getElementById(`view-${pageId}`);
            if (view) {
                view.classList.remove('page-enter');
                // Force reflow to restart animation
                void view.offsetWidth;
                view.classList.add('page-enter');
            }
        };
    }

    // ----------------------------------------------------------
    // 3. MODAL OPEN/CLOSE ANIMATION ENHANCER
    // ----------------------------------------------------------
    // Observe modals being shown/hidden and add smooth animation
    const modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const el = mutation.target;
                if (el.id && el.id.startsWith('modal-')) {
                    const isVisible = !el.classList.contains('hidden');
                    if (isVisible) {
                        el.style.opacity = '0';
                        requestAnimationFrame(() => {
                            el.style.transition = 'opacity 0.25s ease';
                            el.style.opacity = '1';
                        });
                    }
                }
            }
        });
    });

    // Observe all modals
    document.querySelectorAll('[id^="modal-"]').forEach((modal) => {
        modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    // ----------------------------------------------------------
    // 4. SMOOTH NUMBER COUNTER ANIMATION
    // ----------------------------------------------------------
    window.animateNumber = function (el, targetValue, duration = 600) {
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (targetValue - start) * easeOut);
            el.textContent = current;
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    };

    // ----------------------------------------------------------
    // 5. SCROLL REVEAL (Fade-in elements as they enter viewport)
    // ----------------------------------------------------------
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('page-enter');
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.1 }
    );

    // Observe key containers after DOM is ready
    function observeRevealElements() {
        document.querySelectorAll('.bg-glass, .card-glow, .glass-card-premium').forEach((el) => {
            if (!el.classList.contains('page-enter')) {
                revealObserver.observe(el);
            }
        });
    }

    // ----------------------------------------------------------
    // 6. ICON BOUNCE ON HOVER (for sidebar emoji icons)
    // ----------------------------------------------------------
    document.querySelectorAll('aside nav a span:first-child').forEach((icon) => {
        icon.style.display = 'inline-block';
        icon.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        icon.parentElement.addEventListener('mouseenter', () => {
            icon.style.transform = 'scale(1.25) rotate(-8deg)';
        });
        icon.parentElement.addEventListener('mouseleave', () => {
            icon.style.transform = 'scale(1) rotate(0deg)';
        });
    });

    // ----------------------------------------------------------
    // 7. HEADER SCROLL SHADOW
    // ----------------------------------------------------------
    const mainContent = document.getElementById('main-content');
    const header = document.querySelector('header');
    if (mainContent && header) {
        mainContent.addEventListener('scroll', () => {
            if (mainContent.scrollTop > 10) {
                header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
            } else {
                header.style.boxShadow = 'none';
            }
        }, { passive: true });
    }

    // ----------------------------------------------------------
    // 8. SKELETON LOADER HELPER
    // ----------------------------------------------------------
    window.showSkeleton = function (containerId, count = 3) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `<div class="skeleton skeleton-card mb-4" style="animation-delay: ${i * 0.1}s"></div>`;
        }
        container.innerHTML = html;
    };

    window.showTableSkeleton = function (tbodyId, cols = 5, rows = 5) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        let html = '';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                const width = c === 0 ? '60%' : '40%';
                html += `<td class="px-6 py-4"><div class="skeleton skeleton-text" style="width:${width}; animation-delay:${(r * cols + c) * 0.03}s"></div></td>`;
            }
            html += '</tr>';
        }
        tbody.innerHTML = html;
    };

    // ----------------------------------------------------------
    // 9. CUSTOM SELECT ENHANCER (SaaS Style Dropdown)
    // ----------------------------------------------------------
    class PremiumSelect {
        constructor(selectElement) {
            this.select = selectElement;
            if (this.select.dataset.customInit || this.select.classList.contains('no-custom')) return;
            this.select.dataset.customInit = 'true';
            
            // Hide original select completely
            this.select.style.display = 'none';

            this.wrapper = document.createElement('div');
            this.wrapper.className = 'custom-select-wrapper';

            this.trigger = document.createElement('div');
            this.trigger.className = 'custom-select-trigger';
            const iconClass = this.select.dataset.icon || '';
            const iconHtml = iconClass ? `<i class="${iconClass} mr-2"></i>` : '';
            this.trigger.innerHTML = `${iconHtml}<span class="select-text"></span><i class="fas fa-chevron-down select-chevron"></i>`;
            
            this.menu = document.createElement('div');
            this.menu.className = 'custom-select-menu';

            this.wrapper.appendChild(this.trigger);
            this.wrapper.appendChild(this.menu);
            this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);

            this.setupOptions();
            this.addEvents();

            // Setup observer to watch for dynamic option changes (e.g., from updateCRMPackages)
            this.observer = new MutationObserver(() => this.setupOptions());
            this.observer.observe(this.select, { childList: true, characterData: true, subtree: true });
        }

        setupOptions() {
            this.menu.innerHTML = '';
            let selectedText = '';
            
            Array.from(this.select.options).forEach((option) => {
                const item = document.createElement('div');
                item.className = 'custom-select-option';
                if (option.selected) {
                    item.classList.add('selected');
                    selectedText = option.text;
                }
                item.textContent = option.text;
                item.dataset.value = option.value;
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.select.value = option.value;
                    // Trigger native change event so app.js logic runs
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                    this.close();
                    this.setupOptions(); // Re-render to update selected state
                });
                
                this.menu.appendChild(item);
            });

            this.trigger.querySelector('span').textContent = selectedText || 'Chọn...';
        }

        open() {
            // Close all others first
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                w.classList.remove('open');
                w.style.zIndex = '';
            });
            this.wrapper.classList.add('open');
            this.wrapper.style.zIndex = '1000'; // Ensure it's above other fields
        }

        close() {
            this.wrapper.classList.remove('open');
            this.wrapper.style.zIndex = '';
        }

        addEvents() {
            this.trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (this.wrapper.classList.contains('open')) this.close();
                else this.open();
            });
        }
    }

    // Close select menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
    });

    // Initialize custom selects globally
    function initAllCustomSelects() {
        document.querySelectorAll('select').forEach(select => {
            new PremiumSelect(select);
        });
    }

    // ----------------------------------------------------------
    // 10. INITIAL SETUP
    // ----------------------------------------------------------
    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            observeRevealElements();
            initAllCustomSelects();
        });
    } else {
        observeRevealElements();
        initAllCustomSelects();
    }

    // Log that premium UI is loaded
    console.log('%c✨ Premium UI Engine loaded', 'color: #f97316; font-weight: bold; font-size: 12px;');
})();
