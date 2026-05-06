/**
 * Quotation Components logic
 */
class QuoteUtils {
    static formatCurrency(value) {
        if (!value) return "0";
        return new Intl.NumberFormat('vi-VN').format(value).replace(/,/g, '.');
    }
}

class QuoteGenerator {
    static renderImage() {
        const previewEl = document.getElementById('quote-preview-board');
        if (!previewEl) return;
        
        const btn = document.getElementById('btn-export-img');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
        btn.disabled = true;

        html2canvas(previewEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Bao_Gia_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('Error rendering image:', err);
            alert('Có lỗi xảy ra khi tạo ảnh báo giá!');
        }).finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    }

    static renderWord() {
        const previewEl = document.getElementById('quote-preview-board');
        if (!previewEl) return;
        
        const items = window.quoteManagerInstance?.state?.items || [];
        let rowsHtml = '';
        
        if (items.length === 0) {
            rowsHtml = `<tr><td colspan="4" class="text-center">Chưa có dịch vụ nào</td></tr>`;
        } else {
            items.forEach((item, index) => {
                const title = `${item.service} (${item.variant})`;
                const desc = item.duration;
                rowsHtml += `
                <tr>
                    <td class="text-left">
                        <strong>${title}</strong><br>
                        <small>${desc}</small>
                    </td>
                    <td>${item.quantity || 1}</td>
                    <td class="text-right">${QuoteUtils.formatCurrency(item.price)}</td>
                    <td class="text-right">${QuoteUtils.formatCurrency(item.total)}</td>
                </tr>`;
            });
        }

        const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Báo giá Tự động</title>
            <style>
                body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: center; font-size: 14px; }
                th { background-color: #2563eb; color: white; font-weight: bold; }
                .text-left { text-align: left; }
                .text-right { text-align: right; }
                .brand-color { color: #2563eb; }
                .total-row td { background-color: #f8fafc; font-weight: bold; font-size: 16px; }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #2563eb;">NACENCOMM</h1>
                <h2>${document.getElementById('pv-title')?.innerText || 'BÁO GIÁ DỊCH VỤ'}</h2>
            </div>
            <div style="margin-bottom: 20px;">
                <p><strong>Khách hàng:</strong> ${document.getElementById('pv-company')?.innerText || ''}</p>
                <p><strong>Mã số thuế:</strong> ${document.getElementById('pv-mst')?.innerText || ''}</p>
                <p><strong>Người nhận:</strong> ${document.getElementById('pv-receiver')?.innerText || ''}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th class="text-left">Dịch vụ / Gói cước</th>
                        <th>Số lượng</th>
                        <th class="text-right">Đơn giá (VNĐ)</th>
                        <th class="text-right">Thành tiền (VNĐ)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr class="total-row">
                        <td colspan="3" class="text-right">Tổng cộng (Đã bao gồm VAT):</td>
                        <td class="text-right brand-color">${document.getElementById('pv-final-total')?.innerText || '0'}</td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>`;

        const blob = new Blob(['\ufeff', htmlContent], {
            type: 'application/msword'
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Bao_Gia_${new Date().getTime()}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

class QuoteManager {
    constructor() {
        try {
            this.state = {
                company: '', mst: '', receiver: '', email: '',
                items: [],
                quotations: [],
                isLoading: false,
                // Add Item Form State
                currentItem: {
                    service: '',
                    variant: 'Cấp mới',
                    model: 'TIME',
                    packageId: '',
                    duration: '',
                    quantity: 1,
                    price: 0,
                    total: 0
                }
            };
            this.init();
        } catch (err) {
            console.error('[QuoteManager] Critical Initialization Error:', err);
        }
    }

    init() {
        const listEl = document.getElementById('quotation-list');
        if (listEl) {
            this.loadList();
        }

        this.els = {
            companyInp: document.getElementById('quote-company-inp'),
            mstInp: document.getElementById('quote-mst-inp'),
            receiverInp: document.getElementById('quote-receiver-inp'),
            emailInp: document.getElementById('quote-email-inp'),
            btnImg: document.getElementById('btn-export-img'),
            btnWord: document.getElementById('btn-export-word'),
            btnSave: document.getElementById('btn-save-quote'),
            
            // Sub-form els
            addForm: document.getElementById('quote-add-item-form'),
            serviceSel: document.getElementById('quote-service-sel'),
            variantSel: document.getElementById('quote-variant-sel'),
            modelSel: document.getElementById('quote-model-sel'),
            modelWrapper: document.getElementById('quote-model-wrapper'),
            packageSel: document.getElementById('quote-package-sel'),
            qtyOldWrapper: document.getElementById('quote-qty-wrapper'),
            qtyInput: document.getElementById('quote-item-qty'),
            priceDisplay: document.getElementById('quote-price-display'),
            totalDisplay: document.getElementById('quote-item-total'),
            btnAddItem: document.getElementById('btn-add-item-to-list'),
            btnAddAllPackages: document.getElementById('btn-add-all-packages'),
            itemsTableBody: document.getElementById('quote-items-table'),
            sumTotal: document.getElementById('quote-total-sum')
        };
        
        if (this.els.serviceSel) {
            this.populateServices();
            this.bindEvents();
            this.renderItemsTable();
            this.updatePreview();
        }
    }

    populateServices() {
        const services = PricingEngine.getServices();
        let html = '<option value="">Chọn dịch vụ...</option>';
        services.forEach(s => {
            html += `<option value="${s}">${s}</option>`;
        });
        this.els.serviceSel.innerHTML = html;
        if (typeof window.refreshCustomSelects === 'function') window.refreshCustomSelects();
    }

    bindEvents() {
        ['companyInp', 'mstInp', 'receiverInp', 'emailInp'].forEach(key => {
            if (!this.els[key]) return;
            this.els[key].addEventListener('input', (e) => {
                const stateKey = key.replace('Inp', '');
                let value = e.target.value;
                if (key === 'mstInp') {
                    value = value.replace(/[^0-9-]/g, '').trim();
                    e.target.value = value;
                    this.searchCRMForQuote(value);
                }
                this.state[stateKey] = value;
                this.updatePreview();
            });
            this.els[key].addEventListener('focus', () => this.els[key].parentElement.classList.add('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
            this.els[key].addEventListener('blur', () => this.els[key].parentElement.classList.remove('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
        });

        // Add form events
        this.els.serviceSel.addEventListener('change', (e) => {
            this.state.currentItem.service = e.target.value;
            // Handle Remote Signing special case
            if (e.target.value.includes('Remote Signing')) {
                this.els.modelWrapper.classList.remove('hidden');
            } else {
                this.els.modelWrapper.classList.add('hidden');
                this.state.currentItem.model = 'TIME';
                if(this.els.modelSel) this.els.modelSel.value = 'TIME';
            }
            this.state.currentItem.packageId = '';
            this.els.packageSel.value = '';
            this.updatePackageOptions();
            this.recalcCurrentItem();
        });

        this.els.variantSel.addEventListener('change', (e) => {
            this.state.currentItem.variant = e.target.value;
            this.state.currentItem.packageId = '';
            this.els.packageSel.value = '';
            this.updatePackageOptions();
            this.recalcCurrentItem();
        });

        this.els.modelSel.addEventListener('change', (e) => {
            this.state.currentItem.model = e.target.value;
            this.updatePackageOptions();
            this.recalcCurrentItem();
        });

        this.els.packageSel.addEventListener('change', (e) => {
            this.state.currentItem.packageId = e.target.value;
            const pkg = PricingEngine.getPackageDetails(this.state.currentItem.service, e.target.value);
            if (pkg) {
                this.state.currentItem.duration = pkg.name;
                this.state.currentItem.price = pkg.price;
                this.els.priceDisplay.value = QuoteUtils.formatCurrency(pkg.price);
            } else {
                this.state.currentItem.price = 0;
                this.els.priceDisplay.value = '';
            }
            this.recalcCurrentItem();
        });

        this.els.qtyInput.addEventListener('input', (e) => {
            this.state.currentItem.quantity = parseInt(e.target.value) || 1;
            this.recalcCurrentItem();
        });

        this.els.priceDisplay.addEventListener('input', (e) => {
            let raw = e.target.value.replace(/\./g, '');
            let val = parseInt(raw);
            if (isNaN(val)) val = 0;
            this.state.currentItem.price = val;
            e.target.value = val === 0 ? '' : QuoteUtils.formatCurrency(val);
            this.recalcCurrentItem(true); // skip updating price display
        });
    }

    searchCRMForQuote(mst) {
        if (!mst || mst.length < 5) return;
        if (typeof currentCRMData === 'undefined') return;
        const found = currentCRMData.find(c => c.mst === mst.trim());
        if (found) {
            this.state.company = found.company_name;
            this.els.companyInp.value = found.company_name;
            this.updatePreview();
        }
    }

    updatePackageOptions() {
        const { service, variant } = this.state.currentItem;
        if (!service) {
            this.els.packageSel.innerHTML = '<option value="">-- Trước tiên chọn dịch vụ --</option>';
            this.els.packageSel.disabled = true;
            if (window.refreshCustomSelects) window.refreshCustomSelects();
            return;
        }
        this.els.packageSel.disabled = false;
        let pkgs = PricingEngine.getPackages(service);
        
        // Filter by Variant (Cấp mới / Gia hạn)
        if (variant) {
            pkgs = pkgs.filter(p => p.name.toLowerCase().includes(variant.toLowerCase()));
        }
        
        let html = '<option value="">Chọn gói/thời hạn...</option>';
        pkgs.forEach(p => {
            html += `<option value="${p.id}">${p.name}</option>`;
        });
        
        if (pkgs.length === 0) {
            html = '<option value="">-- Không có gói phù hợp --</option>';
            this.els.packageSel.disabled = true;
            if (this.els.btnAddAllPackages) this.els.btnAddAllPackages.classList.add('hidden');
        } else {
            if (this.els.btnAddAllPackages) this.els.btnAddAllPackages.classList.remove('hidden');
        }
        
        this.els.packageSel.innerHTML = html;

        if (typeof window.refreshCustomSelects === 'function') {
            window.refreshCustomSelects();
        }
    }

    recalcCurrentItem(skipPriceUpdate = false) {
        const { price, quantity, service, packageId } = this.state.currentItem;
        this.state.currentItem.total = price * quantity;
        
        this.els.totalDisplay.value = QuoteUtils.formatCurrency(this.state.currentItem.total);
        if (!skipPriceUpdate) {
            this.els.priceDisplay.value = QuoteUtils.formatCurrency(price);
        }
        
        const isValid = service && packageId && price > 0;
        this.els.btnAddItem.disabled = !isValid;
    }

    addAllPackages() {
        const { service, variant, model } = this.state.currentItem;
        if (!service) {
            alert('Vui lòng chọn Dịch vụ trước.');
            return;
        }

        let pkgs = PricingEngine.getPackages(service);
        if (variant) {
            pkgs = pkgs.filter(p => p.name.toLowerCase().includes(variant.toLowerCase()));
        }

        if (pkgs.length === 0) {
            alert('Không có gói cước nào phù hợp để thêm.');
            return;
        }

        let addedCount = 0;
        pkgs.forEach(pkg => {
            const exists = this.state.items.some(it => it.service === service && it.packageId === pkg.id);
            if (!exists) {
                const item = {
                    service: service,
                    variant: variant || 'Cấp mới',
                    model: model || 'TIME',
                    packageId: pkg.id,
                    duration: pkg.name,
                    quantity: 1,
                    price: pkg.price,
                    total: pkg.price
                };
                this.state.items.push(item);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.els.packageSel.value = '';
            this.els.qtyInput.value = 1;
            this.state.currentItem.packageId = '';
            this.state.currentItem.duration = '';
            this.state.currentItem.price = 0;
            this.state.currentItem.quantity = 1;
            this.state.currentItem.total = 0;
            if(this.els.priceDisplay) this.els.priceDisplay.value = '';
            if(this.els.totalDisplay) this.els.totalDisplay.value = '';
            
            this.recalcCurrentItem();
            if (window.refreshCustomSelects) window.refreshCustomSelects();
            
            this.hideAddForm();
            this.renderItemsTable();
            this.updatePreview();
        } else {
            alert('Tất cả các gói cước này đã có trong báo giá.');
        }
    }

    showAddForm() {
        this.els.addForm.classList.remove('hidden');
    }

    hideAddForm() {
        this.els.addForm.classList.add('hidden');
    }

    addCurrentItem() {
        if (!this.state.currentItem.service || !this.state.currentItem.packageId) {
            alert('Vui lòng chọn Dịch vụ và Gói cước trước khi thêm.');
            return;
        }
        const item = { ...this.state.currentItem };
        this.state.items.push(item);
        
        // Reset form
        this.els.packageSel.value = '';
        this.els.qtyInput.value = 1;
        this.state.currentItem.packageId = '';
        this.state.currentItem.duration = '';
        this.state.currentItem.price = 0;
        this.state.currentItem.quantity = 1;
        this.state.currentItem.total = 0;
        if(this.els.priceDisplay) this.els.priceDisplay.value = '';
        if(this.els.totalDisplay) this.els.totalDisplay.value = '';
        
        this.recalcCurrentItem();
        
        if (window.refreshCustomSelects) window.refreshCustomSelects();
        
        this.hideAddForm();
        this.renderItemsTable();
        this.updatePreview();
    }

    removeItem(index) {
        this.state.items.splice(index, 1);
        this.renderItemsTable();
        this.updatePreview();
    }

    renderItemsTable() {
        if (this.state.items.length === 0) {
            this.els.itemsTableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500 italic">Chưa có dịch vụ nào</td></tr>`;
            this.els.sumTotal.innerText = '0 đ';
        } else {
            let html = '';
            let sum = 0;
            this.state.items.forEach((item, idx) => {
                sum += item.total;
                html += `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-4 py-3 font-medium text-white">${item.service}</td>
                    <td class="px-4 py-3"><span class="px-2 py-0.5 rounded bg-white/10 text-gray-300 text-[10px] uppercase">${item.variant}</span> <br><span class="text-gray-400 text-xs">${item.duration}</span></td>
                    <td class="px-4 py-3 text-right text-gray-400">${QuoteUtils.formatCurrency(item.price)}</td>
                    <td class="px-4 py-3 text-center">${item.quantity}</td>
                    <td class="px-4 py-3 text-right font-medium text-white">${QuoteUtils.formatCurrency(item.total)}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="window.quoteManagerInstance.removeItem(${idx})" class="text-gray-500 hover:text-red-500 transition-colors"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
            this.els.itemsTableBody.innerHTML = html;
            this.els.sumTotal.innerText = QuoteUtils.formatCurrency(sum) + ' đ';
        }
        
        const hasItems = this.state.items.length > 0;
        this.els.btnImg.disabled = !hasItems;
        this.els.btnWord.disabled = !hasItems;
    }

    updatePreview() {
        const previewEl = document.getElementById('quote-preview-board');
        previewEl.classList.add('opacity-50');
        setTimeout(() => previewEl.classList.remove('opacity-50', 'transition-opacity'), 200);

        document.getElementById('pv-company').innerText = this.state.company || '[Chưa nhập Tên Công Ty]';
        document.getElementById('pv-mst').innerText = this.state.mst || '...';
        document.getElementById('pv-receiver').innerText = this.state.receiver || '...';
        
        const tbody = document.getElementById('quote-preview-body');
        if (!tbody) return;

        if (this.state.items.length === 0) {
            tbody.innerHTML = `
            <tr class="hover:bg-gray-50">
                <td colspan="4" class="border border-gray-300 px-3 py-2 text-center text-gray-500 italic">Chưa có dịch vụ</td>
            </tr>`;
            document.getElementById('pv-final-total').innerText = '0';
        } else {
            let html = '';
            let sum = 0;
            this.state.items.forEach(item => {
                sum += item.total;
                html += `
                <tr class="hover:bg-gray-50">
                    <td class="border border-gray-300 px-3 py-2 text-left">
                        <span class="font-bold text-gray-800">${item.service}</span> <span class="text-xs text-gray-500 uppercase">(${item.variant})</span><br>
                        <span class="text-xs text-gray-600">${item.duration}</span>
                    </td>
                    <td class="border border-gray-300 px-3 py-2 text-center">${item.quantity}</td>
                    <td class="border border-gray-300 px-3 py-2 text-right">${QuoteUtils.formatCurrency(item.price)}</td>
                    <td class="border border-gray-300 px-3 py-2 text-right font-medium">${QuoteUtils.formatCurrency(item.total)}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
            document.getElementById('pv-final-total').innerText = QuoteUtils.formatCurrency(sum);
        }
    }

    async loadList() {
        const listContainer = document.getElementById('quotation-list');
        if (!listContainer) return;
        this.state.isLoading = true;
        listContainer.innerHTML = `
            <tr>
                <td colspan="6" class="px-8 py-20 text-center pointer-events-none">
                    <div class="flex flex-col items-center gap-4">
                        <div class="w-12 h-12 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin"></div>
                        <p class="text-gray-500 font-bold italic text-sm">Đang tải danh sách báo giá...</p>
                    </div>
                </td>
            </tr>`;
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Kết nối quá hạn (Timeout).')), 15000));
            const res = await Promise.race([authedFetch('/api/quotations'), timeoutPromise]);
            if (!res.ok) throw new Error(`Lỗi máy chủ: ${res.status}`);
            const data = await res.json();
            this.state.quotations = Array.isArray(data) ? data : [];
            this.renderList();
        } catch (e) {
            console.error('[QuoteManager] Load List Error:', e);
            this.renderError(e.message);
        } finally {
            this.state.isLoading = false;
        }
    }

    renderError(msg) {
        const list = document.getElementById('quotation-list');
        if (!list) return;
        list.innerHTML = `
            <tr>
                <td colspan="6" class="px-8 py-20 text-center">
                    <div class="flex flex-col items-center gap-4">
                        <div class="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-2xl">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <p class="text-white font-black">KHÔNG THỂ TẢI DỮ LIỆU</p>
                        <button onclick="window.quoteManagerInstance.loadList()" class="px-8 py-3 bg-white/5 hover:bg-orange-500 rounded-2xl text-xs font-black transition-all">TẢI LẠI</button>
                    </div>
                </td>
            </tr>`;
    }

    renderList() {
        const list = document.getElementById('quotation-list');
        if (!list) return;
        try {
            const search = (document.getElementById('quotation-search')?.value || '').toLowerCase();
            const filtered = (this.state.quotations || []).filter(q => 
                (q.customer_name || '').toLowerCase().includes(search) || 
                (q.mst && q.mst.includes(search))
            );

            if (filtered.length === 0) {
                list.innerHTML = `<tr><td colspan="6" class="px-8 py-20 text-center text-gray-500 italic">Chưa có báo giá nào.</td></tr>`;
                return;
            }

            list.innerHTML = filtered.map(q => {
                // If the backend returns items array, compute display string
                let serviceDisplay = q.service || 'Dịch vụ';
                let totalDisplay = q.total || q.price || 0;
                
                if (q.items && q.items.length > 0) {
                    serviceDisplay = q.items.length > 1 ? `${q.items[0].service} + ${q.items.length - 1} khác` : q.items[0].service;
                    totalDisplay = q.items.reduce((sum, it) => sum + it.total, 0);
                }

                const date = q.created_at ? new Date(q.created_at).toLocaleDateString('vi-VN') : 'N/A';
                return `
                    <tr class="hover:bg-white/2 transition-colors border-b border-white/5">
                        <td class="px-8 py-6">
                            <p class="text-sm font-bold text-white">${q.customer_name || 'N/A'}</p>
                            <p class="text-[10px] text-gray-500 font-mono tracking-widest">${q.mst || '-'}</p>
                        </td>
                        <td class="px-8 py-6">
                            <span class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase border border-blue-500/20">${serviceDisplay}</span>
                        </td>
                        <td class="px-8 py-6 text-right">
                            <p class="text-sm font-black text-orange-gradient">${QuoteUtils.formatCurrency(totalDisplay)}</p>
                            <p class="text-[10px] text-gray-500 font-bold uppercase">VNĐ</p>
                        </td>
                        <td class="px-8 py-6 text-center text-xs text-gray-400 font-medium">${date}</td>
                        <td class="px-8 py-6 text-center">
                            ${q.file_url ? 
                                `<span class="px-3 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-full border border-green-500/20"><i class="fas fa-check mr-1"></i> HOÀN TẤT</span>` : 
                                `<span class="px-3 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-bold rounded-full border border-orange-500/20 animate-pulse"><i class="fas fa-clock mr-1"></i> ĐANG CHỜ</span>`
                            }
                        </td>
                        <td class="px-8 py-6 text-right space-x-2">
                            ${q.file_url ? 
                                `<a href="${q.file_url}" target="_blank" class="w-10 h-10 inline-flex items-center justify-center bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all"><i class="fas fa-external-link-alt"></i></a>` : 
                                `<button onclick="window.quoteManagerInstance.generateFile('${q.id}')" class="w-10 h-10 inline-flex items-center justify-center bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white rounded-xl transition-all"><i class="fas fa-file-export"></i></button>`
                            }
                            <button onclick="window.quoteManagerInstance.deleteQuote('${q.id}')" class="w-10 h-10 inline-flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Render List Error:', err);
            this.renderError('Lỗi hiển thị danh sách');
        }
    }

    async save() {
        if (!this.state.company) {
            alert('Vui lòng nhập tên khách hàng');
            return;
        }
        if (this.state.items.length === 0) {
            alert('Vui lòng thêm ít nhất 1 dịch vụ vào báo giá');
            return;
        }

        const sumTotal = this.state.items.reduce((s, it) => s + it.total, 0);

        // Prepare data with items array for backend
        const data = {
            customer_name: this.state.company,
            mst: this.state.mst,
            items: this.state.items,
            // Fallbacks for older systems:
            service: 'Báo giá tổng hợp',
            duration: `${this.state.items.length} dịch vụ`,
            price: sumTotal,
            package_id: 'MULTI',
            quantity: 1,
            total: sumTotal
        };

        const btn = this.els.btnSave;
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync fa-spin mr-2"></i> ĐANG LƯU...';
            btn.disabled = true;
        }

        try {
            const res = await authedFetch('/api/quotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                window.closeQuotationModal();
                this.loadList();
            } else {
                const err = await res.json();
                alert('Lỗi: ' + (err.error || 'Không thể lưu báo giá'));
            }
        } catch (e) {
            console.error('[QuoteManager] Save Error:', e);
            alert('Lỗi kết nối máy chủ');
        } finally {
            if (btn) {
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        }
    }

    async generateFile(id) {
        const btn = event?.currentTarget;
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; btn.disabled = true; }
        try {
            const res = await authedFetch(`/api/quotations/${id}/generate`, { method: 'POST' });
            if (res.ok) {
                this.loadList();
            } else {
                const data = await res.json();
                alert('Lỗi xuất file: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error('Generate File Error:', e);
            alert('Lỗi hệ thống khi xuất file');
        } finally {
            if (btn) { btn.innerHTML = oldHtml; btn.disabled = false; }
        }
    }

    async deleteQuote(id) {
        if (!confirm('Bạn có chắc chắn muốn xóa báo giá này?')) return;
        try {
            const res = await authedFetch(`/api/quotations/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.loadList();
            } else {
                const data = await res.json();
                alert('Lỗi khi xóa: ' + (data.error || 'Lỗi không xác định'));
            }
        } catch (e) {
            alert('Lỗi kết nối khi xóa báo giá');
        }
    }
}

window.QuoteGenerator = QuoteGenerator;

window.openCreateQuotationModal = function() {
    console.log('[FORCE-LOG] openCreateQuotationModal CALLED');
    const modal = document.getElementById('modal-quotation');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // FORCE
        modal.style.opacity = '1';    // FORCE
        modal.style.pointerEvents = 'auto'; // FORCE
        console.log('[FORCE-LOG] Modal DOM classes modified.');
        if (!window.quoteManagerInstance) {
            try {
                window.quoteManagerInstance = new QuoteManager();
            } catch (err) {
                console.error('[FORCE-LOG] QuoteManager Init Crash:', err);
            }
        }
    } else {
        console.error('[FORCE-LOG] Modal quotation NOT FOUND in DOM!');
    }
}

window.closeQuotationModal = function() {
    const modal = document.getElementById('modal-quotation');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none'; // FORCE: Reset Absolute Rescue style
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
    }
}

window.sendQuotationEmail = function() {
    // Basic interaction to open create campaign
    closeQuotationModal();
    if(typeof openCreateModal === 'function') {
        openCreateModal();
        setTimeout(() => {
            const subj = document.getElementById('input-subject');
            if(subj) subj.value = "Báo giá Dịch vụ CA2 - " + (window.quoteManagerInstance?.state?.company || '');
        }, 500);
    }
}
