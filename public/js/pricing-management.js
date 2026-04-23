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
        try {
            await this.loadConfig();
            await this.loadActivePricing();
        } catch (err) {
            console.error('[PRICING] Initialization error:', err);
            // Even if it fails, try to render what we have or an error state
            this.servicesConfig = this.servicesConfig || []; 
        } finally {
            this.render();
        }
    }

    static async loadConfig() {
        try {
            const res = await fetch('/api/services-config', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-token')}` }
            });
            if (!res.ok) throw new Error('API failed with status ' + res.status);
            this.servicesConfig = await res.json();
            if (this.servicesConfig.error) throw new Error(this.servicesConfig.error);
        } catch (err) {
            console.error('[PRICING] Failed to load config:', err);
            this.servicesConfig = []; // Fallback so render() doesn't crash
        }
    }

    static async loadActivePricing() {
        try {
            const res = await fetch('/api/pricing/active', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-token')}` }
            });
            if (!res.ok) throw new Error('API failed with status ' + res.status);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this.pricingData = data;
            
            if (data.version) {
                const verEl = document.getElementById('current-version-name');
                if (verEl) verEl.textContent = data.version.name;
            }

            // Initialize draftItems from active pricing
            this.draftItems = {};
            if (data.categories && Array.isArray(data.categories)) {
                data.categories.forEach(cat => {
                    if (!cat.services) return;
                    cat.services.forEach(svc => {
                        if (!svc.items) return;
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
            }
        } catch (err) {
            console.error('[PRICING] Failed to load active pricing:', err);
            this.pricingData = null;
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

        if (!Array.isArray(this.servicesConfig) || this.servicesConfig.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-20 text-gray-500">
                    <div class="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <p>Không thể tải dữ liệu cấu hình dịch vụ.</p>
                    <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors">Tải Lại</button>
                </div>
            `;
            return;
        }

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
                    'Authorization': `Bearer ${localStorage.getItem('sb-token')}`
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

    static handleImageUpload(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            await this.analyzeImage(base64);
        };
        reader.readAsDataURL(file);
    }

    static async analyzeImage(base64) {
        showToast('🚀 Đang phân tích ảnh bằng AI...', 'info');
        
        try {
            const res = await fetch('/api/pricing/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sb-token')}`
                },
                body: JSON.stringify({ image: base64 })
            });

            const result = await res.json();
            if (!result.success) throw new Error(result.error);

            // Merge AI data into draftItems
            result.data.forEach(aiSvc => {
                // Find matching service in config
                const svcMatch = this.findServiceMatch(aiSvc.service_name);
                if (svcMatch) {
                    this.draftItems[svcMatch.id] = aiSvc.items.map(item => ({
                        duration: item.duration,
                        price: item.price,
                        description: ''
                    }));
                }
            });

            showToast('✅ Đã trích xuất dữ liệu thành công!', 'success');
            this.render();

        } catch (err) {
            console.error('[PRICING] Analysis error:', err);
            showToast('❌ Lỗi AI: ' + err.message, 'error');
        }
    }

    static findServiceMatch(name) {
        if (!this.servicesConfig) return null;
        const search = name.toLowerCase();
        
        for (const cat of this.servicesConfig) {
            for (const svc of cat.pricing_services) {
                const svcName = svc.name.toLowerCase();
                if (svcName.includes(search) || search.includes(svcName)) return svc;
            }
        }
        return null;
    }
}

window.PricingManager = PricingManager;
