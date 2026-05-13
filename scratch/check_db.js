const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log('Checking customers table...');
    const { data, error } = await supabase.from('customers').select('*').limit(1);
    if (error) {
        console.error('Error fetching customers:', error);
    } else {
        console.log('Sample customer record:', JSON.stringify(data[0], null, 2));
    }
}

checkSchema();
