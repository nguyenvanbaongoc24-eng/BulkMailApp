require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAllQuotes() {
    const { data: quotes, error } = await supabase.from('quotations').select('id, customer_name, total, price, created_at, items');
    console.log('Total quotes in DB:', quotes?.length);
    console.log(quotes);
}

checkAllQuotes();
