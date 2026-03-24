const { parseTemplate } = require('./services/emailService'); // Wait, emailService doesn't export parseTemplate.
// I'll just copy the function here to test it.

function parseTemplate(data, template) {
    if (!template) return '';
    console.log(`\n[TEMPLATE PARSER] BEFORE:`, template.substring(0, 100) + '...');
    console.log(`[TEMPLATE PARSER] DATA:`, data);

    const sanitize = (val) => {
        if (val === null || val === undefined) return '';
        return String(val).trim();
    };

    let parsedHTML = template
        .replace(/#TênCôngTy/g, sanitize(data.company_name))
        .replace(/#MST/g, sanitize(data.mst))
        .replace(/#ĐịaChỉ/g, sanitize(data.address))
        .replace(/#Email/g, sanitize(data.email))
        .replace(/#NgàyHếtHạn/g, sanitize(data.expired_date));

    console.log(`[TEMPLATE PARSER] AFTER:`, parsedHTML.substring(0, 100) + '...');

    const unmatched = parsedHTML.match(/#[A-Za-zÀ-ỹ0-9_]+/g);
    if (unmatched && unmatched.length > 0) {
        const remaining = unmatched.filter(tag => !(/^#[0-9A-Fa-f]{3,6}$/.test(tag)));
        if (remaining.length > 0) {
            console.error(`[TEMPLATE] ERROR TAG NOT REPLACED:`, remaining);
            throw new Error(`TAG NOT REPLACED: ${remaining.join(', ')}`);
        }
    }
    return parsedHTML;
}

try {
    const data = {
        company_name: 'CTY CA2',
        mst: '0101438910',
        address: 'Hanoi',
        email: 'test@ca2.vn',
        expired_date: '16/07/2026'
    };
    const tpl1 = "Kính gửi #TênCôngTy, MST của bạn là #MST. #ĐịaChỉ. #Email. #NgàyHếtHạn. #TênCôngTy";
    console.log("TEST 1 SUCCESS:", parseTemplate(data, tpl1));

    const tpl2 = "Kính gửi #TênCôngTy, màu sắc là #FFFFFF. Nhưng tag #LoiTag chưa được fix.";
    console.log("TEST 2 SHOULD FAIL:");
    parseTemplate(data, tpl2);
} catch (e) {
    console.error("Caught expected error:", e.message);
}
