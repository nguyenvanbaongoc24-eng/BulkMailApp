/**
 * Pricing Manager - Handles the UI for full CRUD on pricing
 */
class PricingManager {
    static pricingData = []; // Full list of items
    static draftItems = []; // Working copy
    static editingIndex = -1;
    static deletedItem = null;
    static deleteTimeout = null;

    static async init() {
        console.log('[PRICING] Initializing CRUD...');
        await this.loadActivePricing();
        this.render();
    }

    static async loadActivePricing() {
        try {
            const res = await fetch('/api/pricing/active', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-token')}` }
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            this.pricingData = data.items || [];
            this.draftItems = JSON.parse(JSON.stringify(this.pricingData)); // Deep copy
            
            console.log('[PRICING] Loaded packages from DB:', this.pricingData.length, 'items');
            
            if (data.version) {
                const verEl = document.getElementById('current-version-name');
                if (verEl) verEl.textContent = data.version.name;
            }
        } catch (err) {
            console.error('[PRICING] Load error:', err);
            showToast('❌ Không thể tải bảng giá', 'error');
        }
    }

    static render() {
        const tbody = document.getElementById('pricing-table-body');
        const emptyState = document.getElementById('pricing-empty-state');
        if (!tbody) return;

        const filterGroup = document.getElementById('filter-group').value;
        const filterSubject = document.getElementById('filter-subject').value;
        const filterTransaction = document.getElementById('filter-transaction').value;

        // Filter draft items
        const filtered = this.draftItems.filter(item => {
            const matchGroup = filterGroup === 'all' || item.product_group === filterGroup;
            const matchSubject = filterSubject === 'all' || (item.subject_type && item.subject_type.includes(filterSubject));
            const matchTransaction = filterTransaction === 'all' || item.transaction_type === filterTransaction;
            return matchGroup && matchSubject && matchTransaction;
        });

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            filtered.forEach((item, idx) => {
                const card = document.createElement('div');
                card.className = 'ios-stat-card flex flex-col p-6 relative overflow-hidden group hover:border-orange-500/30 transition-all duration-300';
                card.innerHTML = `
                    <div class="absolute -top-10 -right-10 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full group-hover:bg-orange-500/10 transition-all"></div>
                    
                    <div class="flex items-center justify-between mb-4 relative z-10">
                        <div class="px-3 py-1 rounded-lg bg-orange-500/10 text-orange-500 text-[10px] font-black tracking-widest uppercase border border-orange-500/20">
                            ${item.product_code || '??'}
                        </div>
                        <span class="badge-premium ${item.is_active ? 'badge-done' : 'badge-pending'}">
                            <span class="badge-dot"></span>
                            ${item.is_active ? 'Đang dùng' : 'Ẩn'}
                        </span>
                    </div>

                    <div class="mb-4 relative z-10">
                        <h3 class="text-xl font-black text-white tracking-tight leading-tight">${item.package_name}</h3>
                        <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                            ${item.product_group} <span class="mx-1 opacity-30">|</span> ${item.transaction_type}
                        </p>
                    </div>

                    <div class="flex-1 mb-6 relative z-10">
                        <div class="bg-black/30 rounded-2xl p-4 border border-white/5 h-full">
                             <p class="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                <i class="fas fa-users text-[8px]"></i> Đối tượng
                             </p>
                             <p class="text-xs text-gray-300 font-bold line-clamp-2 leading-relaxed">${item.subject_type || 'Tất cả'}</p>
                        </div>
                    </div>

                    <div class="space-y-3 mb-6 relative z-10">
                        <div class="flex justify-between items-end">
                            <span class="text-[9px] text-gray-600 font-black uppercase tracking-widest">Phí dịch vụ</span>
                            <span class="text-xs text-white font-bold">${this.formatVND(item.service_fee)}đ</span>
                        </div>
                        <div class="flex justify-between items-end">
                            <span class="text-[9px] text-gray-600 font-black uppercase tracking-widest">Token & VAT</span>
                            <span class="text-xs text-white/50 font-medium">${this.formatVND(item.token_fee + item.vat_fee)}đ</span>
                        </div>
                        <div class="pt-3 border-t border-white/5 flex justify-between items-baseline">
                            <span class="text-[10px] text-orange-500 font-black uppercase tracking-widest">Thành tiền</span>
                            <span class="text-2xl font-black text-emerald-400 tracking-tighter">${this.formatVND(item.total_price)}đ</span>
                        </div>
                    </div>

                    <div class="flex gap-2 relative z-10">
                        <button onclick="PricingManager.showEditModal(${this.draftItems.indexOf(item)})" class="flex-1 bg-white/5 hover:bg-blue-600/20 hover:text-blue-400 py-3 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border border-white/5">
                            <i class="fas fa-edit"></i> CHỈNH SỬA
                        </button>
                        <button onclick="PricingManager.deleteItem(${this.draftItems.indexOf(item)})" class="w-12 bg-white/5 hover:bg-red-600/20 hover:text-red-500 py-3 rounded-xl transition-all flex items-center justify-center border border-white/5">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
                tbody.appendChild(card);
            });
        }
    }

    static showAddModal() {
        this.editingIndex = -1;
        const title = document.getElementById('pricing-modal-title');
        if (title) title.textContent = 'Thêm gói giá mới';
        this.resetModal();
        if (typeof openModal === 'function') {
            openModal('modal-pricing-crud');
        } else {
            const el = document.getElementById('modal-pricing-crud');
            if (el) el.classList.remove('hidden');
        }
    }

    static showEditModal(index) {
        this.editingIndex = index;
        const item = this.draftItems[index];
        const title = document.getElementById('pricing-modal-title');
        if (title) title.textContent = 'Sửa gói giá';
        
        const fGroup = document.getElementById('field-group');
        const fTrans = document.getElementById('field-transaction');
        const fCode = document.getElementById('field-code');
        const fPkg = document.getElementById('field-package');
        const fFeeSvc = document.getElementById('field-fee-service');
        const fFeeTok = document.getElementById('field-fee-token');
        const fFeeVat = document.getElementById('field-fee-vat');
        const fNotes = document.getElementById('field-notes');
        const fActive = document.getElementById('field-active');

        if (fGroup) fGroup.value = item.product_group;
        if (fTrans) fTrans.value = item.transaction_type;
        if (fCode) fCode.value = item.product_code;
        if (fPkg) fPkg.value = item.package_name;
        if (fFeeSvc) fFeeSvc.value = this.formatVND(item.service_fee);
        if (fFeeTok) fFeeTok.value = this.formatVND(item.token_fee);
        if (fFeeVat) fFeeVat.value = this.formatVND(item.vat_fee);
        if (fNotes) fNotes.value = item.notes;
        if (fActive) fActive.checked = item.is_active;

        // Handle multi-checkbox for subjects
        const subjects = item.subject_type ? item.subject_type.split(', ') : [];
        document.querySelectorAll('.field-subject').forEach(cb => {
            cb.checked = subjects.includes(cb.value);
        });

        this.updateTotal();
        if (typeof openModal === 'function') {
            openModal('modal-pricing-crud');
        } else {
            const el = document.getElementById('modal-pricing-crud');
            if (el) el.classList.remove('hidden');
        }
    }

    static resetModal() {
        document.getElementById('field-code').value = '';
        document.getElementById('field-package').value = '';
        document.getElementById('field-fee-service').value = '0';
        document.getElementById('field-fee-token').value = '0';
        document.getElementById('field-fee-vat').value = '0';
        document.getElementById('field-notes').value = '';
        document.getElementById('field-active').checked = true;
        document.querySelectorAll('.field-subject').forEach(cb => cb.checked = false);
        this.updateTotal();
    }

    static handleModalPriceInput(el) {
        const raw = el.value.replace(/[^0-9]/g, '');
        el.value = this.formatVND(Number(raw));
        this.updateTotal();
    }

    static updateTotal() {
        const fee = this.parseVND(document.getElementById('field-fee-service').value);
        const token = this.parseVND(document.getElementById('field-fee-token').value);
        const vat = this.parseVND(document.getElementById('field-fee-vat').value);
        const total = fee + token + vat;
        document.getElementById('field-total-display').textContent = this.formatVND(total) + 'đ';
        return total;
    }

    static async saveItem() {
        const subjects = Array.from(document.querySelectorAll('.field-subject:checked')).map(cb => cb.value).join(', ');
        
        const item = {
            product_group: document.getElementById('field-group').value,
            subject_type: subjects,
            transaction_type: document.getElementById('field-transaction').value,
            product_code: document.getElementById('field-code').value.toUpperCase(),
            package_name: document.getElementById('field-package').value,
            service_fee: this.parseVND(document.getElementById('field-fee-service').value),
            token_fee: this.parseVND(document.getElementById('field-fee-token').value),
            vat_fee: this.parseVND(document.getElementById('field-fee-vat').value),
            total_price: this.updateTotal(),
            notes: document.getElementById('field-notes').value,
            is_active: document.getElementById('field-active').checked,
            effective_date: new Date().toISOString().split('T')[0]
        };

        if (!item.product_code || !item.package_name) {
            showToast('⚠️ Vui lòng nhập đầy đủ Mã SP và Gói cước', 'warning');
            return;
        }

        console.log('[PRICING] Saving package:', item);

        if (this.editingIndex >= 0) {
            this.draftItems[this.editingIndex] = item;
        } else {
            this.draftItems.push(item);
        }

        closeModal('modal-pricing-crud');
        
        // AUTO-PERSIST to database immediately
        try {
            showToast('⏳ Đang lưu vào hệ thống...', 'info');
            const res = await fetch('/api/pricing/version', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sb-token')}`
                },
                body: JSON.stringify({
                    name: `Bảng giá ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`,
                    items: this.draftItems
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            showToast('✅ Đã lưu gói cước vào database!', 'success');
            
            // Reload from DB to ensure consistency
            await this.loadActivePricing();
            this.render();
            
            // Sync CRM dropdown with new pricing data
            if (typeof loadCRMPrices === 'function') await loadCRMPrices();
            if (window.PricingEngine) PricingEngine.init();
            
            console.log('[PRICING] Loaded packages after save:', this.pricingData.length, 'items');
        } catch (err) {
            console.error('[PRICING] Save to DB error:', err);
            showToast('❌ Lỗi khi lưu: ' + err.message, 'error');
        }
    }

    static async deleteItem(index) {
        const item = this.draftItems[index];
        if (!confirm(`Bạn có chắc muốn xóa gói [${item.product_code}]?`)) return;
        
        this.deletedItem = { index, data: this.draftItems[index] };
        this.draftItems.splice(index, 1);
        this.render();
        
        // AUTO-PERSIST deletion to database
        try {
            showToast('⏳ Đang xóa khỏi hệ thống...', 'info');
            const res = await fetch('/api/pricing/version', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sb-token')}`
                },
                body: JSON.stringify({
                    name: `Bảng giá ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`,
                    items: this.draftItems
                })
            });

            if (!res.ok) throw new Error('Failed to persist deletion');
            
            showToast(`🗑 Đã xóa gói ${item.product_code}`, 'success');
            await this.loadActivePricing();
            this.render();
            if (typeof loadCRMPrices === 'function') await loadCRMPrices();
        } catch (err) {
            console.error('[PRICING] Delete persist error:', err);
            showToast('❌ Lỗi khi xóa: ' + err.message, 'error');
        }
    }

    static async saveNewVersion() {
        const modal = document.getElementById('modal-confirm-pricing');
        if (modal) modal.classList.remove('hidden');

        document.getElementById('btn-do-save-pricing').onclick = async () => {
            await this.submit();
        };
    }

    static async submit() {
        const btn = document.getElementById('btn-do-save-pricing');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

        try {
            const res = await fetch('/api/pricing/version', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sb-token')}`
                },
                body: JSON.stringify({
                    name: `Bảng giá ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`,
                    items: this.draftItems
                })
            });

            if (!res.ok) throw new Error('Failed to save pricing');

            showToast('✅ Bảng giá mới đã được áp dụng!', 'success');
            closeModal('modal-confirm-pricing');
            await this.loadActivePricing();
            this.render();
            
            // Sync with other components
            if (window.PricingEngine) PricingEngine.init();

        } catch (err) {
            console.error('[PRICING] Save error:', err);
            showToast('❌ Lỗi khi lưu bảng giá: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý & Lưu';
        }
    }

    static formatVND(val) {
        if (!val) return '0';
        return Math.floor(val).toLocaleString('vi-VN');
    }

    static parseVND(str) {
        return Number(str.toString().replace(/[^0-9]/g, ''));
    }
}

window.PricingManager = PricingManager;

