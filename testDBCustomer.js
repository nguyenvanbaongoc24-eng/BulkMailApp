const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCustomer(mst) {
    const { data, error } = await supabase.from('customers').select('*').eq('mst', mst).single();
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Customer Data:', data);
        console.log('PDF URL:', data?.pdf_url);
    }
}

// User's test customer MST might be 0000000000 or from the recent error log 0400459020
checkCustomer('0400459020').then(() => {
    checkCustomer('0101438910').then(() => {
        checkCustomer('0302820352');
    });
});
