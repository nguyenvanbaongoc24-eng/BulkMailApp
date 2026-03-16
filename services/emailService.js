const nodemailer = require('nodemailer');

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

    for (let i = 0; i < campaign.recipients.length; i++) {
        const recipient = campaign.recipients[i];
        
        // Anti-spam random delay (2-6 seconds)
        const delay = Math.floor(Math.random() * (6000 - 2000 + 1)) + 2000;
        await new Promise(resolve => setTimeout(resolve, delay));

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

        try {
            await transporter.sendMail({
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: recipient.Email || recipient.MST, // Use Email if available, fallback to MST (which will fail but is safer than undefined)
                subject: campaign.subject || `Thông báo từ ${sender.senderName}`,
                html: html
            });
            success++;
            recipient.status = 'Đã gửi';
        } catch (err) {
            console.error(`Lỗi khi gửi đến ${recipient.Email || recipient.MST}:`, err.message);
            errorCount++;
            recipient.status = 'Thất bại';
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
}

module.exports = { sendBulkEmails };
