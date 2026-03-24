require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function countCustomers() {
    const { count, error } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    if (error) {
        console.error('Error counting customers:', error.message);
    } else {
        console.log('Total customers in table:', count);
    }
}

countCustomers();
