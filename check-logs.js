require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    console.log("Checking email logs...");
    const { data, error } = await supabase.from('email_logs').select('id, campaign_id, status, retry_count, created_at').order('created_at', { ascending: false }).limit(5);
    console.log("Latest logs:", JSON.stringify(data, null, 2));
    if (error) console.error("Error:", error);

    console.log("Testing pick_email_tasks RPC...");
    const { data: rpcData, error: rpcError } = await supabase.rpc('pick_email_tasks', { batch_size: 5 });
    console.log("RPC returned:", rpcData ? rpcData.length : 0, "rows.");
    if (rpcData && rpcData.length > 0) console.log("RPC Data:", JSON.stringify(rpcData, null, 2));
    if (rpcError) console.error("RPC Error:", rpcError);
}

run();
