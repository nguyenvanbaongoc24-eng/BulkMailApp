const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const supabase = require('./supabaseClient');
const scraperService = require('./scraperService');

const WORKER_INTERVAL = 30000;
const RECOVERY_INTERVAL = 15 * 60 * 1000;
let isWorkerRunning = false;
let isRecoveryRunning = false;

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log(`[Worker] 🛠 Checking for email tasks at ${new Date().toLocaleTimeString()}...`);

    let browser = null;
    try {
        const { data: tasks, error: pickError } = await supabase.rpc('pick_email_tasks', { batch_size: 5 });
        if (pickError) throw pickError;

        if (!tasks || tasks.length === 0) {
            console.log(`[Worker] No pending tasks.`);
            return;
        }

        console.log(`[Worker] 🚀 Processing ${tasks.length} tasks...`);
        browser = await scraperService.initBrowser();

        for (const log of tasks) {
            await processEmailTask(log, browser);
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }
    } catch (err) {
        console.error(`[Worker] Critical Loop Error:`, err.message);
    } finally {
        if (browser) await browser.close().catch(() => {});
        isWorkerRunning = false;
    }
}

async function processEmailTask(log, browser) {
    console.log(`[Worker] [${log.id}] Starting processing for MST: ${log.customer_id}`);
    try {
        const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', log.campaign_id).single();
        if (!campaign) throw new Error('Campaign not found.');

        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode) === String(log.customer_id));
        let { data: customer } = await supabase.from('customers').select('*').eq('taxCode', log.customer_id).single();

        let scrapeResult = null;
        let pdfAttachedStatus = '';

        if (campaign.attachCert) {
            if (customer && customer.pdf_url) {
                console.log(`[Worker] [${log.id}] Using existing PDF URL for customer.`);
                pdfAttachedStatus = '✅ Có PDF (Sẵn có)';
            } else {
                console.log(`[Worker] [${log.id}] No PDF found. Triggering scraper...`);
                // Use Serial from Excel column B or C (mapped in excelService)
                const excelSerial = recipientInExcel?.Serial || '';
                const targetCustomer = customer || { taxCode: log.customer_id, companyName: recipientInExcel?.TenCongTy };
                
                scrapeResult = await scraperService.getLatestCertificate(browser, log.customer_id, excelSerial, targetCustomer);

                if (scrapeResult && scrapeResult.status === 'Matched') {
                    console.log(`[Worker] [${log.id}] Scraper found match: ${scrapeResult.fileName}. Uploading...`);
                    const fileBuffer = fs.readFileSync(scrapeResult.filePath);
                    const fileName = `${campaign.userId}/${log.customer_id}_${Date.now()}.pdf`;

                    const { error: uploadError } = await supabase.storage
                        .from('pdf-attachments')
                        .upload(fileName, fileBuffer, { contentType: 'application/pdf', upsert: true });

                    if (!uploadError) {
                        const { data: { publicUrl } } = supabase.storage.from('pdf-attachments').getPublicUrl(fileName);
                        
                        const customerUpdate = { 
                            taxCode: log.customer_id, 
                            pdf_url: publicUrl,
                            companyName: recipientInExcel?.TenCongTy || customer?.companyName,
                            userId: campaign.userId
                        };

                        const { data: updatedCustomer, error: upsertError } = await supabase
                            .from('customers')
                            .upsert(customerUpdate, { onConflict: 'taxCode' })
                            .select()
                            .single();

                        if (!upsertError) customer = updatedCustomer;
                        else customer = { ...customer, ...customerUpdate };
                        
                        pdfAttachedStatus = '✅ Có PDF (Mới tải)';
                    }
                    try { if (scrapeResult.dirPath) fs.rmSync(scrapeResult.dirPath, { recursive: true, force: true }); } catch(e) {}
                } else {
                    console.warn(`[Worker] [${log.id}] Scraper note: ${scrapeResult?.message || 'Not found'}`);
                    pdfAttachedStatus = `⚠ Không PDF (${scrapeResult?.message || 'Không tìm thấy'})`;
                }
            }
        } else {
            pdfAttachedStatus = 'Chế độ gửi không đính kèm';
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
        }

        // 4. Send Execution
        const { data: sender } = await supabase.from('senders').select('*').eq('id', campaign.senderAccountId).single();
        if (!sender) throw new Error('Sender account config missing.');

        let finalMessageId = null;
        let transporter;

        if (sender.smtpHost === 'oauth2.google') {
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
            const { token } = await oauth2Client.getAccessToken();
            if (!token) throw new Error('Gmail OAuth2 token invalid.');
            
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email,
                subject: subject,
                html: html,
                attachments: []
            };

            if (customer?.pdf_url) {
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

            const info = await transporter.sendMail(mailOptions);
            const chunks = [];
            for await (const chunk of info.message) chunks.push(chunk);
            const messageBuffer = Buffer.concat(chunks);
            const base64Raw = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const gResponse = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Raw } });
            if (!gResponse.data || !gResponse.data.id) throw new Error('Gmail API failed.');
            finalMessageId = gResponse.data.id;
        } else {
            transporter = nodemailer.createTransport({
                host: sender.smtpHost, port: parseInt(sender.smtpPort),
                secure: sender.smtpPort == 465,
                auth: { user: sender.smtpUser, pass: sender.smtpPassword },
                tls: { rejectUnauthorized: false }
            });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email, subject: subject, html: html,
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
            if (!info.messageId) throw new Error('SMTP failed.');
            finalMessageId = info.messageId;
        }

        // 5. Update DB
        console.log(`[Worker] [${log.id}] ✅ SENT. MessageID: ${finalMessageId}`);
        await supabase.from('email_logs').update({
            status: 'sent',
            sent_time: new Date().toISOString(),
            message_id: finalMessageId,
            error_message: pdfAttachedStatus
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

setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);
module.exports = { startWorker };
