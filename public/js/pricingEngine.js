/**
 * Pricing Engine logic for Quotations
 */

const PRICING_DATA = {
    'Hóa đơn điện tử': {
        icon: 'fas fa-file-invoice',
        packages: [
            { id: 'CA2-ei300', name: 'CA2-ei300 (300 tờ)', quantity: 300, price: 1000 },
            { id: 'CA2-ei500', name: 'CA2-ei500 (500 tờ)', quantity: 500, price: 850 },
            { id: 'CA2-ei1000', name: 'CA2-ei1000 (1000 tờ)', quantity: 1000, price: 675 },
            { id: 'CA2-ei2000', name: 'CA2-ei2000 (2000 tờ)', quantity: 2000, price: 550 },
            { id: 'CA2-ei5000', name: 'CA2-ei5000 (5000 tờ)', quantity: 5000, price: 450 },
            { id: 'CA2-ei10000', name: 'CA2-ei10000 (10000 tờ)', quantity: 10000, price: 350 },
            { id: 'CA2-eiextra', name: 'CA2-eiextra (>10000 tờ)', quantity: null, price: 300, requiresCustomQuantity: true }
        ]
    },
    'Chữ ký số': {
        icon: 'fas fa-signature',
        packages: [
            { id: 'CKS-1Y', name: 'Gói 1 năm', quantity: 1, price: 1827000 },
            { id: 'CKS-2Y', name: 'Gói 2 năm', quantity: 1, price: 2740000 },
            { id: 'CKS-3Y', name: 'Gói 3 năm', quantity: 1, price: 3109000 },
            { id: 'CKS-4Y', name: 'Gói 4 năm', quantity: 1, price: 3200000 }
        ]
    },
    'Bảo hiểm EBH': {
        icon: 'fas fa-shield-alt',
        packages: [
            { id: 'EBH-100', name: 'Gói dưới 100 NS', quantity: 1, price: 400000 },
            { id: 'EBH-1000', name: 'Gói 100-1000 NS', quantity: 1, price: 800000 },
            { id: 'EBH-MAX', name: 'Gói không giới hạn', quantity: 1, price: 1500000 }
        ]
    }
};

class PricingEngine {
    static getServices() {
        return Object.keys(PRICING_DATA);
    }

    static getPackages(serviceName) {
        if (!PRICING_DATA[serviceName]) return [];
        return PRICING_DATA[serviceName].packages;
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
window.PRICING_DATA = PRICING_DATA;
