const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');
require('dotenv').config();

const excelService = require('./services/excelService');
const emailService = require('./services/emailService');
const scraperService = require('./services/scraperService');
const supabase = require('./services/supabaseClient');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NODE_ENV === 'production' 
        ? 'https://automation-ca2.onrender.com/api/auth/google/callback'
        : 'http://localhost:3000/api/auth/google/callback'
);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure required directories exist for temp file processing
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

const upload = multer({ dest: 'uploads/' });

// Serve Supabase config to frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY
    });
});

// Middleware to verify Supabase Auth Session
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: 'Invalid session' });

    req.user = user;
    next();
};

// Routes
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const filePath = req.file.path;
        const data = excelService.parseExcel(filePath);
        fs.unlinkSync(filePath); // Clean up
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PDF Upload to Supabase Storage
app.post('/api/customers/upload-pdf', authenticate, upload.single('pdf'), async (req, res) => {
    try {
        const { taxCode } = req.body;
        if (!taxCode || !req.file) {
            return res.status(400).json({ error: 'Missing taxCode or pdf file' });
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${req.user.id}/${taxCode}_${Date.now()}${fileExt}`;
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pdf-attachments')
            .upload(fileName, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        fs.unlinkSync(filePath); // Cleanup local temp file

        if (uploadError) throw uploadError;

        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('pdf-attachments')
            .getPublicUrl(fileName);

        // Update customer record
        const { error: updateError } = await supabase
            .from('customers')
            .update({ pdf_url: publicUrl })
            .eq('taxCode', taxCode)
            .eq('userId', req.user.id);

        if (updateError) throw updateError;

        res.json({ message: 'Upload thành công', pdfUrl: publicUrl });
    } catch (error) {
        console.error('PDF Upload Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Google OAuth2 Routes
app.get('/api/auth/google/url', authenticate, (req, res) => {
    // We pass the userId in state so we know who is connecting this account
    const state = req.user.id;
    
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force consent so we get a refresh token
        scope: [
            'https://www.googleapis.com/auth/gmail.send', 
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        state: state
    });
    res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) {
            return res.status(400).send('Missing code or state (userId).');
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Fetch user info (email)
        const oauth2 = google.oauth2({
            auth: oauth2Client,
            version: 'v2'
        });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;
        const name = userInfo.data.name || email;

        // Ensure we got a refresh token
        if (!tokens.refresh_token) {
            return res.status(400).send(`
                <h2>Kết nối thất bại</h2>
                <p>Google không trả về Refresh Token. Vui lòng vào Cài đặt tài khoản Google -> Xóa quyền của ứng dụng Automation CA2. Sau đó kết nối lại và nhớ TICK chọn vào ô "Gửi email thay bạn" (Send email on your behalf).</p>
                <script>setTimeout(() => window.close(), 10000)</script>
            `);
        }
        
        // Verify scopes if possible
        if (tokens.scope && !tokens.scope.includes('gmail.send') && !tokens.scope.includes('mail.google.com')) {
            return res.status(400).send(`
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: red;">⚠ LỖI: Bạn chưa cấp quyền gửi thư!</h2>
                    <p>Ở màn hình đăng nhập Google, bạn đã BỎ QUA việc đánh dấu tick (☑) vào ô cho phép ứng dụng gửi email.</p>
                    <p><b>Cách khắc phục:</b></p>
                    <ol>
                        <li>Đóng cửa sổ này lại.</li>
                        <li>Bấm "Kết nối Gmail API" lại một lần nữa.</li>
                        <li>Đến bước đòi quyền, <b>HÃY TICK VÀO Ô VUÔNG CÓ CHỮ "Gửi email"</b> rồi mới bấm Tiếp tục.</li>
                    </ol>
                </div>
            `);
        }

        // Save sender inside Supabase using smtpPassword as the refresh_token placeholder
        const newSender = {
            id: Date.now().toString(),
            userId: userId,
            senderName: name,
            senderEmail: email,
            smtpHost: 'oauth2.google', // Marker to indicate OAuth2
            smtpPort: 465,
            smtpUser: email,
            smtpPassword: tokens.refresh_token,
            createdAt: new Date().toISOString()
        };

        const { error } = await supabase.from('senders').insert([newSender]);
        if (error) {
            return res.status(500).send('Lỗi khi lưu tài khoản vào CSDL: ' + error.message);
        }

        // Return a simple success page that closes itself and refreshes parent
        res.send(`
            <html><body>
            <h2>Kết nối Gmail thành công!</h2>
            <p>Tài khoản <b>${email}</b> đã được kết nối.</p>
            <p>Cửa sổ này sẽ tự đóng...</p>
            <script>
                if (window.opener) {
                    window.opener.postMessage('google_auth_success', '*');
                    window.setTimeout(() => window.close(), 2000);
                }
            </script>
            </body></html>
        `);
    } catch (error) {
        console.error('Google OAuth Callback Error:', error);
        res.status(500).send('Lỗi máy chủ nội bộ khi xác thực Google: ' + error.message);
    }
});

// Sender Routes
app.get('/api/senders', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('senders')
        .select('*')
        .eq('userId', req.user.id)
        .order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/senders', authenticate, async (req, res) => {
    const newSender = {
        id: Date.now().toString(),
        userId: req.user.id,
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        smtpHost: req.body.smtpHost,
        smtpPort: req.body.smtpPort,
        smtpUser: req.body.smtpUser,
        smtpPassword: req.body.smtpPassword,
        createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('senders').insert([newSender]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.put('/api/senders/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const updates = {
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        smtpHost: req.body.smtpHost,
        smtpPort: req.body.smtpPort,
        smtpUser: req.body.smtpUser,
        smtpPassword: req.body.smtpPassword
    };
    const { data, error } = await supabase
        .from('senders')
        .update(updates)
        .eq('id', id)
        .eq('userId', req.user.id)
        .select();
    
    if (error) return res.status(500).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ error: 'Sender not found or unauthorized' });
    res.json(data[0]);
});

app.delete('/api/senders/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('senders')
        .delete()
        .eq('id', id)
        .eq('userId', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Sender deleted successfully' });
});

// Template Routes
app.get('/api/templates', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('userId', req.user.id)
        .order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/templates', authenticate, async (req, res) => {
    const newTemplate = {
        id: Date.now().toString(),
        userId: req.user.id,
        name: req.body.name,
        content: req.body.content,
        createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('templates').insert([newTemplate]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

// Google Sheets Integration
app.post('/api/gsheets', async (req, res) => {
    try {
        const { url } = req.body;
        let exportUrl = url.replace(/\/edit.*$/, '/export?format=csv');
        if (!exportUrl.includes('/export?format=csv')) {
            exportUrl = exportUrl.replace(/\/$/, '') + '/export?format=csv';
        }

        const response = await axios.get(exportUrl, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const data = rawData.map(row => {
            const serial = row[2]; // Column C
            const mst = row[4];
            const tenCongTy = row[3];
            const diaChi = row[6];
            const ngayHetHan = row[10];
            const email = row[8];

            if (!mst) return null;

            return {
                Serial: serial ? serial.toString().trim() : '',
                MST: mst.toString().trim(),
                TenCongTy: tenCongTy ? tenCongTy.toString().trim() : '',
                DiaChi: diaChi ? diaChi.toString().trim() : '',
                Email: email ? email.toString().trim() : '',
                NgayHetHanChuKySo: excelService.formatDate(ngayHetHan)
            };
        }).filter(row => row !== null);

        res.json({ data });
    } catch (error) {
        console.error('Error fetching Google Sheet:', error.message);
        res.status(500).json({ error: 'Không thể đọc dữ liệu từ Google Sheet. Vui lòng kiểm tra quyền truy cập (Công khai).' });
    }
});

app.get('/api/campaigns', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('userId', req.user.id)
        .order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/campaigns', authenticate, async (req, res) => {
    const campaignId = Date.now().toString();
    const newCampaign = {
        id: campaignId,
        userId: req.user.id,
        name: req.body.name,
        subject: req.body.subject,
        senderAccountId: req.body.senderAccountId,
        template: req.body.template,
        recipients: (req.body.recipients || []).map(r => ({ ...r, status: 'Chờ xử lý', sentTime: null })),
        attachCert: req.body.attachCert || false,
        status: 'Chờ gửi',
        sentCount: 0,
        successCount: 0,
        errorCount: 0,
        createdAt: new Date().toISOString()
    };

    try {
        const { data, error } = await supabase.from('campaigns').insert([newCampaign]).select();
        if (error) throw error;

        // Create initial logs in email_logs table for the worker
        const logs = (req.body.recipients || []).map(r => ({
            customer_id: r.MST ? String(r.MST).trim() : '',
            campaign_id: campaignId,
            email: r.Email ? String(r.Email).trim() : '',
            status: 'pending',
            retry_count: 0,
            created_at: new Date().toISOString()
        }));

        if (logs.length > 0) {
            const { error: logsError } = await supabase.from('email_logs').insert(logs);
            if (logsError) console.error('Error creating email_logs:', logsError);
        }

        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/campaigns/:id/send', authenticate, async (req, res) => {
    // Fetch campaign from Supabase with userId check
    const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', req.params.id)
        .eq('userId', req.user.id)
        .single();
    
    if (campaignError || !campaign) return res.status(404).json({ error: 'Campaign not found or unauthorized' });
    
    // Fetch sender account details with userId check
    const { data: sender, error: senderError } = await supabase
        .from('senders')
        .select('*')
        .eq('id', campaign.senderAccountId)
        .eq('userId', req.user.id)
        .single();
    
    if (senderError || !sender) return res.status(400).json({ error: 'Không tìm thấy cấu hình người gửi hợp lệ.' });

    // Update status to "Đang gửi"
    await supabase.from('campaigns').update({ status: 'Đang gửi' }).eq('id', campaign.id);

    res.json({ message: 'Chiến dịch đã được đưa vào hàng đợi gửi ngầm.' });
});

// Email Logs Route
app.get('/api/email-logs', authenticate, async (req, res) => {
    try {
        // First get user's campaign IDs
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id')
            .eq('userId', req.user.id);
        
        const campaignIds = campaigns.map(c => c.id);

        if (campaignIds.length === 0) return res.json([]);

        const { data, error } = await supabase
            .from('email_logs')
            .select('*')
            .in('campaign_id', campaignIds)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/campaigns/:id', authenticate, async (req, res) => {
    const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', req.params.id)
        .eq('userId', req.user.id);
    if (error) return res.status(500).json({ error: 'Lỗi khi xóa chiến dịch hoặc Unauthorized.' });
    res.json({ message: 'Đã xóa chiến dịch thành công.' });
});

app.get('/api/stats', authenticate, async (req, res) => {
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('sentCount, successCount, errorCount')
        .eq('userId', req.user.id);
    if (error) return res.status(500).json({ error: error.message });

    const stats = campaigns.reduce((acc, c) => {
        acc.totalSent += c.sentCount || 0;
        acc.totalSuccess += c.successCount || 0;
        acc.totalError += c.errorCount || 0;
        return acc;
    }, { totalSent: 0, totalSuccess: 0, totalError: 0 });
    
    res.json(stats);
});

// CRM Routes
app.get('/api/customers', authenticate, async (req, res) => {
    let query = supabase.from('customers').select('*').eq('userId', req.user.id);
    
    const { filter } = req.query;
    const now = new Date().toISOString().split('T')[0];
    const getDateNDaysAway = (n) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().split('T')[0];
    };

    if (filter === 'expired') {
        query = query.lt('expirationDate', now);
    } else if (filter === '30') {
        query = query.gte('expirationDate', now).lte('expirationDate', getDateNDaysAway(30));
    } else if (filter === '60') {
        query = query.gte('expirationDate', now).lte('expirationDate', getDateNDaysAway(60));
    } else if (filter === '90') {
        query = query.gte('expirationDate', now).lte('expirationDate', getDateNDaysAway(90));
    }

    const { data, error } = await query.order('expirationDate', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/customers/import', authenticate, async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data must be an array' });

    const customers = data.map(c => ({
        id: (c.MST ? String(c.MST).trim() : Date.now().toString() + Math.random().toString(36).substr(2, 5)).toString(),
        userId: req.user.id,
        taxCode: c.MST ? String(c.MST).trim() : '',
        companyName: c.TenCongTy ? String(c.TenCongTy).trim() : '',
        email: c.Email ? String(c.Email).trim() : '',
        expirationDate: c.NgayHetHanChuKySo ? String(c.NgayHetHanChuKySo).trim() : '',
        Serial: c.Serial ? String(c.Serial).trim() : '',
        status: 'Chưa liên hệ'
    }));

    try {
        // 1. Get IDs of customers being imported
        const ids = customers.map(c => c.id);

        // 2. Fetch existing customers to preserve fields like pdf_url
        const { data: existingCustomers } = await supabase
            .from('customers')
            .select('id, pdf_url')
            .in('id', ids)
            .eq('userId', req.user.id);

        // 3. Map existing pdf_url back to the new objects
        if (existingCustomers && existingCustomers.length > 0) {
            const pdfMap = {};
            existingCustomers.forEach(ec => { if (ec.pdf_url) pdfMap[ec.id] = ec.pdf_url; });
            
            customers.forEach(c => {
                if (pdfMap[c.id]) c.pdf_url = pdfMap[c.id];
            });
        }

        const { error } = await supabase.from('customers').upsert(customers);
        if (error) throw error;
        res.json({ message: `Đã nhập ${customers.length} khách hàng.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/customers/:id', authenticate, async (req, res) => {
    const { status, notes } = req.body;
    const { data, error } = await supabase
        .from('customers')
        .update({ status, notes })
        .eq('id', req.params.id)
        .eq('userId', req.user.id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.get('/api/customers/:id', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', req.params.id)
        .eq('userId', req.user.id)
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Scrape Certificate for a customer
app.post('/api/customers/:id/scrape', authenticate, async (req, res) => {
    const { id } = req.params;
    let browser = null;
    try {
        // 1. Get customer
        const { data: customer, error: fetchError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('userId', req.user.id)
            .single();
        
        if (fetchError || !customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
        if (!customer.taxCode) return res.status(400).json({ error: 'Khách hàng không có MST' });

        console.log(`[Scraper] Starting manual scrape for MST: ${customer.taxCode}`);
        
        // 2. Init Browser
        const { initBrowser, getLatestCertificate } = require('./services/scraperService');
        browser = await initBrowser();
        
        // 3. Scrape
        const result = await getLatestCertificate(browser, customer.taxCode, customer.Serial || '', customer);
        
        if (result && result.status === 'Matched') {
            console.log(`[Scraper] Scrape success for ${customer.taxCode}. Uploading to Supabase...`);
            
            // 4. Upload to Supabase Storage
            const fileBuffer = fs.readFileSync(result.filePath);
            const path = require('path');
            const fileName = `${req.user.id}/${customer.taxCode}_${Date.now()}.pdf`;
            
            const { error: uploadError } = await supabase.storage
                .from('pdf-attachments')
                .upload(fileName, fileBuffer, { contentType: 'application/pdf', upsert: true });

            if (uploadError) throw uploadError;

            // 5. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('pdf-attachments')
                .getPublicUrl(fileName);

            // 6. Update Customer record
            await supabase.from('customers').update({ pdf_url: publicUrl }).eq('id', id);

            // Cleanup local file
            try { 
                if (result.dirPath) fs.rmSync(result.dirPath, { recursive: true, force: true }); 
            } catch(e) {}

            res.json({ success: true, pdf_url: publicUrl });
        } else {
            res.status(404).json({ error: result?.message || 'Không tìm thấy chứng thư trên hệ thống CA' });
        }
    } catch (error) {
        console.error('[Scraper Error]:', error);
        res.status(500).json({ error: 'Lỗi khi tra cứu: ' + error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// 3. Test Email Endpoint (Mục 3)
app.post('/api/test-send-email', authenticate, async (req, res) => {
    try {
        const { senderId, testEmail, testPdfUrl, testTaxCode } = req.body;
        if (!senderId || !testEmail) return res.status(400).json({ error: 'Missing senderId or testEmail' });

        // 1. Fetch Sender
        const { data: sender, error: senderError } = await supabase
            .from('senders')
            .select('*')
            .eq('id', senderId)
            .eq('userId', req.user.id)
            .single();
        
        if (senderError || !sender) return res.status(404).json({ error: 'Sender not found' });

        console.log(`[TestSend] 🧪 Starting test send To: ${testEmail} (PDF: ${testPdfUrl || 'No'})`);

        // 2. Prepare Transporter (OAuth2)
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });
        
        try {
            await oauth2Client.getAccessToken();
        } catch (tokenErr) {
            return res.status(401).json({ error: 'Không thể làm mới quyền Gmail. Vui lòng kết nối lại.', details: tokenErr.message });
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({ streamTransport: true, newline: 'windows' });

        const mailOptions = {
            from: `"${sender.senderName}" <${sender.senderEmail}>`,
            to: testEmail,
            replyTo: sender.senderEmail,
            subject: 'Test Email từ Automation CA2 - Verification',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #f97316;">Hello World!</h2>
                    <p>Đây là email thử nghiệm để kiểm tra kết nối Gmail API và Đính kèm PDF.</p>
                    <hr>
                    <p style="font-size: 12px; color: gray;">Timestamp: ${new Date().toISOString()}</p>
                </div>
            `,
            attachments: []
        };

        // 3. Optional PDF Attachment for Testing
        if (testPdfUrl) {
            console.log(`[TestSend] Downloading test PDF from: ${testPdfUrl}`);
            const response = await axios.get(testPdfUrl, { responseType: 'arraybuffer' });
            mailOptions.attachments.push({
                filename: `${testTaxCode || 'TEST'}_Certification.pdf`,
                content: Buffer.from(response.data),
                contentType: 'application/pdf'
            });
            console.log(`[TestSend] PDF attached. Size: ${response.data.length} bytes`);
        }

        const info = await transporter.sendMail(mailOptions);
        const chunks = [];
        for await (const chunk of info.message) chunks.push(chunk);
        const messageBuffer = Buffer.concat(chunks);
        const base64EncodedEmail = messageBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        const gResponse = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: base64EncodedEmail }
        });

        if (gResponse.data && gResponse.data.id) {
            res.json({ 
                success: true, 
                message: 'Email test đã được gửi!', 
                messageId: gResponse.data.id,
                pdfAttached: !!testPdfUrl
            });
        } else {
            throw new Error('Gmail API không trả về messageId');
        }
    } catch (error) {
        console.error('[TestSend] ❌ Error:', error);
        res.status(500).json({ error: 'Lỗi khi gửi test: ' + error.message });
    }
});

app.get('/api/crm/stats', authenticate, async (req, res) => {
    const { data: customers, error } = await supabase
        .from('customers')
        .select('expirationDate')
        .eq('userId', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date();
    const stats = { expired: 0, within30: 0, within60: 0, within90: 0, total: customers.length };

    customers.forEach(c => {
        if (!c.expirationDate) return;
        const exp = new Date(c.expirationDate);
        const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) stats.expired++;
        else if (diffDays <= 30) stats.within30++;
        else if (diffDays <= 60) stats.within60++;
        else if (diffDays <= 90) stats.within90++;
    });

    res.json(stats);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    // Start the background worker
    emailService.startWorker();
});
