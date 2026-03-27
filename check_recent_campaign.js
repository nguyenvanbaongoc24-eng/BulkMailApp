require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkRecentCampaign() {
    console.log('--- CHECKING RECENT CAMPAIGN ---');
    try {
        const { data: camps } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(1);
        if (camps?.[0]) {
            const camp = camps[0];
            console.log(`Campaign ID: ${camp.id} | Name: ${camp.name} | Created: ${camp.created_at}`);
            
            const { data: logs } = await supabase.from('email_logs').select('*').eq('campaign_id', camp.id).limit(20);
            console.log(`Logs for this campaign (${logs?.length || 0}):`);
            logs?.forEach(l => {
                console.log(`- MST: [${l.mst}] | Email: ${l.email} | Status: ${l.status} | PDF Attached: ${l.pdf_attached} | Error: ${l.error_message}`);
            });
        } else {
            console.log('No recent campaigns found.');
        }

    } catch (e) {
        console.error('Fatal error:', e.message);
    }
}

checkRecentCampaign();
