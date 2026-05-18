const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function checkDuplicates() {
    console.log('Querying for duplicate MSTs in the customers table...');
    const { data, error } = await supabase.from('customers').select('mst, service_type');
    if (error) {
        console.error('Error fetching customers:', error);
        return;
    }

    const mstCounts = {};
    data.forEach(c => {
        if (!c.mst) return;
        mstCounts[c.mst] = (mstCounts[c.mst] || 0) + 1;
    });

    const duplicates = Object.entries(mstCounts).filter(([mst, count]) => count > 1);
    console.log(`Found ${duplicates.length} duplicate MSTs in the database.`);
    if (duplicates.length > 0) {
        console.log('Sample duplicates:', duplicates.slice(0, 5));
    }
}

checkDuplicates();
