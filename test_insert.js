require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testInsert() {
    console.log('--- TESTING INSERT ---');
    const { data, error } = await supabase.from('customers').insert([
        { mst: 'TEST_MST', company_name: 'TEST_COMPANY', pdf_url: 'https://test.com/pdf' }
    ]).select();

    if (error) {
        console.error('❌ INSERT FAILED:', error.message);
        console.error('Error details:', error);
    } else {
        console.log('✅ INSERT SUCCESS:', data);
    }
}

testInsert();
