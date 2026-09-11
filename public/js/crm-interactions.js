/**
 * CRM INTERACTIONS MODULE (CA2 Automation Pro)
 *
 * Bổ sung 3 tính năng cho trang Quản lý Khách hàng (ADDITIVE ONLY):
 *  1. Tìm kiếm nhanh theo Số điện thoại + Debounce 350ms
 *  2. Lịch sử tương tác khách hàng (modal Timeline + Form thêm nhanh)
 *  3. Người phụ trách (Owner): filter, badge trên row, field trong modal
 *
 * Không sửa logic cũ. Dùng wrapper + MutationObserver để gắn thêm vào UI hiện có.
 */

(function () {
    'use strict';

    // ================================================
    // STATE
    // ================================================
    let ownerMap = {};              // { userId: email }
    let currentInteractionId = null;
    let currentInteractionName = '';
    let crmExtInitialized = false;

    function isAuthenticated() {
        return !!localStorage.getItem('sb-token');
    }

    // ================================================
    // 1. PHONE SEARCH + DEBOUNCE
    // ================================================

    // Wrap renderCA2CRM: sau khi render gốc (mst/company_name),
    // nếu kết quả trống nhưng phone khớp → render lại theo phone
    function extendCRMSearch() {
        if (typeof window.renderCA2CRM !== 'function') return;
        const _orig = window.renderCA2CRM;

        window.renderCA2CRM = function renderCA2CRM_Extended() {
            _orig.apply(this, arguments);

            // Kiểm tra nếu render gốc cho empty state + có phone match
            const search = (document.getElementById('ca2-crm-search')?.value || '').toLowerCase().trim();
            if (search) {
                const listContainer = document.getElementById('ca2-crm-list');
                if (listContainer && listContainer.querySelector('.empty-state') && window.currentCRMData) {
                    renderPhoneSearchResults(search, listContainer);
                }
            }

            // Áp dụng filter người phụ trách sau khi render
            applyCRMOwnerFilter();
        };

        // Thay onkeyup bằng input+debounce để tránh gọi liên tục
        addSearchDebounce();
    }

    // Render kết quả tìm theo phone khi filter gốc không tìm thấy gì
    function renderPhoneSearchResults(search, listContainer) {
        const tab = window.currentCRMTab || 'active';
        const filterType = document.getElementById('crm-filter-service')?.value || 'all';
        const filterYear = document.getElementById('crm-filter-year')?.value || 'all';
        const filterMonth = document.getElementById('crm-filter-month')?.value || 'all';

        const phoneMatches = (window.currentCRMData || []).filter(c => {
            if (!c.phone || !c.phone.toLowerCase().includes(search)) return false;
            // Tab filter
            const days = (c.daysLeft !== undefined && c.daysLeft !== null)
                ? c.daysLeft
                : (c.expired_date ? Math.ceil((new Date(c.expired_date) - Date.now()) / 86400000) : 999);
            if (tab === 'active' && days < 0) return false;
            if (tab === 'expired' && days >= 0) return false;
            // Service filter
            if (filterType !== 'all' && typeof window.matchesCRMServiceFilter === 'function') {
                if (!window.matchesCRMServiceFilter(c.service_type, filterType)) return false;
            }
            // Year filter
            if (filterYear !== 'all' && !(c.start_date && new Date(c.start_date).getFullYear().toString() === filterYear)) return false;
            // Month filter
            if (filterMonth !== 'all' && !(c.start_date && (new Date(c.start_date).getMonth() + 1).toString() === filterMonth)) return false;
            return true;
        });

        if (phoneMatches.length === 0) return;

        listContainer.innerHTML = `
            <div class="px-5 py-2.5 mb-2 text-[10px] text-green-400/80 font-black uppercase tracking-widest flex items-center gap-2 bg-green-500/5 rounded-xl border border-green-500/10">
                <i class="fas fa-phone-alt"></i>
                Kết quả tìm theo số điện thoại — ${phoneMatches.length} khách hàng
            </div>
            ${phoneMatches.map(c => buildCRMPhoneRowHTML(c)).join('')}
        `;
    }

    function buildCRMPhoneRowHTML(c) {
        const days = (c.daysLeft !== undefined && c.daysLeft !== null)
            ? c.daysLeft
            : (c.expired_date ? Math.ceil((new Date(c.expired_date) - Date.now()) / 86400000) : 999);
        const isExpired = days < 0;
        const isPaid = c.payment_status === 'paid';
        const paymentLabel = isPaid ? 'Đã thanh toán' : 'Chưa thanh toán';
        const paymentBadgeClass = isPaid ? 'badge-paid' : 'badge-unpaid';
        const nextPayStatus = isPaid ? 'unpaid' : 'paid';
        const expDateStr = c.expired_date
            ? (typeof formatDate === 'function' ? formatDate(c.expired_date) : c.expired_date)
            : 'N/A';
        const ownerText = c.owner_user_id ? (ownerMap[c.owner_user_id] || '') : '';
        const safeId = escHtml(c.id || '');
        const safeName = escHtml(c.company_name || 'N/A').replace(/'/g, "\\'");

        return `
            <div class="crm-row ${isExpired ? 'crm-row-expired' : 'crm-row-active'} p-4 md:p-5 rounded-[24px] border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all cursor-pointer relative group"
                 onclick="editCRM('${safeId}')" style="pointer-events:auto!important;z-index:10;">
                <div class="flex-1 min-w-0 relative z-[2]">
                    <div class="flex items-center gap-3 mb-1.5">
                        <div class="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400 border border-green-500/10 group-hover:scale-110 transition-transform">
                            <i class="fas fa-phone-alt"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="text-base font-black text-white leading-tight truncate">${escHtml(c.company_name || 'N/A')}</div>
                            <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <span class="text-orange-500/80">${escHtml(c.mst || '---')}</span>
                                <span class="opacity-20">|</span>
                                <span class="text-blue-400/80">${escHtml(c.service_type || 'Dịch vụ')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center flex-wrap gap-4 text-[11px] font-bold text-gray-400/60 ml-[52px]">
                        <span class="flex items-center gap-1.5"><i class="fas fa-phone-alt text-green-400/70"></i> <span class="text-green-400/80">${escHtml(c.phone || '')}</span></span>
                        <span class="flex items-center gap-1.5"><i class="far fa-calendar-alt"></i> Hết hạn: ${expDateStr}</span>
                        ${ownerText ? `<span class="flex items-center gap-1.5 text-violet-400/70"><i class="fas fa-user-tie"></i> ${escHtml(ownerText)}</span>` : ''}
                    </div>
                </div>
                <div class="flex flex-wrap items-center md:justify-end gap-3 md:gap-6 relative z-[5]">
                    <div class="flex items-center gap-2 status-badge-group p-1.5 rounded-2xl shadow-inner pointer-events-auto">
                        <div onclick="event.stopPropagation(); updatePaymentStatus('${safeId}', '${nextPayStatus}')"
                             class="justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${paymentBadgeClass} shadow-lg flex items-center gap-2.5 transition-all active:scale-95 cursor-pointer"
                             style="width:180px;flex-shrink:0;" title="Click để đổi trạng thái">
                            <div class="w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-green-500' : 'bg-red-500'}"></div>
                            <span class="truncate whitespace-nowrap">${paymentLabel}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 pointer-events-auto">
                        <button onclick="event.stopPropagation(); editCRM('${safeId}')"
                                class="w-11 h-11 rounded-xl bg-white/5 hover:bg-blue-500 hover:text-white text-gray-400 border border-white/10 hover:border-blue-500/30 transition-all flex items-center justify-center shadow-lg active:scale-95"
                                title="Sửa thông tin"><i class="fas fa-pen text-sm"></i></button>
                        <button onclick="event.stopPropagation(); openInteractionLog('${safeId}', '${safeName}')"
                                class="btn-history w-11 h-11 rounded-xl bg-white/5 hover:bg-purple-500 hover:text-white text-gray-400 border border-white/10 hover:border-purple-500/30 transition-all flex items-center justify-center shadow-lg active:scale-95"
                                title="Lịch sử tương tác"><i class="fas fa-history text-sm"></i></button>
                        <button onclick="event.stopPropagation(); deleteCRM('${safeId}')"
                                class="w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500 hover:text-white text-gray-400 border border-white/10 hover:border-red-500/30 transition-all flex items-center justify-center shadow-lg active:scale-95"
                                title="Xóa"><i class="fas fa-trash-alt text-sm"></i></button>
                    </div>
                </div>
            </div>`;
    }

    function addSearchDebounce() {
        const el = document.getElementById('ca2-crm-search');
        if (!el || el._crmDebounced) return;
        el._crmDebounced = true;
        el.onkeyup = null; // bỏ onkeyup cũ
        el.addEventListener('input', debounce(function () {
            if (typeof window.renderCA2CRM === 'function') window.renderCA2CRM();
        }, 350));
    }

    function debounce(fn, ms) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // ================================================
    // 2. OWNER FILTER
    // ================================================

    function applyCRMOwnerFilter() {
        const ownerFilter = document.getElementById('crm-filter-owner')?.value || 'all';
        if (ownerFilter === 'all') return;

        const listContainer = document.getElementById('ca2-crm-list');
        if (!listContainer) return;

        listContainer.querySelectorAll('.crm-row').forEach(row => {
            const onclickStr = row.getAttribute('onclick') || '';
            const m = onclickStr.match(/editCRM\(['"](.+?)['"]\)/);
            if (!m) return;
            const customer = (window.currentCRMData || []).find(c => String(c.id) === String(m[1]));
            const ownerMatch = customer && customer.owner_user_id === ownerFilter;
            row.style.display = ownerMatch ? '' : 'none';
        });
    }

    async function loadOwnerOptions() {
        try {
            if (!isAuthenticated()) return;
            if (typeof authedFetch !== 'function') return;
            const res = await authedFetch('/api/admin/users-list');
            if (!res || !res.ok) return;
            const json = await res.json();
            const users = json.data || [];
            if (!users.length) return;

            users.forEach(u => { if (u.id) ownerMap[u.id] = u.email || u.id; });

            // Populate filter dropdown
            const filterSel = document.getElementById('crm-filter-owner');
            if (filterSel) {
                users.forEach(u => {
                    if (!filterSel.querySelector(`option[value="${u.id}"]`)) {
                        const opt = document.createElement('option');
                        opt.value = u.id;
                        opt.textContent = u.email || u.id;
                        filterSel.appendChild(opt);
                    }
                });
            }

            // Populate modal dropdown
            const modalSel = document.getElementById('ca2-crm-owner');
            if (modalSel) {
                while (modalSel.options.length > 1) modalSel.remove(1);
                users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.email || u.id;
                    modalSel.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('[CRM-EXT] loadOwnerOptions error:', e);
        }
    }

    // ================================================
    // 3. MUTATIONOBSERVER: INJECT HISTORY BTN + OWNER BADGE
    // ================================================

    function injectRowExtensions(rows) {
        rows.forEach(row => {
            if (!row.classList || !row.classList.contains('crm-row')) return;

            const m = (row.getAttribute('onclick') || '').match(/editCRM\(['"](.+?)['"]\)/);
            if (!m) return;
            const customerId = m[1];
            const customer = (window.currentCRMData || []).find(c => String(c.id) === String(customerId));
            if (!customer) return;

            // Nút Lịch sử (tiêm vào nhóm nút actions)
            if (!row.querySelector('.btn-history')) {
                const actionBtns = row.querySelector('.flex.items-center.gap-2.pointer-events-auto');
                if (actionBtns) {
                    const safeName = (customer.company_name || '').replace(/'/g, "\\'");
                    const btn = document.createElement('button');
                    btn.className = 'btn-history w-11 h-11 rounded-xl bg-white/5 hover:bg-purple-500 hover:text-white text-gray-400 border border-white/10 hover:border-purple-500/30 transition-all flex items-center justify-center shadow-lg active:scale-95';
                    btn.title = 'Lịch sử tương tác';
                    btn.innerHTML = '<i class="fas fa-history text-sm"></i>';
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        openInteractionLog(customerId, customer.company_name || '');
                    });
                    // Chèn trước nút Xóa (nút cuối)
                    const deleteBtn = actionBtns.querySelector('[title="Xóa"]');
                    if (deleteBtn) {
                        actionBtns.insertBefore(btn, deleteBtn);
                    } else {
                        actionBtns.appendChild(btn);
                    }
                }
            }

            // Badge người phụ trách
            if (customer.owner_user_id && !row.querySelector('.owner-badge')) {
                const ml52 = row.querySelector('[class*="ml-\\[52px\\]"]') ||
                    Array.from(row.querySelectorAll('div')).find(d => d.className.includes('ml-[52px]'));
                if (ml52) {
                    const ownerName = ownerMap[customer.owner_user_id] || customer.owner_user_id;
                    const badge = document.createElement('span');
                    badge.className = 'owner-badge flex items-center gap-1.5 text-violet-400/70 text-[11px] font-bold';
                    badge.innerHTML = `<i class="fas fa-user-tie"></i> ${escHtml(ownerName)}`;
                    ml52.appendChild(badge);
                }
            }
        });
    }

    function startCRMListObserver() {
        const listEl = document.getElementById('ca2-crm-list');
        if (!listEl) {
            setTimeout(startCRMListObserver, 600);
            return;
        }

        const observer = new MutationObserver(mutations => {
            const newRows = [];
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.classList?.contains('crm-row')) {
                        newRows.push(node);
                    } else {
                        node.querySelectorAll?.('.crm-row').forEach(r => newRows.push(r));
                    }
                });
            });
            if (newRows.length > 0) setTimeout(() => injectRowExtensions(newRows), 60);
        });

        observer.observe(listEl, { childList: true, subtree: true });
    }

    // ================================================
    // 4. WRAP editCRM (pre-populate owner field)
    // ================================================

    function patchEditCRM() {
        if (typeof window.editCRM !== 'function') return;
        const _orig = window.editCRM;
        window.editCRM = function (id) {
            _orig.apply(this, arguments);
            setTimeout(() => {
                const customer = (window.currentCRMData || []).find(c => String(c.id) === String(id));
                const ownerEl = document.getElementById('ca2-crm-owner');
                if (customer && ownerEl) {
                    ownerEl.value = customer.owner_user_id || '';
                }
            }, 150);
        };
    }

    // ================================================
    // 5. WRAP saveCA2CRM (save owner sau khi lưu chính)
    // ================================================

    function patchSaveCRM() {
        if (typeof window.saveCA2CRM !== 'function') return;
        const _orig = window.saveCA2CRM;
        window.saveCA2CRM = async function () {
            // Capture trước khi modal đóng
            const customerId = document.getElementById('ca2-crm-id')?.value || '';
            const ownerVal = document.getElementById('ca2-crm-owner')?.value || null;

            await _orig.apply(this, arguments);

            // Sau khi lưu chính thành công, cập nhật owner (chỉ khi edit, có id)
            if (customerId && typeof authedFetch === 'function') {
                try {
                    await authedFetch(`/api/ca2-crm/${customerId}/owner`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ owner_user_id: ownerVal || null })
                    });
                } catch (e) {
                    console.warn('[CRM-EXT] Lỗi lưu người phụ trách:', e);
                }
            }
        };
    }

    // ================================================
    // 6. INTERACTION LOG MODAL FUNCTIONS
    // ================================================

    window.openInteractionLog = function (customerId, companyName) {
        currentInteractionId = customerId;
        currentInteractionName = companyName;

        const modal = document.getElementById('modal-interaction-log');
        if (!modal) { console.warn('[CRM-EXT] modal-interaction-log không tồn tại trong DOM'); return; }

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const titleEl = document.getElementById('interaction-company-name');
        if (titleEl) titleEl.textContent = companyName;

        // Reset form
        const contentEl = document.getElementById('interaction-content');
        if (contentEl) contentEl.value = '';

        loadInteractionList(customerId);
    };

    window.closeInteractionLog = function () {
        const modal = document.getElementById('modal-interaction-log');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = '';
        }
        currentInteractionId = null;
    };

    async function loadInteractionList(customerId) {
        const listEl = document.getElementById('interaction-timeline');
        if (!listEl) return;

        listEl.innerHTML = `<div class="p-8 text-center text-xs text-gray-400">
            <i class="fas fa-spinner fa-spin mr-2"></i> Đang tải lịch sử...</div>`;

        try {
            const res = await authedFetch(`/api/crm/interactions/${customerId}`);
            if (!res || !res.ok) throw new Error('API error');
            const json = await res.json();
            const items = json.data || [];

            if (!items.length) {
                listEl.innerHTML = `
                    <div class="p-10 text-center">
                        <div class="text-4xl mb-3">📋</div>
                        <div class="text-sm font-bold text-white/60">Chưa có lịch sử tương tác</div>
                        <div class="text-xs text-gray-500 mt-1">Thêm ghi chú đầu tiên bên dưới</div>
                    </div>`;
                return;
            }

            const typeMap = {
                call:    { icon: 'fa-phone-alt',  color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Gọi điện' },
                email:   { icon: 'fa-envelope',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Gửi email' },
                note:    { icon: 'fa-sticky-note', color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Ghi chú' },
                meeting: { icon: 'fa-handshake',   color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Gặp mặt' }
            };

            listEl.innerHTML = items.map(item => {
                const cfg = typeMap[item.type] || typeMap.note;
                const ago = timeAgo(item.created_at);
                const by = item.created_by ? `• ${escHtml(item.created_by)}` : '';
                return `
                    <div class="flex gap-3 p-4 border-b border-white/5 hover:bg-white/[0.02] transition-all group">
                        <div class="w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                            <i class="fas ${cfg.icon} text-sm ${cfg.color}"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1 flex-wrap">
                                <span class="text-[10px] font-black uppercase tracking-wider ${cfg.color}">${cfg.label}</span>
                                <span class="text-[10px] text-gray-500">${ago} ${by}</span>
                            </div>
                            <div class="text-sm text-white/80 leading-relaxed whitespace-pre-line">${escHtml(item.content)}</div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            listEl.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">
                <i class="fas fa-exclamation-triangle mr-2"></i> Không tải được lịch sử. Vui lòng thử lại.</div>`;
            console.warn('[CRM-EXT] loadInteractionList error:', e);
        }
    }

    window.addInteraction = async function () {
        if (!currentInteractionId) return;
        const typeEl    = document.getElementById('interaction-type');
        const contentEl = document.getElementById('interaction-content');
        const btnEl     = document.getElementById('btn-add-interaction');

        const type    = typeEl?.value || 'note';
        const content = contentEl?.value?.trim() || '';
        if (!content) { contentEl?.focus(); return; }

        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Lưu...'; }

        try {
            const res = await authedFetch(`/api/crm/interactions/${currentInteractionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, content })
            });
            if (res && res.ok) {
                if (contentEl) contentEl.value = '';
                await loadInteractionList(currentInteractionId);
            } else {
                alert('Lỗi khi lưu. Vui lòng thử lại.');
            }
        } catch (e) {
            alert('Lỗi kết nối server.');
            console.warn('[CRM-EXT] addInteraction error:', e);
        } finally {
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-plus mr-1"></i> Thêm'; }
        }
    };

    // ================================================
    // HELPERS
    // ================================================

    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1)  return 'Vừa xong';
        if (m < 60) return `${m} phút trước`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} giờ trước`;
        const d = Math.floor(h / 24);
        if (d < 30) return `${d} ngày trước`;
        return new Date(dateStr).toLocaleDateString('vi-VN');
    }

    // ================================================
    // INIT
    // ================================================

    function initCRMExtensions() {
        if (!isAuthenticated()) return;
        if (crmExtInitialized) return;
        crmExtInitialized = true;
        console.log('[CRM-EXT] Khởi động CRM Extensions module...');

        extendCRMSearch();
        patchEditCRM();
        patchSaveCRM();
        startCRMListObserver();
        loadOwnerOptions();
    }

    // Chờ auth ready event từ app.js
    document.addEventListener('ca2:auth:ready', function () {
        setTimeout(initCRMExtensions, 400);
    });

    // Fallback: nếu trang được reload với token hợp lệ và app.js đã chạy xong
    setTimeout(function () {
        if (!crmExtInitialized && isAuthenticated() && typeof window.renderCA2CRM === 'function') {
            initCRMExtensions();
        }
    }, 3000);

})();
