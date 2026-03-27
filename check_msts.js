require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSpecific() {
    console.log('--- CHECKING SPECIFIC MSTs ---');
    const msts = ['0310679945', '0101935049'];
    try {
        for (const mst of msts) {
            console.log(`\n>> MST: ${mst}`);
            const { data: cert } = await supabase.from('certificates').select('*').eq('mst', mst);
            console.log(`   Certs count: ${cert?.length || 0}`);
            if (cert?.[0]) console.log(`   Cert PDF: ${cert[0].pdf_url}`);

            const { data: cust } = await supabase.from('customers').select('*').eq('mst', mst);
            console.log(`   Custs count: ${cust?.length || 0}`);
            if (cust?.[0]) console.log(`   Cust PDF: ${cust[0].pdf_url}`);

            const { data: logs } = await supabase.from('email_logs').select('*').eq('mst', mst).order('created_at', { ascending: false });
            console.log(`   Email Logs (${logs?.length || 0}):`);
            logs?.forEach(l => console.log(`   - Status: ${l.status} | PDF Attached: ${l.pdf_attached} | Error: ${l.error_message}`));
        }
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSpecific();
