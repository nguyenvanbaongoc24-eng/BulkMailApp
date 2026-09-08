require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractPriceFromRecord(c) {
    if (!c) return 0;
    
    // 1. Check if package_name has price format like "12 tháng - 1.793.880đ" or "300 Số - 300.000đ"
    if (c.package_name && typeof c.package_name === 'string') {
        const match = c.package_name.match(/-\s*([\d.,]+)\s*đ?/i);
        if (match && match[1]) {
            const rawNum = match[1].replace(/[.,]/g, '');
            const parsed = parseInt(rawNum, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }

    // 2. Check if amount or price or total field exists
    if (c.amount) {
        const parsed = parseInt(String(c.amount).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (c.price) {
        const parsed = parseInt(String(c.price).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (c.total) {
        const parsed = parseInt(String(c.total).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return 0;
}

async function testWeeklyRevenue() {
    const fromDate = new Date('2026-08-17T00:00:00');
    const toDate = new Date('2026-08-23T23:59:59.999');

    const { data: customers } = await supabase.from('customers').select('*');
    
    let total = 0;
    let count = 0;
    customers?.forEach(c => {
        const dateStr = c.start_date || c.created_at;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (d >= fromDate && d <= toDate) {
            const price = extractPriceFromRecord(c);
            console.log(`[CRM] ${c.start_date} | ${c.company_name} | ${c.service_type} | ${c.package_name} => ${price.toLocaleString('vi-VN')} đ`);
            total += price;
            count++;
        }
    });

    console.log(`\n===> TỔNG DOANH THU TUẦN NÀY (${count} đơn): ${total.toLocaleString('vi-VN')} đ`);
}

testWeeklyRevenue();
