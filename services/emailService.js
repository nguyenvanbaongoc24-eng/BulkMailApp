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
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        host: sender.smtpHost,
        port: parseInt(sender.smtpPort),
        secure: sender.smtpPort == 465,
        auth: {
            user: sender.smtpUser,
            pass: sender.smtpPassword
        },
        tls: { rejectUnauthorized: false }, // Avoid SSL issues with SMTP
        connectionTimeout: 120000,
        greetingTimeout: 120000,
        socketTimeout: 120000,
        debug: true // Enable for troubleshooting
    });

    let success = 0;
    let errorCount = 0;
    const attachCert = campaign.attachCert || false;
    const totalRecipients = campaign.recipients.length;

            // --- PHASE 1: PRE-SCRAPE ALL CERTIFICATES ---
            const certMap = new Map(); // MST -> certInfo
            if (attachCert && scraperService) {
                try {
                    console.log(`[EmailService] --- GIAI ĐOẠN 1: TRA CỨU CHỨNG THƯ & XÁC THỰC SERIAL ---`);
                    const browser = await scraperService.initBrowser();
                    
                    // User requested: Avoid multiple parallel requests
                    const SCRAPE_CONCURRENCY = 1; 
                    for (let i = 0; i < totalRecipients; i += SCRAPE_CONCURRENCY) {
                        const chunk = campaign.recipients.slice(i, i + SCRAPE_CONCURRENCY);
                        await Promise.all(chunk.map(async (recipient) => {
                            if (!recipient.MST) return;
                            try {
                                console.log(`[EmailService] 🔍 Đang tra cứu cho MST: ${recipient.MST} (Serial Excel: ${recipient.Serial || 'N/A'})...`);
                                let info = await scraperService.getLatestCertificate(browser, recipient.MST, recipient.Serial, recipient);
                                
                                if (info && info.status === 'Matched') {
                                    certMap.set(recipient.MST, info);
                                    recipient.status = '✔ Khớp - Đã tải';
                                } else if (info && info.status === 'Not Matched') {
                                    recipient.status = '✖ Không khớp - Bỏ qua';
                                } else {
                                    recipient.status = 'Không tìm thấy';
                                }
                            } catch (e) {
                                console.error(`[EmailService] Lỗi scraper cho ${recipient.MST}:`, e.message);
                                recipient.status = 'Lỗi Scraper';
                            }
                        }));
                        // User requested: 2-3s delay between requests
                        if (i + SCRAPE_CONCURRENCY < totalRecipients) {
                            await new Promise(r => setTimeout(r, 3000));
                        }
                    }
                    
                    await browser.close().catch(() => {});
                    console.log(`[EmailService] --- GIAI ĐOẠN 1 HOÀN TẤT: Đã tải ${certMap.size} file hợp lệ ---`);
                } catch (e) {
                    console.error('[EmailService] Lỗi giai đoạn tra cứu:', e.message);
                }
            }

    // --- PHASE 2: SEND ALL EMAILS ---
    console.log(`[EmailService] --- GIAI ĐOẠN 2: TIẾN HÀNH GỬI MAIL ---`);
    
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

    const SEND_CONCURRENCY = 3;
    for (let i = 0; i < totalRecipients; i += SEND_CONCURRENCY) {
        const chunk = campaign.recipients.slice(i, i + SEND_CONCURRENCY);
        await Promise.all(chunk.map(async (recipient) => {
            // Personalized template
            let html = campaign.template || '';
            html = html.replace(/{{TenCongTy}}/g, recipient.TenCongTy || '')
                       .replace(/{{MST}}/g, recipient.MST || '')
                       .replace(/{{DiaChi}}/g, recipient.DiaChi || '')
                       .replace(/{{NgayHetHanChuKySo}}/g, recipient.NgayHetHanChuKySo || '');
            
            html += '<br><br><p style="color: gray; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">' +
                    'Email này được gửi tự động từ hệ thống Automation CA2.</p>';

            const targetEmail = recipient.Email && recipient.Email.trim() !== '' ? recipient.Email : null;
            if (!targetEmail) {
                recipient.status = 'Thiếu Email';
                errorCount++;
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

            const certInfo = certMap.get(recipient.MST);
            if (certInfo && fs.existsSync(certInfo.filePath)) {
                mailOptions.attachments.push({ filename: certInfo.fileName, path: certInfo.filePath });
                console.log(`[EmailService] 📎 Đính kèm PDF cho MST ${recipient.MST}`);
            }

            try {
                console.log(`[EmailService] 📤 Đang gửi tới: ${targetEmail}...`);
                await transporter.sendMail(mailOptions);
                success++;
                recipient.status = certInfo ? 'Đã gửi (có CTS)' : 'Đã gửi';
                console.log(`[EmailService] ✅ Thành công: ${targetEmail}`);
            } catch (err) {
                console.error(`[EmailService] ❌ Lỗi SMTP (${targetEmail}):`, err.message);
                errorCount++;
                recipient.status = `Thất bại: ${err.message}`;
            }

            // Cleanup cert file/folder after sending
            if (certInfo && certInfo.dirPath) {
                setTimeout(() => {
                    try { fs.rmSync(certInfo.dirPath, { recursive: true, force: true }); } catch(e) {}
                }, 15000);
            }

            recipient.sentTime = new Date().toISOString();
            updateProgress();
        }));
        
        if (i + SEND_CONCURRENCY < totalRecipients) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (scraperService) {
        try { scraperService.cleanupCerts(); } catch(e) {}
    }
}

module.exports = { sendBulkEmails };
