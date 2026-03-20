const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { adminClient: supabase } = require('./supabaseClient');
const scraperService = require('./scraperService');

const WORKER_INTERVAL = 10000; // 10s
const RECOVERY_INTERVAL = 15 * 60 * 1000;
let isWorkerRunning = false;
let isRecoveryRunning = false;

// Helper to format date for Vietnamese display (DD/MM/YYYY)
const formatDateVN = (dateVal) => {
    if (!dateVal) return "";
    let date = dateVal;
    if (!(date instanceof Date)) {
        date = new Date(dateVal);
    }
    if (isNaN(date.getTime())) return dateVal;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Helper to validate email format
const validateEmail = (email) => {
    return String(email)
        .toLowerCase()
        .match(
            /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        );
};

// Standardized tag replacement function
const replaceTags = (template, data) => {
    if (!template) return "";
    
    const replacements = {
        '#TênCôngTy': data.company_name || "",
        '#MST': data.mst || "",
        '#ĐịaChỉ': data.address || "",
        '#NgàyHếtHạn': formatDateVN(data.expired_date) || ""
    };

    let result = template;
    for (const [tag, value] of Object.entries(replacements)) {
        // Handle variants (case-insensitive and without accents/extensions)
        let variants = [tag];
        if (tag === '#TênCôngTy') variants.push('#TenCongTy', '#TEN_CONG_TY', '#TÊN_CÔNG_TY', '#Tencongty');
        if (tag === '#NgàyHếtHạn') variants.push('#NgayHetHan', '#NGAY_HET_HAN', '#NGÀY_HẾT_HẠN', '#Ngayhethan', '#NgayHetHanChuKySo');
        if (tag === '#ĐịaChỉ') variants.push('#DiaChi', '#DIA_CHI', '#ĐỊA_CHỈ', '#Diachi');

        for (const variant of variants) {
            const regex = new RegExp(variant.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            result = result.replace(regex, value);
        }
    }
    return result;
};

// Helper to extract relative path and bucket from Supabase URL
const getStorageInfo = (url) => {
    if (!url) return null;
    // Handle full URLs
    if (url.includes('/storage/v1/object/public/')) {
        const parts = url.split('/storage/v1/object/public/')[1].split('/');
        const bucket = parts.shift();
        const path = parts.join('/');
        return { bucket, path };
    }
    // Fallback/Legacy: guess bucket based on URL content
    if (url.includes('pdf-attachments')) return { bucket: 'pdf-attachments', path: url.split('pdf-attachments/')[1] || url };
    if (url.includes('pdfs/')) return { bucket: 'pdfs', path: url.split('pdfs/')[1] || url };
    
    return null;
};

async function startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log(`[Worker] 🛠 Checking for email tasks at ${new Date().toLocaleTimeString()}...`);

    // Visibility Check (Diagnostic)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn(`[Worker] ⚠ WARNING: SUPABASE_SERVICE_ROLE_KEY is MISSING. Background worker may be BLOCKED by RLS!`);
    }

    let browser = null;
    try {
        const { data: tasks, error: pickError } = await supabase.rpc('pick_email_tasks', { batch_size: 10 });
        if (pickError) throw pickError;

        if (!tasks || tasks.length === 0) {
            console.log(`[Worker] No pending tasks.`);
            return;
        }

        console.log(`[Worker] 🚀 RPC returned ${tasks.length} tasks. Initializing Browser...`);
        browser = await scraperService.initBrowser();

        for (const log of tasks) {
            try {
                await Promise.race([
                    processEmailTask(log, browser),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Task Timeout Exceeded (90s)')), 90000))
                ]);
            } catch (taskErr) {
                console.error(`[Worker] [${log.id}] Unhandled Task Error:`, taskErr.message);
                await supabase.rpc('update_email_log_for_worker', {
                    p_log_id: log.id,
                    p_status: 'failed',
                    p_error_message: `Unhandled Error: ${taskErr.message}`
                }).catch(() => {});
            }
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
        }
    } catch (err) {
        console.error(`[Worker] Critical Loop Error:`, err.message);
        if (err.message.includes('RLS') || err.message.includes('permission denied')) {
            console.error(`[Worker] 💡 Hint: This error is likely due to RLS policies. Make sure SUPABASE_SERVICE_ROLE_KEY is set in your environment.`);
        }
    } finally {
        if (browser) await browser.close().catch(() => {});
        isWorkerRunning = false;
    }
}

async function processEmailTask(log, browser) {
    console.log(`[Worker] [${log.id}] Starting processing for MST: ${log.customer_id}`);
    let pdfAttachedStatus = 'Chờ xử lý';
    
    try {
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'processing',
            p_error_message: 'Đang chuẩn bị nội dung...'
        }).catch(() => {});
        
        const { data: campaignData, error: campaignError } = await supabase.rpc('get_campaign_for_worker', { p_campaign_id: log.campaign_id });
        const campaign = campaignData && campaignData[0];
        if (campaignError || !campaign) throw new Error(`Campaign not found or inaccessible: ${log.campaign_id}`);

        const cleanMST = String(log.customer_id || '').trim();
        const recipientInExcel = (campaign.recipients || []).find(r => String(r.MST || r.taxCode || '').trim() === cleanMST);
        const { data: customerData } = await supabase.rpc('get_customer_for_worker', { p_mst: cleanMST });
        let customer = customerData && customerData[0];

        // FALLBACK: certificates table (Local Tool's output)
        if (!customer || !customer.pdf_url) {
            const { data: certData } = await supabase.rpc('get_certificate_for_worker', { p_mst: cleanMST });
            const cert = certData && certData[0];
            if (cert && cert.pdf_url) {
                console.log(`[Worker] [${log.id}] Found PDF in certificates table: ${cert.pdf_url}`);
                customer = { 
                    ...customer, 
                    pdf_url: cert.pdf_url, 
                    company_name: cert.company_name || recipientInExcel?.TenCongTy || customer?.company_name,
                    serial: cert.serial || recipientInExcel?.Serial || customer?.serial
                };
            }
        }

        // 1. PDF Handling (STRICT MODE)
        const shouldAttach = campaign.attach_cert === true || campaign.attach_cert === 'true' || campaign.attachCert === true || campaign.attachCert === 'true';
        if (shouldAttach) {
            if (customer && customer.pdf_url) {
                console.log(`[Worker] [${log.id}] Found existing PDF URL: ${customer.pdf_url}`);
                pdfAttachedStatus = '✅ Có PDF (Sẵn có)';
            } else {
                console.log(`[Worker] [${log.id}] PDF missing from CRM. Triggering Scraper...`);
                // Use Serial from Excel or CRM
                const targetSerial = recipientInExcel?.Serial || customer?.serial || '';
                
                const targetCustomer = customer || { 
                    mst: log.customer_id, 
                    company_name: recipientInExcel?.TenCongTy || recipientInExcel?.['Tên Công Ty'] || 'Quý Doanh Nghiệp'
                };
                
                // Only trigger scraper if we have a serial, or it's mandatory
                const scrapeResult = await scraperService.getLatestCertificate(browser, log.customer_id, targetSerial, targetCustomer);

                if (scrapeResult && scrapeResult.status === 'Matched') {
                    console.log(`[Worker] [${log.id}] Scraper found Match! Uploading file...`);
                    const fileBuffer = fs.readFileSync(scrapeResult.filePath);
                    const fileName = `${campaign.user_id}/${log.customer_id}_${Date.now()}.pdf`;

                    const { error: uploadError } = await supabase.storage
                        .from('pdf-attachments')
                        .upload(fileName, fileBuffer, { upsert: true });

                    if (uploadError) throw new Error(`Lỗi upload PDF: ${uploadError.message}`);

                    const { data: { publicUrl } } = supabase.storage.from('pdf-attachments').getPublicUrl(fileName);
                    
                    const customerUpdate = { 
                        mst: log.customer_id, 
                        pdf_url: publicUrl,
                        company_name: targetCustomer.company_name,
                        user_id: campaign.user_id
                    };

                    await supabase.rpc('upsert_customer_for_worker', {
                        p_mst: log.customer_id,
                        p_pdf_url: publicUrl,
                        p_company_name: targetCustomer.company_name,
                        p_user_id: campaign.user_id
                    });
                    
                    const { data: updatedCustomerData } = await supabase.rpc('get_customer_for_worker', { p_mst: log.customer_id });
                    customer = updatedCustomerData && updatedCustomerData[0];
                    pdfAttachedStatus = '✅ Có PDF (Mới tải)';
                    try { if (scrapeResult.dirPath) fs.rmSync(scrapeResult.dirPath, { recursive: true, force: true }); } catch(e) {}
                } else {
                    pdfAttachedStatus = `⚠ Không PDF cho MST ${log.customer_id} (${scrapeResult?.message || 'Không tìm thấy trên hệ thống'})`;
                    console.warn(`[Worker] [${log.id}] ${pdfAttachedStatus}`);
                }
            }
        } else {
            pdfAttachedStatus = 'Gửi không đính kèm';
        }

        // 2. Content Preparation
        const findVal = (obj, keys) => {
            if (!obj) return '';
            const entries = Object.entries(obj);
            for (const key of keys) {
                const found = entries.find(([k]) => k.toLowerCase().trim() === key.toLowerCase().trim());
                if (found && found[1]) return String(found[1]);
            }
            return '';
        };

        const dataForTags = {
            company_name: findVal(recipientInExcel, ['company_name', 'TenCongTy', 'Tên Công Ty', 'Name', 'companyName']) || customer?.company_name || 'Quý Doanh Nghiệp',
            mst: findVal(recipientInExcel, ['mst', 'MST', 'taxCode', 'Mã số thuế']) || customer?.mst || log.customer_id || '',
            address: findVal(recipientInExcel, ['dia_chi', 'DiaChi', 'Địa chỉ', 'Address']) || customer?.dia_chi || '',
            expired_date: findVal(recipientInExcel, ['NgayHetHanChuKySo', 'expired_date', 'Ngày hết hạn', 'Expiration', 'Hết hạn']) || customer?.expired_date || ''
        };

        const decodeEntities = (str) => {
            if (!str) return '';
            return str.replace(/&[#a-z0-9]+;/gi, match => {
                const map = { 
                    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
                    '&ecirc;': 'ê', '&ocirc;': 'ô', '&agrave;': 'à', '&aacute;': 'á', '&iacute;': 'í', 
                    '&ograve;': 'ò', '&oacute;': 'ó', '&ugrave;': 'ù', '&uacute;': 'ú', '&yacute;': 'ý', '&đ;': 'đ',
                    '&Agrave;': 'À', '&Aacute;': 'Á', '&Iacute;': 'Í', '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ugrave;': 'Ù', '&Uacute;': 'Ú'
                };
                return map[match.toLowerCase()] || match;
            }).normalize('NFC');
        };

        let html = decodeEntities(campaign.template || '');
        let subject = decodeEntities(campaign.subject || 'Thông báo từ Automation CA2');

        html = replaceTags(html, dataForTags);
        subject = replaceTags(subject, dataForTags);

        // Check for remaining tags
        if (html.includes('#') || subject.includes('#')) {
            console.warn(`[Worker] [${log.id}] ⚠ Warning: Detected '#' in final content. Possible unreplaced tags!`);
        }

        // 3. Sender & Transporter
        const { data: senderData, error: senderError } = await supabase.rpc('get_sender_for_worker', { p_sender_id: campaign.sender_account_id || campaign.senderAccountId });
        const sender = senderData && senderData[0];
        if (senderError || !sender) throw new Error('Tài khoản người gửi không tồn tại hoặc không thể truy cập.');

        const mailOptions = {
            from: `"${sender.senderName}" <${sender.senderEmail}>`,
            to: log.email, 
            subject: subject, 
            html: html,
            text: html.replace(/<[^>]*>?/gm, '').substring(0, 500), // Fallback text body
            headers: { "X-Mailer": "NodeMailer Automation" },
            attachments: []
        };

        // Validate Email
        if (!validateEmail(log.email)) {
            throw new Error(`Email không hợp lệ: ${log.email}`);
        }

        // Authenticated PDF attachment
        if (customer?.pdf_url && shouldAttach) {
            try {
                const storageInfo = getStorageInfo(customer.pdf_url);
                const attachmentFileName = `${cleanMST}.pdf`;
                if (storageInfo) {
                    const { data, error } = await supabase.storage.from(storageInfo.bucket).download(storageInfo.path);
                    if (error) throw error;
                    mailOptions.attachments.push({ filename: attachmentFileName, content: Buffer.from(await data.arrayBuffer()) });
                    console.log(`[Worker] [${log.id}] Attached PDF via authenticated download.`);
                } else {
                    const response = await axios.get(customer.pdf_url, { responseType: 'arraybuffer' });
                    mailOptions.attachments.push({ filename: attachmentFileName, content: Buffer.from(response.data) });
                    console.log(`[Worker] [${log.id}] Attached PDF via public URL.`);
                }
            } catch (err) {
                console.error(`[Worker] [${log.id}] PDF attachment failed:`, err.message);
                pdfAttachedStatus += ` (Lỗi đính kèm: ${err.message})`;
            }
        }

        let finalMessageId = null;

        const sendWithRetry = async (options, senderData, maxRetries = 3) => {
            let lastErr = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[Worker] [${log.id}] Attempt ${attempt}/${maxRetries} to send email...`);
                    
                    if (senderData.smtpHost === 'oauth2.google') {
                        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
                        oauth2Client.setCredentials({ refresh_token: senderData.smtpPassword });
                        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                        
                        const tempTransporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });
                        const info = await tempTransporter.sendMail(options);
                        const chunks = [];
                        for await (const chunk of info.message) chunks.push(chunk);
                        const base64Raw = Buffer.concat(chunks).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                        
                        const gResponse = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Raw } });
                        return gResponse.data.id;
                    } else {
                        console.log(`[Worker] SMTP Config: host=${senderData.smtpHost}, port=${senderData.smtpPort}, user=${senderData.smtpUser}, secure=${senderData.smtpPort == 465}`);
                        const transporter = nodemailer.createTransport({
                            host: senderData.smtpHost, port: parseInt(senderData.smtpPort),
                            secure: senderData.smtpPort == 465,
                            auth: { user: senderData.smtpUser, pass: senderData.smtpPassword },
                            tls: { rejectUnauthorized: false },
                            connectionTimeout: 10000, // 10s
                            greetingTimeout: 5000     // 5s
                        });
                        
                        // Verification Step
                        await transporter.verify();
                        
                        const info = await transporter.sendMail(options);
                        return info.messageId;
                    }
                } catch (err) {
                    lastErr = err;
                    console.error(`[Worker] [${log.id}] Attempt ${attempt} failed: ${err.message}${err.code ? ' (' + err.code + ')' : ''}`);
                    if (attempt < maxRetries) {
                        const delaySec = attempt * 3000; // 3s, 6s...
                        await new Promise(r => setTimeout(r, delaySec));
                    }
                }
            }
            throw lastErr;
        };

        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'processing',
            p_error_message: 'Đang thực hiện gửi (Retry loop)...'
        }).catch(() => {});
        
        console.log("[Worker] Sending Email Diagnostic:", {
            email: log.email,
            mst: cleanMST,
            pdf_url: customer?.pdf_url || "NONE",
            content_preview: html.substring(0, 100) + "..."
        });

        finalMessageId = await sendWithRetry(mailOptions, sender);

        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: 'sent',
            p_sent_time: new Date().toISOString(),
            p_message_id: finalMessageId,
            p_error_message: `Hoàn thành | PDF: ${pdfAttachedStatus}`
        });

        console.log(`[Worker] [${log.id}] ✅ Email sent successfully to ${log.email}`);

        await supabase.rpc('increment_campaign_success', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);

    } catch (err) {
        console.error(`[Worker] [${log.id}] ❌ FAIL: ${err.message}`);
        const newRetryCount = (log.retry_count || 0) + 1;
        const isTerminal = newRetryCount >= 3;
        await supabase.rpc('update_email_log_for_worker', {
            p_log_id: log.id,
            p_status: isTerminal ? 'failed_permanent' : 'failed',
            p_error_message: `${pdfAttachedStatus} | Lỗi: ${err.message}`,
            p_sent_time: new Date().toISOString()
        }).catch(() => {});

        if (isTerminal) await supabase.rpc('increment_campaign_error', { campaign_id: log.campaign_id });
        await checkCampaignCompletion(log.campaign_id);
    }
}

async function checkCampaignCompletion(campaign_id) {
    try {
        const { data: remainingCount, error: countErr } = await supabase.rpc('get_remaining_tasks_count', { p_campaign_id: campaign_id });
        if (countErr) throw countErr;
        
        if (parseInt(remainingCount) === 0) {
            const { data: campaignData, error: campaignGetErr } = await supabase.rpc('get_campaign_for_worker', { p_campaign_id: campaign_id });
            const campaign = campaignData && campaignData[0];
            const total = (campaign?.recipients || []).length;
            const final = (campaign?.error_count || 0) > 0 ? `Hoàn thành (Lỗi ${campaign.error_count}/${total})` : 'Hoàn thành';
            await supabase.rpc('update_campaign_status_for_worker', {
                p_campaign_id: campaign_id,
                p_status: final
            });
        }
    } catch (e) {}
}

async function startRecoveryWorker() {
    if (isRecoveryRunning) return;
    isRecoveryRunning = true;
    try { await supabase.rpc('recover_failed_tasks'); } catch (err) {} finally { isRecoveryRunning = false; }
}

setInterval(startWorker, WORKER_INTERVAL);
setInterval(startRecoveryWorker, RECOVERY_INTERVAL);
module.exports = { startWorker, processEmailTask };
