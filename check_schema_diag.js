require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('--- CHECKING SCHEMA ---');
    try {
        const { data, error } = await supabase.from('customers').select('*').limit(1);
        if (error) {
            console.error('Error selecting from customers:', error.message);
        } else if (data && data.length > 0) {
            console.log('Columns in customers table:', Object.keys(data[0]));
        } else {
            console.log('Customers table is empty, trying to fetch from RPC or meta if possible...');
            // Try to inert dummy data to see what works
            const { error: insErr } = await supabase.from('customers').insert({ mst: 'TEST', dia_chi: 'TEST' });
            console.log('Insert into dia_chi result:', insErr ? insErr.message : 'SUCCESS');
        }
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSchema();
