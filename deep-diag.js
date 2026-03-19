const scraperService = require('./services/scraperService');
const emailService = require('./services/emailService');
const supabase = require('./services/supabaseClient');

async function debugFinal() {
    const mst = '3603376551';
    console.log(`[Diagnostic] STARTING DEEP SCAN FOR MST: ${mst}`);
    const browser = await scraperService.initBrowser();
    try {
        const { data: customer } = await supabase.from('customers').select('*').eq('taxCode', mst).single();
        const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', '1773807479349').single(); // Reuse latest campaign metadata

        if (!customer || !campaign) {
            console.error('[Diagnostic] Missing customer or campaign metadata.');
            return;
        }

        console.log(`[Diagnostic] Using target serial: ${customer.Serial}`);
        
        const result = await scraperService.getLatestCertificate(browser, mst, customer.Serial, customer);
        
        console.log('--- SCRAPER RESULT ---');
        console.log(JSON.stringify(result, null, 2));

        if (result.status === 'Matched') {
            console.log(`[Diagnostic] ✅ MATCH SUCCESSFUL! File found at: ${result.filePath}`);
            console.log(`[Diagnostic] Next step would be upload and attach.`);
        } else {
            console.log(`[Diagnostic] ❌ MATCH FAILED: ${result.message}`);
        }
    } catch (err) {
        console.error('[Diagnostic] CRITICAL ERROR:', err);
    } finally {
        await browser.close();
        process.exit(0);
    }
}

debugFinal();
