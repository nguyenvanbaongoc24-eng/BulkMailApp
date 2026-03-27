require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('--- CHECKING Case-Sensitive SCHEMA ---');
    try {
        const { error: insErr } = await supabase.from('customers').insert({ mst: 'TEST_CASE', DiaChi: 'TEST_CASE' });
        console.log('Insert into DiaChi result:', insErr ? insErr.message : 'SUCCESS');
        
        const { error: insErr2 } = await supabase.from('customers').insert({ mst: 'TEST_CASE_2', "DiaChi": 'TEST_CASE_2' });
        console.log('Insert into "DiaChi" result:', insErr2 ? insErr2.message : 'SUCCESS');

        const { error: insErr3 } = await supabase.from('customers').insert({ mst: 'TEST_CASE_3', "address": 'TEST_CASE_3' });
        console.log('Insert into "address" result:', insErr3 ? insErr3.message : 'SUCCESS');

        // Let's try to get all columns if possible
        const { data, error } = await supabase.from('customers').select('*').limit(1);
        console.log('Select * data:', data);
        console.log('Select * error:', error ? error.message : 'NONE');

    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSchema();
