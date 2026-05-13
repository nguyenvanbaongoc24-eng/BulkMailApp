
// Mocking normalizeStr and calculateExpirationDate from server.js
function normalizeStr(str) {
    if (!str) return '';
    return str.toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .toLowerCase()
        .trim();
}

function calculateExpirationDate(startDate, duration, cksType = '', compensateMonths = 0) {
    if (!startDate || !duration) return null;
    try {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) return null;
        
        const durStr = String(duration || '').toLowerCase();
        let resultDate = null;
        
        if (cksType) {
            const yearsMatch = durStr.match(/(\d+)/);
            const years = yearsMatch ? parseInt(yearsMatch[1]) : 1;
            let bonusMonths = years * 3;
            const result = new Date(start);
            result.setFullYear(result.getFullYear() + years);
            result.setMonth(result.getMonth() + bonusMonths);
            resultDate = result;
        } else {
            let daysToAdd = 0;
            let years = 0;
            const yearsMatch = durStr.match(/(\d+)\s*(năm|nam|year|y|n)/i);
            if (yearsMatch) {
                years = parseInt(yearsMatch[1]);
            } else {
                years = parseInt(durStr);
            }
            if (!isNaN(years) && years > 0) {
                daysToAdd = years * 365;
            }
            if (daysToAdd > 0) {
                resultDate = new Date(start.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
            }
        }

        if (resultDate && !isNaN(resultDate.getTime())) {
            if (compensateMonths > 0) {
                resultDate.setMonth(resultDate.getMonth() + parseInt(compensateMonths));
            }
            return resultDate.toISOString().split('T')[0];
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Test cases
const tests = [
    { s: "Chữ ký số", d: "1 năm", cks: "cap_moi", date: "2024-01-01" },
    { s: "CHỮ KÝ SỐ", d: "1 năm", cks: "gia_han", date: "2024-01-01" },
    { s: "CKS - Gia hạn", d: "2 năm", cks: "gia_han", date: "2024-01-01" },
    { s: "Hóa đơn điện tử", d: "500 số", cks: "", date: "2024-01-01" }
];

console.log('Testing Normalization and Expiration Logic:');
tests.forEach(t => {
    const svcNorm = normalizeStr(t.s);
    const isCKS = svcNorm.includes('cks') || svcNorm.includes('chu ky so');
    const expiry = calculateExpirationDate(t.date, t.d, isCKS ? t.cks : '', 0);
    console.log(`Input: "${t.s}" | Normalized: "${svcNorm}" | isCKS: ${isCKS} | Expiry: ${expiry}`);
});
