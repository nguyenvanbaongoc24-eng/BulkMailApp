const { adminClient: supabase } = require('./services/supabaseClient');
require('dotenv').config();

async function checkColumns() {
    const { data: cols, error } = await supabase.rpc('get_table_columns_info', { t_name: 'customers' });
    if (error) {
        // Fallback: try querying information_schema
        const { data: schemaCols, error: schemaError } = await supabase.from('customers').select().limit(1);
        if (schemaError) console.error(schemaError);
        else console.log('Columns found:', Object.keys(schemaCols[0] || {}));
    } else {
        console.log(cols);
    }
}
checkColumns();
