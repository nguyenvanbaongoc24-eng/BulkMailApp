const { createClient } = require('@supabase/supabase-js');
const seoService = require('../services/seoService');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runManualCrawl() {
    console.log('--- MANUAL CRAWL TEST ---');
    try {
        await seoService.crawlTaxNews(supabase);
        console.log('Manual crawl finished.');
        
        // Verify results
        const { data, count } = await supabase
            .from('tax_news')
            .select('title, source, publish_date', { count: 'exact' })
            .order('publish_date', { ascending: false })
            .limit(10);
            
        console.log(`\nNew total entries: ${count}`);
        if (data) {
            console.log('Latest 10 entries:');
            data.forEach((n, i) => {
                console.log(`${i+1}. [${n.source}] ${n.title} (${n.publish_date})`);
            });
        }
    } catch (e) {
        console.error('Crawl failed:', e.message);
    }
}

runManualCrawl();
