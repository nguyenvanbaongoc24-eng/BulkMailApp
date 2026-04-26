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
                card.className = 'list-item group';
                card.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-orange-gradient/10 text-orange-500 flex items-center justify-center text-xs font-black">
                            ${item.product_code || '??'}
                        </div>
                        <div>
                            <div class="list-item-title">${item.package_name}</div>
                            <div class="list-item-meta">${item.product_group} • ${item.transaction_type}</div>
                        </div>
                    </div>
                    <div class="flex-1 px-4">
                        <p class="text-[10px] text-gray-500 font-bold uppercase mb-1">Ghi chú</p>
                        <p class="text-[11px] text-gray-400 italic line-clamp-1">${item.notes || '---'}</p>
                    </div>
                    <div class="flex flex-col items-end px-4">
                        <div class="text-emerald-400 font-black text-sm">${this.formatVND(item.total_price)}đ</div>
                        <div class="text-[9px] text-gray-600 font-bold mt-1">Tổng cộng</div>
                    </div>
                    <div class="flex justify-center px-4">
                        <span class="badge-premium ${item.is_active ? 'badge-done' : 'badge-pending'}">
                            <span class="badge-dot"></span>
                            ${item.is_active ? 'Đang dùng' : 'Ẩn'}
                        </span>
                    </div>
                    <div class="flex justify-end gap-2">
                        <button onclick="PricingManager.showEditModal(${this.draftItems.indexOf(item)})" class="btn-action-premium text-blue-400 hover:text-white"><i class="fas fa-edit"></i></button>
                        <button onclick="PricingManager.deleteItem(${this.draftItems.indexOf(item)})" class="btn-delete-ios"><i class="fas fa-trash-alt"></i></button>
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

    static saveItem() {
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

        if (this.editingIndex >= 0) {
            this.draftItems[this.editingIndex] = item;
            showToast('✅ Đã cập nhật gói cước', 'success');
        } else {
            this.draftItems.push(item);
            showToast('✅ Đã thêm gói cước mới', 'success');
        }

        closeModal('modal-pricing-crud');
        this.render();
    }

    static deleteItem(index) {
        const item = this.draftItems[index];
        if (confirm(`Bạn có chắc muốn xóa gói [${item.product_code}]?`)) {
            this.deletedItem = { index, data: this.draftItems[index] };
            this.draftItems.splice(index, 1);
            this.render();
            
            showToast(`🗑 Đã xóa gói ${item.product_code}`, 'info');
            // Logic for Undo could go here if we wanted a real toast with action
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

