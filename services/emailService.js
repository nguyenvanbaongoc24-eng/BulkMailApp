const nodemailer = require('nodemailer');
const dns = require('dns');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { adminClient: supabase } = require('./supabaseClient');

const WORKER_INTERVAL = 10000; // 10s
const RECOVERY_INTERVAL = 15 * 60 * 1000;
let isWorkerRunning = false;
let isRecoveryRunning = false;

// PHẦN 3: RENDER TEMPLATE (FIX TAG)
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

function renderTemplate(template, data) {
  if (!template) return "";
  return template
    .replace(/#TênCôngTy/g, data.company_name || "")
    .replace(/#MST/g, data.mst || "")
    .replace(/#ĐịaChỉ/g, data.address || "")
    .replace(/#NgàyHếtHạn/g, data.expired_date || "");
}

// Helper to validate email format
const validateEmail = (email) => {
    return String(email)
        .toLowerCase()
        .match(
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        );
};

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log(`[Worker] 🛠 Checking for email tasks at ${new Date().toLocaleTimeString()}...`);

    try {
        const { data: tasks, error: pickError } = await supabase.rpc('pick_email_tasks', { batch_size: 10 });
        if (pickError) throw pickError;

        if (!tasks || tasks.length === 0) {
            console.log(`[Worker] No pending tasks.`);
            return;
        }

        console.log(`[Worker] 🚀 RPC returned ${tasks.length} tasks.`);

        for (const log of tasks) {
            try {
                // PHẦN 9: CHỐNG SPAM
                // Delay giữa mỗi mail: 3–5 giây
                await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 3000));
                
                await processEmailTask(log);
            } catch (taskErr) {
                console.error(`[Worker] [${log.id}] Unhandled Task Error:`, taskErr.message);
                await supabase.rpc('update_email_log_for_worker', {
                    p_log_id: log.id,
                    p_status: 'failed',
                    p_error_message: `Unhandled Error: ${taskErr.message}`,
                    p_message_id: null,
                    p_sent_time: new Date().toISOString()
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error(`[Worker] Critical Loop Error:`, err.message);
    } finally {
        isWorkerRunning = false;
    }
}

// PHẦN 6: FLOW GỬI MAIL
async function processEmailTask(log) {
    console.log(`[Worker] [${log.id}] Starting processing for MST: ${log.customer_id}`);
    let pdfAttachedStatus = 'Chờ xử lý';
    
    try {
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'processing',
            p_error_message: 'Đang chuẩn bị nội dung...',
            p_message_id: null,
            p_sent_time: null
        }).catch(() => {});
        
        // Lấy campaign
        const { data: campaignData, error: campaignError } = await supabase.rpc('get_campaign_for_worker', { p_campaign_id: log.campaign_id });
        const campaign = campaignData && campaignData[0];
        if (campaignError || !campaign) throw new Error(`Campaign not found or inaccessible: ${log.campaign_id}`);

        // Lấy customer
        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode || '').trim() === cleanMST);
        const { data: customerData } = await supabase.rpc('get_customer_for_worker', { p_mst: cleanMST });
        let customer = customerData && customerData[0];

        // Lấy dữ liệu cơ bản cho customer nếu không có trong DB
        if (!customer) {
             customer = { 
                 mst: log.customer_id, 
                 company_name: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || 'Quý Doanh Nghiệp'
             };
        }

        // Lấy file PDF
        const shouldAttach = campaign.attach_cert === true || campaign.attach_cert === 'true' || campaign.attachCert === true || campaign.attachCert === 'true';
        if (shouldAttach) {
            if (customer && customer.pdf_url) {
                console.log(`[Worker] [${log.id}] Found existing PDF URL: ${customer.pdf_url}`);
                pdfAttachedStatus = '✅ Có PDF';
            } else {
                pdfAttachedStatus = `⚠ Không tìm thấy link PDF trên Supabase cho MST ${log.customer_id}`;
                console.warn(`[Worker] [${log.id}] ${pdfAttachedStatus}`);
            }
        } else {
            pdfAttachedStatus = 'Gửi không đính kèm';
        }

        // Lấy template & replace data
        const findVal = (obj, keys) => {
            if (!obj) return '';
            const entries = Object.entries(obj);
            for (const key of keys) {
                const found = entries.find(([k]) => k.toLowerCase().trim() === key.toLowerCase().trim());
                if (found && found[1]) return String(found[1]);
            }
            return '';
        };

        const dataForTags = {
            company_name: findVal(recipientInExcel, ['company_name', 'TenCongTy', 'Tên Công Ty', 'Name', 'companyName']) || customer?.company_name || 'Quý Doanh Nghiệp',
            mst: findVal(recipientInExcel, ['mst', 'MST', 'taxCode', 'Mã số thuế']) || customer?.mst || log.customer_id || '',
            address: findVal(recipientInExcel, ['dia_chi', 'DiaChi', 'Địa chỉ', 'Address']) || customer?.dia_chi || '',
            expired_date: findVal(recipientInExcel, ['NgayHetHanChuKySo', 'expired_date', 'Ngày hết hạn', 'Expiration', 'Hết hạn']) || customer?.expired_date || ''
        };

        const decodeEntities = (str) => {
            if (!str) return '';
            return str.replace(/&[#a-z0-9]+;/gi, match => {
                const map = { 
                    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
                    '&ecirc;': 'ê', '&ocirc;': 'ô', '&agrave;': 'à', '&aacute;': 'á', '&iacute;': 'í', 
                    '&ograve;': 'ò', '&oacute;': 'ó', '&ugrave;': 'ù', '&uacute;': 'ú', '&yacute;': 'ý', '&đ;': 'đ',
                    '&Agrave;': 'À', '&Aacute;': 'Á', '&Iacute;': 'Í', '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ugrave;': 'Ù', '&Uacute;': 'Ú'
                };
                return map[match.toLowerCase()] || match;
            }).normalize('NFC');
        };

        let html = decodeEntities(campaign.template || '');
        let subject = decodeEntities(campaign.subject || 'Thông báo từ Automation CA2');

        // Lấy content cuối cùng (Replace content template)
        const renderedContent = renderTemplate(html, dataForTags);
        subject = renderTemplate(subject, dataForTags);

        // PHẦN 3: Bắt buộc console.log nội dung FINAL
        console.log(`[Worker] [${log.id}] NỘI DUNG FINAL (đã replace):`);
        console.log(`[Worker] [${log.id}] Tiêu đề: ${subject}`);
        console.log(`[Worker] [${log.id}] Nội dung (excerpt): ${renderedContent.substring(0, 50)}...`);

        // Lấy sender details
        const { data: senderData, error: senderError } = await supabase.rpc('get_sender_for_worker', { p_sender_id: campaign.sender_account_id || campaign.senderAccountId });
        const sender = senderData && senderData[0];
        if (senderError || !sender) throw new Error('Tài khoản người gửi không tồn tại hoặc không thể truy cập.');

        if (!validateEmail(log.email)) {
            throw new Error(`Email không hợp lệ: ${log.email}`);
        }

        // PHẦN 4: LẤY FILE PDF TỪ SUPABASE
        let finalAttachments = [];
        if (shouldAttach) {
            if (customer && customer.pdf_url) {
                console.log(`[Worker] [${log.id}] BẮT ĐẦU ĐÍNH KÈM: Found existing PDF URL: ${customer.pdf_url}`);
                try {
                    // Sử dụng Node_fetch với Timeout cực gắt để không treo server
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
                    
                    const res = await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(customer.pdf_url, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    
                    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                    const buffer = await res.arrayBuffer();
                    
                    finalAttachments.push({
                        filename: `${cleanMST}.pdf`,
                        content: Buffer.from(buffer)
                    });
                    pdfAttachedStatus = '✅ Có PDF (Attached success)';
                } catch (err) {
                    pdfAttachedStatus = `⚠ Lỗi tải PDF: ${err.message}`;
                    console.error(`[Worker] [${log.id}] ATTACH FAIL: ${pdfAttachedStatus}`);
                }
            } else {
                pdfAttachedStatus = `⚠ Không tìm thấy link PDF trên Supabase cho MST ${log.customer_id}`;
                console.warn(`[Worker] [${log.id}] ATTACH FAIL: ${pdfAttachedStatus}`);
            }
        } else {
            pdfAttachedStatus = 'Gửi không đính kèm';
        }

        // PHẦN 5: GỬI MAIL + ĐÍNH KÈM PDF (Options cấu hình mail)
        const userFallback = process.env.EMAIL_USER || process.env.SMTP_USER || sender.smtpUser;
        const mailOptions = {
            from: userFallback,
            to: log.email,
            subject: subject,
            html: renderedContent,
            attachments: finalAttachments
        };

        console.log(`[Worker] [${log.id}] CHUẨN BỊ GỬI EMAIL ĐẾN: ${log.email}`);

        // Gửi qua SMTP với Retry mechanism
        const finalMessageId = await sendEmailWithRetry(mailOptions, sender);

        // PHẦN 7: LOG LỖI (Success case - save to db)
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'sent',
            p_sent_time: new Date().toISOString(),
            p_message_id: finalMessageId,
            p_error_message: `Hoàn thành | PDF: ${pdfAttachedStatus}`
        });

        console.log(`[Worker] [${log.id}] ✅ Email sent successfully to ${log.email}`);

        // PHẦN 10: UI FEEDBACK (Cập nhật số đã gửi/thành công vào chiến dịch)
        await supabase.rpc('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[Worker] [${log.id}] ❌ FAIL: ${err.message}`);
        
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'failed',
            p_error_message: `${pdfAttachedStatus} | Lỗi: ${err.message}`,
            p_message_id: null,
            p_sent_time: new Date().toISOString()
        }).catch(() => {});

        // Cập nhật lỗi UI Feedback
        await supabase.rpc('increment_campaign_error', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);
    }
}

async function sendEmailWithRetry(options, senderData, maxRetries = 3) {
    let lastErr = null;
    
    // PHẦN 1: CẤU HÌNH SMTP GMAIL
    // Nếu có process.env thì ghi đè sử dụng cấu hình tập trung an toàn
    const user = process.env.EMAIL_USER || process.env.SMTP_USER || senderData.smtpUser;
    const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS || senderData.smtpPassword;
    
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    let portRaw = parseInt(process.env.SMTP_PORT) || 587;
    let secure = portRaw === 465;

    // FORCE: Gmail on 465 is much more stable on Render/Cloud than 587
    if (host.includes("gmail.com")) {
        console.log("[SMTP] Detect Gmail: Forcing Port 465 SSL for stability on Render.");
        portRaw = 465;
        secure = true;
    }

    const transporter = nodemailer.createTransport({
        host: host,
        port: portRaw,
        secure: secure,
        auth: { user, pass },
        lookup: (hostname, options, callback) => {
            // ÉP BUỘC dùng IPv4 (family: 4) để tránh lỗi ENETUNREACH trên Render (do IPv6 bị chặn)
            dns.lookup(hostname, { family: 4 }, callback);
        },
        connectionTimeout: 15000, // 15s
        socketTimeout: 30000,     // 30s
        greetingTimeout: 15000,   // 15s
    });

    // PHẦN 2: KIỂM TRA KẾT NỐI SMTP
    try {
        console.log(`[SMTP Check] Đang thử kết nối ${host}:${portRaw} (SSL: ${secure})...`);
        await transporter.verify();
        console.log(`[SMTP Check] Kết nối SMTP THÀNH CÔNG cho tài khoản: ${user}`);
    } catch (verifyErr) {
        // Log rõ: auth fail / connection timeout
        console.error(`[SMTP Check] ❌ Lỗi kết nối gửi thư (Auth fail / Connection timeout): ${verifyErr.message}`);
        throw new Error(`SMTP Connection Error: ${verifyErr.message}`);
    }

    // PHẦN 8: RETRY
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const info = await transporter.sendMail(options);
            console.log(`[SMTP Send] ✅ Send result THÀNH CÔNG: MessageId ${info.messageId}`);
            return info.messageId;
        } catch (err) {
            lastErr = err;
            console.error(`[SMTP Send] ❌ [Attempt ${attempt}] Send FAIL: ${err.message}`);
            if (attempt < maxRetries) {
                // Delay 2-5s giữa mỗi lần retry nếu thất bại
                const delay = Math.floor(Math.random() * 3000) + 2000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastErr;
}

async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remainingCount, error: countErr } = await supabase.rpc('get_remaining_tasks_count', { p_campaign_id: campaign_id });
        if (countErr) throw countErr;
        
        if (parseInt(remainingCount) === 0) {
            const { data: campaignData, error: campaignGetErr } = await supabase.rpc('get_campaign_for_worker', { p_campaign_id: campaign_id });
            const campaign = campaignData && campaignData[0];
            const total = (campaign?.recipients || []).length;
            const final = (campaign?.error_count || 0) > 0 ? `Hoàn thành (Lỗi ${campaign.error_count}/${total})` : 'Hoàn thành';
            await supabase.rpc('update_campaign_status_for_worker', {
                p_campaign_id: campaign_id,
                p_status: final
            });
        }
    } catch (e) {}
}

async function startRecoveryWorker() {
    if (isRecoveryRunning) return;
    isRecoveryRunning = true;
    try { await supabase.rpc('recover_failed_tasks'); } catch (err) {} finally { isRecoveryRunning = false; }
}

async function testEmailFlow(targetEmail) {
    console.log(`[E2E TEST] Bắt đầu verify toàn bộ flow gửi cho: ${targetEmail}`);
    
    // 1. Mock Data
    const customer = {
        company_name: 'CÔNG TY TNHH E2E TEST (VERIFIED)',
        mst: '0123456789',
        address: 'Hà Nội, Việt Nam',
        expired_date: '2030-12-31',
        // Dùng 1 public PDF URL cố định để test nếu hệ thống chưa có
        pdf_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    };

    const template = `<h2>Xin chào #TênCôngTy,</h2>
<p>Kính gửi quý khách có MST: <b>#MST</b></p>
<p>Địa chỉ đăng ký: #ĐịaChỉ</p>
<p>Dịch vụ sẽ hết hạn vào ngày: <b>#NgàyHếtHạn</b>.</p>
<p>Đây là email test E2E để xác minh toàn bộ Flow: Email + Replace Tag + Attach PDF đều hoạt động 100%.</p>`;

    const subjectTemplate = `[Test E2E] Thông báo gia hạn cho #TênCôngTy - MST: #MST`;

    console.log(`[E2E TEST] 1. Template trước parse:`, template.substring(0, 50) + "...");

    // 2. Parse Template
    const renderedContent = renderTemplate(template, customer);
    const subject = renderTemplate(subjectTemplate, customer);

    console.log(`[E2E TEST] 2. NỘI DUNG FINAL (đã replace tag):`);
    console.log(`[E2E TEST] Tiêu đề: ${subject}`);
    console.log(`[E2E TEST] Nội dung: ${renderedContent.substring(0, 50)}...`);

    // 3. Attachments
    console.log(`[E2E TEST] 3. Chuẩn bị file đính kèm ảo...`);
    const dummyPDFBuffer = Buffer.from('%PDF-1.4\\n1 0 obj\\n<<\\n/Type /Catalog\\n/Pages 2 0 R\\n>>\\nendobj\\n2 0 obj\\n<<\\n/Type /Pages\\n/Kids [3 0 R]\\n/Count 1\\n>>\\nendobj\\n3 0 obj\\n<<\\n/Type /Page\\n/Parent 2 0 R\\n/MediaBox [0 0 612 792]\\n/Resources <<\\n/Font <<\\n/F1 4 0 R\\n>>\\n>>\\n/Contents 5 0 R\\n>>\\nendobj\\n4 0 obj\\n<<\\n/Type /Font\\n/Subtype /Type1\\n/BaseFont /Helvetica\\n>>\\nendobj\\n5 0 obj\\n<< /Length 44 >>\\nstream\\nBT\\n/F1 24 Tf\\n100 700 Td\\n(Hello, this is a verified PDF attachment!) Tj\\nET\\nendstream\\nendobj\\nxref\\n0 6\\n0000000000 65535 f \\n0000000009 00000 n \\n0000000056 00000 n \\n0000000111 00000 n \\n0000000212 00000 n \\n0000000296 00000 n \\ntrailer\\n<<\\n/Size 6\\n/Root 1 0 R\\n>>\\nstartxref\\n389\\n%%EOF');
    const attachments = [{
        filename: `${customer.mst}_Verified_Cert.pdf`,
        content: dummyPDFBuffer
    }];

    // 4. Send Email
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;

    if (!user || !pass) {
        throw new Error("Không tìm thấy cấu hình SMTP_USER hoặc SMTP_PASS trong .env");
    }

    const mailOptions = {
        from: user,
        to: targetEmail,
        subject: subject,
        html: renderedContent,
        attachments: attachments
    };

    // Override senderData cho hàm sendEmailWithRetry (nó dùng chung)
    const mockSender = { smtpUser: user, smtpPassword: pass };

    console.log(`[E2E TEST] 4. Gửi email qua SMTP...`);
    const messageId = await sendEmailWithRetry(mailOptions, mockSender, 1);

    console.log(`[E2E TEST] ✅ SUCCESS! Email đã được gửi thành công. MessageID: ${messageId}`);
    return {
        success: true,
        messageId: messageId,
        subject_replaced: subject,
        attachment_url: customer.pdf_url
    };
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);
module.exports = { startWorker, processEmailTask, testEmailFlow };
