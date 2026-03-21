const nodemailer = require('nodemailer');
const { adminClient: supabase } = require('./supabaseClient');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// -----------------------------------
// 1. TẠO LOGIC LẤY SMTP TỪ SUPABASE SENDERS
// -----------------------------------
async function createTransporter(sender) {
    if (!sender || !sender.smtpUser || !sender.smtpPassword || !sender.smtpHost) {
        throw new Error("Missing SMTP config (Sender không hợp lệ hoặc thiếu thông tin cấu hình)");
    }

    const host = sender.smtpHost;
    const port = parseInt(sender.smtpPort || "587", 10);
    const user = sender.smtpUser;
    const pass = sender.smtpPassword;
    const senderName = sender.senderName || "Automation CA2";

    console.log(`\n[EmailService] SMTP đang dùng: ${user} (Thuộc người gửi: ${senderName})`);

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });

    // BẮT BUỘC verify trước khi chuẩn bị gửi
    try {
        await transporter.verify();
        console.log(`[EmailService] SMTP connect OK (Verified) cho ${user}`);
        return { transporter, fromEmail: user, senderName };
    } catch(err) {
        console.error(`[EmailService] SMTP connect FAIL (${user}) | Lỗi chi tiết:`, err.message);
        throw new Error(`SMTP FAIL: ${err.message}`);
    }
}

// -----------------------------------
// 2. FIX TEMPLATE TAG VÀ XỬ LÝ SÓT TAG
// -----------------------------------
function parseTemplateAndCheckTags(template, data, isAttachMode) {
    if (!template) return { html: "", missingTags: [] };

    console.log(`[EmailService] Đang parse template (Trước):`, template.substring(0, 50) + "...");
    
    // Replace đúng dữ liệu
    let parsedHTML = template
        .replace(/#TênCôngTy/g, data.company_name || "")
        .replace(/#MST/g, data.mst || "")
        .replace(/#ĐịaChỉ/g, data.address || "")
        .replace(/#NgàyHếtHạn/g, data.expired_date || "");

    console.log(`[EmailService] Đã parse template (Sau):`, parsedHTML.substring(0, 50) + "...");

    // Tìm các tag còn sót lại (Bắt đầu bằng # và theo sau là chữ)
    const unmatched = parsedHTML.match(/#[A-Za-zÀ-ỹ0-9_]+/g);
    let missingTags = [];
    
    if (unmatched && unmatched.length > 0) {
        // Lọc các tag như màu sắc (#fff) ra ngoài (Chỉ coi các tag chữ tiếng Việt là tag mẫu)
        missingTags = unmatched.filter(tag => tag.length > 4 && !(/^#[0-9A-Fa-f]{3,6}$/.test(tag)));
        
        if (missingTags.length > 0) {
            console.warn(`[EmailService] WARNING: Còn sót các tag chưa được thay thế: ${missingTags.join(', ')}`);
            // Yêu cầu: KHÔNG được gửi nếu attachCertificate = TRUE 
            if (isAttachMode) {
                throw new Error(`Template còn sót tag chưa thay thế: ${missingTags.join(', ')}. Không thể gửi khi đang bật chế độ đính kèm.`);
            }
        }
    }

    return { html: parsedHTML, missingTags };
}

// -----------------------------------
// 3. GỬI MAIL CHUẨN + ĐÍNH KÈM THEO LOGIC MỚI
// -----------------------------------
async function sendEmail({ transporter, from, to, subject, html, pdf_url, isAttachMode }) {
    console.log(`[EmailService] Chi tiết luồng gửi email tới: ${to}`);

    const attachments = [];

    // Kiểm tra Attach mode
    if (isAttachMode) {
        console.log(`[EmailService] ATTACHMENT ON`);
        if (!pdf_url) {
            console.error(`[EmailService] Lỗi: Bật attachCertificate nhưng thiếu URL PDF`);
            throw new Error("Missing PDF attachment (Bật đính kèm nhưng không tìm thấy file PDF hợp lệ)");
        }
        
        attachments.push({
            filename: `ChungNhan_${subject.replace(/[^a-zA-Z0-9]/g, '_') || "CA2"}.pdf`,
            path: pdf_url
        });
        console.log(`[EmailService] File được attach: ${pdf_url}`);
    } else {
        console.log(`[EmailService] ATTACHMENT OFF (Gửi mail thường)`);
    }

    // Call gửi
    const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        attachments
    });

    console.log(`[EmailService] Response từ Gmail/SMTP - Success! messageId=${info.messageId}`);
    return info;
}


// -----------------------------------
// 4. FLOW CHUẨN (XỬ LÝ WORKER TỰ ĐỘNG)
// -----------------------------------
const WORKER_INTERVAL = 10000;
let isWorkerRunning = false;

const supabaseRPC = async (name, params) => {
    return Promise.race([
        supabase.rpc(name, params),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Supabase RPC ${name} Timeout`)), 15000))
    ]);
};

async function processEmailTask(log) {
    try {
        await supabaseRPC('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'processing',
            p_error_message: null,
            p_message_id: null,
            p_sent_time: null
        }).catch(() => {});
        
        // 4. Máy chủ Lấy Campaign, Customer, Sender
        const { data: campaignData } = await supabaseRPC('get_campaign_for_worker', { p_campaign_id: log.campaign_id });
        const campaign = campaignData && campaignData[0];
        if (!campaign) throw new Error('Dữ liệu Campaign trống rỗng');

        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode || '').trim() === cleanMST);
        const { data: customerData } = await supabaseRPC('get_customer_for_worker', { p_mst: cleanMST });
        const customer = customerData && customerData[0] || {};

        const { data: senderData } = await supabaseRPC('get_sender_for_worker', { p_sender_id: campaign.sender_account_id || campaign.senderAccountId });
        const senderPayload = senderData && senderData[0];
        if (!senderPayload) throw new Error(`Không tìm thấy Sender ID ${campaign.sender_account_id || 'Unknown'}`);

        // Lấy điều kiện đính kèm
        const attachCertificate = campaign.attach_cert === true || campaign.attach_cert === 'true' || campaign.attachCert === true || campaign.attachCert === 'true';

        // 3. Parse Template & Validate: Bắt buộc Check Sot Tag
        const dataForTags = {
            company_name: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || customer.company_name || 'Quý khách',
            mst: recipientInExcel?.MST || recipientInExcel?.taxCode || customer.mst || cleanMST,
            address: recipientInExcel?.DiaChi || recipientInExcel?.['Địa chỉ'] || customer.dia_chi || '',
            expired_date: recipientInExcel?.NgayHetHanChuKySo || recipientInExcel?.['Ngày hết hạn'] || customer.expired_date || ''
        };

        // Hàm này tự ném lỗi nếu tag lỗi + attachCertificate = true
        const parsedSubject = parseTemplateAndCheckTags(campaign.subject || 'Thông báo tự động', dataForTags, attachCertificate);
        const parsedBody = parseTemplateAndCheckTags(campaign.template || '', dataForTags, attachCertificate);

        // 1 & 2. Khởi tạo trực tiếp Transporter, Check Verify
        const { transporter, fromEmail, senderName } = await createTransporter(senderPayload);

        // ==========================================
        // AUTO RETRY
        // ==========================================
        let successInfo = null;
        let lastError = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                successInfo = await sendEmail({
                    transporter,
                    from: `"${senderName}" <${fromEmail}>`,
                    to: log.email,
                    subject: parsedSubject.html,
                    html: parsedBody.html,
                    pdf_url: customer.pdf_url, // Lấy từ DB
                    isAttachMode: attachCertificate
                });
                break; // Thoát nếu OK
            } catch (e) {
                lastError = e;
                console.error(`[EmailService] Retry (Lần thử ${attempt}/3) FAIL:`, e.message);
                if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!successInfo) throw lastError;

        await supabaseRPC('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'success',
            p_message_id: successInfo.messageId,
            p_sent_time: new Date().toISOString(),
            p_error_message: 'Hoàn thành'
        });
        await supabaseRPC('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[EmailService] FATAL ERROR khi xử lý:`, err.message);
        
        await supabaseRPC('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'failed',
            p_error_message: `Lỗi: ${err.message}`, // Bắt cứng ném nguyên String lỗi ra ngoài (No Silent Fail)
            p_message_id: null,
            p_sent_time: new Date().toISOString()
        });
        await supabaseRPC('increment_campaign_error', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);
    }
}

async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remainingCount } = await supabaseRPC('get_remaining_tasks_count', { p_campaign_id: campaign_id });
        if (parseInt(remainingCount) === 0) {
            const { data: campaignData } = await supabaseRPC('get_campaign_for_worker', { p_campaign_id: campaign_id });
            const campaign = campaignData && campaignData[0];
            const total = (campaign?.recipients || []).length;
            const final = (campaign?.error_count || 0) > 0 ? `Hoàn thành (Lỗi ${campaign.error_count}/${total})` : 'Hoàn thành';
            await supabaseRPC('update_campaign_status_for_worker', { p_campaign_id: campaign_id, p_status: final });
        }
    } catch (e) {}
}

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    try {
        const { data: tasks, error: pickError } = await supabaseRPC('pick_email_tasks', { batch_size: 10 });
        if (pickError) throw pickError;
        if (!tasks || tasks.length === 0) return;

        for (const log of tasks) {
            await new Promise(r => setTimeout(r, 2000));
            await processEmailTask(log);
        }
    } catch (err) { } finally { isWorkerRunning = false; }
}

async function recoverFailedTasks() {
    try { await supabaseRPC('recover_failed_tasks'); } catch(e) {}
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(recoverFailedTasks, 60 * 1000);

// -----------------------------------
// 5. TEST BẮT BUỘC 3 CASES 
// -----------------------------------
async function testEmailFlow(targetEmail, forcedSenderId = null, testCase = 1) {
    console.log(`\n\n=== RUNNING E2E TEST: CASE ${testCase} ===`);
    
    // Fallback thử nghiệm (dùng .env nếu DB trống, để code tự test nội bộ k bị đổ gãy)
    const fallbackSender = {
        smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
        smtpPort: process.env.SMTP_PORT || "587",
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASS,
        senderName: "System Auto Test"
    };

    let sender;
    if (forcedSenderId) {
        const { data: s } = await supabase.from('senders').select('*').eq('id', forcedSenderId).limit(1);
        sender = (s && s[0]) || fallbackSender;
    } else {
        const { data: senders } = await supabase.from('senders').select('*').order('created_at', { ascending: false }).limit(1);
        sender = (senders && senders[0]) || fallbackSender;
    }

    const { transporter, fromEmail, senderName } = await createTransporter(sender);

    // Mock Payload
    const dataForTags = {
        company_name: "TẬP ĐOÀN CA2 TEST_COMPANY",
        mst: "010101010",
        address: "HN VN",
        expired_date: "12/12/2030"
    };

    let rawTemplate = `Xin chào #TênCôngTy, Mã số thuế của ngài là #MST.</p>`;
    let attachCertificate = false;
    let mockPdfUrl = null;

    if (testCase === 1) {
        // CASE 1: attachCertificate = FALSE -> gửi mail thành công, không PDF
        attachCertificate = false;
        mockPdfUrl = null; 
    } 
    else if (testCase === 2) {
        // CASE 2: attachCertificate = TRUE + có PDF -> gửi thành công + có đính kèm
        attachCertificate = true;
        mockPdfUrl = "https://media.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    }
    else if (testCase === 3) {
        // CASE 3: attachCertificate = TRUE + KHÔNG có PDF -> FAIL + BÁO LỖI
        attachCertificate = true;
        mockPdfUrl = null;
    }
    else if (testCase === 4) {
        // BONUS CASE: attachCertificate = TRUE + Có SÓT TAG LỖI -> FAIL + BÁO LỖI
        attachCertificate = true;
        mockPdfUrl = "https://media.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
        rawTemplate = `Xin chào #TênCôngTy, mã là #MST. Các biến lỗi: #LoiNghiemTrongChuaThayThe`;
    }

    // Tiến hành Render
    const parsedBody = parseTemplateAndCheckTags(rawTemplate, dataForTags, attachCertificate);

    // Gọi lệnh gửi (Nếu thiếu file PDF sẽ throw Error)
    try {
        const info = await sendEmail({
            transporter,
            from: `"[TEST V${testCase}] ${senderName}" <${fromEmail}>`,
            to: targetEmail,
            subject: `Test CA2 - Case ${testCase}`,
            html: parsedBody.html,
            pdf_url: mockPdfUrl,
            isAttachMode: attachCertificate
        });
        console.log(`\n✅ TEST CASE ${testCase} XONG - SUCCESS!`);
        return { success: true, messageId: info.messageId, html: parsedBody.html, sent_via: fromEmail, case: testCase };
    } catch(err) {
        console.error(`\n❌ TEST CASE ${testCase} XONG - THẤT BẠI CÓ CHỦ ĐÍCH:`, err.message);
        throw err; // BẮT BUỘC RƠI LỖI LÊN - KHÔNG SILENT FAIL
    }
}

module.exports = { 
    startWorker, 
    processEmailTask, 
    testEmailFlow,
    createTransporter,
    parseTemplateAndCheckTags,
    sendEmail
};
