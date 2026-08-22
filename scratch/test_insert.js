require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    // get a valid user_id
    const { data: users } = await supabase.from('customers').select('user_id').limit(1);
    if (!users || users.length === 0) {
        console.log("No valid users found");
        return;
    }
    const validUuid = users[0].user_id;
    
    const data = {
        user_id: validUuid,
        mst: 'TEST_MST_123',
        company_name: 'TEST COMPANY',
        service_type: 'TEST_SERVICE'
    };
    
    // Insert first
    await supabase.from('customers').insert(data);
    
    // Insert second
    const { error } = await supabase.from('customers').insert(data);
    console.log(error);
    
    // Cleanup
    await supabase.from('customers').delete().eq('mst', 'TEST_MST_123');
}

test();
