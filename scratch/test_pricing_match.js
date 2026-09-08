require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testPricing() {
    const { data: pricing } = await supabase.from('pricing_packages').select('*');
    console.log('Pricing packages count:', pricing?.length);
    console.log('Sample packages:', pricing?.slice(0, 5).map(p => ({
        group: p.product_group,
        pkg: p.package_name,
        price: p.total_price,
        months: p.duration_months
    })));

    const { data: customers } = await supabase.from('customers').select('*');
    console.log('Customers count:', customers?.length);
    console.log('Sample customers with service & package:');
    customers?.forEach(c => {
        console.log({
            mst: c.mst,
            company: c.company_name,
            service: c.service_type,
            type: c.customer_type,
            package: c.package_name,
            duration: c.duration,
            start_date: c.start_date,
            created_at: c.created_at
        });
    });
}

testPricing();
