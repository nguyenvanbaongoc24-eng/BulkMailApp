/**
 * Pricing Engine logic for Quotations (Phần 4: KHÔNG HARDCODE)
 */
class PricingEngine {
    static getPRICING_DATA() {
        // Build PRICING_DATA from global CRM_PRICE_LIST on the fly
        const data = {};
        
        // Ensure CRM_PRICE_LIST is an array
        const list = Array.isArray(window.CRM_PRICE_LIST) ? window.CRM_PRICE_LIST : [];

        list.forEach(p => {
            if (!p.is_active) return;
            
            if (!data[p.service_name]) {
                data[p.service_name] = {
                    icon: this.getIconForService(p.service_name),
                    packages: []
                };
            }
            
            data[p.service_name].packages.push({
                id: p.id || `pkg-${p.service_name}-${p.package_name}`,
                name: p.package_name,
                quantity: p.duration_months || 1,
                price: p.price,
                requiresCustomQuantity: p.service_name.includes('Platform') || p.package_name.includes('>')
            });
        });

        return data;
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
}

window.PricingEngine = PricingEngine;
