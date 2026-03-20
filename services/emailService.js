const nodemailer = require('nodemailer');
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

function renderTemplate(template, customer) {
  if (!template) return "";
  return template
    .replaceAll("#TênCôngTy", customer.company_name || "")
    .replaceAll("#MST", customer.mst || "")
    .replaceAll("#ĐịaChỉ", customer.address || "")
    .replaceAll("#NgàyHếtHạn", formatDate(customer.expired_date));
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
                    p_error_message: `Unhandled Error: ${taskErr.message}`
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
            p_error_message: 'Đang chuẩn bị nội dung...'
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

        // Lấy sender details
        const { data: senderData, error: senderError } = await supabase.rpc('get_sender_for_worker', { p_sender_id: campaign.sender_account_id || campaign.senderAccountId });
        const sender = senderData && senderData[0];
        if (senderError || !sender) throw new Error('Tài khoản người gửi không tồn tại hoặc không thể truy cập.');

        if (!validateEmail(log.email)) {
            throw new Error(`Email không hợp lệ: ${log.email}`);
        }

        // PHẦN 4: LẤY FILE PDF TỪ SUPABASE
        let buffer = null;
        if (customer?.pdf_url && shouldAttach) {
            try {
                // Fetch direct via public URL
                const res = await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(customer.pdf_url);
                buffer = await res.arrayBuffer();
                console.log(`[Worker] [${log.id}] Attached PDF successfully via public URL.`);
            } catch (err) {
                console.error(`[Worker] [${log.id}] PDF attachment fetch failed:`, err.message);
                pdfAttachedStatus += ` (Lỗi tải PDF: ${err.message})`;
            }
        }

        // PHẦN 5: GỬI MAIL + ĐÍNH KÈM PDF (Options cấu hình mail)
        const mailOptions = {
            from: process.env.EMAIL_USER || sender.smtpUser,
            to: log.email,
            subject: subject,
            html: renderedContent,
            attachments: buffer ? [
                {
                    filename: `${cleanMST}.pdf`,
                    content: Buffer.from(buffer)
                }
            ] : []
        };

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
        
        // PHẦN 7: LOG LỖI (Fail case - save to db)
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'failed',
            p_error_message: `${pdfAttachedStatus} | Lỗi: ${err.message}`,
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
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER || senderData.smtpUser,
            pass: process.env.EMAIL_PASS || senderData.smtpPassword
        }
    });

    // PHẦN 2: KIỂM TRA KẾT NỐI SMTP
    try {
        await transporter.verify();
    } catch (verifyErr) {
        // Log rõ: auth fail / connection timeout
        console.error("[SMTP Check] Lỗi kết nối gửi thư: Auth fail hoặc Connection timeout:", verifyErr.message);
        throw new Error(`SMTP Connection Error: ${verifyErr.message}`);
    }

    // PHẦN 8: RETRY
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const info = await transporter.sendMail(options);
            return info.messageId;
        } catch (err) {
            lastErr = err;
            console.error(`[Attempt ${attempt}] Send failed: ${err.message}`);
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

setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);
module.exports = { startWorker, processEmailTask };
