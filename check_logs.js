require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkKilledCampaign() {
    const { data: camps } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(3);
    console.log('--- RECENT CAMPAIGNS ---');
    camps.forEach(c => console.log(`ID: ${c.id} | Name: ${c.name} | Status: ${c.status} | Progress: ${c.success_count}/${c.total_count || '?'}`));
    
    if (camps.length > 0) {
        const target = camps[0];
        console.log(`\n--- LOGS FOR ${target.id} ---`);
        const { data: logs } = await supabase.from('email_logs').select('id,status,error_message,customer_id').eq('campaign_id', target.id);
        logs.forEach(l => console.log(`ID: ${l.id} | MST: ${l.customer_id} | Status: ${l.status}`));
    }
}

checkKilledCampaign();
