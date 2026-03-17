const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const axios = require('axios');
const supabase = require('./supabaseClient');
const scraperService = require('./scraperService');

/**
 * Polling interval for the worker (e.g., every 10 seconds)
 */
const WORKER_INTERVAL = 10000;
let isWorkerRunning = false;

/**
 * Resolves an SMTP hostname to its IPv4 address.
 */
async function resolveToIPv4(hostname) {
    try {
        const net = require('net');
        if (net.isIP(hostname)) return hostname;
        const addresses = await dns.resolve4(hostname);
        if (addresses && addresses.length > 0) return addresses[0];
    } catch (err) {}
    return hostname;
}

/**
 * Worker main loop
 */
async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        // 1. Fetch tasks atomically using RPC to avoid double-processing (Lỗi 175%)
        const { data: tasks, error } = await supabase
            .rpc('pick_email_tasks', { batch_size: 5 });

        if (error) {
            console.error('[Worker] RPC pick_email_tasks error:', error.message);
            isWorkerRunning = false;
            return;
        }

        if (!tasks || tasks.length === 0) {
            isWorkerRunning = false;
            return;
        }

        console.log(`[Worker] Picked ${tasks.length} tasks to process.`);

        for (const log of tasks) {
            await processEmailTask(log);
            // 9. Rate Limit: Random delay 2-5 seconds per email
            const delay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
            console.log(`[Worker] Waiting ${delay}ms before next email...`);
            await new Promise(r => setTimeout(r, delay));
        }
    } catch (err) {
        console.error('[Worker] Fatal Error:', err.message);
    } finally {
        isWorkerRunning = false;
    }
}

/**
 * Process a single email task from email_logs
 */
async function processEmailTask(log) {
    console.log(`[Worker] Processing Task ID: ${log.id} for ${log.email}`);

    try {
        // 1. Fetch Campaign and Sender
        const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', log.campaign_id).single();
        const { data: sender } = await supabase.from('senders').select('*').eq('id', campaign.senderAccountId).single();
        
        // Use trimmed customer_id for lookup
        const lookupId = log.customer_id ? String(log.customer_id).trim() : '';
        const { data: customer } = await supabase.from('customers').select('*').eq('taxCode', lookupId).single();

        if (!campaign || !sender) throw new Error('Campaign or Sender not found');

        // 2. Prepare Transporter
        let transporter;
        let isGoogleHttpApi = false;
        let gmailClient = null;

        if (sender.smtpHost === 'oauth2.google') {
            isGoogleHttpApi = true;
            const { google } = require('googleapis');
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID, 
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.NODE_ENV === 'production' 
                    ? 'https://automation-ca2.onrender.com/api/auth/google/callback'
                    : 'http://localhost:3000/api/auth/google/callback'
            );
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
            
            // 4. Verify OAuth2 Credentials (Mục 4)
            try {
                const { token } = await oauth2Client.getAccessToken();
                if (!token) throw new Error('Refresh token is invalid or expired');
                
                // Fetch authorized email to verify (Mục 6)
                const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
                const userInfo = await oauth2.userinfo.get();
                const authEmail = userInfo.data.email;
                
                console.log(`[Worker] [GmailAPI] OAuth2 Token valid. Authorized account: ${authEmail}`);
                
                if (authEmail !== sender.senderEmail) {
                    console.warn(`[Worker] [GmailAPI] ⚠ Mismatch: Authorized as ${authEmail} but configured to send as ${sender.senderEmail}. Gmail may reject/change the From header.`);
                }
            } catch (authErr) {
                console.error(`[Worker] [GmailAPI] ❌ Auth Failure for ${sender.senderEmail}:`, authErr.message);
                throw new Error(`Xác thực Gmail thất bại cho ${sender.senderEmail}: ${authErr.message}`);
            }

            gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
            transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });
        } else {
            const resolvedHost = await resolveToIPv4(sender.smtpHost);
            transporter = nodemailer.createTransport({
                host: resolvedHost,
                port: parseInt(sender.smtpPort),
                secure: sender.smtpPort == 465,
                auth: { user: sender.smtpUser, pass: sender.smtpPassword },
                tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2', servername: sender.smtpHost }
            });
        }

        // 3. Prepare Email Content
        let html = campaign.template || '';
        let subject = campaign.subject || 'Thông báo từ Automation CA2';

        if (customer) {
            const replacements = {
                '{{TenCongTy}}': customer.companyName || '',
                '{{MST}}': customer.taxCode || '',
                '{{DiaChi}}': customer.diaChi || '',
                '{{NgayHetHanChuKySo}}': customer.expirationDate || ''
            };

            for (const [key, value] of Object.entries(replacements)) {
                const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                html = html.replace(regex, value);
                subject = subject.replace(regex, value);
            }
        }
        
        html += '<br><br><p style="color: gray; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">' +
                'Email này được gửi tự động từ hệ thống Automation CA2.</p>';

        const mailOptions = {
            from: `"${sender.senderName}" <${sender.senderEmail}>`,
            to: log.email,
            replyTo: sender.senderEmail, // 8. Add Reply-To for anti-spam
            subject: subject,
            html: html,
            attachments: []
        };

        // 2. Log Pre-send Details (Mục 2)
        console.log(`[Worker] 📤 Preparing email to: ${log.email}`);
        console.log(`[Worker] Subject: ${subject}`);
        console.log(`[Worker] Content length: ${html.length} chars`);
        console.log(`[Worker] Has attachment: ${campaign.attachCert ? 'Yes' : 'No'}`);

        // 4. Attach PDF if required
        if (campaign.attachCert) {
            // Case A: Missing pdf_url -> Trigger AUTO-SCRAPE
            if (!customer || !customer.pdf_url) {
                console.log(`[Worker] PDF missing for ${log.customer_id}. Triggering AUTO-SCRAPE...`);
                let browser = null;
                try {
                    // Try to find serial from campaign recipients (Excel source)
                    const recipient = (campaign.recipients || []).find(r => String(r.MST) === String(log.customer_id));
                    const excelSerial = recipient ? (recipient.Serial || '') : '';

                    const lookupCustomer = customer || { 
                        taxCode: log.customer_id, 
                        Serial: excelSerial, 
                        TenCongTy: recipient ? recipient.TenCongTy : '', 
                        userId: campaign.userId 
                    };
                    
                    // Prioritize excelSerial if customer object doesn't have one
                    const targetSerial = lookupCustomer.Serial || excelSerial;

                    browser = await scraperService.initBrowser();
                    const scrapeResult = await scraperService.getLatestCertificate(browser, lookupCustomer.taxCode, targetSerial, lookupCustomer);

                    if (scrapeResult && scrapeResult.status === 'Matched') {
                        console.log(`[Worker] Auto-scrape success for ${lookupCustomer.taxCode}. Uploading...`);
                        
                        // Upload to Supabase Storage
                        const fileBuffer = fs.readFileSync(scrapeResult.filePath);
                        const fileName = `${campaign.userId}/${lookupCustomer.taxCode}_${Date.now()}.pdf`;
                        
                        const { error: uploadError } = await supabase.storage
                            .from('pdf-attachments')
                            .upload(fileName, fileBuffer, { contentType: 'application/pdf', upsert: true });

                        if (uploadError) throw uploadError;

                        const { data: { publicUrl } } = supabase.storage
                            .from('pdf-attachments')
                            .getPublicUrl(fileName);

                        // Update local customer object and DB
                        if (!customer) {
                            // Create a temporary object so the email can still be sent
                            customer = { 
                                taxCode: lookupCustomer.taxCode, 
                                pdf_url: publicUrl 
                            };
                        } else {
                            await supabase.from('customers').update({ pdf_url: publicUrl }).eq('id', customer.id);
                            customer.pdf_url = publicUrl;
                        }
                        
                        // Cleanup local file
                        try { if (scrapeResult.dirPath) fs.rmSync(scrapeResult.dirPath, { recursive: true, force: true }); } catch(e) {}
                    } else {
                        throw new Error(scrapeResult?.message || 'Không tìm thấy chứng thư trên CA system');
                    }
                } catch (scrapeErr) {
                    const msg = `Lỗi bẻ lái: Tự động tra cứu thất bại cho ${log.customer_id}: ${scrapeErr.message}`;
                    console.error(`[Worker] ${msg}`);
                    throw new Error(msg);
                } finally {
                    if (browser) await browser.close();
                }
            }

            // Case B: Has pdf_url (either pre-existing or just scraped) -> Download & Attach
            // 1. Pre-send PDF Validation (Mục 1)
            if (!customer || !customer.pdf_url) {
                const msg = `❌ BẮT BUỘC THIẾU: Không có PDF_URL cho ${log.customer_id}. Hệ thống ngừng gửi.`;
                console.error(`[Worker] ${msg}`);
                throw new Error(msg);
            }

            console.log(`[Worker] 📥 Attempting to download PDF: ${customer.pdf_url}`);
            try {
                const response = await axios.get(customer.pdf_url, { 
                    responseType: 'arraybuffer', 
                    timeout: 20000 
                });
                
                if (!response.data || response.data.length === 0) {
                    throw new Error('File download returned empty content');
                }

                // 7. Log file size (Mục 7)
                console.log(`[Worker] PDF fetched. Size: ${response.data.length} bytes`);

                // 5. Custom Filename (Mục 5)
                const safeCompanyName = (customer.companyName || 'Document').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                const filename = `${customer.taxCode || 'Cert'}_${safeCompanyName}.pdf`;

                mailOptions.attachments.push({
                    filename: filename,
                    content: Buffer.from(response.data),
                    contentType: 'application/pdf'
                });
                console.log(`[Worker] ✅ PDF attached: ${filename}`);
            } catch (pdfErr) {
                const msg = `Lỗi đính kèm: Không tải được file từ link: ${customer.pdf_url}. ${pdfErr.message}`;
                console.error(`[Worker] ${msg}`);
                throw new Error(msg);
            }
        }

        // 2 & 8. HARD FAIL if attachment is missing for a certificate campaign
        if (campaign.attachCert && mailOptions.attachments.length === 0) {
            const msg = `❌ FAILSAFE: Campaign yêu cầu PDF nhưng không có attachment nào được tạo. Hủy gửi.`;
            console.error(`[Worker] ${msg}`);
            throw new Error(msg);
        }

        // 5. Send
        if (isGoogleHttpApi) {
            console.log(`[Worker] [GmailAPI] Encoding message for ${log.email}...`);
            const info = await transporter.sendMail(mailOptions);
            const chunks = [];
            for await (const chunk of info.message) chunks.push(chunk);
            const messageBuffer = Buffer.concat(chunks);
            const base64EncodedEmail = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            
            console.log(`[Worker] [GmailAPI] Sending via users.messages.send...`);
            const response = await gmailClient.users.messages.send({ 
                userId: 'me', 
                requestBody: { raw: base64EncodedEmail } 
            });

            // 1. & 11. Strict Delivery Check
            if (!response.data || !response.data.id) {
                console.error(`[Worker] [GmailAPI] ❌ Failed: No messageId in response`, response.data);
                throw new Error('Gmail API response missing messageId');
            }

            console.log(`[Worker] [GmailAPI] ✅ Success. Response:`, {
                messageId: response.data.id,
                threadId: response.data.threadId,
                labelIds: response.data.labelIds
            });
        } else {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Worker] [SMTP] ✅ Success. messageId: ${info.messageId}`);
        }

        // 6. Update Success
        await supabase.from('email_logs').update({
            status: 'sent',
            sent_time: new Date().toISOString(),
            error_message: null
        }).eq('id', log.id);

        // Update counts in campaign
        // ONLY increment sentCount once. If it was already failed before, we don't want to double count sentCount?
        // Actually, the simplest way is to have a specialized RPC or check the log status before incrementing.
        // For now, let's just use the RPC but be mindful of the counts.
        await supabase.rpc('increment_campaign_success', { campaign_id: log.campaign_id });

        console.log(`[Worker] ✅ Sent successfully to ${log.email}`);

        // 7. Check if Campaign is finished
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[Worker] ❌ Failed to send to ${log.email}:`, err.message);
        
        const isTerminalFailure = (log.retry_count + 1) >= 2;

        await supabase.from('email_logs').update({
            status: 'failed',
            error_message: err.message,
            retry_count: log.retry_count + 1
        }).eq('id', log.id);

        // If it's a retry, we only increment errorCount, NOT sentCount (to avoid 200% progress)
        // We need a custom RPC or just update fields manually.
        // Let's create a more flexible RPC in the next step or use manual update.
        if (isTerminalFailure) {
            await supabase.rpc('increment_campaign_error', { campaign_id: log.campaign_id });
        } else {
            // Just increment error count for stats, but don't advance the progress bar (sentCount)
            await supabase
                .from('campaigns')
                .update({ errorCount: (campaign.errorCount || 0) + 1 })
                .eq('id', log.campaign_id);
        }

        // Check completion even on error
        await checkCampaignCompletion(log.campaign_id);
    }
}

/**
 * Checks if all logs for a campaign are finished and updates the campaign status
 */
async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remaining, error } = await supabase
            .from('email_logs')
            .select('id')
            .eq('campaign_id', campaign_id)
            .or('status.eq.pending,status.eq.failed')
            .lt('retry_count', 2);

        if (!error && remaining.length === 0) {
            // All done or max retries reached for all
            const { data: stats } = await supabase.from('campaigns').select('successCount, errorCount, sentCount').eq('id', campaign_id).single();
            const finalStatus = stats.errorCount > 0 ? 'Hoàn thành (có lỗi)' : 'Hoàn thành';
            await supabase.from('campaigns').update({ status: finalStatus }).eq('id', campaign_id);
            console.log(`[Worker] 🏁 Campaign ${campaign_id} finished with status: ${finalStatus}`);
        }
    } catch (e) {
        console.error('[Worker] Completion check error:', e.message);
    }
}

// Start polling
setInterval(startWorker, WORKER_INTERVAL);

module.exports = { startWorker };
