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
            service: '', packageId: '', quantity: 0, price: 0, total: 0
        };
        this.init();
    }

    init() {
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
            btnWord: document.getElementById('btn-export-word')
        };
        
        if (!this.els.serviceSel) return;
        this.populateServices();
        this.bindEvents();
        this.recalc();
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
            this.els[key].addEventListener('input', (e) => {
                const stateKey = key.replace('Inp', '');
                this.state[stateKey] = e.target.value;
                this.updatePreview();
            });
            this.els[key].addEventListener('focus', () => this.els[key].parentElement.classList.add('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
            this.els[key].addEventListener('blur', () => this.els[key].parentElement.classList.remove('shadow-[0_0_15px_rgba(59,130,246,0.3)]'));
        });
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
