require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkAll() {
    console.log('--- CHECKING ALL CUSTOMERS ---');
    try {
        const { data: custs, error } = await supabase.from('customers').select('*').limit(50);
        if (error) {
            console.error('Error:', error.message);
        } else {
            console.log(`Found ${custs?.length || 0} customers.`);
            custs?.forEach((c, i) => {
                console.log(`${i+1}. MST: [${c.mst}] | Name: ${c.company_name} | PDF: ${c.pdf_url}`);
            });
        }
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkAll();
