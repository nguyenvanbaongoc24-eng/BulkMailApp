/**
 * Pricing Engine logic for Quotations (Phần 4: KHÔNG HARDCODE)
 */
class PricingEngine {
    static getPRICING_DATA() {
        const data = {};
        const items = window.PricingManager && window.PricingManager.pricingData ? window.PricingManager.pricingData : [];
        
        items.forEach(item => {
            if (!item.is_active) return;

            let groupName = this.getFriendlyGroupName(item.product_group);
            
            if (!data[groupName]) {
                data[groupName] = {
                    icon: this.getIconForService(groupName),
                    packages: []
                };
            }

            data[groupName].packages.push({
                id: item.id || `pkg-${item.product_code}`,
                name: `${item.package_name} (${item.transaction_type} - ${item.subject_type})`,
                quantity: 1,
                price: item.total_price,
                requiresCustomQuantity: item.product_group === 'SP' || item.package_name.includes('>')
            });
        });

        return data;
    }

    static getFriendlyGroupName(group) {
        const map = {
            'CKS': 'Chữ ký số CA2 (Token)',
            'RS': 'Remote Signing',
            'SP': 'Sign Platform',
            'eINVOICE': 'Hóa đơn điện tử',
            'IVM': 'Quản lý HĐ đầu vào',
            'EBH': 'Bảo hiểm xã hội'
        };
        return map[group] || group;
    }

    static getIconForService(name) {
        if (name.includes('Chữ ký số') || name.includes('CKS')) return 'fas fa-signature';
        if (name.includes('Hóa đơn')) return 'fas fa-file-invoice';
        if (name.includes('Bảo hiểm') || name.includes('EBH')) return 'fas fa-shield-alt';
        return 'fas fa-tags';
    }

    static getServices() {
        return Object.keys(this.getPRICING_DATA());
    }

    static getPackages(serviceName) {
        const data = this.getPRICING_DATA();
        if (!data[serviceName]) return [];
        return data[serviceName].packages;
    }

    static getPackageDetails(serviceName, packageId) {
        const pkgs = this.getPackages(serviceName);
        return pkgs.find(p => p.id === packageId) || null;
    }

    static calculateTotal(price, quantity) {
        if (!price || !quantity) return 0;
        return price * quantity;
    }
    static async init() {
        if (window.PricingManager && (!window.PricingManager.pricingData || window.PricingManager.pricingData.length === 0)) {
            await window.PricingManager.loadActivePricing();
        }
        
        // Refresh quotation UI if it exists
        if (window.quoteManagerInstance && typeof window.quoteManagerInstance.populateServices === 'function') {
            window.quoteManagerInstance.populateServices();
        }
    }
}

window.PricingEngine = PricingEngine;
