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
            // Wait 2-3 seconds between emails
            await new Promise(r => setTimeout(r, 2000));
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
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
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
            subject: subject,
            html: html,
            attachments: []
        };

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
            console.log(`[Worker] Attempting to download PDF: ${customer.pdf_url}`);
            try {
                const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer', timeout: 20000 });
                mailOptions.attachments.push({
                    filename: `${customer.taxCode}_Certification.pdf`,
                    content: Buffer.from(response.data)
                });
                console.log(`[Worker] PDF attached successfully for ${log.email}`);
            } catch (pdfErr) {
                const msg = `Lỗi đính kèm: Không tải được file từ link: ${customer.pdf_url}. ${pdfErr.message}`;
                console.error(`[Worker] ${msg}`);
                throw new Error(msg);
            }
        }

        // 5. Send
        if (isGoogleHttpApi) {
            const info = await transporter.sendMail(mailOptions);
            const chunks = [];
            for await (const chunk of info.message) chunks.push(chunk);
            const messageBuffer = Buffer.concat(chunks);
            const base64EncodedEmail = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await gmailClient.users.messages.send({ userId: 'me', requestBody: { raw: base64EncodedEmail } });
        } else {
            await transporter.sendMail(mailOptions);
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
