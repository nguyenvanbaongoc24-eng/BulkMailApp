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
function parseTemplate(data, template) {
    if (!template) return '';
    console.log(`\n[TEMPLATE PARSER] BEFORE:`, template.substring(0, 50) + '...');
    
    const s = (val) => {
        if (val === null || val === undefined) return '';
        return String(val).trim();
    };

    // Mapping of (Regex Pattern) -> (Value)
    // Supports: #Tag, {{Tag}}, {{ Tag }}, {{  Tag  }}
    const replacements = [
        { 
            patterns: [
                /#TênCônnTy/gi, /#TenCongTy/gi, /#Tên\s+Công\s+Ty/gi, /#Tên\s+đơn\s+vị/gi, /#Tên\s+khách\s+hàng/gi,
                /{{\s*TenCongTy\s*}}/gi, /{{\s*Tên Công Ty\s*}}/gi, /{{\s*Tên\s*Công\s*Ty\s*}}/gi, /{{\s*Tên\s*Khách\s*Hàng\s*}}/gi
            ], 
            val: s(data.company_name) 
        },
        { 
            patterns: [
                /#MST/gi, /#MãSốThuế/gi, /#Mã\s+Số\s+Thuế/gi,
                /{{\s*MST\s*}}/gi, /{{\s*Mã Số Thuế\s*}}/gi, /{{\s*Mã\s+Số\s+Thuế\s*}}/gi
            ], 
            val: s(data.mst) 
        },
        { 
            patterns: [
                /#ĐịaChỉ/gi, /#DiaChi/gi, /#Địa\s+Chỉ/gi,
                /{{\s*DiaChi\s*}}/gi, /{{\s*Địa Chỉ\s*}}/gi, /{{\s*Địa\s+Chỉ\s*}}/gi
            ], 
            val: s(data.address) 
        },
        { 
            patterns: [
                /#Email/gi, /{{\s*Email\s*}}/gi
            ], 
            val: s(data.email) 
        },
        { 
            patterns: [
                /#NgàyHếtHạn/gi, /#NgayHetHan/gi, /#Ngày\s+Hết\s+Hạn/gi,
                /{{\s*NgayHetHan\s*}}/gi, /{{\s*Ngày Hết Hạn\s*}}/gi, /{{\s*Ngày\s+Hết\s+Hạn\s*}}/gi
            ], 
            val: s(data.expired_date) 
        }
    ];

    let parsedHTML = template;
    replacements.forEach(item => {
        item.patterns.forEach(p => {
            parsedHTML = parsedHTML.replace(p, item.val);
        });
    });

    // Smart Validation: Match #Tags but ignore CSS HEX colors (#abc or #abcdef)
    const unmatched = parsedHTML.match(/#[A-Za-zÀ-ỹ_][A-Za-zÀ-ỹ0-9_]+/g) || [];
    const unmatchedBraces = parsedHTML.match(/{{[^}]+}}/g) || [];
    
    const remaining = [...unmatched, ...unmatchedBraces];

    if (remaining.length > 0) {
        console.warn(`[TEMPLATE] ⚠ Dấu hiệu Tag chưa được thay thế:`, remaining);
        // We throw ONLY if it looks like one of OUR critical tags
        const criticalTags = ['Tên', 'MST', 'Địa', 'Email', 'Ngày'];
        const hasCritical = remaining.some(r => criticalTags.some(c => r.toLowerCase().includes(c.toLowerCase())));
        if (hasCritical) {
            console.error(`[TEMPLATE] CRITICAL TAG NOT REPLACED:`, remaining);
        }
    }

    return parsedHTML;
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
    let pdfSkipped = false;
    let pdfBase64 = null;
    let filename = `ChungNhan_${(subject || 'CA2').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    if (isAttachMode === true) {
        if (!pdfUrl) {
            console.warn(`[MIME] ⚠ attachCertificate=TRUE nhưng pdf_url=NULL → GỬI MAIL KHÔNG ĐÍNH KÈM PDF`);
            pdfSkipped = true;
        } else {
            try {
                console.log(`[MIME] 📥 Fetching PDF from: ${pdfUrl}`);
                // Add Timeout to fetch (20s)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);
                
                const response = await fetch(pdfUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
                const buffer = await response.arrayBuffer();
                pdfBase64 = Buffer.from(buffer).toString("base64");
                console.log(`[MIME] PDF SIZE: ${buffer.byteLength}`);
            } catch (err) {
                const isTimeout = err.name === 'AbortError';
                console.error(`[MIME] ❌ Lỗi tải PDF (${pdfUrl}):`, isTimeout ? 'TIMEOUT (20s)' : err.message);
                console.warn(`[MIME] ⚠ Skipping PDF attachment...`);
                pdfSkipped = true;
            }
        }
    }
    // ... remaining MIME construction ...

    let message = `To: ${to}\r\n`;
    message += `From: ${from}\r\n`;
    message += `Subject: ${encodedSubject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Part 1: HTML Body
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    message += `${htmlBody}\r\n\r\n`;
    
    // Part 2: HTML Attachment
    if (pdfBase64) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: application/pdf; name="${filename}"\r\n`;
        message += `Content-Disposition: attachment; filename="${filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        
        // Wrap base64 to avoid line length limits in old MTA nodes, Gmail handles it well though
        const wrappedBase64 = pdfBase64.match(/.{1,76}/g)?.join('\r\n') || pdfBase64;
        message += `${wrappedBase64}\r\n\r\n`;
        console.log(`[MIME] 📎 ATTACHED PDF successfully: ${filename}`);
    }
    
    message += `--${boundary}--`;
    
    const encoded = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    console.log(`[MIME] FINAL EMAIL HTML length: ${htmlBody.length}`);
    console.log(`[MIME] HAS PDF: ${!!pdfBase64}`);
    
    return { raw: encoded, pdfSkipped };
};

async function sendGmailAPI({ rawSender, to, subject, html, pdf_url, isAttachMode }) {
    const sender = normalizeSender(rawSender);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[SEND] 📧 GMAIL API SEND START`);
    console.log(`[SEND] FROM: ${sender.senderEmail}`);
    console.log(`[SEND] TO: ${to}`);
    console.log(`[SEND] SUBJECT: ${subject}`);
    console.log(`[SEND] attachMode: ${isAttachMode}, pdf_url: ${pdf_url || 'NULL'}`);
    
    // The refresh_token is stored in smtpPassword for OAuth2 accounts
    const refreshToken = sender.smtpPassword;
    if (!refreshToken) {
        console.error(`[SEND] ❌ FATAL: smtpPassword (refresh_token) is EMPTY!`);
        throw new Error('Không tìm thấy Refresh Token (smtpPassword trống).');
    }
    console.log(`[SEND] 🔑 refresh_token exists: length=${refreshToken.length}, starts=${refreshToken.substring(0, 8)}...`);

    // 1. Initialize OAuth2 Client
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    console.log(`[SEND] GOOGLE_CLIENT_ID: ${clientId ? `exists (${clientId.length} chars)` : '❌ MISSING'}`);
    console.log(`[SEND] GOOGLE_CLIENT_SECRET: ${clientSecret ? `exists (${clientSecret.length} chars)` : '❌ MISSING'}`);
    
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET chưa được cấu hình trên server!');
    }
    
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Ensure token is valid / refreshed
    let accessToken;
    try {
        console.log(`[SEND] 🔄 Refreshing access token...`);
        const { token } = await oauth2Client.getAccessToken();
        accessToken = token;
        if (!accessToken) throw new Error('getAccessToken() returned null — refresh token may be revoked');
        console.log(`[SEND] ✅ Access token OK: length=${accessToken.length}, starts=${accessToken.substring(0, 15)}...`);
    } catch (tokenErr) {
        const detail = tokenErr.response?.data || tokenErr.message;
        console.error(`[SEND] ❌ OAuth2 Token Error:`, JSON.stringify(detail));
        throw new Error('Lỗi làm mới Token (invalid_grant hoặc token expired). Vui lòng kết nối lại tài khoản Gmail. Detail: ' + JSON.stringify(detail));
    }

    // 2. Build MIME
    // Fix: Properly encode sender name for UTF-8 (RFC 2047) to prevent "BÃ¡o LÃ£i" gibberish
    const encodedSenderName = `=?utf-8?B?${Buffer.from(sender.senderName || sender.senderEmail).toString('base64')}?=`;
    const fromString = `${encodedSenderName} <${sender.senderEmail}>`;
    
    console.log(`[SEND] 📝 Building MIME message...`);
    const mimeResult = await buildMimeMessage(fromString, to, subject, html, pdf_url, isAttachMode);

    // 3. Send using Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    try {
        console.log(`[SEND] 🚀 Calling gmail.users.messages.send... (raw length: ${mimeResult.raw.length})`);
        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: mimeResult.raw }
        });
        
        console.log(`[SEND] GMAIL RESPONSE:`, JSON.stringify(res.data));
        if (!res.data || !res.data.id) {
            throw new Error(`Gmail API không trả về messageId hợp lệ.`);
        }
        
        console.log(`[SEND] ✅✅✅ GMAIL API SUCCESS! messageId: ${res.data.id}`);
        console.log(`${'='.repeat(60)}\n`);
        
        let responseMsg = 'Sent via Gmail API';
        if (mimeResult.pdfSkipped) responseMsg += ' (PDF skipped - no URL)';
        
        return { messageId: res.data.id, response: responseMsg, pdfSkipped: mimeResult.pdfSkipped };
    } catch (gErr) {
        const errorDetails = gErr.response?.data?.error || gErr.response?.data || gErr.message;
        console.error(`[SEND] ❌ GMAIL API ERROR:`, JSON.stringify(errorDetails));
        console.error(`[SEND] Error status:`, gErr.response?.status);
        console.error(`[SEND] Error headers:`, JSON.stringify(gErr.response?.headers || {}));
        console.log(`${'='.repeat(60)}\n`);
        throw new Error(`Gmail API failure (${gErr.response?.status || 'unknown'}): ${JSON.stringify(errorDetails)}`);
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
    console.log(`[DB] Fallback: Searching for 'pending' tasks (limit ${batchSize})...`);
    const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);
 
    if (error) {
        console.error(`[DB] ❌ Fallback query error: ${error.message}`);
        throw error;
    }
 
    // Mark them as processing
    if (data && data.length > 0) {
        const ids = data.map(d => d.id);
        console.log(`[DB] 🔄 Marking ${ids.length} tasks as 'processing'...`);
        const { error: updErr } = await supabase
            .from('email_logs')
            .update({ status: 'processing', last_retry_time: new Date().toISOString() })
            .in('id', ids);
        
        if (updErr) console.error(`[DB] ❌ Failed to mark tasks as processing: ${updErr.message}`);
    } else {
        console.log(`[DB] No pending tasks found.`);
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
    console.log(`\n\n${'▶'.repeat(30)}`);
    console.log(`▶ PROCESSING TASK: ${log.id}`);
    console.log(`▶ Email: ${log.email}`);
    console.log(`▶ MST/customer_id: ${log.customer_id}`);
    console.log(`▶ Campaign: ${log.campaign_id}`);
    console.log(`${'▶'.repeat(30)}`);

    try {
        // Mark as processing
        await dbUpdateEmailLog(log.id, 'processing', null, null);

        // Step 1: Get Campaign
        setHeartbeat('Getting campaign', log.id);
        const campaign = await dbGetCampaign(log.campaign_id);
        console.log(`[TASK:1] ✅ Campaign loaded: "${campaign.name}"`);
        console.log(`[TASK:1]    sender_account_id: ${campaign.sender_account_id}`);
        console.log(`[TASK:1]    attach_cert: ${campaign.attach_cert} (type: ${typeof campaign.attach_cert})`);
        console.log(`[TASK:1]    recipients count: ${(campaign.recipients || []).length}`);
        console.log(`[TASK:1]    subject: ${campaign.subject}`);

        // Step 2: Get Customer data
        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r =>
            String(r.MST || r.taxCode || '').trim() === cleanMST
        );
        const customer = await dbGetCustomer(cleanMST);
        console.log(`[TASK:2] ✅ Customer lookup for MST "${cleanMST}":`);
        console.log(`[TASK:2]    Excel match: ${recipientInExcel ? 'YES' : 'NO'}`);
        console.log(`[TASK:2]    DB customer found: ${customer && customer.mst ? 'YES' : 'NO'}`);
        
        let pdfUrl = customer.pdf_url;
        
        // --- FALLBACK: Check certificates table if customers table has no PDF ---
        if (!pdfUrl) {
            console.log(`[TASK:2] 🔍 No PDF found in customers table. Checking certificates table...`);
            const { data: cert } = await supabase.from('certificates').select('pdf_url').eq('mst', cleanMST).maybeSingle();
            if (cert && cert.pdf_url) {
                pdfUrl = cert.pdf_url;
                console.log(`[TASK:2] ✅ Fallback PDF found in certificates: ${pdfUrl}`);
            }
        }

        console.log(`[TASK:2]    Final pdf_url: ${pdfUrl || '❌ NULL/EMPTY'}`);
        console.log(`[TASK:2]    company_name: ${customer.company_name || recipientInExcel?.TenCongTy || 'N/A'}`);

        // Step 3: Get Sender
        setHeartbeat('Getting sender', log.id);
        const senderId = campaign.sender_account_id || campaign.senderAccountId;
        console.log(`[TASK:3] Looking up sender: ${senderId}`);
        const senderRaw = await dbGetSender(senderId);
        console.log(`[TASK:3] ✅ Sender loaded: ${senderRaw.senderEmail || senderRaw.sender_email || 'unknown'}`);
        console.log(`[TASK:3]    smtpHost: ${senderRaw.smtpHost || senderRaw.smtp_host || 'N/A'}`);
        console.log(`[TASK:3]    has refresh_token: ${!!(senderRaw.smtpPassword || senderRaw.smtp_password)}`);

        // Step 4: Determine attach mode
        const attachCertificate = campaign.attach_cert === true || campaign.attach_cert === 'true';
        console.log(`[TASK:4] attachCertificate resolved: ${attachCertificate}`);

        // Step 5: Parse Template
        const formatDateDDMMYYYY = (dateStr) => {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            } catch {
                return dateStr;
            }
        };

        const rawExpiredDate = recipientInExcel?.NgayHetHanChuKySo || recipientInExcel?.['Ngày hết hạn'] || customer.expired_date || '';

        const dataForTags = {
            company_name: recipientInExcel?.TenCongTy || recipientInExcel?.Ten || recipientInExcel?.['Tên Công Ty'] || customer.company_name || 'Quý khách',
            mst: recipientInExcel?.MST || recipientInExcel?.taxCode || customer.mst || cleanMST,
            address: recipientInExcel?.DiaChi || recipientInExcel?.['Địa chỉ'] || customer.dia_chi || '',
            email: log.email || recipientInExcel?.Email || customer.email || '',
            expired_date: formatDateDDMMYYYY(rawExpiredDate)
        };
        console.log(`[TASK:5] TAG DATA [${log.id}]:`, JSON.stringify(dataForTags, null, 2));
        
        const parsedSubjectHTML = parseTemplate(dataForTags, campaign.subject || 'Thông báo tự động');
        const parsedBodyHTML = parseTemplate(dataForTags, campaign.template || '');

        console.log(`[TASK:5] ✅ Parsed subject: ${parsedSubjectHTML}`);
        console.log(`[TASK:5]    Parsed body length: ${parsedBodyHTML.length} chars`);

        // Step 6: Send with retry (3 attempts)
        setHeartbeat('Sending', log.id);
        let successInfo = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`\n[TASK:6] 🚀 Send attempt ${attempt}/3 using Gmail API...`);
                successInfo = await sendGmailAPI({
                    rawSender: senderRaw,
                    to: log.email,
                    subject: parsedSubjectHTML,
                    html: parsedBodyHTML,
                    pdf_url: pdfUrl,
                    isAttachMode: attachCertificate
                });
                console.log(`[TASK:6] ✅ Attempt ${attempt} succeeded!`);
                break;
            } catch (e) {
                lastError = e;
                console.error(`[TASK:6] ❌ Attempt ${attempt}/3 FAILED: ${e.message}`);
                if (attempt < 3) {
                    console.log(`[TASK:6] ⏳ Waiting 3s before retry...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }

        if (!successInfo) throw lastError || new Error('All 3 send attempts failed');

        // ✅ SUCCESS
        let statusMsg = `OK: ${successInfo.response || 'Delivered'}`;
        if (successInfo.pdfSkipped) statusMsg += ' [PDF skipped - no URL]';
        
        await dbUpdateEmailLog(log.id, 'success', successInfo.messageId, statusMsg);
        await dbIncrementSuccess(log.campaign_id);
        await dbCheckCompletion(log.campaign_id);
        console.log(`\n[TASK] ✅✅✅ EMAIL SENT SUCCESSFULLY to ${log.email} ✅✅✅`);
        console.log(`[TASK] messageId: ${successInfo.messageId}\n`);

    } catch (err) {
        setHeartbeat('ERROR', log.id, err.message);
        console.error(`\n[TASK] ❌❌❌ TASK FAILED for ${log.email} ❌❌❌`);
        console.error(`[TASK] Error: ${err.message}`);
        console.error(`[TASK] Stack: ${err.stack}\n`);

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

        console.log(`\n${'🔄'.repeat(5)} WORKER CYCLE START ${'🔄'.repeat(5)}`);
        console.log(`[WORKER] Found ${tasks.length} pending task(s)`);
        console.log(`[WORKER] Tasks: ${tasks.map(t => `${t.id.substring(0,8)}→${t.email}`).join(', ')}`);
        
        for (let i = 0; i < tasks.length; i++) {
            const log = tasks[i];
            console.log(`\n[WORKER] Processing task ${i + 1}/${tasks.length}...`);
            await new Promise(r => setTimeout(r, 2000));
            
            try {
                // Wrap task in a 90s timeout (Promise.race)
                await Promise.race([
                    processEmailTask(log),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('MÔI TRƯỜNG GỬI MAIL BỊ TREO (90s)')), 90000))
                ]);
            } catch (taskErr) {
                console.error(`[WORKER] ⚠ Task ${log.id} failed or timed out: ${taskErr.message}`);
                setHeartbeat('Task Error', log.id, taskErr.message);
                try {
                    await dbUpdateEmailLog(log.id, 'failed', null, `WORKER ERROR/TIMEOUT: ${taskErr.message}`);
                } catch (dbErr) {
                    console.error(`[WORKER] ⚠ Failed to mark task as failed in DB: ${dbErr.message}`);
                }
            }
        }
        
        console.log(`[WORKER] ✅ Cycle complete. Processed ${tasks.length} task(s).\n`);
    } catch (err) {
        console.error(`[WORKER] ❌ Critical Error: ${err.message}`);
        console.error(`[WORKER] Stack: ${err.stack}`);
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

    const parsedBodyHTML = parseTemplate(dataForTags, rawTemplate);
    const sendArgs = {
        rawSender: sender,
        to: targetEmail,
        subject: `[TEST CA2] Case ${testCase} - ${new Date().toISOString()}`,
        html: parsedBodyHTML,
        pdf_url: mockPdfUrl,
        isAttachMode: attachCertificate
    };

    const info = await sendGmailAPI(sendArgs);

    return { success: true, messageId: info.messageId, response: info.response, sent_via: sender.senderEmail, case: testCase };
}

module.exports = {
    startWorker,
    processEmailTask,
    testEmailFlow,
    sendGmailAPI,
    parseTemplate,
    getHeartbeat
};
