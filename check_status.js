require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkStatus() {
    console.log('--- CAMPAIGNS ---');
    const { data: campaigns } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(5);
    campaigns?.forEach(c => console.log(`${c.id}: ${c.name} | Status: ${c.status} | Total: ${c.total_emails}`));

    console.log('\n--- RECENT TASKS ---');
    const { data: tasks } = await supabase.from('email_logs')
        .select('id, campaign_id, email, status, error_details')
        .order('created_at', { ascending: false })
        .limit(10);
    tasks?.forEach(t => console.log(`[${t.campaign_id}] ${t.email}: ${t.status} | Err: ${t.error_details || 'none'}`));

    console.log('\n--- PROCESSING TASKS ---');
    const { data: processing } = await supabase.from('email_logs')
        .select('id, campaign_id, email')
        .eq('status', 'processing');
    console.log(`Currently processing: ${processing?.length || 0}`);
    processing?.forEach(p => console.log(`- ${p.id} (${p.email})`));
}

checkStatus();
