const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const axios = require('axios');
const supabase = require('./supabaseClient');
const scraperService = require('./scraperService');

/**
 * Configuration & Intervals
 */
const WORKER_INTERVAL = 10000;      // 10 seconds between batch checks
const RECOVERY_INTERVAL = 15 * 60 * 1000; // 15 minutes for stale recovery
const MIN_SEND_DELAY = 2000;         // 2s minimum delay between emails
const MAX_SEND_DELAY = 5000;         // 5s maximum delay between emails

let isWorkerRunning = false;
let isRecoveryRunning = false;

/**
 * Worker Entry Point
 */
async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        // 1. Pick a batch (Sequential processing)
        const { data: tasks, error } = await supabase.rpc('pick_email_tasks', { batch_size: 5 });

        if (error) {
            console.error('[Worker] Fatal: pick_email_tasks RPC failed:', error.message);
            isWorkerRunning = false;
            return;
        }

        if (!tasks || tasks.length === 0) {
            isWorkerRunning = false;
            return; 
        }

        console.log(`[Worker] Picked ${tasks.length} tasks. Starting sequential processing...`);
        
        // 2. Optimization: Single Browser per Batch
        let sharedBrowser = null;
        
        try {
            for (const log of tasks) {
                // Check if this specific task needs scraping
                const needsScrape = await checkIfTaskNeedsScrape(log);
                
                if (needsScrape && !sharedBrowser) {
                    console.log('[Worker] Launching shared browser for batch scraping...');
                    sharedBrowser = await scraperService.initBrowser();
                }

                await processEmailTask(log, sharedBrowser);

                // Sequential Delay to prevent rate limiting
                const delay = Math.floor(Math.random() * (MAX_SEND_DELAY - MIN_SEND_DELAY + 1)) + MIN_SEND_DELAY;
                await new Promise(r => setTimeout(r, delay));
            }
        } finally {
            if (sharedBrowser) {
                console.log('[Worker] Closing shared browser.');
                await sharedBrowser.close().catch(() => {});
            }
        }
    } catch (err) {
        console.error('[Worker] Fatal error in loop:', err.message);
    } finally {
        isWorkerRunning = false;
    }
}

/**
 * Check if a task requires the scraper
 */
async function checkIfTaskNeedsScrape(log) {
    try {
        const { data: campaign } = await supabase.from('campaigns').select('attachCert').eq('id', log.campaign_id).single();
        if (!campaign || !campaign.attachCert) return false;

        const { data: customer } = await supabase.from('customers').select('pdf_url').eq('taxCode', log.customer_id).single();
        return !customer?.pdf_url;
    } catch (e) {
        return false;
    }
}

/**
 * Process a single email task with absolute verification
 */
async function processEmailTask(log, browser) {
    console.log(`[Worker] [${log.id}] MST: ${log.customer_id} Email: ${log.email}`);
    
    try {
        // 1. Retrieval
        const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', log.campaign_id).single();
        const { data: sender } = await supabase.from('senders').select('*').eq('id', campaign.senderAccountId).single();
        let { data: customer } = await supabase.from('customers').select('*').eq('taxCode', log.customer_id).single();

        if (!campaign || !sender) throw new Error('Campaign or Sender not found.');

        // Backup recipient data from Excel field if DB customer is missing
        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode).trim() === String(log.customer_id).trim());

        // 2. Auto-Scrape (If required)
        if (campaign.attachCert && (!customer || !customer.pdf_url)) {
            if (browser) {
                console.log(`[Worker] [${log.id}] Scraping PDF for MST: ${log.customer_id}`);
                const excelSerial = recipientInExcel ? (recipientInExcel.Serial || '') : '';
                
                const targetCustomer = customer || { 
                    taxCode: log.customer_id, 
                    Serial: excelSerial, 
                    TenCongTy: recipientInExcel ? recipientInExcel.TenCongTy : '',
                    userId: campaign.userId 
                };

                const scrapeResult = await scraperService.getLatestCertificate(browser, log.customer_id, excelSerial, targetCustomer);

                if (scrapeResult && scrapeResult.status === 'Matched') {
                    console.log(`[Worker] [${log.id}] Scrape Success. Uploading...`);
                    const fileBuffer = fs.readFileSync(scrapeResult.filePath);
                    const fileName = `${campaign.userId}/${log.customer_id}_${Date.now()}.pdf`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('pdf-attachments')
                        .upload(fileName, fileBuffer, { contentType: 'application/pdf', upsert: true });

                    if (!uploadError) {
                        const { data: { publicUrl } } = supabase.storage.from('pdf-attachments').getPublicUrl(fileName);
                        if (customer) {
                            await supabase.from('customers').update({ pdf_url: publicUrl }).eq('id', customer.id);
                            customer.pdf_url = publicUrl;
                        } else {
                            customer = { pdf_url: publicUrl, taxCode: log.customer_id, companyName: recipientInExcel?.TenCongTy };
                        }
                    }
                    try { if (scrapeResult.dirPath) fs.rmSync(scrapeResult.dirPath, { recursive: true, force: true }); } catch(e) {}
                } else {
                    console.warn(`[Worker] [${log.id}] Scraper note: ${scrapeResult?.message || 'Not found'}`);
                }
            }
        }

        // 3. Content Preparation
        let html = campaign.template || '';
        let subject = campaign.subject || 'Thông báo từ Automation CA2';

        const replacements = {
            '{{TenCongTy}}': customer?.companyName || recipientInExcel?.TenCongTy || '',
            '{{MST}}': customer?.taxCode || recipientInExcel?.MST || log.customer_id || '',
            '{{DiaChi}}': customer?.diaChi || recipientInExcel?.DiaChi || '',
            '{{NgayHetHanChuKySo}}': customer?.expirationDate || recipientInExcel?.NgayHetHanChuKySo || ''
        };

        for (const [key, value] of Object.entries(replacements)) {
            const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            html = html.replace(regex, value || '');
            subject = subject.replace(regex, value || '');
        }

        if (!html.trim() || !subject.trim()) throw new Error('Email subject or body is empty.');

        // 4. Execution (MIME + Gmail API)
        const { google } = require('googleapis');
        const isOAuth2 = sender.smtpHost === 'oauth2.google';
        let transporter;
        let finalMessageId = '';

        if (isOAuth2) {
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
            const { token } = await oauth2Client.getAccessToken();
            if (!token) throw new Error('Gmail OAuth2 token invalid. Reconnection needed.');
            
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email,
                subject: subject,
                html: html,
                attachments: []
            };

            // Download PDF if available
            if (customer?.pdf_url) {
                console.log(`[Worker] [${log.id}] Fetching PDF: ${customer.pdf_url}`);
                const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer', timeout: 15000 });
                if (response.data && response.data.length > 0) {
                    const safeName = (customer.companyName || 'Document').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                    mailOptions.attachments.push({
                        filename: `Chung_thu_so_${log.customer_id}_${safeName}.pdf`,
                        content: Buffer.from(response.data),
                        contentType: 'application/pdf'
                    });
                }
            }

            // Build MIME
            const info = await transporter.sendMail(mailOptions);
            const chunks = [];
            for await (const chunk of info.message) chunks.push(chunk);
            const messageBuffer = Buffer.concat(chunks);
            const base64Raw = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            // Call Gmail API
            const gResponse = await gmail.users.messages.send({ 
                userId: 'me', 
                requestBody: { raw: base64Raw } 
            });

            if (!gResponse.data || !gResponse.data.id) throw new Error('Gmail API did not return a messageId.');
            finalMessageId = gResponse.data.id;
        } else {
            // Standard SMTP
            transporter = nodemailer.createTransport({
                host: sender.smtpHost,
                port: parseInt(sender.smtpPort),
                secure: sender.smtpPort == 465,
                auth: { user: sender.smtpUser, pass: sender.smtpPassword },
                tls: { rejectUnauthorized: false }
            });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email,
                subject: subject,
                html: html,
                attachments: []
            };

            if (customer?.pdf_url) {
                const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer', timeout: 15000 });
                mailOptions.attachments.push({
                    filename: `Cert_${log.customer_id}.pdf`,
                    content: Buffer.from(response.data),
                    contentType: 'application/pdf'
                });
            }

            const info = await transporter.sendMail(mailOptions);
            if (!info.messageId) throw new Error('SMTP failed: No messageId.');
            finalMessageId = info.messageId;
        }

        // 5. Update DB
        console.log(`[Worker] [${log.id}] ✅ SENT. MessageID: ${finalMessageId}`);
        await supabase.from('email_logs').update({
            status: 'sent',
            sent_time: new Date().toISOString(),
            message_id: finalMessageId,
            error_message: null
        }).eq('id', log.id);

        await supabase.rpc('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[Worker] [${log.id}] ❌ ERROR: ${err.message}`);
        const newRetryCount = (log.retry_count || 0) + 1;
        const isTerminal = newRetryCount >= 3;

        await supabase.from('email_logs').update({
            status: isTerminal ? 'failed_permanent' : 'failed',
            error_message: err.message,
            retry_count: newRetryCount,
            last_retry_time: new Date().toISOString()
        }).eq('id', log.id);

        if (isTerminal) await supabase.rpc('increment_campaign_error', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);
    }
}

async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remaining } = await supabase
            .from('email_logs')
            .select('id')
            .eq('campaign_id', campaign_id)
            .in('status', ['pending', 'retrying', 'failed', 'processing'])
            .lt('retry_count', 3);

        if (!remaining || remaining.length === 0) {
            const { data: campaign } = await supabase.from('campaigns').select('errorCount, recipients').eq('id', campaign_id).single();
            const total = (campaign?.recipients || []).length;
            const final = campaign.errorCount > 0 ? `Hoàn thành (Lỗi ${campaign.errorCount}/${total})` : 'Hoàn thành';
            await supabase.from('campaigns').update({ status: final }).eq('id', campaign_id);
            console.log(`[Worker] 🏁 Campaign ${campaign_id} finish: ${final}`);
        }
    } catch (e) {}
}

async function startRecoveryWorker() {
    if (isRecoveryRunning) return;
    isRecoveryRunning = true;
    try {
        await supabase.rpc('recover_failed_tasks');
    } catch (err) {
        console.error('[Recovery] Loop Error:', err.message);
    } finally {
        isRecoveryRunning = false;
    }
}

// Start Loops
setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);

module.exports = { startWorker };
