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
        
        const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Báo giá Tự động</title>
            <style>
                body { font-family: Arial, sans-serif; color: #1e293b; }
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
                <h2>${document.getElementById('pv-title').innerText}</h2>
            </div>
            <div style="margin-bottom: 20px;">
                <p><strong>Khách hàng:</strong> ${document.getElementById('pv-company').innerText}</p>
                <p><strong>Mã số thuế:</strong> ${document.getElementById('pv-mst').innerText}</p>
                <p><strong>Người nhận:</strong> ${document.getElementById('pv-receiver').innerText}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th class="text-left">Gói Dịch Vụ</th>
                        <th>Số lượng</th>
                        <th class="text-right">Đơn giá (VNĐ)</th>
                        <th class="text-right">Thành tiền (VNĐ)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="text-left">${document.getElementById('pv-pkg-name').innerText}</td>
                        <td>${document.getElementById('pv-pkg-qty').innerText}</td>
                        <td class="text-right">${document.getElementById('pv-pkg-price').innerText}</td>
                        <td class="text-right">${document.getElementById('pv-pkg-total').innerText}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="3" class="text-right">Tổng cộng (Đã bao gồm VAT):</td>
                        <td class="text-right brand-color">${document.getElementById('pv-final-total').innerText}</td>
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
        this.state = {
            company: '', mst: '', receiver: '', email: '',
            service: '', packageId: '', quantity: 0, price: 0, total: 0,
            quotations: []
        };
        this.init();
    }

    init() {
        // Essential Elements for Management Page
        const listEl = document.getElementById('quotation-list');
        if (listEl) {
            this.loadList();
        }

        // Essential Elements for Creation Modal
        this.els = {
            serviceSel: document.getElementById('quote-service-sel'),
            packageSel: document.getElementById('quote-package-sel'),
            qtyInput: document.getElementById('quote-custom-qty'),
            qtyWrapper: document.getElementById('quote-qty-wrapper'),
            companyInp: document.getElementById('quote-company-inp'),
            mstInp: document.getElementById('quote-mst-inp'),
            receiverInp: document.getElementById('quote-receiver-inp'),
            emailInp: document.getElementById('quote-email-inp'),
            priceDisplay: document.getElementById('quote-price-display'),
            totalDisplay: document.getElementById('quote-total-display'),
            btnImg: document.getElementById('btn-export-img'),
            btnWord: document.getElementById('btn-export-word'),
            btnSave: document.getElementById('btn-save-quote') // Added ID in index.html later if needed
        };
        
        // Only bind events if the modal selects are present
        if (this.els.serviceSel && this.els.packageSel) {
            this.populateServices();
            this.bindEvents();
            this.recalc();
        } else {
            console.warn('[QuoteManager] Creation Modal elements not fully found. Modal features may be limited.');
        }
    }

    populateServices() {
        console.log('[QuoteManager] Populating services...');
        const services = PricingEngine.getServices();
        let html = '<option value="">Chọn dịch vụ...</option>';
        services.forEach(s => {
            html += `<option value="${s}">${s}</option>`;
        });
        this.els.serviceSel.innerHTML = html;
        
        // Force sync custom select UI if present
        if (window.refreshCustomSelects) {
            window.refreshCustomSelects();
        }
    }

    bindEvents() {
        this.els.serviceSel.addEventListener('change', (e) => {
            this.state.service = e.target.value;
            this.updatePackageOptions();
            this.recalc();
            this.updatePreview();
            this.animateDropdown(this.els.packageSel);
        });

        this.els.packageSel.addEventListener('change', (e) => {
            this.state.packageId = e.target.value;
            const pkg = PricingEngine.getPackageDetails(this.state.service, this.state.packageId);
            if (pkg) {
                this.state.price = pkg.price;
                if (pkg.requiresCustomQuantity) {
                    this.state.quantity = 0;
                    this.els.qtyWrapper.classList.remove('hidden');
                    this.els.qtyInput.value = '';
                    this.els.qtyInput.focus();
                } else {
                    this.state.quantity = pkg.quantity;
                    this.els.qtyWrapper.classList.add('hidden');
                }
            } else {
                this.state.price = 0;
                this.state.quantity = 0;
                this.els.qtyWrapper.classList.add('hidden');
            }
            this.recalc();
            this.updatePreview();
        });

        this.els.qtyInput.addEventListener('input', (e) => {
            this.state.quantity = parseInt(e.target.value) || 0;
            if (this.state.quantity < 10000) {
                 this.els.qtyInput.classList.add('border-red-500', 'bg-red-500/10');
            } else {
                 this.els.qtyInput.classList.remove('border-red-500', 'bg-red-500/10');
            }
            this.recalc();
            this.updatePreview();
        });

        ['companyInp', 'mstInp', 'receiverInp', 'emailInp'].forEach(key => {
            if (!this.els[key]) return;
            this.els[key].addEventListener('input', (e) => {
                const stateKey = key.replace('Inp', '');
                this.state[stateKey] = e.target.value;
                if (key === 'mstInp') this.searchCRMForQuote(e.target.value);
                this.updatePreview();
            });
            this.els[key].addEventListener('focus', () => this.els[key].parentElement.classList.add('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
            this.els[key].addEventListener('blur', () => this.els[key].parentElement.classList.remove('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
        });
    }

    searchCRMForQuote(mst) {
        if (!mst || mst.length < 5) return;
        if (typeof currentCRMData === 'undefined') return;
        
        const found = currentCRMData.find(c => c.mst === mst.trim());
        if (found) {
            this.state.company = found.company_name;
            this.els.companyInp.value = found.company_name;
            // Optionally auto-select service
            const svc = found.service_type || 'Chữ ký số';
            if (this.els.serviceSel.querySelector(`option[value*="${svc}"]`)) {
                this.state.service = this.els.serviceSel.querySelector(`option[value*="${svc}"]`).value;
                this.els.serviceSel.value = this.state.service;
                if (window.refreshCustomSelects) window.refreshCustomSelects(); 
                this.updatePackageOptions();
            }
            this.updatePreview();
        }
    }

    animateDropdown(el) {
        el.style.transform = 'scale(0.95)';
        el.style.opacity = '0.5';
        setTimeout(() => {
            el.style.transition = 'all 200ms ease-out';
            el.style.transform = 'scale(1)';
            el.style.opacity = '1';
        }, 50);
    }

    updatePackageOptions() {
        console.log('[QuoteManager] Updating packages for:', this.state.service);
        if (!this.state.service) {
            this.els.packageSel.innerHTML = '<option value="">-- Trước tiên chọn dịch vụ --</option>';
            this.els.packageSel.disabled = true;
            if (window.refreshCustomSelects) window.refreshCustomSelects();
            return;
        }
        this.els.packageSel.disabled = false;
        const pkgs = PricingEngine.getPackages(this.state.service);
        let html = '<option value="">Chọn gói dịch vụ...</option>';
        pkgs.forEach(p => {
            html += `<option value="${p.id}">${p.name}</option>`;
        });
        this.els.packageSel.innerHTML = html;

        // Force sync custom select UI
        if (window.refreshCustomSelects) {
            window.refreshCustomSelects();
        }
    }

    recalc() {
        this.state.total = PricingEngine.calculateTotal(this.state.price, this.state.quantity);
        this.els.priceDisplay.value = QuoteUtils.formatCurrency(this.state.price);
        this.els.totalDisplay.value = QuoteUtils.formatCurrency(this.state.total);
        
        let isValid = this.state.service && this.state.packageId && this.state.quantity > 0;
        if (this.state.packageId === 'CA2-eiextra' && this.state.quantity < 10000) {
            isValid = false; // requires > 10000
        }

        this.els.btnImg.disabled = !isValid;
        this.els.btnWord.disabled = !isValid;
        
        if (!isValid) {
            this.els.btnImg.classList.add('opacity-50', 'cursor-not-allowed');
            this.els.btnWord.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            this.els.btnImg.classList.remove('opacity-50', 'cursor-not-allowed');
            this.els.btnWord.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    updatePreview() {
        const previewEl = document.getElementById('quote-preview-board');
        previewEl.classList.add('opacity-50');
        setTimeout(() => previewEl.classList.remove('opacity-50', 'transition-opacity'), 200);

        document.getElementById('pv-company').innerText = this.state.company || '[Chưa nhập Tên Công Ty]';
        document.getElementById('pv-mst').innerText = this.state.mst || '...';
        document.getElementById('pv-receiver').innerText = this.state.receiver || '...';
        
        const serviceMap = {
            'Hóa đơn điện tử': 'HÓA ĐƠN ĐIỆN TỬ',
            'Chữ ký số': 'CHỮ KÝ SỐ CHUYÊN DÙNG CA2',
            'Bảo hiểm EBH': 'PHẦN MỀM BẢO HIỂM EBH'
        };
        document.getElementById('pv-title').innerText = \`BÁO GIÁ \${serviceMap[this.state.service] || 'DỊCH VỤ'}\`;
        document.getElementById('pv-subtitle').innerText = (this.state.service === 'Hóa đơn điện tử') ? 'CA2 - EINVOICE' : '';

        const pkg = PricingEngine.getPackageDetails(this.state.service, this.state.packageId);
        document.getElementById('pv-pkg-name').innerText = pkg ? pkg.name : '-';
        document.getElementById('pv-pkg-qty').innerText = this.state.quantity > 0 ? QuoteUtils.formatCurrency(this.state.quantity) : '-';
        document.getElementById('pv-pkg-price').innerText = this.state.price > 0 ? QuoteUtils.formatCurrency(this.state.price) : '-';
        document.getElementById('pv-pkg-total').innerText = this.state.total > 0 ? QuoteUtils.formatCurrency(this.state.total) : '-';
        document.getElementById('pv-final-total').innerText = this.state.total > 0 ? QuoteUtils.formatCurrency(this.state.total) : '0';
    }

    // --- API LIST MANAGEMENT ---
    async loadList() {
        const listContainer = document.getElementById('quotation-list');
        if (!listContainer) return;

        // Show loading state
        listContainer.innerHTML = `
            <tr>
                <td colspan="6" class="px-8 py-20 text-center">
                    <div class="flex flex-col items-center gap-4">
                        <div class="w-12 h-12 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin"></div>
                        <p class="text-gray-500 font-bold italic text-sm">Đang tải danh sách báo giá...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            if (typeof authedFetch === 'undefined') {
                throw new Error('Hệ thống chưa sẵn sàng (authedFetch missing)');
            }

            const res = await authedFetch('/api/quotations');
            if (!res.ok) throw new Error(`Lỗi máy chủ: ${res.status}`);
            
            const data = await res.json();
            this.state.quotations = Array.isArray(data) ? data : [];
            this.renderList();
        } catch (e) {
            console.error('Load Quotations Error:', e);
            this.renderError(e.message);
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
                        <div class="space-y-1">
                            <p class="text-white font-black">KHÔNG THỂ TẢI DỮ LIỆU</p>
                            <p class="text-xs text-gray-500">${msg}</p>
                        </div>
                        <button onclick="window.quoteManagerInstance.loadList()" class="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all">
                            THỬ LẠI
                        </button>
                    </div>
                </td>
            </tr>
        `;
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
                list.innerHTML = `<tr><td colspan="6" class="px-8 py-20 text-center text-gray-500 italic font-medium">Chưa có báo giá nào phù hợp.</td></tr>`;
                return;
            }

            list.innerHTML = filtered.map(q => {
                const price = q.price || 0;
                const date = q.created_at ? new Date(q.created_at).toLocaleDateString('vi-VN') : 'N/A';
                
                return `
                    <tr class="hover:bg-white/2 transition-colors border-b border-white/5">
                        <td class="px-8 py-6">
                            <p class="text-sm font-bold text-white">${q.customer_name || 'N/A'}</p>
                            <p class="text-[10px] text-gray-500 font-mono tracking-widest">${q.mst || 'KHÔNG CÓ MST'}</p>
                        </td>
                        <td class="px-8 py-6">
                            <span class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">${q.service || 'Dịch vụ'}</span>
                        </td>
                        <td class="px-8 py-6 text-right">
                            <p class="text-sm font-black text-orange-gradient">${QuoteUtils.formatCurrency(price)}</p>
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
                                `<a href="${q.file_url}" target="_blank" class="w-10 h-10 inline-flex items-center justify-center bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all" title="Xem file"><i class="fas fa-external-link-alt text-xs"></i></a>` : 
                                `<button onclick="window.quoteManagerInstance.generateFile('${q.id}')" class="w-10 h-10 inline-flex items-center justify-center bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white rounded-xl transition-all" title="Xuất File"><i class="fas fa-file-export text-xs"></i></button>`
                            }
                            <button onclick="window.quoteManagerInstance.deleteQuote('${q.id}')" class="w-10 h-10 inline-flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all" title="Xóa"><i class="fas fa-trash text-xs"></i></button>
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

        const data = {
            customer_name: this.state.company,
            mst: this.state.mst,
            service: this.state.service,
            package_id: this.state.packageId,
            quantity: this.state.quantity,
            price: this.state.price,
            total: this.state.total
        };

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
            console.error('Save Quotation Error:', e);
        }
    }

    async generateFile(id) {
        const btn = event.currentTarget;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
        btn.disabled = true;

        try {
            const res = await authedFetch(`/api/quotations/${id}/generate`, { method: 'POST' });
            if (res.ok) {
                this.loadList();
            } else {
                const data = await res.json();
                alert('Lỗi xuất file: ' + data.error);
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        } catch (e) {
            console.error('Generate File Error:', e);
            btn.innerHTML = oldHtml;
            btn.disabled = false;
        }
    }

    async deleteQuote(id) {
        if (!confirm('Bạn có chắc chắn muốn xóa báo giá này?')) return;
        try {
            const res = await authedFetch(`/api/quotations/${id}`, { method: 'DELETE' });
            if (res.ok) this.loadList();
        } catch (e) {
            console.error('Delete Quote Error:', e);
        }
    }
}

window.QuoteGenerator = QuoteGenerator;

window.openCreateQuotationModal = function() {
    const modal = document.getElementById('modal-quotation');
    if (modal) {
        modal.classList.remove('hidden');
        if (!window.quoteManagerInstance) {
            window.quoteManagerInstance = new QuoteManager();
        }
    } else {
        console.error('Modal quotation not found!');
    }
}

window.closeQuotationModal = function() {
    document.getElementById('modal-quotation').classList.add('hidden');
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
