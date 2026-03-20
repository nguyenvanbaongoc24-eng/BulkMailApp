const { adminClient: supabase } = require('./services/supabaseClient');

async function testRPC() {
    console.log("Testing RPC 'pick_email_tasks'...");
    try {
        const { data, error } = await supabase.rpc('pick_email_tasks', { batch_size: 10 });
        if (error) {
            console.error("RPC Error:", error.message);
            if (error.hint) console.log("Hint:", error.hint);
        } else {
            console.log("RPC Success! Records returned:", data.length);
            if (data.length > 0) {
                console.log("Sample task ID:", data[0].id);
                console.log("Sample task status:", data[0].status);
            } else {
                console.log("No tasks picked (maybe no pending logs or RLS is still blocking).");
                
                // Let's check if we can see ANY logs at all
                const { count, error: cErr } = await supabase.from('email_logs').select('*', { count: 'exact', head: true });
                console.log(`Total logs visible to adminClient: ${count} (Error: ${cErr?.message || 'none'})`);
            }
        }
    } catch (err) {
        console.error("Critical error:", err.message);
    }
}

testRPC();
