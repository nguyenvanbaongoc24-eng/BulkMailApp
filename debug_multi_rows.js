require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function debugPdf() {
    console.log('--- DEBUGGING MULTIPLE ROWS ---');
    const mst = '0101935049';
    try {
        const { data: customers } = await supabase.from('customers').select('*').eq('mst', mst);
        console.log(`Found ${customers?.length || 0} rows in 'customers' for MST ${mst}:`);
        customers?.forEach((c, i) => {
            console.log(`Row ${i+1}: ID=${c.id} | Name=${c.company_name} | PDF=${c.pdf_url} | Created=${c.created_at}`);
        });

        const { data: certs } = await supabase.from('certificates').select('*').eq('mst', mst);
        console.log(`Found ${certs?.length || 0} rows in 'certificates' for MST ${mst}:`);
        certs?.forEach((c, i) => {
            console.log(`Row ${i+1}: ID=${c.id} | Serial=${c.serial} | PDF=${c.pdf_url}`);
        });

    } catch (e) {
        console.error('Fatal debug error:', e.message);
    }
}

debugPdf();
