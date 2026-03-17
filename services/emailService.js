const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

let scraperService = null;
try {
    scraperService = require('./scraperService');
} catch (e) {
    console.warn('[EmailService] scraperService not available:', e.message);
}

/**
 * Resolves an SMTP hostname to its IPv4 address.
 * This avoids IPv6 ENETUNREACH errors on hosts that don't support IPv6 routing
 * (e.g., Render.com free tier).
 */
async function resolveToIPv4(hostname) {
    try {
        // If already an IP address, return as-is
        const net = require('net');
        if (net.isIP(hostname)) {
            return hostname;
        }
        const addresses = await dns.resolve4(hostname);
        if (addresses && addresses.length > 0) {
            console.log(`[EmailService] ✅ Resolved ${hostname} -> ${addresses[0]} (IPv4)`);
            return addresses[0];
        }
    } catch (err) {
        console.warn(`[EmailService] ⚠️ IPv4 DNS resolution failed for ${hostname}: ${err.message}, using hostname as fallback`);
    }
    return hostname; // fallback to original hostname
}

/**
 * Sends a single email with retry logic.
 * Retries up to maxRetries times on transient SMTP errors.
 */
async function sendWithRetry(transporter, mailOptions, maxRetries = 2) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } catch (err) {
            lastError = err;
            const isTransient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN'].some(code => 
                err.message.includes(code) || err.code === code
            ) || err.message.includes('Connection timeout');
            
            if (isTransient && attempt <= maxRetries) {
                const delay = attempt * 3000; // progressive backoff: 3s, 6s
                console.log(`[EmailService] ⏳ Retry ${attempt}/${maxRetries} for ${mailOptions.to} in ${delay/1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw lastError;
            }
        }
    }
    throw lastError;
}

/**
 * Sends bulk emails for a campaign.
 * Phase 1: Scrape certificates if required.
 * Phase 2: Send emails via SMTP.
 */
async function sendBulkEmails(campaign, sender, onUpdate) {
    let success = 0;
    let errorCount = 0;
    const totalRecipients = campaign.recipients.length;

    function updateProgress() {
        const processedCount = campaign.recipients.filter(r => r.status && r.status !== 'Chưa gửi').length;
        campaign.sentCount = processedCount;
        campaign.successCount = success;
        campaign.errorCount = errorCount;
        
        if (processedCount === totalRecipients) {
            campaign.status = success > 0 ? (errorCount > 0 ? 'Hoàn thành (có lỗi)' : 'Hoàn thành') : 'Thất bại';
        } else {
            campaign.status = 'Đang gửi';
        }
        if (onUpdate) onUpdate(campaign);
    }

    try {
        let transporter;
        let isGoogleHttpApi = false;
        let gmailClient = null;

        if (sender.smtpHost === 'oauth2.google') {
            isGoogleHttpApi = true;
            if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
                throw new Error("Hệ thống chưa được cấu hình Google API (Thiếu Client ID/Secret).");
            }
            if (!sender.smtpPassword || sender.smtpPassword.length < 10) {
                throw new Error("Tài khoản gửi chưa được cấp phép đẩy đủ (Thiếu Refresh Token). Hãy xóa tài khoản và kết nối lại Gmail.");
            }
            
            const { google } = require('googleapis');
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
            gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
            
            // We still create a Nodemailer transporter to help compile the MIME message easily before passing it to Google API
            transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });
        } else {
            // ... non OAuth logic
            const resolvedHost = await resolveToIPv4(sender.smtpHost);
            transporter = nodemailer.createTransport({
                pool: false,
                host: resolvedHost,
                port: parseInt(sender.smtpPort),
                secure: sender.smtpPort == 465,
                auth: {
                    user: sender.smtpUser,
                    pass: sender.smtpPassword
                },
                tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2', servername: sender.smtpHost },
                connectionTimeout: 60000, greetingTimeout: 60000, socketTimeout: 60000, logger: true, debug: true
            });
        }

        const attachCert = campaign.attachCert || false;

    // --- PHASE 1: CERTIFICATE SCRAPING & SERIAL VALIDATION ---
    const certMap = new Map(); 
    let phase1FatalError = null;

    if (attachCert && scraperService) {
        try {
            console.log(`[EmailService] --- PHASE 1: SEARCHING & VALIDATING SERIAL ---`);
            const browser = await scraperService.initBrowser();
            
            for (let i = 0; i < totalRecipients; i++) {
                const recipient = campaign.recipients[i];
                if (!recipient.MST) continue;

                try {
                    console.log(`[EmailService] 🔍 (${i+1}/${totalRecipients}) Tra cứu MST: ${recipient.MST} (Serial: ${recipient.Serial || 'N/A'})...`);
                    let info = await scraperService.getLatestCertificate(browser, recipient.MST, recipient.Serial, recipient);
                    
                    if (info && info.status === 'Matched') {
                        certMap.set(recipient.MST, info);
                        recipient.status = '✔ Khớp - Đã tải';
                    } else if (info && info.status === 'Not Matched') {
                        recipient.status = '✖ Không khớp - Bỏ qua';
                    } else {
                        recipient.status = 'Không tìm thấy CTS';
                    }
                } catch (e) {
                    console.error(`[EmailService] Scraper error for ${recipient.MST}:`, e.message);
                    recipient.status = 'Lỗi tải CTS';
                }
                
                // Rate limiting delay (3s as requested)
                if (i < totalRecipients - 1) await new Promise(r => setTimeout(r, 3000));
            }
            
            await browser.close().catch(() => {});
            console.log(`[EmailService] --- PHASE 1 COMPLETE: Downloaded ${certMap.size} files ---`);
        } catch (e) {
            phase1FatalError = e.message;
            console.error('[EmailService] Serious phase 1 error:', e.message);
            campaign.errorLogs = campaign.errorLogs ? campaign.errorLogs + '\nPhase 1 Lỗi: ' + e.message : 'Phase 1 Lỗi: ' + e.message;
        }
    }

    // --- PHASE 2: SMTP DELIVERY ---
    console.log(`[EmailService] --- PHASE 2: SENDING EMAILS ---`);
    
    // Process sequentially or in very small chunks for reliability
    const SEND_CONCURRENCY = 1; 
    for (let i = 0; i < totalRecipients; i += SEND_CONCURRENCY) {
        const chunk = campaign.recipients.slice(i, i + SEND_CONCURRENCY);
        
        await Promise.all(chunk.map(async (recipient) => {
            // Skip if serial mismatch
            if (recipient.status === '✖ Không khớp - Bỏ qua') {
                errorCount++;
                updateProgress();
                return;
            }

            const targetEmail = (recipient.Email || '').trim();
            if (!targetEmail) {
                recipient.status = 'Thiếu Email';
                errorCount++;
                updateProgress();
                return;
            }

            // Replace template placeholders
            let html = campaign.template || '';
            html = html.replace(/{{TenCongTy}}/g, recipient.TenCongTy || '')
                       .replace(/{{MST}}/g, recipient.MST || '')
                       .replace(/{{DiaChi}}/g, recipient.DiaChi || '')
                       .replace(/{{NgayHetHanChuKySo}}/g, recipient.NgayHetHanChuKySo || '');
            
            html += '<br><br><p style="color: gray; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">' +
                    'Email này được gửi tự động từ hệ thống Automation CA2.</p>';

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: targetEmail,
                subject: campaign.subject || `Thông báo từ ${sender.senderName}`,
                html: html,
                attachments: []
            };

            const certInfo = certMap.get(recipient.MST);
            if (certInfo && fs.existsSync(certInfo.filePath)) {
                mailOptions.attachments.push({
                    filename: certInfo.fileName,
                    path: certInfo.filePath
                });
                console.log(`[EmailService] 📎 Attaching PDF for: ${recipient.MST}`);
            }

            try {
                console.log(`[EmailService] 📤 Sending to: ${targetEmail}...`);
                
                if (isGoogleHttpApi) {
                    // 1. Compile email to RFC822 using local stream transporter
                    const info = await transporter.sendMail(mailOptions);
                    
                    // 2. Read stream to buffer
                    const chunks = [];
                    for await (const chunk of info.message) {
                        chunks.push(chunk);
                    }
                    const messageBuffer = Buffer.concat(chunks);
                    
                    // 3. Convert to base64url format required by Gmail API
                    const base64EncodedEmail = messageBuffer.toString('base64')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                    
                    // 4. Send via HTTP API (Port 443 - Bypasses Render Port 465 Block)
                    await gmailClient.users.messages.send({
                        userId: 'me',
                        requestBody: {
                            raw: base64EncodedEmail
                        }
                    });
                } else {
                    // Standard SMTP sending (Blocked on Render, works locally/VPS)
                    await sendWithRetry(transporter, mailOptions);
                }

                success++;
                if (certInfo) {
                    recipient.status = 'Đã gửi (có CTS)';
                } else if (attachCert) {
                    recipient.status = phase1FatalError ? 'Đã gửi (Lỗi bot trình duyệt)' : 'Đã gửi (Không lấy được CTS)';
                } else {
                    recipient.status = 'Đã gửi';
                }
                console.log(`[EmailService] ✅ Success: ${targetEmail}`);
            } catch (err) {
                console.error(`[EmailService] ❌ Delivery Error (${targetEmail}):`, err.message);
                errorCount++;
                recipient.status = `Thất bại: ${err.message}`;
            }

            // Cleanup temp file
            if (certInfo && certInfo.dirPath) {
                setTimeout(() => {
                    try { fs.rmSync(certInfo.dirPath, { recursive: true, force: true }); } catch(e) {}
                }, 10000);
            }

            recipient.sentTime = new Date().toISOString();
            updateProgress();
        }));

        // Delay between chunks
        if (i + SEND_CONCURRENCY < totalRecipients) {
            await new Promise(r => setTimeout(r, 2000)); 
        }
    }

    console.log(`[EmailService] --- CAMPAIGN END: Success ${success}, Error ${errorCount} ---`);
    } catch (err) {
        console.error(`[EmailService] FATAL ERROR:`, err);
        errorCount = totalRecipients || 1; 
        campaign.status = 'Thất bại';
        
        // Show error on first recipient so user can see it
        if (campaign.recipients && campaign.recipients.length > 0) {
            campaign.recipients[0].status = `Lỗi hệ thống: ${err.message}`;
        }
        if (onUpdate) onUpdate(campaign);
    }
}

module.exports = { sendBulkEmails };
