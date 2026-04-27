/* ============================================================
   PREMIUM UI/UX – Micro-Interaction Engine v2.0
   Aesthetic: Stripe / Linear / Notion
   NOTE: This file is PURELY visual. No backend logic is modified.
   ============================================================ */

(function () {
    'use strict';

    // Design system motion constants (iOS-smooth)
    const DS_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
    const DS_DURATION = 250; // ms

    // ----------------------------------------------------------
    // 1. RIPPLE EFFECT ON BUTTONS (refined, lighter)
    // ----------------------------------------------------------
    function createRipple(e, target) {
        const btn = target || e.currentTarget;
        if (!btn || !btn.tagName || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;

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
        if (btn) createRipple(e, btn);
    });

    // ----------------------------------------------------------
    // 2. PAGE TRANSITION ENHANCEMENT
    // ----------------------------------------------------------
    const originalShowPage = window.showPage;

    if (typeof originalShowPage === 'function') {
        window.showPage = function (pageId) {
            originalShowPage(pageId);

            const view = document.getElementById(`view-${pageId}`);
            if (view) {
                // FORCE: Bypass animation for quotations to prevent hangs (Requirement #1)
                if (pageId === 'quotations') {
                    view.classList.remove('page-enter', 'hidden');
                    console.log('[FORCE-LOG] Animation bypassed for quotations view.');
                    return;
                }
                view.classList.remove('page-enter');
                void view.offsetWidth; // Force reflow
                view.classList.add('page-enter');
            }
        };
    }

    // ----------------------------------------------------------
    // 3. MODAL OPEN/CLOSE LOGIC (Robust Visibility)
    //    Removed requestAnimationFrame opacity logic to prevent 
    //    invisible blocking layers if animations hang.
    // ----------------------------------------------------------
    const modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const el = mutation.target;
                if (el.id && el.id.startsWith('modal-')) {
                    const isVisible = !el.classList.contains('hidden');
                    if (isVisible) {
                        console.log(`[DEBUG] render component (Modal Open: ${el.id})`);
                        el.style.opacity = '1';
                        el.style.pointerEvents = 'auto';
                        el.style.visibility = 'visible';
                    } else {
                        el.style.pointerEvents = 'none';
                    }
                }
            }
        });
    });

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
    // 5. SCROLL REVEAL (Fade-in on viewport entry)
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

    function observeRevealElements() {
        document.querySelectorAll('.bg-glass, .card-glow, .glass-card-premium').forEach((el) => {
            if (!el.classList.contains('page-enter')) {
                revealObserver.observe(el);
            }
        });
    }

    // ----------------------------------------------------------
    // 6. ICON BOUNCE ON HOVER (sidebar emoji icons)
    // ----------------------------------------------------------
    document.querySelectorAll('aside nav a span:first-child').forEach((icon) => {
        icon.style.display = 'inline-block';
        icon.style.transition = `transform ${DS_DURATION}ms ${DS_EASE}, filter ${DS_DURATION}ms ${DS_EASE}`;
        icon.parentElement.addEventListener('mouseenter', () => {
            icon.style.transform = 'scale(1.2) rotate(-6deg)';
            icon.style.filter = 'brightness(1.3)';
        });
        icon.parentElement.addEventListener('mouseleave', () => {
            icon.style.transform = 'scale(1) rotate(0deg)';
            icon.style.filter = 'brightness(1)';
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
                header.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.25)';
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
    // 8b. AUTH ASSIST: Enter-to-submit + password recovery
    // ----------------------------------------------------------
    async function requestPasswordReset() {
        const emailInput = document.getElementById('auth-email');
        const errorDiv = document.getElementById('auth-error');
        const email = String(emailInput?.value || '').trim();

        if (!email) {
            if (errorDiv) {
                errorDiv.textContent = 'Vui lòng nhập email để nhận link đặt lại mật khẩu.';
                errorDiv.classList.remove('hidden', 'text-green-500', 'bg-green-500/10', 'border-green-500/20');
                errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
            }
            emailInput?.focus();
            return;
        }

        try {
            const res = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Không thể gửi yêu cầu khôi phục mật khẩu.');
            }

            if (errorDiv) {
                errorDiv.textContent = data.message || 'Vui lòng kiểm tra email để đặt lại mật khẩu.';
                errorDiv.classList.remove('hidden', 'text-red-500', 'bg-red-500/10', 'border-red-500/20');
                errorDiv.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
            }
        } catch (err) {
            if (errorDiv) {
                errorDiv.textContent = err.message || 'Không thể gửi yêu cầu khôi phục mật khẩu.';
                errorDiv.classList.remove('hidden', 'text-green-500', 'bg-green-500/10', 'border-green-500/20');
                errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
            }
        }
    }

    function showAuthMessage(message, type = 'error') {
        const errorDiv = document.getElementById('auth-error');
        if (!errorDiv) return;

        errorDiv.textContent = message;
        errorDiv.classList.remove(
            'hidden',
            'text-red-500',
            'bg-red-500/10',
            'border-red-500/20',
            'text-green-500',
            'bg-green-500/10',
            'border-green-500/20'
        );

        if (type === 'success') {
            errorDiv.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
        } else {
            errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
        }
    }

    window.handleAuthSubmit = async function handleAuthSubmitPatched() {
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const nameInput = document.getElementById('auth-name');
        const registerFields = document.getElementById('register-fields');
        const submitBtn = document.getElementById('auth-submit-btn');
        const errorDiv = document.getElementById('auth-error');
        const email = String(emailInput?.value || '').trim();
        const password = passwordInput?.value || '';
        const name = nameInput?.value || '';
        const isRegister = registerFields ? !registerFields.classList.contains('hidden') : false;
        const originalBtnText = submitBtn?.innerText || 'Đăng nhập ngay';

        if (errorDiv) {
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';
        }

        if (!email) {
            showAuthMessage('Vui lòng nhập email.');
            emailInput?.focus();
            return;
        }

        if (!password) {
            showAuthMessage('Vui lòng nhập mật khẩu.');
            passwordInput?.focus();
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'ĐANG XỬ LÝ...';
            submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
        }

        let timeoutId = null;

        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 15000);
            const url = isRegister ? '/api/register' : '/api/login';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const contentType = res.headers.get('content-type') || '';
            let data = null;

            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const rawText = await res.text();
                throw new Error(rawText || 'Phản hồi từ server không hợp lệ.');
            }

            if (data.message) {
                showAuthMessage(data.message, 'success');
                return;
            }

            if (!res.ok) {
                showAuthMessage(data.error || 'Không thể đăng nhập.');
                return;
            }

            if (!data.token) {
                showAuthMessage('Đăng nhập thất bại: server không trả về phiên đăng nhập.');
                return;
            }

            localStorage.setItem('sb-token', data.token);
            if (typeof window.saveCurrentSession === 'function') {
                window.saveCurrentSession(data.token, data.user);
            }
            if (typeof window.checkAuth === 'function') {
                await window.checkAuth();
            } else {
                window.location.reload();
            }
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                showAuthMessage('Server phản hồi quá chậm. Vui lòng thử lại.');
            } else {
                showAuthMessage(err.message || 'Lỗi kết nối server.');
            }
            console.error('[AUTH] Submit failed:', err);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const authCard = document.querySelector('#auth-screen .auth-card');
        const authActions = authCard?.querySelector('.text-center');
        const submitBtn = document.getElementById('auth-submit-btn');
        const passwordInput = document.getElementById('auth-password');
        const emailInput = document.getElementById('auth-email');
        const nameInput = document.getElementById('auth-name');

        [emailInput, passwordInput, nameInput].forEach((input) => {
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && typeof window.handleAuthSubmit === 'function') {
                    e.preventDefault();
                    window.handleAuthSubmit();
                }
            });
        });

        if (authActions && !document.getElementById('auth-reset-btn')) {
            const resetWrap = document.createElement('div');
            resetWrap.className = 'text-center -mt-2';
            resetWrap.innerHTML = '<button id="auth-reset-btn" type="button" class="text-xs font-bold text-gray-400 hover:text-orange-400 transition-colors">Quên mật khẩu?</button>';
            authActions.insertAdjacentElement('afterend', resetWrap);

            const resetBtn = document.getElementById('auth-reset-btn');
            resetBtn?.addEventListener('click', requestPasswordReset);
        }

        if (submitBtn) {
            submitBtn.onclick = (e) => {
                e.preventDefault();
                window.handleAuthSubmit();
            };
        }
    });

    // ----------------------------------------------------------
    // 9. CUSTOM SELECT ENHANCER (SaaS-Grade Dropdown)
    //    CRITICAL FIX: rounded corners, no icon overlap,
    //    smooth fade+slide animation
    // ----------------------------------------------------------
    class PremiumSelect {
        constructor(selectElement) {
            this.select = selectElement;
            if (this.select.dataset.customInit || this.select.classList.contains('no-custom')) return;
            this.select.dataset.customInit = 'true';
            this.select.customSelectInstance = this;

            // Hide original select completely
            this.select.style.display = 'none';

            this.wrapper = document.createElement('div');
            this.wrapper.className = 'custom-select-wrapper';

            this.trigger = document.createElement('div');
            this.trigger.className = 'custom-select-trigger';

            // Build trigger HTML — icon left, text center, chevron right (no overlap)
            const iconClass = this.select.dataset.icon || '';
            const iconHtml = iconClass
                ? `<i class="${iconClass}" style="flex-shrink:0; font-size:13px; margin-right:8px;"></i>`
                : '';
            this.trigger.innerHTML = `${iconHtml}<span class="select-text"></span><i class="fas fa-chevron-down select-chevron"></i>`;

            this.menu = document.createElement('div');
            this.menu.className = 'custom-select-menu portal-menu';
            this.menu.style.position = 'absolute';
            this.menu.style.zIndex = '999999';
            this.menu.style.display = 'none';

            this.wrapper.appendChild(this.trigger);
            // Append to body (Portal) instead of wrapper to avoid overflow:hidden cutoffs
            document.body.appendChild(this.menu);
            this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);

            this.setupOptions();
            this.addEvents();

            // Observe dynamic option changes
            this.observer = new MutationObserver(() => this.setupOptions());
            this.observer.observe(this.select, { childList: true, characterData: true, subtree: true });
        }

        setupOptions() {
            if (!this.select) return;
            const options = Array.from(this.select.options);
            console.log(`[PremiumSelect] Syncing ${options.length} options for`, this.select.id || this.select.name);
            
            this.menu.innerHTML = '';
            let selectedText = '';
            
            options.forEach((option) => {
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
                    this.select.dispatchEvent(new Event('change', { bubbles: true }));
                    this.close();
                    this.setupOptions();
                });

                this.menu.appendChild(item);
            });

            const textSpan = this.trigger.querySelector('.select-text');
            if (textSpan) {
                textSpan.textContent = selectedText || 'Chọn...';
            }
            
            // Sync status colors from the original select (Payment Status logic)
            if (this.select.classList.contains('text-green-400')) {
                this.trigger.style.backgroundColor = 'rgba(74, 222, 128, 0.1)';
                this.trigger.style.borderColor = '#22c55e';
                this.trigger.style.color = '#4ade80';
                this.trigger.style.boxShadow = '0 0 15px rgba(74, 222, 128, 0.15)';
                if (textSpan) textSpan.style.cssText = 'font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px;';
            } else if (this.select.classList.contains('text-orange-400')) {
                this.trigger.style.backgroundColor = 'rgba(251, 146, 60, 0.1)';
                this.trigger.style.borderColor = '#f97316';
                this.trigger.style.color = '#fb923c';
                this.trigger.style.boxShadow = '0 0 15px rgba(251, 146, 60, 0.15)';
                if (textSpan) textSpan.style.cssText = 'font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px;';
            } else {
                this.trigger.style.backgroundColor = '';
                this.trigger.style.borderColor = '';
                this.trigger.style.color = '';
                this.trigger.style.boxShadow = '';
                if (textSpan) textSpan.style.cssText = '';
            }
        }

        open() {
            // Close all others first
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                w.classList.remove('open');
            });
            document.querySelectorAll('.portal-menu').forEach(m => {
                m.style.display = 'none';
                m.classList.remove('open');
            });
            this.wrapper.classList.add('open');
            
            // Calculate position for portal
            const rect = this.trigger.getBoundingClientRect();
            this.menu.style.top = `${rect.bottom + window.scrollY + 8}px`;
            this.menu.style.left = `${rect.left + window.scrollX}px`;
            this.menu.style.width = `${rect.width}px`;
            this.menu.style.display = 'block';
            
            // Force animation reflow
            void this.menu.offsetWidth;
            this.menu.classList.add('open');
        }

        close() {
            this.wrapper.classList.remove('open');
            this.menu.classList.remove('open');
            // Timeout to allow animation
            setTimeout(() => {
                if (!this.wrapper.classList.contains('open')) {
                    this.menu.style.display = 'none';
                }
            }, 200);
        }

        addEvents() {
            this.trigger.addEventListener('click', (e) => {
                try {
                    e.stopPropagation(); // Prevents the global document click listener from immediately closing the menu
                    if (this.wrapper.classList.contains('open')) this.close();
                    else this.open();
                } catch (err) {
                    console.error('PremiumSelect Click Error:', err);
                }
            });

            // If an option is clicked, it stops propagation, handled in setupOptions
        }

        sync() {
            this.setupOptions();
        }
    }

    // Global helper to refresh custom selects
    // It syncs existing ones AND initializes any new ones found (vital for dynamic data tables)
    window.refreshCustomSelects = function () {
        try {
            document.querySelectorAll('select').forEach(select => {
                if (select.customSelectInstance) {
                    select.customSelectInstance.sync();
                } else if (!select.dataset.customInit && !select.classList.contains('no-custom')) {
                    new PremiumSelect(select);
                }
            });
        } catch (err) {
            console.error('refreshCustomSelects Error:', err);
        }
    };

    // Close select menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
            w.classList.remove('open');
        });
        document.querySelectorAll('.portal-menu.open').forEach(m => {
            m.classList.remove('open');
            setTimeout(() => m.style.display = 'none', 200);
        });
    });

    // Close select menus when scrolling
    window.addEventListener('scroll', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
        document.querySelectorAll('.portal-menu.open').forEach(m => {
            m.classList.remove('open');
            m.style.display = 'none';
        });
    }, { passive: true });

    // Initialize custom selects globally
    function initAllCustomSelects() {
        window.refreshCustomSelects();
    }

    // ----------------------------------------------------------
    // 10. INITIAL SETUP
    // ----------------------------------------------------------
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
    console.log('%c✨ Premium Design System v3.0 loaded', 'color: #3b82f6; font-weight: bold; font-size: 12px;');
})();
