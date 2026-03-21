
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function diag() {
    try {
        const { data: campaigns, error: cErr } = await supabase
            .from('campaigns')
            .select('id, name, status, success_count, total_recipients, created_at')
            .order('created_at', { ascending: false })
            .limit(1);

        if (cErr) throw cErr;
        if (!campaigns || campaigns.length === 0) {
            console.log("No campaigns found.");
            return;
        }

        const c = campaigns[0];
        console.log(`\nLATEST CAMPAIGN: ${c.name} (${c.id})`);
        console.log(`Status: ${c.status} | Progress: ${c.success_count}/${c.total_recipients}`);

        const { data: logs, error: lErr } = await supabase
            .from('email_logs')
            .select('email, status, message_id, error_message, sent_time')
            .eq('campaign_id', c.id)
            .limit(5);

        if (lErr) throw lErr;
        
        console.log("\nRECENT LOGS for this campaign:");
        console.table(logs);

    } catch (e) {
        console.error("DIAG ERROR:", e.message);
    }
}

diag();
