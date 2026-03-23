const { google } = require('googleapis');
const axios = require('axios');
const { adminClient: supabase } = require('./supabaseClient');
require('dotenv').config();

// -----------------------------------
// HEARTBEAT: Track worker activity
// -----------------------------------
const heartbeat = { time: null, task: null, step: null, error: null };
function getHeartbeat() { return heartbeat; }
function setHeartbeat(step, taskId = null, error = null) {
    heartbeat.time = new Date().toISOString();
    heartbeat.step = step;
    if (taskId) heartbeat.task = taskId;
    if (error) heartbeat.error = error;
}

// -----------------------------------
// SENDER HELPER: Ensure valid OAuth2 credentials
// -----------------------------------
function normalizeSender(raw) {
    if (!raw) return null;
    return {
        smtpHost: raw.smtpHost || raw.smtp_host || raw.smtphost || null,
        smtpUser: raw.smtpUser || raw.smtp_user || raw.smtpuser || null,
        smtpPassword: raw.smtpPassword || raw.smtp_password || raw.smtppassword || null,
        senderName: raw.senderName || raw.sender_name || raw.sendername || 'Automation CA2',
        senderEmail: raw.senderEmail || raw.sender_email || raw.senderemail || null,
    };
}

// -----------------------------------
// TEMPLATE TAG PARSER
// -----------------------------------
function parseTemplateAndCheckTags(template, data, isAttachMode) {
    if (!template) return { html: '', missingTags: [] };

    let parsedHTML = template
        .replace(/#TênCôngTy/g, data.company_name || '')
        .replace(/#MST/g, data.mst || '')
        .replace(/#ĐịaChỉ/g, data.address || '')
        .replace(/#NgàyHếtHạn/g, data.expired_date || '');

    const unmatched = parsedHTML.match(/#[A-Za-zÀ-ỹ0-9_]+/g);
    let missingTags = [];
    if (unmatched && unmatched.length > 0) {
        missingTags = unmatched.filter(tag => tag.length > 4 && !(/^#[0-9A-Fa-f]{3,6}$/.test(tag)));
        if (missingTags.length > 0) {
            console.warn(`[TEMPLATE] ⚠ UNPARSED TAGS: ${missingTags.join(', ')}`);
            if (isAttachMode) {
                throw new Error(`Template còn tag chưa thay thế: ${missingTags.join(', ')}`);
            }
        }
    }
    return { html: parsedHTML, missingTags };
}

// -----------------------------------
// GMAIL API: BUILD MIME & SEND
// -----------------------------------
const makeBase64Url = (str) => {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const buildMimeMessage = async (from, to, subject, htmlBody, pdfUrl, isAttachMode) => {
    const boundary = `====boundary_${Date.now()}====`;
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    
    let message = `To: ${to}\r\n`;
    message += `From: ${from}\r\n`;
    message += `Subject: ${encodedSubject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Part 1: HTML Body
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    message += `${htmlBody}\r\n\r\n`;
    
    // Part 2: PDF Attachment (if any)
    if (isAttachMode) {
        if (!pdfUrl) {
            throw new Error('attachCertificate=TRUE nhưng không có PDF URL. Không gửi.');
        }
        try {
            console.log(`[MIME] Fetching PDF from: ${pdfUrl}`);
            const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
            const pdfBase64 = Buffer.from(response.data).toString('base64');
            const filename = `ChungNhan_${(subject || 'CA2').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            
            message += `--${boundary}\r\n`;
            message += `Content-Type: application/pdf; name="${filename}"\r\n`;
            message += `Content-Disposition: attachment; filename="${filename}"\r\n`;
            message += `Content-Transfer-Encoding: base64\r\n\r\n`;
            
            // Gmail API requires word-wrapping the base64 attachment roughly every 76 chars
            const wrappedBase64 = pdfBase64.match(/.{1,76}/g).join('\r\n');
            message += `${wrappedBase64}\r\n\r\n`;
            console.log(`[MIME] 📎 ATTACHED PDF successfully: ${filename}`);
        } catch (err) {
            console.error('[MIME] Lỗi tải File PDF:', err.message);
            throw new Error('Lỗi khi tải hoặc đính kèm PDF: ' + err.message);
        }
    }
    
    message += `--${boundary}--`;
    return makeBase64Url(message);
};

async function sendGmailAPI({ rawSender, to, subject, html, pdf_url, isAttachMode }) {
    const sender = normalizeSender(rawSender);
    console.log(`\n[SEND] FROM: ${sender.senderEmail}`);
    console.log(`[SEND] TO: ${to}`);
    console.log(`[SEND] SUBJECT: ${subject}`);
    
    // The refresh_token is stored in smtpPassword for OAuth2 accounts
    const refreshToken = sender.smtpPassword;
    if (!refreshToken) throw new Error('Không tìm thấy Refresh Token (smtpPassword trống).');

    // 1. Initialize OAuth2 Client
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Ensure token is valid / refreshed
    let accessToken;
    try {
        const { token } = await oauth2Client.getAccessToken(); // Auto-refreshes if needed
        accessToken = token;
        if (!accessToken) throw new Error('Cannot get access token from refresh token');
        console.log(`[SEND] 🔑 Token refreshed OK. Token starts with: ${accessToken.substring(0, 10)}...`);
    } catch (tokenErr) {
        console.error(`[SEND] ❌ Auth Error:`, tokenErr.response?.data || tokenErr.message);
        throw new Error('Lỗi làm mới Token (invalid_grant hoặc token expired). Vui lòng kết nối lại tài khoản Gmail.');
    }

    // 2. Build MIME
    const fromString = `"${sender.senderName}" <${sender.senderEmail}>`;
    const mimeEncodedMessage = await buildMimeMessage(fromString, to, subject, html, pdf_url, isAttachMode);

    // 3. Send using Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    try {
        console.log(`[SEND] Calling gmail.users.messages.send...`);
        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: mimeEncodedMessage }
        });
        
        console.log(`[SEND] ✅ SUCCESS! messageId: ${res.data.id}`);
        return { messageId: res.data.id, response: 'Sent via Gmail API' };
    } catch (gErr) {
        const errorDetails = gErr.response?.data || gErr.message;
        console.error(`[SEND] ❌ GMAIL API ERROR:`, errorDetails);
        throw new Error(`Gmail API failure: ${JSON.stringify(errorDetails)}`);
    }
}

// ===========================================
// 4. WORKER FLOW — DIRECT QUERIES (NO RPCs!)
// ===========================================
const WORKER_INTERVAL = 10000;
let isWorkerRunning = false;

// --- DIRECT DB HELPERS (Replace all RPCs) ---

async function dbPickTasks(batchSize) {
    // Try RPC first (if it exists), fallback to direct query
    try {
        const { data, error } = await supabase.rpc('pick_email_tasks', { batch_size: batchSize });
        if (!error && data) return data;
    } catch (e) {
        console.log(`[DB] pick_email_tasks RPC not available, using direct query`);
    }

    // Fallback: direct query
    const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);

    if (error) throw error;

    // Mark them as processing
    if (data && data.length > 0) {
        const ids = data.map(d => d.id);
        await supabase
            .from('email_logs')
            .update({ status: 'processing', last_retry_time: new Date().toISOString() })
            .in('id', ids);
    }
    return data || [];
}

async function dbUpdateEmailLog(logId, status, messageId, errorMessage) {
    const updates = {
        status,
        error_message: errorMessage || null,
        message_id: messageId || null,
        sent_time: new Date().toISOString()
    };
    console.log(`[DB] Updating log ${logId}: status=${status}`);
    const { error } = await supabase.from('email_logs').update(updates).eq('id', logId);
    if (error) console.error(`[DB] ⚠ Failed to update log ${logId}:`, error.message);
}

async function dbGetCampaign(campaignId) {
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
    if (error) throw new Error(`Campaign ${campaignId} not found: ${error.message}`);
    return data;
}

async function dbGetSender(senderId) {
    const { data, error } = await supabase.from('senders').select('*').eq('id', senderId).single();
    if (error) throw new Error(`Sender ${senderId} not found: ${error.message}`);
    return data;
}

async function dbGetCustomer(mst) {
    if (!mst) return {};
    const { data } = await supabase.from('customers').select('*').eq('mst', mst).limit(1);
    return (data && data[0]) || {};
}

async function dbIncrementSuccess(campaignId) {
    // Use direct SQL increment via RPC if available, otherwise manual
    try {
        const { error } = await supabase.rpc('increment_campaign_success', { campaign_id: campaignId });
        if (!error) return;
    } catch (e) {}

    // Fallback: read-modify-write
    const { data: c } = await supabase.from('campaigns').select('success_count, sent_count').eq('id', campaignId).single();
    if (c) {
        await supabase.from('campaigns').update({
            success_count: (c.success_count || 0) + 1,
            sent_count: (c.sent_count || 0) + 1
        }).eq('id', campaignId);
    }
}

async function dbIncrementError(campaignId) {
    try {
        const { error } = await supabase.rpc('increment_campaign_error', { campaign_id: campaignId });
        if (!error) return;
    } catch (e) {}

    const { data: c } = await supabase.from('campaigns').select('error_count, sent_count').eq('id', campaignId).single();
    if (c) {
        await supabase.from('campaigns').update({
            error_count: (c.error_count || 0) + 1,
            sent_count: (c.sent_count || 0) + 1
        }).eq('id', campaignId);
    }
}

async function dbCheckCompletion(campaignId) {
    try {
        const { count } = await supabase
            .from('email_logs')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .in('status', ['pending', 'processing']);

        console.log(`[COMPLETION] Remaining pending/processing for ${campaignId}: ${count}`);

        if (count === 0) {
            const campaign = await dbGetCampaign(campaignId);
            const total = (campaign?.recipients || []).length || campaign?.total_recipients || 0;
            const errCount = campaign?.error_count || 0;
            const finalStatus = errCount > 0 ? `Hoàn thành (Lỗi ${errCount}/${total})` : 'Hoàn thành';
            await supabase.from('campaigns').update({ status: finalStatus }).eq('id', campaignId);
            console.log(`[COMPLETION] ✅ Campaign ${campaignId}: ${finalStatus}`);
        }
    } catch (e) {
        console.error(`[COMPLETION] ⚠ Error: ${e.message}`);
    }
}

async function dbRecoverStuck() {
    // Try RPC first
    try {
        const { error } = await supabase.rpc('recover_failed_tasks');
        if (!error) return;
    } catch (e) {}

    // Fallback: direct update - recover tasks stuck in 'processing' for >5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
        .from('email_logs')
        .update({
            status: 'pending',
            error_message: 'Auto-recovered from stuck processing state'
        })
        .eq('status', 'processing')
        .lt('last_retry_time', fiveMinAgo);
}

// --- MAIN WORKER ---

async function processEmailTask(log) {
    setHeartbeat('START processEmailTask', log.id);
    console.log(`\n\n▶▶▶ PROCESSING: ${log.id} | email: ${log.email} | MST: ${log.customer_id} ▶▶▶`);

    try {
        // Mark as processing
        await dbUpdateEmailLog(log.id, 'processing', null, null);

        // Get Campaign
        setHeartbeat('Getting campaign', log.id);
        const campaign = await dbGetCampaign(log.campaign_id);
        console.log(`[TASK] Campaign: "${campaign.name}", sender: ${campaign.sender_account_id}`);

        // Get Customer
        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r =>
            String(r.MST || r.taxCode || '').trim() === cleanMST
        );
        const customer = await dbGetCustomer(cleanMST);
        console.log(`[TASK] Excel match: ${recipientInExcel ? 'YES' : 'NO'}, DB pdf: ${customer.pdf_url || 'NONE'}`);

        // Get Sender
        setHeartbeat('Getting sender', log.id);
        const senderId = campaign.sender_account_id || campaign.senderAccountId;
        const senderRaw = await dbGetSender(senderId);

        // Attach mode
        const attachCertificate = campaign.attach_cert === true || campaign.attach_cert === 'true';
        console.log(`[TASK] attachCertificate: ${attachCertificate}`);

        // Parse Template
        const dataForTags = {
            company_name: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || customer.company_name || 'Quý khách',
            mst: recipientInExcel?.MST || recipientInExcel?.taxCode || customer.mst || cleanMST,
            address: recipientInExcel?.DiaChi || recipientInExcel?.['Địa chỉ'] || customer.dia_chi || '',
            expired_date: recipientInExcel?.NgayHetHanChuKySo || recipientInExcel?.['Ngày hết hạn'] || customer.expired_date || ''
        };
        const parsedSubject = parseTemplateAndCheckTags(campaign.subject || 'Thông báo tự động', dataForTags, attachCertificate);
        const parsedBody = parseTemplateAndCheckTags(campaign.template || '', dataForTags, attachCertificate);

        // Send with retry (3 attempts)
        setHeartbeat('Sending', log.id);
        let successInfo = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[TASK] Send attempt ${attempt}/3...`);
                successInfo = await sendGmailAPI({
                    rawSender: senderRaw,
                    to: log.email,
                    subject: parsedSubject.html,
                    html: parsedBody.html,
                    pdf_url: customer.pdf_url,
                    isAttachMode: attachCertificate
                });
                break;
            } catch (e) {
                lastError = e;
                console.error(`[TASK] ❌ Attempt ${attempt}/3: ${e.message}`);
                if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!successInfo) throw lastError || new Error('All 3 attempts failed');

        // ✅ SUCCESS
        await dbUpdateEmailLog(log.id, 'success', successInfo.messageId, `OK: ${successInfo.response || 'Delivered'}`);
        await dbIncrementSuccess(log.campaign_id);
        await dbCheckCompletion(log.campaign_id);
        console.log(`[TASK] ✅✅✅ SENT to ${log.email} ✅✅✅\n`);

    } catch (err) {
        setHeartbeat('ERROR', log.id, err.message);
        console.error(`[TASK] ❌❌❌ FAILED for ${log.email}: ${err.message}`);

        try {
            await dbUpdateEmailLog(log.id, 'failed', null, `FAILED: ${err.message}`.substring(0, 500));
            await dbIncrementError(log.campaign_id);
            await dbCheckCompletion(log.campaign_id);
        } catch (dbErr) {
            console.error(`[TASK] ⚠ DB update after failure also failed: ${dbErr.message}`);
        }
    }
}

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    setHeartbeat('Polling');

    try {
        const tasks = await dbPickTasks(10);
        if (!tasks || tasks.length === 0) return;

        console.log(`\n🔄 WORKER: Found ${tasks.length} pending tasks`);
        for (const log of tasks) {
            await new Promise(r => setTimeout(r, 2000));
            await processEmailTask(log);
        }
    } catch (err) {
        console.error(`[WORKER] ❌ Error: ${err.message}`);
        setHeartbeat('Worker error', null, err.message);
    } finally {
        isWorkerRunning = false;
    }
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(() => dbRecoverStuck().catch(e => console.error('[RECOVER]', e.message)), 60000);

// -----------------------------------
// 5. TEST FLOW
// -----------------------------------
async function testEmailFlow(targetEmail, forcedSenderId = null, testCase = 1) {
    console.log(`\n=== E2E TEST: CASE ${testCase} to ${targetEmail} ===`);

    let sender;
    if (forcedSenderId) {
        const { data: s } = await supabase.from('senders').select('*').eq('id', forcedSenderId).limit(1);
        sender = s && s[0];
    }
    if (!sender) {
        const { data: senders } = await supabase.from('senders').select('*').order('created_at', { ascending: false }).limit(1);
        sender = senders && senders[0];
    }
    if (!sender) {
        sender = {
            smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
            smtpPort: process.env.SMTP_PORT || '587',
            smtpUser: process.env.SMTP_USER,
            smtpPassword: process.env.SMTP_PASS,
            senderName: 'ENV Fallback Test'
        };
    }

    const dataForTags = { company_name: 'CÔNG TY TEST CA2', mst: '0101010101', address: 'HN VN', expired_date: '31/12/2030' };
    let rawTemplate = `<p>Xin chào <b>#TênCôngTy</b> (MST: #MST).</p><p>Đây là email test từ Automation CA2.</p>`;
    let attachCertificate = false;
    let mockPdfUrl = null;

    if (testCase === 2) { attachCertificate = true; mockPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'; }
    if (testCase === 3) { attachCertificate = true; mockPdfUrl = null; }

    const parsedBody = parseTemplateAndCheckTags(rawTemplate, dataForTags, attachCertificate);
    const info = await sendGmailAPI({
        rawSender: sender,
        to: targetEmail,
        subject: `[TEST CA2] Case ${testCase} - ${new Date().toISOString()}`,
        html: parsedBody.html,
        pdf_url: mockPdfUrl,
        isAttachMode: attachCertificate
    });

    return { success: true, messageId: info.messageId, response: info.response, sent_via: sender.senderEmail, case: testCase };
}

module.exports = {
    startWorker,
    processEmailTask,
    testEmailFlow,
    sendGmailAPI,
    parseTemplateAndCheckTags,
    getHeartbeat
};
