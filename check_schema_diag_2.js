require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('--- CHECKING ADDRESS SCHEMA ---');
    try {
        const { error: insErr } = await supabase.from('customers').insert({ mst: 'TEST_ADDR', address: 'TEST_ADDR' });
        console.log('Insert into address result:', insErr ? insErr.message : 'SUCCESS');
        
        const { error: insErr2 } = await supabase.from('customers').insert({ mst: 'TEST_DIACHI', dia_chi: 'TEST_DIACHI' });
        console.log('Insert into dia_chi result:', insErr2 ? insErr2.message : 'SUCCESS');

        const { data } = await supabase.from('customers').select('*').limit(1);
        if (data && data.length > 0) {
            console.log('Available columns:', Object.keys(data[0]));
        }
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSchema();
