const { adminClient: supabase } = require('./services/supabaseClient');
require('dotenv').config();

async function checkData() {
    const { data, error } = await supabase.from('customers').select('service_type').limit(20);
    if (error) console.error(error);
    else console.log(data);
}
checkData();
