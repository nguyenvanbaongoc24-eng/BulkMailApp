require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('--- FETCHING COLUMNS VIA INSERT ---');
    try {
        const { data, error } = await supabase.from('customers').insert({ mst: 'TEST_COLS_FETCH' }).select();
        if (error) {
            console.error('Insert error:', error.message);
        } else if (data && data.length > 0) {
            console.log('SUCCESS! Available columns:', Object.keys(data[0]));
            console.log('Draft data:', data[0]);
        } else {
            console.log('Insert succeeded but no data returned.');
        }

        // Cleanup
        await supabase.from('customers').delete().eq('mst', 'TEST_COLS_FETCH');
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkSchema();
