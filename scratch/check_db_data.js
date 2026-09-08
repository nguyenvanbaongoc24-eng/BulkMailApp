require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    const { data: quotes } = await supabase.from('quotations').select('*').limit(10);
    console.log('--- QUOTATIONS ---', quotes?.length, 'rows');
    if (quotes && quotes.length) console.log(JSON.stringify(quotes, null, 2));

    const { data: custs } = await supabase.from('customers').select('*').limit(10);
    console.log('--- CUSTOMERS (CRM) ---', custs?.length, 'rows');
    if (custs && custs.length) console.log(JSON.stringify(custs, null, 2));
}

checkData();
