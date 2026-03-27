require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function debugPdf() {
    console.log('--- DEBUGGING PDF STATUS ---');
    const mst = '0101935049'; // From user's screenshot
    try {
        const { data: customer, error: custErr } = await supabase.from('customers').select('*').eq('mst', mst).single();
        console.log('Customer Record:', customer || 'NOT FOUND');
        if (custErr) console.error('Customer Error:', custErr.message);

        const { data: cert, error: certErr } = await supabase.from('certificates').select('*').eq('mst', mst).single();
        console.log('Certificate Record:', cert || 'NOT FOUND');
        if (certErr) console.error('Certificate Error:', certErr.message);

        const pdfUrl = (customer && customer.pdf_url) || (cert && cert.pdf_url);
        if (pdfUrl) {
            console.log('PDF URL found:', pdfUrl);
            // Check if it's accessible (axios HEAD request)
            const axios = require('axios');
            try {
                const head = await axios.head(pdfUrl);
                console.log('PDF Accessibility: SUCCESS (Status: ' + head.status + ')');
                console.log('Content-Type:', head.headers['content-type']);
            } catch (headErr) {
                console.error('PDF Accessibility: FAILED (' + headErr.message + ')');
            }
        } else {
            console.log('NO PDF URL FOUND for MST ' + mst);
        }

        // Check recent logs
        const { data: logs } = await supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(5);
        logs.forEach(l => {
            console.log(`Log ID: ${l.id} | MST: ${l.mst} | Status: ${l.status} | PDF Attached: ${l.pdf_attached} | Error: ${l.error_message}`);
        });

    } catch (e) {
        console.error('Fatal debug error:', e.message);
    }
}

debugPdf();
