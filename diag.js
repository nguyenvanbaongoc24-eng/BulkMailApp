const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://bqsksnxazkhaqqcxqbtl.supabase.co';
const supabaseKey = 'sb_publishable_ywBp6Y6tSP_usD_THCB-NQ_mbZbX6Vz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- ERROR LOG INSPECTION ---');
    const { data: failedLogs, error } = await supabase
        .from('email_logs')
        .select('id, email, status, retry_count, error_message, last_retry_time')
        .eq('status', 'failed')
        .order('last_retry_time', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching failed logs:', error.message);
        return;
    }

    if (failedLogs.length === 0) {
        console.log('No failed logs found.');
    } else {
        failedLogs.forEach((log, i) => {
            console.log(`[${i+1}] Email: ${log.email}`);
            console.log(`    Status: ${log.status} (Retry: ${log.retry_count})`);
            console.log(`    Error: ${log.error_message}`);
            console.log(`    Last Time: ${log.last_retry_time}`);
            console.log('-----------------------------');
        });
    }
}

check();
