const emailService = require('./services/emailService');

async function testCleanLookups() {
    console.log('--- TESTING CLEAN LOOKUPS ---');
    const testCases = [
        '0310 679 945',
        '0310679945 ',
        '  0310679945',
        '0310\t679\n945'
    ];

    for (const raw of testCases) {
        const customer = await emailService.dbGetCustomer(raw);
        console.log(`Input: [${raw}]`);
        console.log(`- DB Customer Found: ${customer ? 'YES (' + customer.mst + ')' : 'NO'}`);
        
        // Test internal certificates fallback if possible
        // (Note: we need to mock or just rely on the real DB if available)
        const { adminClient: supabase } = require('./services/supabaseClient');
        const cleaned = raw.replace(/\s/g, '').trim();
        const { data: cert } = await supabase.from('certificates').select('pdf_url').eq('mst', cleaned).limit(1);
        console.log(`- DB Certificate Found: ${cert?.[0] ? 'YES (' + cert[0].pdf_url.substring(0, 50) + '...)' : 'NO'}`);
    }
}

testCleanLookups();
