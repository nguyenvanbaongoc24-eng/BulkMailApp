const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  try {
    const { data: c, error } = await supabase.from('campaigns').select('id, status, recipients').order('createdAt', { ascending: false }).limit(2);
    if (error) console.error('Query Error:', error);
    if (!c || c.length === 0) {
      console.log('No campaigns found.');
      process.exit(0);
    }
    
    console.log('Campaign 1 Status:', c[0].status);
    console.log('Campaign 1 Recipients:', c[0].recipients.map(r => r.status));
    
    console.log('Campaign 2 Status:', c[1]?.status);
    console.log('Campaign 2 Recipients:', c[1]?.recipients?.map(r => r.status));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
