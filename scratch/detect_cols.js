require('dotenv').config();
const { adminClient: supabase } = require('../services/supabaseClient');

async function checkData() {
    const { data, error } = await supabase.from('customers').select('*').limit(1);
    if (error) {
        console.error('❌ Error fetching customer sample:', error.message);
    } else if (data && data.length > 0) {
        console.log('✅ Found customer row. Fields exist in DB:');
        console.log(Object.keys(data[0]));
    } else {
        console.log('⚠️ Customers table is empty, cannot detect columns via sample.');
    }
}
checkData();
