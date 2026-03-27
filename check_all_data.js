require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkAll() {
    console.log('--- CHECKING ALL RECORDS ---');
    try {
        const { data: certs } = await supabase.from('certificates').select('*').limit(10);
        console.log(`Recent Certificates (${certs?.length || 0}):`);
        certs?.forEach(c => console.log(`MST: ${c.mst} | PDF: ${c.pdf_url}`));

        const { data: custs } = await supabase.from('customers').select('*').limit(10);
        console.log(`Recent Customers (${custs?.length || 0}):`);
        custs?.forEach(c => console.log(`MST: ${c.mst} | PDF: ${c.pdf_url}`));

        const { data: logs } = await supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(5);
        console.log(`Recent Email Logs:`);
        logs?.forEach(l => console.log(`MST: ${l.mst} | Status: ${l.status} | PDF: ${l.pdf_attached}`));

    } catch (e) {
        console.error('Fatal debug error:', e.message);
    }
}

checkAll();
