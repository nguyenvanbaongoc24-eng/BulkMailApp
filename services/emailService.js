const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const supabase = require('./supabaseClient');
const scraperService = require('./scraperService');

const WORKER_INTERVAL = 10000; // Reduced from 30s to 10s for faster sending
const RECOVERY_INTERVAL = 15 * 60 * 1000;
let isWorkerRunning = false;
let isRecoveryRunning = false;

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log(`[Worker] 🛠 Checking for email tasks at ${new Date().toLocaleTimeString()}...`);

    let browser = null;
    try {
        const { data: tasks, error: pickError } = await supabase.rpc('pick_email_tasks', { batch_size: 10 }); // Increased batch to 10
        if (pickError) throw pickError;

        if (!tasks || tasks.length === 0) {
            console.log(`[Worker] No pending tasks.`);
            return;
        }

        console.log(`[Worker] 🚀 RPC returned ${tasks.length} tasks. Initializing Browser...`);
        browser = await scraperService.initBrowser();
        console.log(`[Worker] Browser initialized. Starting loop...`);

        for (const log of tasks) {
            try {
                await Promise.race([
                    processEmailTask(log, browser),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Task Timeout Exceeded (90s)')), 90000))
                ]);
            } catch (taskErr) {
                console.error(`[Worker] [${log.id}] Unhandled Task Error:`, taskErr.message);
                // Emergency fail-safe to revert processing
                await supabase.from('email_logs').update({ status: 'failed', retry_count: (log.retry_count || 0) + 1 }).eq('id', log.id).catch(() => {});
            }
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
    let pdfAttachedStatus = 'Chờ xử lý';
    
    try {
        const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', log.campaign_id).single();
        if (!campaign) throw new Error('Campaign not found.');

        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode) === String(log.customer_id));
        let { data: customer } = await supabase.from('customers').select('*').eq('taxCode', log.customer_id).maybeSingle();

        // FALLBACK: If not in customers, or customers has no PDF, check 'certificates' table (Local Tool's output)
        if (!customer || !customer.pdf_url) {
            console.log(`[Worker] [${log.id}] PDF missing from CRM/Customers. Checking 'certificates' table...`);
            const { data: cert } = await supabase.from('certificates').select('pdf_url, company_name, serial').eq('mst', log.customer_id).maybeSingle();
            if (cert && cert.pdf_url) {
                console.log(`[Worker] [${log.id}] Found PDF in certificates table: ${cert.pdf_url}`);
                customer = { 
                    ...customer, 
                    pdf_url: cert.pdf_url, 
                    companyName: cert.company_name || recipientInExcel?.TenCongTy,
                    Serial: cert.serial
                };
            }
        }

        // 1. PDF Handling (STRICT MODE) - Fix: campaign.attachCert -> campaign.attach_cert
        if (campaign.attach_cert) {
            if (customer && customer.pdf_url) {
                console.log(`[Worker] [${log.id}] Found existing PDF URL: ${customer.pdf_url}`);
                pdfAttachedStatus = '✅ Có PDF (Sẵn có)';
            } else {
                console.log(`[Worker] [${log.id}] PDF missing from CRM. Triggering Scraper...`);
                // Flexible Serial/MST lookup
                const excelSerial = recipientInExcel?.Serial || recipientInExcel?.serial || recipientInExcel?.['SỐ SERIAL'] || '';
                const dbSerial = customer?.Serial || customer?.serial || '';
                const targetSerial = excelSerial || dbSerial;
                
                const targetCustomer = customer || { 
                    taxCode: log.customer_id, 
                    companyName: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || recipientInExcel?.['Name'] 
                };
                const scrapeResult = await scraperService.getLatestCertificate(browser, log.customer_id, targetSerial, targetCustomer);

                if (scrapeResult && scrapeResult.status === 'Matched') {
                    console.log(`[Worker] [${log.id}] Scraper found Match! Uploading file...`);
                    const fileBuffer = fs.readFileSync(scrapeResult.filePath);
                    const fileExt = path.extname(scrapeResult.filePath) || '.pdf';
                    const fileName = `${campaign.user_id}/${log.customer_id}_${Date.now()}${fileExt}`;

                    const { error: uploadError } = await supabase.storage
                        .from('pdf-attachments')
                        .upload(fileName, fileBuffer, { upsert: true });

                    if (uploadError) throw new Error(`Lỗi upload PDF lên Storage: ${uploadError.message}`);

                    const { data: { publicUrl } } = supabase.storage.from('pdf-attachments').getPublicUrl(fileName);
                    
                    const customerUpdate = { 
                        taxCode: log.customer_id, 
                        pdf_url: publicUrl,
                        companyName: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || customer?.companyName,
                        user_id: campaign.user_id
                    };

                    const { data: updatedCustomer, error: upsertError } = await supabase
                        .from('customers')
                        .upsert(customerUpdate, { onConflict: 'taxCode' })
                        .select()
                        .single();

                    if (upsertError) console.warn(`[Worker] Warning: Could not update customer record, but continuing with PDF.`, upsertError.message);
                    
                    customer = updatedCustomer || { ...customer, ...customerUpdate };
                    pdfAttachedStatus = '✅ Có PDF (Mới tải)';
                    
                    try { if (scrapeResult.dirPath) fs.rmSync(scrapeResult.dirPath, { recursive: true, force: true }); } catch(e) {}
                } else {
                    const failNote = scrapeResult?.message || 'Không tìm thấy hoặc không khớp Serial';
                    pdfAttachedStatus = `⚠ Không PDF (${failNote})`;
                    console.log(`[Worker] [${log.id}] PDF requested but not found/matched: ${failNote}. Proceeding to send WITHOUT PDF.`);
                }
            }
        } else {
            pdfAttachedStatus = 'Gửi không đính kèm (Tắt trong cài đặt)';
        }

        // 2. Content Preparation - Robust Variable Replacement
        let html = campaign.template || '';
        let subject = campaign.subject || 'Thông báo từ Automation CA2';
        
        // Helper to find value from recipient object regardless of case/accents
        const findVal = (obj, keys) => {
            if (!obj) return '';
            const entries = Object.entries(obj);
            for (const key of keys) {
                const found = entries.find(([k]) => k.toLowerCase().trim() === key.toLowerCase().trim());
                if (found && found[1]) return String(found[1]).trim();
            }
            return '';
        };

        const replacements = {
            '#TênCôngTy': findVal(recipientInExcel, ['TenCongTy', 'Tên Công Ty', 'Name', 'companyName']) || customer?.companyName || '',
            '#MST': findVal(recipientInExcel, ['MST', 'taxCode', 'Mã số thuế']) || customer?.taxCode || log.customer_id || '',
            '#ĐịaChỉ': findVal(recipientInExcel, ['DiaChi', 'Địa chỉ', 'Address']) || customer?.diaChi || '',
            '#NgàyHếtHạn': findVal(recipientInExcel, ['NgayHetHanChuKySo', 'Ngày hết hạn', 'Expiration']) || customer?.expirationDate || ''
        };

        // Support both {{TAG}} and #TAG syntax
        for (const [tag, value] of Object.entries(replacements)) {
            const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const legacyTag = `{{${tag.substring(1)}}}`; 
            
            const regex = new RegExp(`${escapedTag}|${legacyTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            html = html.replace(regex, value);
            subject = subject.replace(regex, value);
        }

        // 3. Sender Verification
        const { data: sender } = await supabase.from('senders').select('*').eq('id', campaign.senderAccountId).single();
        if (!sender) throw new Error('Tài khoản người gửi không tồn tại.');

        let finalMessageId = null;
        let transporter;

        // 4. Send Execution (MIME Multipart/Mixed)
        if (sender.smtpHost === 'oauth2.google') {
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
            const { token } = await oauth2Client.getAccessToken();
            if (!token) throw new Error('Không thể làm mới quyền Gmail API.');
            
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email, subject: subject, html: html,
                attachments: []
            };

            if (customer?.pdf_url) {
                console.log(`[Worker] [${log.id}] Final check: Attaching PDF from ${customer.pdf_url}`);
                const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer', timeout: 20000 });
                const buf = Buffer.from(response.data);
                if (buf && buf.length > 0) {
                    const urlExt = path.extname(new URL(customer.pdf_url).pathname) || '.pdf';
                    const cleanCompName = (customer.companyName || 'Doc').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                    mailOptions.attachments.push({
                        filename: `Cert_${log.customer_id}_${cleanCompName}${urlExt}`,
                        content: buf
                    });
                } else {
                    throw new Error('Tải PDF từ Storage thất bại (Empty Buffer).');
                }
            } else if (campaign.attachCert) {
                console.log(`[Worker] [${log.id}] Campaign requested PDF, but no PDF URL is available. Sending without attachment.`);
            }

            const info = await transporter.sendMail(mailOptions);
            const chunks = [];
            for await (const chunk of info.message) chunks.push(chunk);
            const messageBuffer = Buffer.concat(chunks);
            const base64Raw = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const gResponse = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Raw } });
            if (!gResponse.data || !gResponse.data.id) throw new Error('Gmail API không trả về messageId.');
            finalMessageId = gResponse.data.id;
        } else {
            // Standard SMTP
            transporter = nodemailer.createTransport({
                host: sender.smtpHost, port: parseInt(sender.smtpPort),
                secure: sender.smtpHost == 465,
                auth: { user: sender.smtpUser, pass: sender.smtpPassword },
                tls: { rejectUnauthorized: false }
            });

            const mailOptions = {
                from: `"${sender.senderName}" <${sender.senderEmail}>`,
                to: log.email, subject: subject, html: html,
                attachments: []
            };

            if (customer?.pdf_url) {
                const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer', timeout: 20000 });
                const buf = Buffer.from(response.data);
                const urlExt = path.extname(new URL(customer.pdf_url).pathname) || '.pdf';
                mailOptions.attachments.push({
                    filename: `Cert_${log.customer_id}${urlExt}`,
                    content: buf
                });
            } else if (campaign.attachCert) {
                console.log(`[Worker] [${log.id}] Campaign requested PDF, but no PDF URL is available. Sending without attachment.`);
            }

            const info = await transporter.sendMail(mailOptions);
            if (!info.messageId) throw new Error('SMTP sending failed.');
            finalMessageId = info.messageId;
        }

        // 5. Success Commit
        console.log(`[Worker] [${log.id}] ✅ SENT successfully. ID: ${finalMessageId}`);
        await supabase.from('email_logs').update({
            status: 'sent',
            sent_time: new Date().toISOString(),
            message_id: finalMessageId,
            error_message: pdfAttachedStatus
        }).eq('id', log.id);

        await supabase.rpc('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[Worker] [${log.id}] ❌ FAIL: ${err.message}`);
        try {
            const newRetryCount = (log.retry_count || 0) + 1;
            const isTerminal = newRetryCount >= 3;

            // If it's a PDF failure, we keep it as 'failed' to be picked up by recovery worker later
            // or marked as failed_permanent if it exceeds retries.
            await supabase.from('email_logs').update({
                status: isTerminal ? 'failed_permanent' : 'failed',
                error_message: `${pdfAttachedStatus} | Lỗi: ${err.message}`,
                retry_count: newRetryCount,
                last_retry_time: new Date().toISOString()
            }).eq('id', log.id);

            if (isTerminal) await supabase.rpc('increment_campaign_error', { campaign_id: log.campaign_id });
            await checkCampaignCompletion(log.campaign_id);
        } catch (fatalErr) {
            console.error(`[Worker] [${log.id}] 🚨 FATAL FAIL writing to DB:`, fatalErr.message);
        }
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
            const final = (campaign?.errorCount || 0) > 0 ? `Hoàn thành (Lỗi ${campaign.errorCount}/${total})` : 'Hoàn thành';
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
module.exports = { startWorker, processEmailTask };
