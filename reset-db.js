require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    console.log("Resetting all non-sent logs to pending...");
    const { data: logs, error: logsError } = await supabase.from('email_logs')
        .update({ status: 'pending', retry_count: 0, last_retry_time: null, error_message: null })
        .neq('status', 'sent')
        .select('id, email, status');
    
    console.log(`Reset ${logs?.length || 0} logs.`);
    if (logsError) console.error(logsError);
}

run();
