const { google } = require('googleapis');
const axios = require('axios');
const { adminClient: supabase } = require('./supabaseClient');
require('dotenv').config();

// -----------------------------------
// HEARTBEAT: Track worker activity
// -----------------------------------
const heartbeat = { time: null, task: null, step: null, error: null, lastErrors: [] };
function getHeartbeat() { return heartbeat; }
function setHeartbeat(step, taskId = null, error = null) {
    heartbeat.time = new Date().toISOString();
    heartbeat.step = step;
    if (taskId) heartbeat.task = taskId;
    if (error) {
        heartbeat.error = error;
        heartbeat.lastErrors.unshift({ time: heartbeat.time, task: taskId, error });
        if (heartbeat.lastErrors.length > 10) heartbeat.lastErrors.pop();
    }
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
function normalizeCustomer(row) {
    if (!row) row = {};
    return {
        company_name: row.company_name || row.TenCongTy || row.ten_cong_ty || row.name || row.Ten || row['Tên Công Ty'] || "",
        mst: row.mst || row.MST || row.tax_code || row.taxCode || "",
        address: row.address || row.DiaChi || row.dia_chi || row['Địa chỉ'] || row.notes || "",
        email: row.email || row.Email || "",
        expired_date: row.expired_date || row.expiry || row.NgayHetHanChuKySo || row['Ngày hết hạn'] || row['Hạn GCN'] || row['Hạn dùng'] || row['Hạn sử dụng'] || ""
    };
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    const entities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
        '&acirc;': 'â', '&ecirc;': 'ê', '&ocirc;': 'ô', '&ucirc;': 'û', '&icirc;': 'î',
        '&agrave;': 'à', '&egrave;': 'è', '&ograve;': 'ò', '&ugrave;': 'ù', '&igrave;': 'ì',
        '&aacute;': 'á', '&eacute;': 'é', '&oacute;': 'ó', '&uacute;': 'ú', '&iacute;': 'í',
        '&atilde;': 'ã', '&etilde;': 'ẽ', '&otilde;': 'õ', '&utilde;': 'ũ', '&itilde;': 'ĩ',
        '&Acirc;': 'Â', '&Ecirc;': 'Ê', '&Ocirc;': 'Ô',
    };
    let result = str;
    // Also handle &#xxx; numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
    for (const [entity, char] of Object.entries(entities)) {
        result = result.split(entity).join(char);
    }
    return result;
}

function parseTemplate(template, customer) {
    if (!template) return '';
    const norm = normalizeCustomer(customer);
    console.log(`\n[TEMPLATE PARSER] BEFORE:`, template.substring(0, 80));
    console.log("CUSTOMER RAW KEYS:", Object.keys(customer || {}));

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            // Handle DD/MM/YYYY format explicitly
            const dateVal = String(dateStr || '');
            // Handle DD/MM/YYYY format explicitly
            if (dateVal.includes('/')) {
                const parts = dateVal.split(' ')[0].split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    if (year.length === 4) return `${day}/${month}/${year}`;
                }
            }
            
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return dateVal;
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        } catch { return String(dateStr || ''); }
    };

    console.log("NORMALIZED:", JSON.stringify(norm));

    // Step 1: Decode HTML entities in the template so "#T&ecirc;nC&ocirc;ngTy" becomes "#TênCôngTy"
    let result = decodeHtmlEntities(template);

    // Step 2: Build a flat map of ALL known tag variants -> value
    // Each tag variant is a plain string (case-insensitive replacement)
    const tagMap = [
        // Company name variants
        ['#TênCôngTy', norm.company_name],
        ['#TenCongTy', norm.company_name],
        ['#tencongty', norm.company_name],
        ['#Tên Công Ty', norm.company_name],
        ['#Ten Cong Ty', norm.company_name],
        // MST variants
        ['#MST', norm.mst],
        ['#mst', norm.mst],
        // Address variants
        ['#ĐịaChỉ', norm.address],
        ['#DiaChi', norm.address],
        ['#diachi', norm.address],
        ['#Địa Chỉ', norm.address],
        ['#Dia Chi', norm.address],
        // Email variants
        ['#Email', norm.email],
        ['#email', norm.email],
        // Expiry date variants
        ['#NgàyHếtHạn', formatDate(norm.expired_date)],
        ['#NgayHetHan', formatDate(norm.expired_date)],
        ['#Ngàyhếthạn', formatDate(norm.expired_date)],
        ['#ngàyhếthạn', formatDate(norm.expired_date)],
        ['#ngayhethan', formatDate(norm.expired_date)],
        ['#Ngày hết hạn', formatDate(norm.expired_date)],
        ['#Ngày Hết Hạn', formatDate(norm.expired_date)],
        ['#HạnGCN', formatDate(norm.expired_date)],
        ['#HanGCN', formatDate(norm.expired_date)],
        ['#Hạn GCN', formatDate(norm.expired_date)],
        ['#Han GCN', formatDate(norm.expired_date)],
    ];

    // Step 3: Replace each tag (case-insensitive)
    for (const [tag, value] of tagMap) {
        // Use a simple case-insensitive find-and-replace
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), value || '');
    }

    if (result.includes('#')) {
        const remaining = result.match(/#[^\s<.,;:!?"']+/g) || [];
        if (remaining.length > 0) {
            console.warn(`[TEMPLATE] ⚠ UNREPLACED TAGS:`, remaining);
        }
    }

    console.log("PARSED RESULT:", result.substring(0, 120));
    return result;
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
    // Inject responsive image CSS to prevent oversized images in email clients
    const responsiveStyles = `
        <style>
            img { max-width: 600px !important; width: auto !important; height: auto !important; display: block; margin: 10px auto; }
            @media only screen and (max-width: 620px) {
                img { max-width: 100% !important; }
            }
            table { width: 100% !important; border-collapse: collapse; }
        </style>
    `;
    const finalHtml = responsiveStyles + htmlBody;
    
    const boundary = `====boundary_${Date.now()}====`;
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    let pdfSkipped = false;
    let pdfBase64 = null;
    let filename = "Giay Chung Nhan CA2.pdf";

    if (isAttachMode === true) {
        if (!pdfUrl) {
            console.warn(`[MIME] ⚠ attachCertificate=TRUE nhưng pdf_url=NULL → GỬI MAIL KHÔNG ĐÍNH KÈM PDF`);
            pdfSkipped = true;
        } else {
            console.log(`[MIME] 📥 Fetching PDF from: ${pdfUrl} (using Axios)`);
            try {
                // Using axios because it's proven reliable with dns.setDefaultResultOrder on Render
                const response = await axios({
                    url: pdfUrl,
                    method: 'GET',
                    responseType: 'arraybuffer',
                    timeout: 45000 // 45s timeout for PDF download
                });
                pdfBase64 = Buffer.from(response.data, 'binary').toString('base64');
            } catch (err) {
                const errMsg = err.response ? `HTTP ${err.response.status}` : err.message;
                console.error(`[MIME] ❌ Lỗi tải PDF (${pdfUrl}):`, errMsg);
                console.warn(`[MIME] ⚠ Skipping PDF attachment...`);
                pdfSkipped = true;
            }
        }
    }

    let message = `To: ${to}\r\n`;
    message += `From: ${from}\r\n`;
    message += `Subject: ${encodedSubject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Part 1: HTML Body (Base64 Encoded to prevent UTF-8 boundary corruption in Gmail)
    const htmlBase64 = Buffer.from(finalHtml, 'utf8').toString('base64');
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    const wrappedHtml = htmlBase64.match(/.{1,76}/g)?.join('\r\n') || htmlBase64;
    message += `${wrappedHtml}\r\n\r\n`;
    
    // Part 2: PDF Attachment
    if (pdfBase64) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: application/pdf; name="${filename}"\r\n`;
        message += `Content-Disposition: attachment; filename="${filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        
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

    console.log(`[MIME] HAS PDF: ${!!pdfBase64}`);
    console.log(`[MIME] PDF LENGTH: ${pdfBase64 ? pdfBase64.length : 0}`);
    
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
    // Try RPC first (if it exists)
    try {
        const { data, error } = await supabase.rpc('pick_email_tasks', { batch_size: batchSize });
        if (!error && data && data.length > 0) {
            console.log(`[DB] ✅ RPC 'pick_email_tasks' returned ${data.length} tasks.`);
            return data;
        }
    } catch (e) {
        console.log(`[DB] RPC not available or failed: ${e.message}`);
    }

    // Fallback: direct query (More reliable for custom logic)
    console.log(`[DB] 🔍 Searching for 'pending' tasks via Direct Query (batch: ${batchSize})...`);
    // Diagnostic: Check if we are using Service Role Key
    const serviceKeyAvailable = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);
 
    if (error) {
        console.error(`[WORKER:DB] ❌ Fetch Error: ${error.message}`);
        throw error;
    }
 
    if (data && data.length > 0) {
        console.log(`[WORKER:DB] ✅ Found ${data.length} pending tasks (ServiceRole: ${serviceKeyAvailable})`);
        const ids = data.map(d => d.id);
        const { error: updErr } = await supabase
            .from('email_logs')
            .update({ status: 'processing', last_retry_time: new Date().toISOString() })
            .in('id', ids);
        
        if (updErr) console.error(`[WORKER:DB] ❌ Update Error: ${updErr.message}`);
    } else {
        // Only log this once in a while to avoid noise, or when explicitly debugged
        // console.log(`[WORKER:DB] No pending tasks found.`);
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

function cleanMST(mst) {
    if (!mst) return '';
    return String(mst).replace(/\s/g, '').trim();
}

async function dbGetCustomer(mst) {
    const cleaned = cleanMST(mst);
    const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('mst', cleaned)
        .order('created_at', { ascending: false })
        .limit(1);
    return data && data.length > 0 ? data[0] : null;
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
        const rawMST = log.customer_id || '';
        const cleanMST_val = cleanMST(rawMST);
        const recipientInExcel = (campaign.recipients || []).find(r =>
            cleanMST(r.MST || r.taxCode || r.mst || '') === cleanMST_val
        );
        const customer = (await dbGetCustomer(cleanMST_val)) || {};
        console.log(`[TASK:2] ✅ Customer lookup for MST "${rawMST}" (Cleaned: "${cleanMST_val}"):`);
        console.log(`[TASK:2]    Excel match: ${recipientInExcel ? 'YES' : 'NO'}`);
        console.log(`[TASK:2]    DB customer found: ${customer && customer.mst ? 'YES' : 'NO'}`);
        
        let pdfUrl = customer.pdf_url || null;
        
        // --- FALLBACK: Check certificates table if customers table has no PDF ---
        if (!pdfUrl) {
            console.log(`[TASK:2] 🔍 No PDF found in customers table. Checking certificates table...`);
            try {
                const { data: certRows } = await supabase.from('certificates').select('pdf_url').eq('mst', cleanMST_val).limit(1);
                if (certRows && certRows.length > 0 && certRows[0].pdf_url) {
                    pdfUrl = certRows[0].pdf_url;
                    console.log(`[TASK:2] ✅ Fallback PDF found in certificates: ${pdfUrl}`);
                }
            } catch (certErr) {
                console.error(`[TASK:2] ❌ Error checking certificates table: ${certErr.message}`);
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

        // --- Step 4: Attachment Decision ---
        // Be more flexible: accept true (bool), 'true' (string), or 1
        const attachCertificate = campaign.attach_cert === true || 
                                 String(campaign.attach_cert).toLowerCase() === 'true' || 
                                 campaign.attach_cert == 1;

        console.log(`[TASK:4] PDF Attachment Enabled: ${attachCertificate} (Raw: ${campaign.attach_cert})`);
        
        if (attachCertificate && !pdfUrl) {
            throw new Error(`Cần đính kèm PDF nhưng không tìm thấy link tải (PDF URL) cho MST ${cleanMST_val}. File có thể bị lỗi khi crawl hoặc chưa được tải xong bởi Desktop Tool. Vui lòng chạy lại Pipeline và bấm "Retry Failed" để gửi lại sau.`);
        }

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

        // Combine DB customer, Excel row, and log item as raw customer object
        const dataForTags = { ...customer, ...recipientInExcel, email: log.email || recipientInExcel?.Email || customer.email || '' };
        if (rawExpiredDate) dataForTags.expired_date = rawExpiredDate;
        
        console.log(`[TASK:5] TAG DATA MAP:`);
        
        const parsedSubjectHTML = parseTemplate(campaign.subject || 'Thông báo tự động', dataForTags);
        const parsedBodyHTML = parseTemplate(campaign.template || '', dataForTags);

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
        if (!tasks || tasks.length === 0) {
            isWorkerRunning = false; // Reset here too
            return;
        }

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
    let sender = null;
    
    // Test case setup
    if (forcedSenderId) {
        const { data: s } = await supabase.from('senders').select('*').eq('id', forcedSenderId).single();
        sender = s;
    }

    if (!sender) {
        const { data: senders } = await supabase.from('senders').select('*').order('created_at', { ascending: false }).limit(1);
        if (senders && senders.length > 0) {
            sender = senders[0];
        } else {
            throw new Error('Bạn chưa có tài khoản Gmail nào được kết nối trong Cơ Sở Dữ Liệu. Vui lòng vào ứng dụng 웹 -> "Tài khoản Gmail" -> "Kết nối Gmail API" trước khi thử gửi Test.');
        }
    }

    const dataForTags = { company_name: 'CÔNG TY TEST CA2', mst: '0101010101', address: 'HN VN', expired_date: '31/12/2030' };
    let rawTemplate = `<p>Xin chào <b>#TênCôngTy</b> (MST: #MST).</p><p>Đây là email test từ Automation CA2.</p>`;
    let attachCertificate = false;
    let mockPdfUrl = null;

    if (testCase === 2) { attachCertificate = true; mockPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'; }
    if (testCase === 3) { attachCertificate = true; mockPdfUrl = null; }

    const parsedBodyHTML = parseTemplate(rawTemplate, dataForTags);
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
    dbGetCustomer,
    getHeartbeat,
    buildMimeMessage
};
