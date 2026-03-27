require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkLogs() {
    console.log('--- CHECKING ALL LOGS ---');
    try {
        const { data: logs, count } = await supabase.from('email_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(20);
        console.log(`Total Logs in DB: ${count}`);
        logs?.forEach(l => {
            console.log(`- MST: [${l.mst}] | Status: ${l.status} | PDF Attached: ${l.pdf_attached} | CampaignID: ${l.campaign_id}`);
        });
    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkLogs();
