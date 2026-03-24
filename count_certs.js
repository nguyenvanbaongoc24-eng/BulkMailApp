require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function countCerts() {
    const { count, error } = await supabase.from('certificates').select('*', { count: 'exact', head: true });
    if (error) {
        console.error('Error counting certs:', error.message);
    } else {
        console.log('Total certs in table:', count);
    }
}

countCerts();
