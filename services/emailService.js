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
        }
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

    for (let i = 0; i < campaign.recipients.length; i++) {
        const recipient = campaign.recipients[i];
        
        // Anti-spam random delay (skip for single email or the first email in a batch to improve speed)
        if (campaign.recipients.length > 1 && i > 0) {
            const delay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Personalized template
        let html = campaign.template || '';
        html = html.replace(/{{TenCongTy}}/g, recipient.TenCongTy || '')
                   .replace(/{{MST}}/g, recipient.MST || '')
                   .replace(/{{DiaChi}}/g, recipient.DiaChi || '')
                   .replace(/{{NgayHetHanChuKySo}}/g, recipient.NgayHetHanChuKySo || '');
        
        // Add Unsubscribe link placeholder
        html += '<br><br><p style="color: gray; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">' +
                'Email này được gửi tự động từ hệ thống Automation CA2. ' +
                'Nếu bạn không muốn nhận email này, vui lòng <a href="#">hủy đăng ký tại đây</a>.</p>';

        // Skip if no valid email address
        const targetEmail = recipient.Email && recipient.Email.trim() !== '' ? recipient.Email : null;
        if (!targetEmail) {
            console.warn(`[EmailService] Bỏ qua khách hàng ${recipient.TenCongTy || recipient.MST} vì không có địa chỉ email.`);
            errorCount++;
            recipient.status = 'Thiếu Email';
            recipient.sentTime = new Date().toISOString();
            
            // Update stats
            campaign.sentCount = i + 1;
            campaign.successCount = success;
            campaign.errorCount = errorCount;
            onUpdate(campaign);
            continue; // Skip trying to send
        }

        // Build mail options
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
                console.log(`[EmailService] 🔍 Tra cứu chứng thư số cho MST: ${recipient.MST}...`);
                certInfo = await scraperService.getLatestCertificate(browser, recipient.MST);
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
            }
        }

        try {
            await transporter.sendMail(mailOptions);
            success++;
            recipient.status = certInfo ? 'Đã gửi (có CTS)' : 'Đã gửi';
        } catch (err) {
            console.error(`Lỗi khi gửi đến ${recipient.Email || recipient.MST}:`, err.message);
            errorCount++;
            recipient.status = 'Thất bại';
        }

        // Clean up downloaded cert after sending
        if (certInfo && certInfo.filePath && fs.existsSync(certInfo.filePath)) {
            try { fs.unlinkSync(certInfo.filePath); } catch (e) { /* ignore */ }
        }

        recipient.sentTime = new Date().toISOString();
        campaign.sentCount = i + 1;
        campaign.successCount = success;
        campaign.errorCount = errorCount;
        
        // Improve status message
        if (i === campaign.recipients.length - 1) {
            if (success === 0 && errorCount > 0) {
                campaign.status = 'Thất bại';
            } else if (errorCount > 0) {
                campaign.status = 'Hoàn thành (có lỗi)';
            } else {
                campaign.status = 'Hoàn thành';
            }
        } else {
            campaign.status = 'Đang gửi';
        }
        
        // Persistence handled by callback
        onUpdate(campaign);
    }

    if (browser) {
        try { await browser.close(); } catch(e) { console.error('Error closing browser:', e); }
    }

    // Cleanup old certs
    if (scraperService) {
        try { scraperService.cleanupCerts(); } catch(e) { /* ignore */ }
    }
}

module.exports = { sendBulkEmails };
