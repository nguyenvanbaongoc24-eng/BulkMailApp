const nodemailer = require('nodemailer');
const dns = require('dns');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { adminClient: supabase } = require('./supabaseClient');

const WORKER_INTERVAL = 10000; // 10s
const RECOVERY_INTERVAL = 60 * 1000; // 1m (Gần hơn để test)
let isWorkerRunning = false;
let isRecoveryRunning = false;
let lastHeartbeat = null;

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
    lastHeartbeat = new Date().toISOString();
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log(`[Worker] 🛠 Checking for email tasks at ${new Date().toLocaleTimeString()}...`);

    try {
        const { data: tasks, error: pickError } = await supabase.rpc('pick_email_tasks', { batch_size: 10 });
        if (pickError) {
             console.error(`[Worker] RPC pick_email_tasks failed: ${pickError.message}`);
             throw pickError;
        }

        if (!tasks || tasks.length === 0) {
            console.log(`[Worker] No pending tasks.`);
            return;
        }

        console.log(`[Worker] 🚀 RPC returned ${tasks.length} tasks. Processing...`);

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
        console.log(`[Worker] ✅ Batch processed.`);
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
    
    // ==============================================================
    // GIẢI PHÁP DỨT ĐIỂM: KHÔNG DÙNG SMTP NỮA!
    // Render Free Tier CHẶN TOÀN BỘ cổng SMTP (587, 465).
    // Chuyển sang Gmail REST API qua HTTPS (port 443) - KHÔNG BAO GIỜ BỊ CHẶN.
    // ==============================================================
    
    const user = process.env.EMAIL_USER || process.env.SMTP_USER || senderData.smtpUser;
    const refreshToken = senderData.smtpPassword; // OAuth2 refresh_token được lưu trong cột smtpPassword

    console.log(`[Gmail API] Sử dụng Gmail REST API (HTTPS) thay vì SMTP. Tài khoản: ${user}`);

    // Bước 1: Lấy Access Token từ Refresh Token qua Google OAuth2
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    let accessToken;
    try {
        // Timeout 15s cho việc lấy token hòng tránh treo vĩnh viễn
        const tokenRes = await Promise.race([
            oauth2Client.getAccessToken(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout lấy Access Token (15s)')), 15000))
        ]);
        accessToken = tokenRes.token;
        if (!accessToken) throw new Error('Không lấy được access token từ refresh token.');
        console.log(`[Gmail API] ✅ Access Token lấy thành công.`);
    } catch (tokenErr) {
        throw new Error(`OAuth2 Token Error: ${tokenErr.message}. Hãy kết nối lại Gmail OAuth.`);
    }

    // Bước 2: Dùng Nodemailer ở chế độ "stream" để biên soạn email thành chuỗi RFC2822
    // (Không mở kết nối SMTP nào cả!) Thêm buffer: true để message trả về dạng Buffer thay vì Stream
    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const compiled = await compiler.sendMail(options);
    const rawMessage = compiled.message.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    console.log(`[Gmail API] Email đã được biên soạn (RFC2822). Kích thước: ${compiled.message.length} bytes`);

    // Bước 3: Gửi qua Gmail REST API (HTTPS - port 443) với Retry
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Gmail API] [Attempt ${attempt}] Đang gửi qua HTTPS...`);
            
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const result = await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: rawMessage }
            }, { timeout: 30000 }); // 30s timeout cho request Gmail API để tránh treo worker

            if (result.data && result.data.id) {
                console.log(`[Gmail API] ✅ GỬI THÀNH CÔNG! MessageId: ${result.data.id}`);
                return result.data.id;
            }

            throw new Error('Gmail API trả về response không hợp lệ: ' + JSON.stringify(result.data));
        } catch (err) {
            lastErr = err;
            const errMsg = err.response?.data?.error?.message || err.errors?.[0]?.message || err.message;
            console.error(`[Gmail API] ❌ [Attempt ${attempt}] FAIL: ${errMsg}`);

            // Nếu lỗi 401/403 (Auth) thì không cần retry
            if (err.code === 401 || err.code === 403) {
                throw new Error(`Gmail Auth Error (${err.code}): ${errMsg}. Hãy kết nối lại tài khoản Gmail.`);
            }

            if (attempt < maxRetries) {
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
    try { 
        const { error } = await supabase.rpc('recover_failed_tasks'); 
        if (error) console.error(`[Recovery] RPC recover_failed_tasks failed: ${error.message}`);
    } catch (err) {
        console.error(`[Recovery] Critical Error:`, err.message);
    } finally { 
        isRecoveryRunning = false; 
    }
}

async function testEmailFlow(targetEmail) {
    console.log(`[E2E TEST] Bắt đầu verify toàn bộ flow gửi cho: ${targetEmail}`);
    
    // 0. Lấy sender đầu tiên từ DB CÓ chứa refresh_token OAuth2
    const { data: senders, error: sErr } = await supabase
        .from('senders')
        .select('*')
        .eq('smtpHost', 'oauth2.google')
        .order('created_at', { ascending: false })
        .limit(1);

    if (sErr || !senders || senders.length === 0) {
        throw new Error('Không tìm thấy tài khoản gửi Gmail REST API (OAuth2) nào trong DB. Hãy kết nối lại Gmail OAuth tại giao diện web.');
    }
    const sender = senders[0];
    console.log(`[E2E TEST] Sử dụng sender: ${sender.senderEmail || sender.smtpUser}`);

    const customer = {
        company_name: 'CÔNG TY TNHH E2E TEST',
        mst: '0123456789',
        address: 'Hà Nội, Việt Nam',
        expired_date: '2030-12-31'
    };

    const renderedContent = renderTemplate(`<h2>Xin chào #TênCôngTy,</h2><p>MST: <b>#MST</b></p><p>Địa chỉ: #ĐịaChỉ</p><p>Hết hạn: <b>#NgàyHếtHạn</b></p><p>Email test E2E qua Gmail API HTTPS.</p>`, customer);
    const subject = renderTemplate(`[E2E] Thông báo cho #TênCôngTy - MST: #MST`, customer);

    const mailOptions = {
        from: sender.senderEmail || sender.smtpUser,
        to: targetEmail,
        subject: subject,
        html: renderedContent,
        attachments: [{ filename: `${customer.mst}_Cert.pdf`, content: Buffer.from('%PDF-1.0 Test') }]
    };

    console.log(`[E2E TEST] Gửi qua Gmail REST API (HTTPS)...`);
    const messageId = await sendEmailWithRetry(mailOptions, sender, 1);

    return {
        success: true,
        method: 'Gmail REST API (HTTPS)',
        messageId: messageId,
        subject_replaced: subject,
        sender_used: sender.senderEmail || sender.smtpUser
    };
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);
module.exports = { 
    startWorker, 
    processEmailTask, 
    testEmailFlow, 
    getHeartbeat: () => lastHeartbeat 
};
