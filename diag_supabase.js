const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function diagnose() {
    console.log('--- Supabase Diagnostic ---');
    console.log('URL:', SUPABASE_URL);
    
    // 1. Test Fetch
    console.log('1. Testing connectivity (fetching certificates)...');
    const { data: fetchCert, error: fetchCertError } = await supabase.from('certificates').select('*').limit(1);
    if (fetchCertError) {
        console.error('❌ Fetch Cert Error:', fetchCertError.message);
    } else {
        console.log('✅ Fetch Cert Success');
    }

    // 2. Test manual UPSERT logic (resilient to missing constraints)
    const testMst = 'TEST_001';
    console.log(`2. Testing manual upsert for MST: ${testMst}...`);
    
    try {
        const { data: existing } = await supabase.from('certificates').select('id').eq('mst', testMst).maybeSingle();
        
        if (existing) {
            console.log('   Record exists, updating...');
            const { error: updateError } = await supabase.from('certificates').update({ 
                company_name: 'Test Company Updated',
                created_at: new Date().toISOString()
            }).eq('mst', testMst);
            if (updateError) throw updateError;
        } else {
            console.log('   Record new, inserting...');
            const { error: insertError } = await supabase.from('certificates').insert({
                mst: testMst,
                company_name: 'Test Company New',
                created_at: new Date().toISOString()
            });
            if (insertError) throw insertError;
        }
        console.log('✅ Manual Upsert Logic Working');
    } catch (err) {
        console.error('❌ Upsert Logic Failed:', err.message);
        if (err.message.includes('row-level security')) {
            console.log('👉 RECOMMENDATION: Disable RLS for certificates and customers tables on Supabase dashboard.');
        }
    }

    // 3. Test Storage
    console.log('3. Testing Storage access...');
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('pdfs');
    if (bucketError) {
        console.error('❌ Bucket Access Error:', bucketError.message);
    } else {
        console.log('✅ Bucket "pdfs" is accessible');
    }
}

diagnose();
