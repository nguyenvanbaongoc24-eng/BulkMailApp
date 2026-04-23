/**
 * Pricing Manager - Handles the UI for updating service prices
 */
class PricingManager {
    static activeCategory = 'company';
    static pricingData = null; // Full active pricing
    static servicesConfig = null; // List of categories and services
    static draftItems = {}; // {service_id: {duration: price}}

    static async init() {
        console.log('[PRICING] Initializing...');
        await this.loadConfig();
        await this.loadActivePricing();
        this.render();
    }

    static async loadConfig() {
        try {
            const res = await fetch('/api/services-config', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}` }
            });
            this.servicesConfig = await res.json();
        } catch (err) {
            console.error('[PRICING] Failed to load config:', err);
        }
    }

    static async loadActivePricing() {
        try {
            const res = await fetch('/api/pricing/active', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}` }
            });
            const data = await res.json();
            this.pricingData = data;
            
            if (data.version) {
                document.getElementById('current-version-name').textContent = data.version.name;
            }

            // Initialize draftItems from active pricing
            this.draftItems = {};
            data.categories.forEach(cat => {
                cat.services.forEach(svc => {
                    svc.items.forEach(item => {
                        if (!this.draftItems[svc.id]) this.draftItems[svc.id] = [];
                        this.draftItems[svc.id].push({
                            duration: item.duration,
                            price: item.price,
                            description: item.description
                        });
                    });
                });
            });
        } catch (err) {
            console.error('[PRICING] Failed to load active pricing:', err);
        }
    }

    static switchCategory(cat) {
        this.activeCategory = cat;
        
        // Update tabs UI
        document.querySelectorAll('.pricing-tab').forEach(t => {
            t.classList.remove('active');
            t.classList.add('text-gray-500');
        });
        
        const activeTab = document.getElementById(`tab-cat-${cat}`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.classList.remove('text-gray-500');
        }

        this.render();
    }

    static render() {
        const grid = document.getElementById('pricing-grid');
        if (!grid) return;

        if (!this.servicesConfig) return;

        const categoryName = this.activeCategory === 'company' ? 'Công ty' : 'Cá nhân/HKD';
        const category = this.servicesConfig.find(c => c.name === categoryName);

        if (!category) {
            grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">Chưa có dữ liệu cho nhóm này.</div>';
            return;
        }

        grid.innerHTML = '';

        category.pricing_services.forEach(svc => {
            const block = document.createElement('div');
            block.className = 'service-block space-y-6';
            
            const existingItems = this.draftItems[svc.id] || [];
            
            // Ensure at least 3 rows for some services or just use what exists
            let itemsToRender = [...existingItems];
            if (itemsToRender.length === 0) {
                // Default durations based on service type
                const durations = svc.name.includes('Hóa đơn') ? ['300 số', '500 số', '1000 số'] : ['1 năm', '2 năm', '3 năm'];
                itemsToRender = durations.map(d => ({ duration: d, price: 0, description: '' }));
            }

            block.innerHTML = `
                <div class="flex items-center gap-3 border-b border-white/5 pb-4">
                    <div class="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                        <i class="${this.getIcon(svc.name)}"></i>
                    </div>
                    <h3 class="font-black text-white tracking-tight">${svc.name}</h3>
                </div>
                <div class="space-y-4" id="items-${svc.id}">
                    ${itemsToRender.map((item, idx) => `
                        <div class="price-input-row">
                            <input type="text" value="${item.duration}" 
                                onchange="PricingManager.updateItem('${svc.id}', ${idx}, 'duration', this.value)"
                                placeholder="Thời hạn" 
                                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-gray-400 outline-none focus:border-orange-500/50 transition-all">
                            <div class="price-input-group">
                                <input type="text" value="${this.formatVND(item.price)}" 
                                    oninput="PricingManager.handlePriceInput(this, '${svc.id}', ${idx})"
                                    placeholder="Giá tiền" 
                                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-8 text-sm font-black text-white outline-none focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all">
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="PricingManager.addItem('${svc.id}')" class="w-full py-3 rounded-xl border border-dashed border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white hover:border-white/20 transition-all">
                    + Thêm mốc giá
                </button>
            `;
            grid.appendChild(block);
        });
    }

    static getIcon(name) {
        if (name.includes('CA2') || name.includes('Chữ ký số')) return 'fas fa-signature';
        if (name.includes('Hóa đơn')) return 'fas fa-file-invoice';
        if (name.includes('Remote')) return 'fas fa-broadcast-tower';
        return 'fas fa-box';
    }

    static formatVND(val) {
        if (!val) return '0';
        return Number(val).toLocaleString('vi-VN');
    }

    static parseVND(str) {
        return Number(str.replace(/[^0-9]/g, ''));
    }

    static handlePriceInput(el, serviceId, idx) {
        const raw = el.value.replace(/[^0-9]/g, '');
        const num = Number(raw);
        el.value = this.formatVND(num);
        this.updateItem(serviceId, idx, 'price', num);
    }

    static updateItem(serviceId, idx, field, value) {
        if (!this.draftItems[serviceId]) this.draftItems[serviceId] = [];
        if (!this.draftItems[serviceId][idx]) {
            this.draftItems[serviceId][idx] = { duration: '', price: 0, description: '' };
        }
        this.draftItems[serviceId][idx][field] = value;
    }

    static addItem(serviceId) {
        if (!this.draftItems[serviceId]) this.draftItems[serviceId] = [];
        this.draftItems[serviceId].push({ duration: '', price: 0, description: '' });
        this.render();
    }

    static saveNewVersion() {
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
            // Flatten draftItems for API
            const items = [];
            Object.keys(this.draftItems).forEach(svcId => {
                this.draftItems[svcId].forEach(item => {
                    if (item.duration && item.price > 0) {
                        items.push({
                            service_id: svcId,
                            duration: item.duration,
                            price: item.price,
                            description: item.description
                        });
                    }
                });
            });

            const res = await fetch('/api/pricing/version', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}`
                },
                body: JSON.stringify({
                    name: `Bảng giá ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`,
                    items: items
                })
            });

            if (!res.ok) throw new Error('Failed to save pricing');

            showToast('✅ Bảng giá mới đã được áp dụng!', 'success');
            closeModal('modal-confirm-pricing');
            await this.loadActivePricing();
            this.render();
            
            // Trigger refresh in other components if needed
            if (window.PricingEngine) {
                // We might need to refresh PricingEngine's local cache if it has one
            }

        } catch (err) {
            console.error('[PRICING] Save error:', err);
            showToast('❌ Lỗi khi lưu bảng giá: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý & Lưu';
        }
    }
}

window.PricingManager = PricingManager;
