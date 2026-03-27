require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('--- FETCHING CERTIFICATES COLUMNS ---');
    try {
        const { data, error } = await supabase.from('certificates').insert({ mst: 'TEST_CERT_COLS' }).select();
        if (error) {
            console.error('Insert error:', error.message);
        } else if (data && data.length > 0) {
            console.log('Available columns in certificates:', Object.keys(data[0]));
        }

        // Cleanup
        await supabase.from('certificates').delete().eq('mst', 'TEST_CERT_COLS');
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSchema();
