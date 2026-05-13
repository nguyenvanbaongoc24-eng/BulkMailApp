const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTaxNews() {
    console.log('--- TAX NEWS STATUS CHECK ---');
    const { data, error } = await supabase
        .from('tax_news')
        .select('title, source, publish_date')
        .order('publish_date', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching tax news:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No tax news found in database.');
    } else {
        console.log('Latest 5 news entries:');
        data.forEach(n => {
            console.log(`- [${n.publish_date}] ${n.source}: ${n.title}`);
        });
    }

    // Check count
    const { count } = await supabase.from('tax_news').select('*', { count: 'exact', head: true });
    console.log(`Total tax news entries: ${count}`);

    // Check when the last one was added
    if (data.length > 0) {
        const lastDate = new Date(data[0].publish_date);
        const now = new Date();
        const diffHours = (now - lastDate) / (1000 * 60 * 60);
        console.log(`Last update was ${diffHours.toFixed(2)} hours ago.`);
    }
}

checkTaxNews();
