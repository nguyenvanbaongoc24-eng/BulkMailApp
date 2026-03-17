const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let scraperService = null;
try {
    scraperService = require('./scraperService');
} catch (e) {
    console.warn('[EmailService] scraperService not available:', e.message);
}

async function sendBulkEmails(campaign, sender, onUpdate) {
    const transporter = nodemailer.createTransport({
        host: sender.smtpHost,
        port: parseInt(sender.smtpPort),
        secure: sender.smtpPort == 465,
        auth: {
            user: sender.smtpUser,
            pass: sender.smtpPassword
        },
        connectionTimeout: 60000, // 60s
        greetingTimeout: 60000,
        socketTimeout: 60000
    });

    let success = 0;
    let errorCount = 0;
    const attachCert = campaign.attachCert || false;

    let browser = null;
    if (attachCert && scraperService) {
        try {
            console.log(`[EmailService] Khởi tạo trình duyệt cho campaign (tiết kiệm thời gian)...`);
            browser = await scraperService.initBrowser();
        } catch (e) {
            console.error('[EmailService] Lỗi khởi tạo trình duyệt:', e.message);
        }
    }

    const CONCURRENCY_LIMIT = 5; // Optimized for maximum speed
    const totalRecipients = campaign.recipients.length;

    async function processRecipient(recipient, index, retryCount = 0) {
        // Personalized template
        let html = campaign.template || '';
        html = html.replace(/{{TenCongTy}}/g, recipient.TenCongTy || '')
                   .replace(/{{MST}}/g, recipient.MST || '')
                   .replace(/{{DiaChi}}/g, recipient.DiaChi || '')
                   .replace(/{{NgayHetHanChuKySo}}/g, recipient.NgayHetHanChuKySo || '');
        
        html += '<br><br><p style="color: gray; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">' +
                'Email này được gửi tự động từ hệ thống Automation CA2. ' +
                'Nếu bạn không muốn nhận email này, vui lòng <a href="#">hủy đăng ký tại đây</a>.</p>';

        const targetEmail = recipient.Email && recipient.Email.trim() !== '' ? recipient.Email : null;
        if (!targetEmail) {
            console.warn(`[EmailService] Bỏ qua khách hàng ${recipient.TenCongTy || recipient.MST} vì không có địa chỉ email.`);
            errorCount++;
            recipient.status = 'Thiếu Email';
            recipient.sentTime = new Date().toISOString();
            updateProgress();
            return;
        }

        const mailOptions = {
            from: `"${sender.senderName}" <${sender.senderEmail}>`,
            to: targetEmail,
            subject: campaign.subject || `Thông báo từ ${sender.senderName}`,
            html: html,
            attachments: []
        };

        let certInfo = null;
        if (attachCert && scraperService && browser && recipient.MST) {
            try {
                console.log(`[EmailService] 🔍 Tra cứu chứng thư số cho MST: ${recipient.MST} (Lần ${retryCount + 1})...`);
                certInfo = await scraperService.getLatestCertificate(browser, recipient.MST);
                
                // Retry logic if scraper fails
                if (!certInfo && retryCount < 1) {
                    console.log(`[EmailService] 🔄 Thử lại tra cứu cho MST: ${recipient.MST}...`);
                    return await processRecipient(recipient, index, retryCount + 1);
                }

                if (certInfo && certInfo.filePath && fs.existsSync(certInfo.filePath)) {
                    mailOptions.attachments.push({
                        filename: certInfo.fileName,
                        path: certInfo.filePath
                    });
                    console.log(`[EmailService] 📎 Đính kèm chứng thư: ${certInfo.fileName}`);
                } else {
                    console.log(`[EmailService] ⚠️ Không tìm thấy chứng thư cho MST: ${recipient.MST}`);
                }
            } catch (scrapeErr) {
                console.error(`[EmailService] Scraper error for MST ${recipient.MST}:`, scrapeErr.message);
                if (retryCount < 1) return await processRecipient(recipient, index, retryCount + 1);
            }
        }

        try {
            console.log(`[EmailService] 📤 Đang gửi tới: ${targetEmail}...`);
            await transporter.sendMail(mailOptions);
            success++;
            recipient.status = certInfo ? 'Đã gửi (có CTS)' : 'Đã gửi';
            console.log(`[EmailService] ✅ Gửi thành công tới: ${targetEmail}`);
        } catch (err) {
            console.error(`[EmailService] ❌ Lỗi SMTP khi gửi đến ${targetEmail}:`, {
                message: err.message,
                code: err.code
            });
            errorCount++;
            recipient.status = `Thất bại: ${err.message}`;
        }

        // Small delay to ensure nodemailer has fully closed the file handle before cleanup
        if (certInfo && certInfo.dirPath && fs.existsSync(certInfo.dirPath)) {
            setTimeout(() => {
                try { 
                    if (certInfo.filePath && fs.existsSync(certInfo.filePath)) {
                        fs.unlinkSync(certInfo.filePath);
                    }
                    fs.rmSync(certInfo.dirPath, { recursive: true, force: true }); 
                } catch (e) {
                    console.error(`[EmailService] Cleanup error for ${recipient.MST}:`, e.message);
                }
            }, 10000); // 10s delay to be safe
        }

        recipient.sentTime = new Date().toISOString();
        updateProgress();
    }

    function updateProgress() {
        const processedCount = campaign.recipients.filter(r => r.status !== 'Chưa gửi').length;
        campaign.sentCount = processedCount;
        campaign.successCount = success;
        campaign.errorCount = errorCount;
        
        if (processedCount === totalRecipients) {
            campaign.status = success > 0 ? (errorCount > 0 ? 'Hoàn thành (có lỗi)' : 'Hoàn thành') : 'Thất bại';
        } else {
            campaign.status = 'Đang gửi';
        }
        onUpdate(campaign);
    }

    // Parallel execution with limit
    for (let i = 0; i < totalRecipients; i += CONCURRENCY_LIMIT) {
        const chunk = campaign.recipients.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(chunk.map((recipient, index) => processRecipient(recipient, i + index)));
        
        // Small delay between chunks to avoid SMTP server rate limits
        if (i + CONCURRENCY_LIMIT < totalRecipients) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (browser) {
        try { await browser.close(); } catch(e) { console.error('[EmailService] Error closing browser:', e); }
    }

    if (scraperService) {
        try { scraperService.cleanupCerts(); } catch(e) { /* ignore */ }
    }
}

module.exports = { sendBulkEmails };
