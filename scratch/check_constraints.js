const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkConstraints() {
    console.log('Checking table constraints for customers...');
    
    // We can query pg_indexes or information_schema via a RPC or direct query if possible,
    // but since we only have normal query permissions, we can test inserting a duplicate MST with a different service.
    // Let's query information about the table constraints if we have access, or try a dry run.
    try {
        const { data, error } = await supabase.rpc('get_table_constraints', { table_name: 'customers' });
        if (error) {
            console.log('RPC check failed (might not exist):', error.message);
            // Alternative: let's query the supabase API or read setup_supabase.sql if we can find it
        } else {
            console.log('Constraints:', data);
        }
    } catch (e) {
        console.error(e);
    }
}

checkConstraints();
