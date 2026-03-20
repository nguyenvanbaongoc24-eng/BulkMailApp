const { adminClient: supabase } = require('./services/supabaseClient');

async function checkCampaigns() {
    try {
        console.log("Listing campaigns...");
        const { data, error } = await supabase.from('campaigns').select('id, name, status, total_recipients, user_id').limit(10);
        if (error) {
            console.error("Error campaigns:", error.message);
        } else {
            console.log("Campaigns found:", data.length);
            data.forEach(c => {
                console.log(`- [${c.id}] ${c.name} | Status: ${c.status} | Total: ${c.total_recipients} | User: ${c.user_id}`);
            });
            
            if (data.length > 0) {
                const campaignId = data[0].id;
                console.log(`\nChecking logs for campaign: ${campaignId}`);
                const { count, error: lError } = await supabase.from('email_logs').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId);
                console.log(`Logs for this campaign: ${count} (Error: ${lError?.message || 'none'})`);
                
                // Inspect ONE recipient from the campaign record
                const { data: cFull } = await supabase.from('campaigns').select('recipients').eq('id', campaignId).single();
                if (cFull && cFull.recipients && cFull.recipients.length > 0) {
                    console.log("Sample recipient from JSONB:", cFull.recipients[0]);
                }
            }
        }
    } catch (err) {
        console.error("Critical error:", err.message);
    }
}

checkCampaigns();
