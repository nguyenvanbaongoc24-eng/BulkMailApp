const nodemailer = require('nodemailer');
const { adminClient: supabase } = require('./supabaseClient');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
// COLUMN NORMALIZER: Handle both camelCase and snake_case from Supabase
// -----------------------------------
function normalizeSender(raw) {
    if (!raw) return null;
    return {
        smtpHost: raw.smtpHost || raw.smtp_host || raw.smtphost || null,
        smtpPort: raw.smtpPort || raw.smtp_port || raw.smtpport || '587',
        smtpUser: raw.smtpUser || raw.smtp_user || raw.smtpuser || null,
        smtpPassword: raw.smtpPassword || raw.smtp_password || raw.smtppassword || null,
        senderName: raw.senderName || raw.sender_name || raw.sendername || 'Automation CA2',
        senderEmail: raw.senderEmail || raw.sender_email || raw.senderemail || null,
    };
}

// -----------------------------------
// 1. TẠO TRANSPORTER VỚI FULL VALIDATION
// -----------------------------------
async function createTransporter(rawSender) {
    const sender = normalizeSender(rawSender);

    console.log(`\n========================================`);
    console.log(`[SMTP] RAW SENDER DATA:`, JSON.stringify(rawSender, null, 2));
    console.log(`[SMTP] NORMALIZED:`, JSON.stringify(sender, null, 2));

    // DETECT OAUTH SENDERS (BUG #1 FIX)
    if (sender.smtpHost === 'oauth2.google' || sender.smtpHost === 'oauth2.googleapis.com') {
        throw new Error(
            `SENDER DÙNG OAUTH2 CŨ (smtpHost='${sender.smtpHost}'). ` +
            `Hệ thống đã chuyển sang SMTP thuần túy. Vui lòng xóa sender này và tạo mới với: ` +
            `Host=smtp.gmail.com, Port=587, User=email@gmail.com, Pass=App Password 16 ký tự.`
        );
    }

    if (!sender.smtpUser || !sender.smtpPassword || !sender.smtpHost) {
        throw new Error(
            `THIẾU CẤU HÌNH SMTP! ` +
            `Host=${sender.smtpHost || 'TRỐNG'}, User=${sender.smtpUser || 'TRỐNG'}, Pass=${sender.smtpPassword ? '***' : 'TRỐNG'}`
        );
    }

    const host = sender.smtpHost;
    const port = parseInt(sender.smtpPort || '587', 10);
    const user = sender.smtpUser;
    const pass = sender.smtpPassword;
    const senderName = sender.senderName;

    console.log(`[SMTP] Connecting to ${host}:${port} as ${user}...`);

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });

    // BẮT BUỘC verify
    try {
        await transporter.verify();
        console.log(`[SMTP] ✅ VERIFY OK for ${user}`);
        return { transporter, fromEmail: user, senderName };
    } catch (err) {
        console.error(`[SMTP] ❌ VERIFY FAIL for ${user}:`, err.message);
        throw new Error(`SMTP VERIFY FAIL (${user}): ${err.message}`);
    }
}

// -----------------------------------
// 2. TEMPLATE TAG PARSER
// -----------------------------------
function parseTemplateAndCheckTags(template, data, isAttachMode) {
    if (!template) return { html: '', missingTags: [] };

    console.log(`[TEMPLATE] Input (first 80 chars):`, template.substring(0, 80));

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

    console.log(`[TEMPLATE] Output (first 80 chars):`, parsedHTML.substring(0, 80));
    return { html: parsedHTML, missingTags };
}

// -----------------------------------
// 3. GỬI MAIL + PDF ATTACH
// -----------------------------------
async function sendEmail({ transporter, from, to, subject, html, pdf_url, isAttachMode }) {
    console.log(`\n[SEND] ============================`);
    console.log(`[SEND] FROM: ${from}`);
    console.log(`[SEND] TO: ${to}`);
    console.log(`[SEND] SUBJECT: ${subject}`);
    console.log(`[SEND] ATTACH MODE: ${isAttachMode}`);
    console.log(`[SEND] PDF_URL: ${pdf_url || 'NONE'}`);

    const attachments = [];

    if (isAttachMode) {
        if (!pdf_url) {
            console.error(`[SEND] ❌ ATTACH MODE ON but NO PDF URL — BLOCKING SEND`);
            throw new Error('attachCertificate=TRUE nhưng không có PDF URL. Không gửi.');
        }
        const filename = `ChungNhan_${(subject || 'CA2').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        attachments.push({ filename, path: pdf_url });
        console.log(`[SEND] 📎 ATTACHING: ${filename} from ${pdf_url}`);
    }

    console.log(`[SEND] Calling transporter.sendMail()...`);
    const info = await transporter.sendMail({ from, to, subject, html, attachments });

    console.log(`[SEND] ✅ SUCCESS!`);
    console.log(`[SEND] messageId: ${info.messageId}`);
    console.log(`[SEND] response: ${info.response}`);
    console.log(`[SEND] accepted: ${JSON.stringify(info.accepted)}`);
    console.log(`[SEND] rejected: ${JSON.stringify(info.rejected)}`);

    if (!info.messageId) {
        throw new Error('sendMail returned but NO messageId — FAKE SUCCESS detected!');
    }

    if (info.rejected && info.rejected.length > 0) {
        throw new Error(`Email bị từ chối bởi server: ${info.rejected.join(', ')}`);
    }

    return info;
}

// -----------------------------------
// 4. WORKER FLOW
// -----------------------------------
const WORKER_INTERVAL = 10000;
let isWorkerRunning = false;

const supabaseRPC = async (name, params) => {
    console.log(`[RPC] Calling ${name}...`);
    const result = await Promise.race([
        supabase.rpc(name, params),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`RPC ${name} TIMEOUT (15s)`)), 15000))
    ]);
    if (result.error) {
        console.error(`[RPC] ❌ ${name} ERROR:`, result.error.message);
        throw result.error;
    }
    console.log(`[RPC] ✅ ${name} OK, data count: ${Array.isArray(result.data) ? result.data.length : 'N/A'}`);
    return result;
};

async function processEmailTask(log) {
    setHeartbeat('START processEmailTask', log.id);
    console.log(`\n\n▶▶▶ PROCESSING EMAIL LOG: ${log.id} ▶▶▶`);
    console.log(`[TASK] email: ${log.email}, customer_id: ${log.customer_id}, campaign_id: ${log.campaign_id}`);

    try {
        // Step 1: Mark as processing
        setHeartbeat('Marking as processing', log.id);
        await supabaseRPC('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'processing',
            p_error_message: null,
            p_message_id: null,
            p_sent_time: null
        });

        // Step 2: Get Campaign
        setHeartbeat('Getting campaign data', log.id);
        const { data: campaignData } = await supabaseRPC('get_campaign_for_worker', { p_campaign_id: log.campaign_id });
        const campaign = campaignData && campaignData[0];
        if (!campaign) throw new Error(`Campaign ${log.campaign_id} NOT FOUND in DB!`);
        console.log(`[TASK] Campaign: "${campaign.name}", sender_id: ${campaign.sender_account_id}`);

        // Step 3: Get Customer
        setHeartbeat('Getting customer data', log.id);
        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode || '').trim() === cleanMST);
        console.log(`[TASK] Recipient from Excel: ${recipientInExcel ? 'FOUND' : 'NOT FOUND'}, MST: ${cleanMST}`);

        let customer = {};
        if (cleanMST) {
            try {
                const { data: customerData } = await supabaseRPC('get_customer_for_worker', { p_mst: cleanMST });
                customer = (customerData && customerData[0]) || {};
            } catch (e) {
                console.warn(`[TASK] ⚠ get_customer_for_worker failed: ${e.message} — continuing without customer data`);
            }
        }
        console.log(`[TASK] Customer pdf_url: ${customer.pdf_url || 'NONE'}`);

        // Step 4: Get Sender
        setHeartbeat('Getting sender data', log.id);
        const senderId = campaign.sender_account_id || campaign.senderAccountId;
        console.log(`[TASK] Looking up Sender ID: ${senderId}`);
        const { data: senderData } = await supabaseRPC('get_sender_for_worker', { p_sender_id: senderId });
        const senderPayload = senderData && senderData[0];
        if (!senderPayload) throw new Error(`Sender ID "${senderId}" NOT FOUND!`);

        // Step 5: Check attach mode
        const attachCertificate = campaign.attach_cert === true || campaign.attach_cert === 'true' || campaign.attachCert === true || campaign.attachCert === 'true';
        console.log(`[TASK] attachCertificate: ${attachCertificate}`);

        // Step 6: Parse Template
        setHeartbeat('Parsing template', log.id);
        const dataForTags = {
            company_name: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || customer.company_name || 'Quý khách',
            mst: recipientInExcel?.MST || recipientInExcel?.taxCode || customer.mst || cleanMST,
            address: recipientInExcel?.DiaChi || recipientInExcel?.['Địa chỉ'] || customer.dia_chi || '',
            expired_date: recipientInExcel?.NgayHetHanChuKySo || recipientInExcel?.['Ngày hết hạn'] || customer.expired_date || ''
        };

        const parsedSubject = parseTemplateAndCheckTags(campaign.subject || 'Thông báo tự động', dataForTags, attachCertificate);
        const parsedBody = parseTemplateAndCheckTags(campaign.template || '', dataForTags, attachCertificate);

        // Step 7: Create SMTP Transporter
        setHeartbeat('Creating SMTP transporter', log.id);
        const { transporter, fromEmail, senderName } = await createTransporter(senderPayload);

        // Step 8: Send with retry
        setHeartbeat('Sending email', log.id);
        let successInfo = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[TASK] Send attempt ${attempt}/3...`);
                successInfo = await sendEmail({
                    transporter,
                    from: `"${senderName}" <${fromEmail}>`,
                    to: log.email,
                    subject: parsedSubject.html,
                    html: parsedBody.html,
                    pdf_url: customer.pdf_url,
                    isAttachMode: attachCertificate
                });
                break;
            } catch (e) {
                lastError = e;
                console.error(`[TASK] ❌ Attempt ${attempt}/3 FAILED: ${e.message}`);
                if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!successInfo) {
            throw lastError || new Error('All 3 send attempts failed with no error captured');
        }

        // Step 9: Mark success
        setHeartbeat('Marking success', log.id);
        await supabaseRPC('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'success',
            p_message_id: successInfo.messageId,
            p_sent_time: new Date().toISOString(),
            p_error_message: `OK: ${successInfo.response || 'Delivered'}`
        });
        await supabaseRPC('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);
        console.log(`[TASK] ✅✅✅ EMAIL SENT SUCCESSFULLY to ${log.email} ✅✅✅`);

    } catch (err) {
        setHeartbeat('FATAL ERROR', log.id, err.message);
        console.error(`\n[TASK] ❌❌❌ FATAL ERROR for ${log.email}: ${err.message}`);
        console.error(`[TASK] Full stack:`, err.stack);

        try {
            await supabaseRPC('update_email_log_for_worker', {
                p_log_id: log.id,
                p_status: 'failed',
                p_error_message: `FAILED: ${err.message}`.substring(0, 500),
                p_message_id: null,
                p_sent_time: new Date().toISOString()
            });
            await supabaseRPC('increment_campaign_error', { campaign_id: log.campaign_id });
            await checkCampaignCompletion(log.campaign_id);
        } catch (dbErr) {
            console.error(`[TASK] ⚠ Could not update DB after failure: ${dbErr.message}`);
        }
    }
}

async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remainingCount } = await supabaseRPC('get_remaining_tasks_count', { p_campaign_id: campaign_id });
        console.log(`[COMPLETION] Remaining tasks for ${campaign_id}: ${remainingCount}`);
        if (parseInt(remainingCount) === 0) {
            const { data: campaignData } = await supabaseRPC('get_campaign_for_worker', { p_campaign_id: campaign_id });
            const campaign = campaignData && campaignData[0];
            const total = (campaign?.recipients || []).length;
            const final = (campaign?.error_count || 0) > 0 ? `Hoàn thành (Lỗi ${campaign.error_count}/${total})` : 'Hoàn thành';
            await supabaseRPC('update_campaign_status_for_worker', { p_campaign_id: campaign_id, p_status: final });
            console.log(`[COMPLETION] ✅ Campaign ${campaign_id} marked as: ${final}`);
        }
    } catch (e) {
        console.error(`[COMPLETION] ⚠ checkCampaignCompletion error: ${e.message}`);
    }
}

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    setHeartbeat('Worker polling for tasks');

    try {
        const { data: tasks } = await supabaseRPC('pick_email_tasks', { batch_size: 10 });
        if (!tasks || tasks.length === 0) {
            // No tasks — this is normal, just return silently
            return;
        }

        console.log(`\n🔄 WORKER: Found ${tasks.length} pending tasks`);
        for (const log of tasks) {
            await new Promise(r => setTimeout(r, 2000));
            await processEmailTask(log);
        }
    } catch (err) {
        // BUG #5 FIX: NO MORE SILENT CATCH
        console.error(`[WORKER] ❌ startWorker ERROR: ${err.message}`);
        setHeartbeat('Worker error', null, err.message);
    } finally {
        isWorkerRunning = false;
    }
}

async function recoverFailedTasks() {
    try {
        await supabaseRPC('recover_failed_tasks');
    } catch (e) {
        console.error(`[WORKER] ⚠ recoverFailedTasks error: ${e.message}`);
    }
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(recoverFailedTasks, 60 * 1000);

// -----------------------------------
// 5. TEST FLOW
// -----------------------------------
async function testEmailFlow(targetEmail, forcedSenderId = null, testCase = 1) {
    console.log(`\n\n=== RUNNING E2E TEST: CASE ${testCase} ===`);

    // Get sender from DB or fallback
    let sender;
    if (forcedSenderId) {
        const { data: s } = await supabase.from('senders').select('*').eq('id', forcedSenderId).limit(1);
        sender = s && s[0];
    }
    if (!sender) {
        const { data: senders } = await supabase.from('senders').select('*').order('created_at', { ascending: false }).limit(1);
        sender = senders && senders[0];
    }

    // If still no sender, use .env as last resort
    if (!sender) {
        console.log(`[TEST] No sender in DB, using .env fallback`);
        sender = {
            smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
            smtpPort: process.env.SMTP_PORT || '587',
            smtpUser: process.env.SMTP_USER,
            smtpPassword: process.env.SMTP_PASS,
            senderName: 'ENV Fallback Test'
        };
    }

    console.log(`[TEST] Using sender:`, JSON.stringify({ ...sender, smtpPassword: '***' }, null, 2));

    const { transporter, fromEmail, senderName } = await createTransporter(sender);

    const dataForTags = {
        company_name: 'CÔNG TY TEST CA2',
        mst: '0101010101',
        address: 'Hà Nội, Việt Nam',
        expired_date: '31/12/2030'
    };

    let rawTemplate = `<p>Xin chào <b>#TênCôngTy</b> (MST: #MST).</p><p>Đây là email test từ Automation CA2.</p>`;
    let attachCertificate = false;
    let mockPdfUrl = null;

    if (testCase === 1) {
        attachCertificate = false;
        mockPdfUrl = null;
    } else if (testCase === 2) {
        attachCertificate = true;
        mockPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    } else if (testCase === 3) {
        attachCertificate = true;
        mockPdfUrl = null;
    }

    const parsedBody = parseTemplateAndCheckTags(rawTemplate, dataForTags, attachCertificate);

    const info = await sendEmail({
        transporter,
        from: `"[TEST] ${senderName}" <${fromEmail}>`,
        to: targetEmail,
        subject: `[TEST CA2] Case ${testCase} - ${new Date().toISOString()}`,
        html: parsedBody.html,
        pdf_url: mockPdfUrl,
        isAttachMode: attachCertificate
    });

    console.log(`\n✅ TEST CASE ${testCase} SUCCESS!`);
    return { success: true, messageId: info.messageId, response: info.response, sent_via: fromEmail, case: testCase };
}

// -----------------------------------
// DIRECT SMTP TEST (No DB needed)
// -----------------------------------
async function testSMTPDirect(smtpHost, smtpPort, smtpUser, smtpPassword, targetEmail) {
    console.log(`\n=== DIRECT SMTP TEST ===`);
    console.log(`Host: ${smtpHost}, Port: ${smtpPort}, User: ${smtpUser}`);

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
    });

    console.log(`[DIRECT] Verifying...`);
    await transporter.verify();
    console.log(`[DIRECT] ✅ Verify OK!`);

    console.log(`[DIRECT] Sending test email to ${targetEmail}...`);
    const info = await transporter.sendMail({
        from: `"Direct Test" <${smtpUser}>`,
        to: targetEmail,
        subject: `[Direct SMTP Test] ${new Date().toISOString()}`,
        html: `<h2>SMTP Test OK!</h2><p>Nếu bạn thấy email này, SMTP đang hoạt động.</p>`
    });

    console.log(`[DIRECT] ✅ Sent! messageId: ${info.messageId}, response: ${info.response}`);
    return { success: true, messageId: info.messageId, response: info.response };
}

module.exports = {
    startWorker,
    processEmailTask,
    testEmailFlow,
    testSMTPDirect,
    createTransporter,
    parseTemplateAndCheckTags,
    sendEmail,
    getHeartbeat
};
