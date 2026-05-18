const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function testInsert() {
    console.log('Starting test insert of duplicate MST...');
    
    // 1. Get a valid user_id
    const { data: users, error: userErr } = await supabase.from('users').select('id').limit(1);
    if (userErr || !users.length) {
        console.error('Failed to get a user:', userErr);
        return;
    }
    const userId = users[0].id;
    const testMst = '9999999999';

    // 2. Insert first record
    console.log('Inserting first record...');
    const { data: ins1, error: err1 } = await supabase.from('customers').insert({
        user_id: userId,
        mst: testMst,
        company_name: 'Test Company 1',
        service_type: 'Chữ ký số',
        start_date: '2026-05-18'
    }).select();

    if (err1) {
        console.error('Error inserting first:', err1.message);
        return;
    }
    console.log('Inserted first record successfully. ID:', ins1[0].id);

    // 3. Insert second record with same MST but different service
    console.log('Inserting second record with same MST...');
    const { data: ins2, error: err2 } = await supabase.from('customers').insert({
        user_id: userId,
        mst: testMst,
        company_name: 'Test Company 1',
        service_type: 'Hóa đơn điện tử',
        start_date: '2026-05-18'
    }).select();

    if (err2) {
        console.log('❌ Insert second record failed:', err2.message);
    } else {
        console.log('✅ Insert second record SUCCEEDED! ID:', ins2[0].id);
    }

    // 4. Cleanup
    console.log('Cleaning up test records...');
    const { error: delErr } = await supabase.from('customers').delete().eq('mst', testMst);
    if (delErr) {
        console.error('Error during cleanup:', delErr.message);
    } else {
        console.log('Cleanup completed successfully.');
    }
}

testInsert();
