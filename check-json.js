require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    const { data } = await supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(10);
    fs.writeFileSync('diag-logs.json', JSON.stringify(data, null, 2));

    const { data: cData } = await supabase.from('campaigns').select('*').order('createdAt', { ascending: false }).limit(3);
    fs.writeFileSync('diag-campaigns.json', JSON.stringify(cData, null, 2));
}

run();
