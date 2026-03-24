require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

const msts = ["0903030334", "0976520840", "0328 464 528", "0907133195", "0400459020"];

async function checkCustomers() {
    console.log('--- CHECKING CUSTOMERS ---');
    for (const mst of msts) {
        const { data: cust } = await supabase.from('customers').select('*').eq('mst', mst).single();
        if (cust) {
            console.log(`[FOUND] MST: ${mst} | Name: ${cust.company_name} | PDF: ${cust.pdf_url || '❌ NULL'}`);
        } else {
            // Try without spaces
            const clean = mst.replace(/\s/g, '');
            const { data: cust2 } = await supabase.from('customers').select('*').eq('mst', clean).single();
            if (cust2) {
                console.log(`[FOUND (CLEAN)] MST: ${clean} | Name: ${cust2.company_name} | PDF: ${cust2.pdf_url || '❌ NULL'}`);
            } else {
                console.log(`[NOT FOUND] MST: ${mst}`);
            }
        }
    }
}

checkCustomers();
