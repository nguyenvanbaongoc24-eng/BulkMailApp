// =============================================
// pdfPipeline.js — Sequential Pipeline Orchestrator
// Crawl → Upload → DB Update with retry logic
// =============================================
const crawler = require('./crawler');
const supabaseUpload = require('./supabaseUpload');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds between retries

// =============================================
// LOGGING
// =============================================
function log(mst, step, status, detail = '') {
    const ts = new Date().toISOString().substring(11, 19);
    const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : status === 'INFO' ? 'ℹ️' : '🔄';
    console.log(`[${ts}] [Pipeline] [${mst}] ${icon} ${step}${detail ? ': ' + detail : ''}`);
}

// =============================================
// PROCESS A SINGLE RECORD
// Returns: { success: boolean, publicUrl?: string, error?: string }
// =============================================
async function processSingleRecord(browser, record, onStatus) {
    const { MST, Serial, companyName, email, diaChi, Phone } = record;
    const mst = String(MST).trim();
    const serial = String(Serial || '').trim();

    const sendStatus = (msg) => {
        log(mst, msg, 'INFO');
        if (typeof onStatus === 'function') onStatus(msg);
    };

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                sendStatus(`🔁 RETRYING (${attempt}/${MAX_RETRIES})...`);
                log(mst, 'RETRY', 'INFO', `Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }

            console.log(`\n${'='.repeat(60)}`);
            log(mst, 'PIPELINE START', 'OK', `Attempt ${attempt}/${MAX_RETRIES} — ${companyName || mst}`);

            // ============================================
            // STEP 1: CRAWL — Download PDF from CA website
            // ============================================
            sendStatus('🔍 SEARCHING');

            const crawlResult = await crawler.crawlCertificate(browser, mst, serial, onStatus);

            if (!crawlResult.success) {
                throw new Error(crawlResult.error || 'Crawl failed — no result');
            }

            if (!crawlResult.buffer || crawlResult.buffer.length < 100) {
                throw new Error(`PDF buffer invalid (${crawlResult.buffer ? crawlResult.buffer.length : 0} bytes)`);
            }

            log(mst, 'CRAWL', 'OK', `${crawlResult.fileName} (${(crawlResult.fileSize / 1024).toFixed(1)} KB)`);

            // ============================================
            // STEP 2: UPLOAD — Send PDF to Supabase Storage
            // ============================================
            sendStatus('📤 UPLOADING');

            const publicUrl = await supabaseUpload.uploadPdf(mst, serial, crawlResult.buffer);
            log(mst, 'UPLOAD', 'OK', publicUrl);

            // ============================================
            // STEP 3: DATABASE — Update certificates table
            //         pdf_url is set IMMEDIATELY after upload
            // ============================================
            sendStatus('💾 Updating database...');

            await supabaseUpload.updateDatabase(mst, serial, publicUrl);

            // Also sync customers table (non-critical, won't block pipeline)
            await supabaseUpload.updateCustomerRecord(mst, publicUrl, companyName, email, Phone, diaChi);

            // ============================================
            // ALL 3 STEPS PASSED → SUCCESS
            // ============================================
            sendStatus('✅ SUCCESS');
            log(mst, 'PIPELINE COMPLETE', 'OK', publicUrl);
            console.log(`${'='.repeat(60)}\n`);

            return { success: true, publicUrl };

        } catch (err) {
            lastError = err;
            log(mst, `ATTEMPT ${attempt}/${MAX_RETRIES}`, 'FAIL', err.message);

            // Don't retry for definitive "not found" errors — waste of time
            if (err.message.includes('Không tìm thấy chứng thư') ||
                err.message.includes('không tìm thấy') ||
                err.message.includes('No certificates found')) {
                log(mst, 'SKIP RETRY', 'INFO', 'Certificate confirmed not found, no point retrying');
                break;
            }
        }
    }

    // ============================================
    // ALL RETRIES EXHAUSTED → MARK AS NOT FOUND
    // Pipeline continues to next record
    // ============================================
    log(mst, 'PIPELINE', 'FAIL', `All attempts failed: ${lastError.message}`);
    sendStatus(`❌ FAILED: ${lastError.message}`);

    // Mark not_found in DB so email system knows to send without attachment
    await supabaseUpload.markNotFound(mst, serial);

    console.log(`${'='.repeat(60)}\n`);
    return { success: false, error: lastError.message };
}

module.exports = { processSingleRecord };
