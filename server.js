const dns = require('dns');
// FIX: Máy chủ Render (Free Tier) bị lỗi định tuyến mạng IPv6 ra ngoài (gây ENETUNREACH khi gửi Mail hoặc Fetch)
// Force toàn bộ Node.js server ưu tiên dùng mạng IPv4 100% - LUÔN ĐỂ Ở DÒNG 1
dns.setDefaultResultOrder('ipv4first');

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
const { adminClient: supabase, anonClient, getClient } = require('./services/supabaseClient');
const { google } = require('googleapis');

// Removed PUPPETEER_CACHE_DIR override to allow .puppeteerrc.cjs to manage cache location (Phase 8)

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

app.get('/api/diag', async (req, res) => {
    try {
        const { data: logs, error: lerr } = await supabase.from('email_logs').select('id,status,error_message,customer_id,retry_count').order('created_at', { ascending: false }).limit(10);
        const { data: camps, error: cerr } = await supabase.from('campaigns').select('id,status,sent_count,error_count,success_count').order('created_at', { ascending: false }).limit(2);
        
        let rpcTestError = null;
        if (logs && logs.length > 0) {
            const testLog = logs[0];
            const result = await supabase.rpc('update_email_log_for_worker', {
                p_log_id: testLog.id,
                p_status: testLog.status, // Keep same status
                p_error_message: 'Diagnose test',
                p_message_id: null,
                p_sent_time: null
            });
            rpcTestError = result.error;
        }

        res.json({
            nodeVersion: process.version,
            hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            hasSmtpUser: !!process.env.SMTP_USER,
            hasSmtpPass: !!process.env.SMTP_PASS,
            smtpHost: process.env.SMTP_HOST,
            smtpPort: process.env.SMTP_PORT,
            rpcTestError: rpcTestError,
            recentCampaigns: camps,
            campsError: cerr,
            recentLogs: logs,
            logsError: lerr
        });
    } catch(e) {
        res.json({ error: e.message });
    }
});

// Endpoint phục vụ TEST END-TO-END luồng email (Yêu cầu Phần 4)
app.get('/api/test-email', async (req, res) => {
    try {
        const targetEmail = req.query.email;
        if (!targetEmail) return res.status(400).json({ error: 'Thiếu query ?email=...' });
        
        const result = await emailService.testEmailFlow(targetEmail);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});


app.get('/api/debug-sender', async (req, res) => {
    try {
        const { data: senders } = await supabase.from('senders').select('*').limit(1);
        if (!senders || senders.length === 0) return res.json({ error: 'No senders found' });
        
        const sender = senders[0];
        const token = sender.smtpPassword || '';
        res.json({
            id: sender.id,
            smtpHost: sender.smtpHost,
            token_length: token.length,
            token_prefix: token.substring(0, 10) + '...',
            clientId_length: (process.env.GOOGLE_CLIENT_ID || '').length,
            clientSecret_length: (process.env.GOOGLE_CLIENT_SECRET || '').length,
            supabaseServiceKey_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/debug-worker', async (req, res) => {
    try {
        const { count: campCount } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });
        const { count: logCount } = await supabase.from('email_logs').select('*', { count: 'exact', head: true });
        const { data: logs } = await supabase.from('email_logs').select('status');
        
        const statusCounts = {};
        if (logs) {
            logs.forEach(l => {
                statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
            });
        }
        
        const { data: recentLogs } = await supabase.from('email_logs').select('id, campaign_id, status, error_message, created_at').order('created_at', { ascending: false }).limit(5);
        
        const heartbeat = emailService.getHeartbeat();
        
        res.json({
            serviceKey_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            worker_last_run: heartbeat.time,
            current_task_id: heartbeat.task,
            current_step: heartbeat.step,
            last_error: heartbeat.error,
            campaigns_total: campCount || 0,
            email_logs_total: logCount || 0,
            status_breakdown: statusCounts,
            pending_logs_count: statusCounts['pending'] || 0,
            recent_logs: recentLogs
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/count-all', async (req, res) => {
    try {
        const { count: camps } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });
        const { count: logs } = await supabase.from('email_logs').select('*', { count: 'exact', head: true });
        const { count: senders } = await supabase.from('senders').select('*', { count: 'exact', head: true });
        const { count: temps } = await supabase.from('templates').select('*', { count: 'exact', head: true });
        const { count: cust } = await supabase.from('customers').select('*', { count: 'exact', head: true });
        res.json({ campaigns: camps, logs, senders, templates: temps, customers: cust });
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/net-diag', async (req, res) => {
    const results = {};
    try {
        const dns = require('dns').promises;
        const target = 'smtp.gmail.com';
        
        results.dns_v4 = await dns.resolve4(target).catch(e => e.message);
        results.dns_v6 = await dns.resolve6(target).catch(e => e.message);
        results.dns_lookup = await dns.lookup(target).catch(e => e.message);
        results.dns_lookup_v4 = await dns.lookup(target, { family: 4 }).catch(e => e.message);
        
        const net = require('net');
        const checkPort = (host, port) => new Promise(res => {
            const socket = net.createConnection(port, host);
            socket.setTimeout(3000);
            socket.on('connect', () => { socket.destroy(); res('OPEN'); });
            socket.on('error', (e) => res('CLOSED: ' + e.message));
            socket.on('timeout', () => { socket.destroy(); res('TIMEOUT'); });
        });
        
        results.port_587 = await checkPort(target, 587);
        results.port_465 = await checkPort(target, 465);
        
        res.json(results);
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/reset-worker', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('email_logs')
            .update({ 
                status: 'pending', 
                last_retry_time: null,
                error_message: 'Manual reset via /api/reset-worker'
            })
            .eq('status', 'processing')
            .select('*', { count: 'exact', head: true });
            
        res.json({
            success: true,
            rows_affected: count || 0,
            error: error ? error.message : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Middleware to verify Supabase Auth Session
const authenticate = async (req, res, next) => {
    let token = req.query.access_token; // Support URL-based auth for reports
    
    if (!token && req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        console.warn('[AUTH] Missing token');
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    try {
        const { data: { user }, error } = await anonClient.auth.getUser(token);
        
        if (error || !user) {
            console.error('[AUTH] getUser failed:', error?.message || 'No user found', 'Token prefix:', token.substring(0, 10));
            return res.status(401).json({ error: 'Invalid session: ' + (error?.message || 'No user found') });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (e) {
        console.error('[AUTH] Critical error during authentication:', e.message);
        return res.status(500).json({ error: 'Internal Auth Error' });
    }
};

// Direct SMTP Test - Tests a specific sender from DB
app.get('/api/test-smtp', authenticate, async (req, res) => {
    try {
        const senderId = req.query.sender_id;
        const targetEmail = req.query.email || req.user.email;
        if (!senderId) {
            const { data: senders } = await getClient(req.token).from('senders').select('id, senderName, senderEmail, smtpHost, smtpPort, smtpUser').eq('user_id', req.user.id);
            return res.json({ message: 'Add ?sender_id=XXX&email=YYY to test.', senders });
        }
        const { data: senders } = await getClient(req.token).from('senders').select('*').eq('id', senderId).eq('user_id', req.user.id);
        if (!senders || senders.length === 0) return res.status(404).json({ error: 'Sender not found' });
        const sender = senders[0];
        const { transporter, fromEmail, senderName } = await emailService.createTransporter(sender);
        const info = await transporter.sendMail({
            from: `"[TEST] ${senderName}" <${fromEmail}>`,
            to: targetEmail,
            subject: `[SMTP Test] ${new Date().toISOString()}`,
            html: '<h2>SMTP Test OK!</h2><p>Email này xác nhận cấu hình SMTP đúng.</p>'
        });
        res.json({ success: true, messageId: info.messageId, response: info.response, from: fromEmail, to: targetEmail });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        // Fast-path: Auto-confirm & bypass limits if Service Role Key is available
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name: name }
            });

            if (adminError) return res.status(400).json({ error: adminError.message });
            
            // Auto login
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
            if (loginError) return res.status(400).json({ error: loginError.message });
            
            return res.json({ token: loginData.session.access_token, user: loginData.user });
        }

        // Standard Supabase Sign Up (subject to Rate Limits & strict email confirmations)
        const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: name } }
        });

        if (error) {
            if (error.message.toLowerCase().includes('rate limit')) {
                return res.status(400).json({ error: 'Hệ thống Supabase đang giới hạn số lượng email gửi ra (Rate Limit - 3 email/giờ cho gói Free). Vui lòng thử lại sau, hoặc yêu cầu admin tắt tính năng Confirm Email.' });
            }
            return res.status(400).json({ error: error.message });
        }

        if (!data.session) {
            return res.status(200).json({ message: 'Đăng ký thành công! Vui lòng kiểm tra hộp thư (hoặc Thư rác/Spam) để xác nhận trước khi đăng nhập.' });
        }

        res.json({ token: data.session.access_token, user: data.user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message.includes('Email not confirmed')) {
                return res.status(400).json({ error: 'Vui lòng kiểm tra email và nhấp vào link xác nhận trước khi đăng nhập.' });
            }
            return res.status(400).json({ error: 'Email hoặc mật khẩu không chính xác.' });
        }
        res.json({ token: data.session.access_token, user: data.user });
    } catch (err) {
         res.status(500).json({ error: err.message });
    }
});

app.get('/api/me', async (req, res) => {
    try {
        let token = req.headers.authorization;
        if (!token) return res.status(401).json({ error: 'No token' });
        token = token.replace('Bearer ', '');
        if (token === 'undefined' || token === 'null') return res.status(401).json({ error: 'Invalid token' });
        
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return res.status(401).json({ error: 'Unauthorized' });
        
        res.json(data.user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
            .eq('user_id', req.user.id);

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
            user_id: userId,
            senderName: name,
            senderEmail: email,
            smtpHost: 'oauth2.google', // Marker to indicate OAuth2
            smtpPort: 465,
            smtpUser: email,
            smtpPassword: tokens.refresh_token,
            created_at: new Date().toISOString()
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
    const { data, error } = await getClient(req.token)
        .from('senders')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/senders', authenticate, async (req, res) => {
    const newSender = {
        id: Date.now().toString(),
        user_id: req.user.id,
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        smtpHost: req.body.smtpHost,
        smtpPort: req.body.smtpPort,
        smtpUser: req.body.smtpUser,
        smtpPassword: req.body.smtpPassword,
        created_at: new Date().toISOString()
    };
    const { data, error } = await getClient(req.token).from('senders').insert([newSender]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.patch('/api/senders/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const updates = {
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        smtpHost: req.body.smtpHost,
        smtpPort: req.body.smtpPort,
        smtpUser: req.body.smtpUser
    };
    if (req.body.smtpPassword !== undefined) {
        updates.smtpPassword = req.body.smtpPassword;
    }
    const { data, error } = await getClient(req.token)
        .from('senders')
        .update(updates)
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select();
    
    if (error) return res.status(500).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ error: 'Sender not found or unauthorized' });
    res.json(data[0]);
});

app.delete('/api/senders/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { error } = await getClient(req.token)
        .from('senders')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Sender deleted successfully' });
});

// Template Routes
app.get('/api/templates', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/templates', authenticate, async (req, res) => {
    const newTemplate = {
        id: Date.now().toString(),
        user_id: req.user.id,
        name: req.body.name,
        content: req.body.content,
        created_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('templates').insert([newTemplate]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.delete('/api/templates/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Mẫu đã được xóa.' });
});

// CA2 CRM Internal Tool API
/**
 * Helper to calculate expiration date based on start date and duration string
 */
function calculateExpirationDate(startDate, duration) {
    if (!startDate || !duration) return null;
    try {
        const start = new Date(startDate);
        let daysToAdd = 0;
        
        // Exact formula from user:
        // Gia hạn 1 năm: +365 + 90
        // Gia hạn 2 năm: +365*2 + 180
        // Gia hạn 3 năm: +365*3 + 270
        // Cấp mới X năm: +365*X
        
        if (duration.includes('Gia hạn')) {
            if (duration.includes('1 năm')) daysToAdd = 365 + 90;
            else if (duration.includes('2 năm')) daysToAdd = (365 * 2) + 180;
            else if (duration.includes('3 năm')) daysToAdd = (365 * 3) + 270;
        } else if (duration.includes('Cấp mới')) {
            if (duration.includes('1 năm')) daysToAdd = 365;
            else if (duration.includes('2 năm')) daysToAdd = 365 * 2;
            else if (duration.includes('3 năm')) daysToAdd = 365 * 3;
        } else {
            // Fallback for old simple "1 năm" etc.
            const years = parseInt(duration);
            if (!isNaN(years)) daysToAdd = years * 365;
        }

        if (daysToAdd === 0) return null;
        
        const date = new Date(start.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

app.get('/api/ca2-crm', authenticate, async (req, res) => {
    try {
        const { data, error } = await getClient(req.token)
            .from('customers')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Enhance data with calculated fields
        const enhancedData = data.map(c => {
            const now = new Date();
            const exp = c.expired_date ? new Date(c.expired_date) : null;
            let daysLeft = null;
            let status = 'active';

            if (exp) {
                daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
                if (daysLeft < 0) status = 'expired'; // Purple
                else if (daysLeft <= 30) status = 'critical'; // Red
                else if (daysLeft <= 60) status = 'warning'; // Orange
                else status = 'active'; // Green
            }

            return { ...c, daysLeft, status };
        });

        res.json({ data: enhancedData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ca2-crm', authenticate, async (req, res) => {
    try {
        const { mst, company_name, email, phone, service_type, start_date, duration } = req.body;
        
        // Auto-calculate expiration if not provided
        const expirationDate = calculateExpirationDate(start_date, duration);

        const { data, error } = await getClient(req.token).from('customers').upsert({
            mst, 
            company_name, 
            email, 
            phone, 
            service_type, 
            start_date, 
            duration,
            expired_date: expirationDate,
            user_id: req.user.id
        }).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/ca2-crm/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.start_date || updates.duration) {
            // Need to fetch current values if one is missing to recalculate
            const { data: current } = await getClient(req.token).from('customers').select('*').eq('id', id).eq('user_id', req.user.id).single();
            const sDate = updates.start_date || current.start_date;
            const dur = updates.duration || current.duration;
            updates.expired_date = calculateExpirationDate(sDate, dur);
        }

        const { data, error } = await getClient(req.token).from('customers')
            .update(updates)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ca2-crm/bulk', authenticate, async (req, res) => {
    try {
        const { mode, data } = req.body;
        
        if (mode === 'overwrite') {
            // Delete all customers for this user (or all if shared, but here we use user_id)
            await supabase.from('customers').delete().eq('user_id', req.user.id);
        }

        // Process each row to calculate expiration
        const processedData = data.map(item => ({
            ...item,
            NgayHetHanChuKySo: calculateExpirationDate(item.start_date, item.duration),
            user_id: req.user.id
        }));

        // Batch insert/upsert
        const { error } = await supabase.from('customers').upsert(processedData);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ca2-crm/:id', authenticate, async (req, res) => {
    try {
        const { error } = await getClient(req.token).from('customers').delete().eq('id', req.params.id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/campaigns', authenticate, async (req, res) => {
    const { data, error } = await getClient(req.token)
        .from('campaigns')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/campaigns', authenticate, async (req, res) => {
    const campaignId = Date.now().toString();
    const recipients = req.body.recipients || [];
    const newCampaign = {
        id: campaignId,
        user_id: req.user.id,
        name: req.body.name,
        subject: req.body.subject,
        sender_account_id: req.body.senderAccountId,
        template: req.body.template || req.body.content,
        recipients: recipients.map(r => ({ ...r, status: 'Chờ xử lý', sentTime: null })),
        attach_cert: req.body.attachCert || false,
        status: 'Chờ gửi',
        sent_count: 0,
        success_count: 0,
        error_count: 0,
        total_recipients: recipients.length,
        created_at: new Date().toISOString()
    };

    try {
        const { data, error } = await getClient(req.token).from('campaigns').insert([newCampaign]).select();
        if (error) throw error;

        // Create initial logs in email_logs table for the worker
        const logs = recipients.map(r => {
            // Helper to get value case-insensitively
            const getVal = (obj, keys) => {
                const foundKey = Object.keys(obj).find(k => keys.includes(k.toLowerCase()));
                return foundKey ? String(obj[foundKey]).trim() : '';
            };

            return {
                customer_id: getVal(r, ['mst', 'taxcode', 'mã số thuế']),
                campaign_id: campaignId,
                user_id: req.user.id,
                email: getVal(r, ['email']),
                status: 'pending',
                retry_count: 0,
                created_at: new Date().toISOString()
            };
        });

        if (logs.length > 0) {
            const { error: logsError } = await getClient(req.token).from('email_logs').insert(logs);
            if (logsError) console.error('Error creating email_logs:', logsError);
        }

        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/campaigns/:id/send', authenticate, async (req, res) => {
    const campaignId = req.params.id;
    try {
        const { data: campaign, error: cErr } = await getClient(req.token).from('campaigns').select('*').eq('id', campaignId).eq('user_id', req.user.id).single();
        if (cErr || !campaign) throw new Error('Không tìm thấy chiến dịch');

        // Update campaign status to "Đang gửi" and reset counters
        // This triggers the emailService.js worker which picks up "pending" logs
        // Ensure logs exist in email_logs table for this campaign
        const { count } = await supabase.from('email_logs').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId);
        if (!count || count === 0) {
            console.log(`[Campaign] Creating missing email_logs for campaign ${campaignId}...`);
            const recipients = campaign.recipients || [];
            if (recipients.length > 0) {
                const logs = recipients.map(r => {
                    const getVal = (obj, keys) => {
                        const foundKey = Object.keys(obj).find(k => keys.includes(k.toLowerCase()));
                        return foundKey ? String(obj[foundKey]).trim() : '';
                    };
                    return {
                        customer_id: getVal(r, ['mst', 'taxcode', 'mã số thuế']),
                        campaign_id: campaignId,
                        user_id: req.user.id,
                        email: getVal(r, ['email']),
                        status: 'pending',
                        retry_count: 0,
                        created_at: new Date().toISOString()
                    };
                });
                const { error: logsError } = await getClient(req.token).from('email_logs').insert(logs);
                if (logsError) throw new Error(`Lỗi tạo hàng đợi email: ${logsError.message}`);
                console.log(`[Campaign] Successfully created ${logs.length} logs for campaign ${campaignId}.`);
            }
        }

        // Reset any failed logs to "pending" so the worker can retry them
        await supabase.from('email_logs')
            .update({ status: 'pending', retry_count: 0, error_message: null })
            .eq('campaign_id', campaignId)
            .eq('status', 'failed')
            .eq('user_id', req.user.id);

        await supabase.from('campaigns').update({ 
            status: 'Đang gửi', 
            sent_count: 0, 
            success_count: 0, 
            error_count: 0 
        }).eq('id', campaign.id).eq('user_id', req.user.id);

        res.json({ success: true, message: 'Chiến dịch đã bắt đầu (Đã reset các lỗi cũ nếu có). Vui lòng theo dõi tiến độ.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Email Logs Route
app.get('/api/email-logs', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('email_logs')
            .select('*, campaigns(name)')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/email-logs/:id/retry', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('email_logs')
            .update({ status: 'pending', retry_count: 0, error_message: 'Thử lại từ giao diện...' })
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/email-logs/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('email_logs')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/campaigns/:id', authenticate, async (req, res) => {
    const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: 'Lỗi khi xóa chiến dịch hoặc Unauthorized.' });
    res.json({ message: 'Đã xóa chiến dịch thành công.' });
});

app.get('/api/stats', authenticate, async (req, res) => {
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('sent_count, success_count, error_count')
        .eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });

    const stats = campaigns.reduce((acc, c) => {
        acc.totalSent += c.sent_count || 0;
        acc.totalSuccess += c.success_count || 0;
        acc.totalError += c.error_count || 0;
        return acc;
    }, { totalSent: 0, totalSuccess: 0, totalError: 0 });
    
    res.json(stats);
});

// CRM Routes
app.get('/api/customers', authenticate, async (req, res) => {
    let query = supabase.from('customers').select('*').eq('user_id', req.user.id);
    
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
        user_id: req.user.id,
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
            .eq('user_id', req.user.id);

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
        .eq('user_id', req.user.id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.get('/api/customers/:id', authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
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
            .eq('user_id', req.user.id)
            .single();
        
        if (fetchError || !customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
        if (!customer.mst) return res.status(400).json({ error: 'Khách hàng không có MST' });

        console.log(`[Scraper] Starting manual scrape for MST: ${customer.mst}`);
        
        // 2. Init Browser
        const { initBrowser, getLatestCertificate } = require('./services/scraperService');
        browser = await initBrowser();
        
        // 3. Scrape
        const result = await getLatestCertificate(browser, customer.mst, customer.serial || '', customer);
        
        if (result && result.status === 'Matched') {
            console.log(`[Scraper] Scrape success for ${customer.taxCode}. Uploading to Supabase...`);
            
            // 4. Upload to Supabase Storage
            const fileBuffer = fs.readFileSync(result.filePath);
            const path = require('path');
            const fileName = `${req.user.id}/${customer.mst}_${Date.now()}.pdf`;
            
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
app.get('/api/senders/:id/test-connection', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: sender, error } = await supabase
            .from('senders')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();
        
        if (error || !sender) return res.status(404).json({ error: 'Sender not found' });
        if (sender.smtpHost !== 'oauth2.google') return res.json({ success: true, message: 'SMTP account (No OAuth2 verification needed)' });

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: sender.smtpPassword });

        const { token } = await oauth2Client.getAccessToken();
        if (!token) throw new Error('Refresh token invalid');

        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();

        res.json({
            success: true,
            authorizedEmail: userInfo.data.email,
            matchesSenderEmail: userInfo.data.email === sender.senderEmail,
            scopes: oauth2Client.credentials.scope
        });
    } catch (error) {
        res.status(500).json({ error: 'Connection failed: ' + error.message });
    }
});

app.post('/api/test-send-email', authenticate, async (req, res) => {
    try {
        const { senderId, testEmail, testPdfUrl, testTaxCode } = req.body;
        if (!senderId || !testEmail) return res.status(400).json({ error: 'Missing senderId or testEmail' });

        // 1. Fetch Sender
        const { data: sender, error: senderError } = await supabase
            .from('senders')
            .select('*')
            .eq('id', senderId)
            .eq('user_id', req.user.id)
            .single();
        
        if (senderError || !sender) return res.status(404).json({ error: 'Sender not found' });

        console.log(`[TestSend] 🧪 Starting test send To: ${testEmail} (PDF: ${testPdfUrl || 'No'})`);

        const isAttachMode = !!testPdfUrl;
        
        // 2. Delegate to emailService.sendGmailAPI
        const info = await emailService.sendGmailAPI({
            rawSender: sender,
            to: testEmail,
            subject: 'Test Email từ Automation CA2 - Verification',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #f97316;">Hello World!</h2>
                    <p>Đây là email thử nghiệm để kiểm tra kết nối Gmail API và Đính kèm PDF.</p>
                    <hr>
                    <p style="font-size: 12px; color: gray;">Timestamp: ${new Date().toISOString()}</p>
                </div>
            `,
            pdf_url: testPdfUrl || null,
            isAttachMode: isAttachMode
        });

        res.json({ 
            success: true, 
            message: 'Email test đã được gửi!', 
            messageId: info.messageId,
            pdfAttached: isAttachMode
        });
    } catch (error) {
        console.error('[TestSend] ❌ Error:', error);
        res.status(500).json({ error: 'Lỗi khi gửi test: ' + error.message });
    }
});

app.get('/api/crm/stats', authenticate, async (req, res) => {
    const { data: customers, error } = await supabase
        .from('customers')
        .select('expired_date')
        .eq('user_id', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date();
    const stats = { expired: 0, within30: 0, within60: 0, within90: 0, total: customers.length };

    customers.forEach(c => {
        if (!c.expired_date) return;
        const exp = new Date(c.expired_date);
        const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) stats.expired++;
        else if (diffDays <= 30) stats.within30++;
        else if (diffDays <= 60) stats.within60++;
        else if (diffDays <= 90) stats.within90++;
    });

    res.json(stats);
});

// Detailed Campaign Report Route (Phase 8 Implementation)
app.get('/api/email-logs', authenticate, async (req, res) => {
    try {
        // Fetch logs with campaign name join if possible, or just logs
        const { data, error } = await supabase
            .from('email_logs')
            .select('*, campaigns(name)')
            .order('created_at', { ascending: false })
            .limit(500); // Limit to last 500 for performance

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reports/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Fetch campaign details
        const { data: campaign, error: campaignError } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();
        
        if (campaignError || !campaign) {
            return res.status(404).send('<h1>Chiến dịch không tồn tại hoặc bạn không có quyền xem.</h1>');
        }

        // Fetch logs for this campaign
        const { data: logs, error: logsError } = await supabase
            .from('email_logs')
            .select('*')
            .eq('campaign_id', id)
            .order('created_at', { ascending: false });

        if (logsError) throw logsError;

        // SSR HTML Template (Matching the dark/orange UI)
        const html = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Báo cáo Chiến dịch - ${campaign.name}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
                body { font-family: 'Outfit', sans-serif; background: #0c0c0e; color: #fff; }
                .orange-gradient { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
                .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            </style>
        </head>
        <body class="p-4 md:p-8 min-h-screen">
            <div class="max-w-7xl mx-auto space-y-6">
                <!-- Header -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-3xl font-black uppercase tracking-tighter text-white">NHẬT KÝ GỬI MAIL CHI TIẾT</h1>
                        <p class="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1">CHIẾN DỊCH: ${campaign.name} (${id})</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="retryAllErrors()" id="btn-retry-all" class="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all">THỬ LẠI TẤT CẢ LỖI</button>
                        <button onclick="exportToExcel()" class="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all">XUẤT EXCEL</button>
                        <button onclick="window.location.reload()" class="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all">LÀM MỚI</button>
                        <button onclick="window.history.back()" class="orange-gradient px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all">QUAY LẠI</button>
                    </div>
                </div>

                <!-- Stats Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="glass p-5 rounded-3xl">
                        <p class="text-xs text-gray-500 font-black uppercase tracking-widest mb-1">Tổng cộng</p>
                        <p class="text-3xl font-black">${logs.length}</p>
                    </div>
                    <div class="glass p-5 rounded-3xl">
                        <p class="text-xs text-green-500 font-black uppercase tracking-widest mb-1">Thành công</p>
                        <p class="text-3xl font-black text-green-500">${logs.filter(l => l.status === 'sent').length}</p>
                    </div>
                    <div class="glass p-5 rounded-3xl">
                        <p class="text-xs text-red-500 font-black uppercase tracking-widest mb-1">Thất bại</p>
                        <p class="text-3xl font-black text-red-500">${logs.filter(l => l.status.includes('failed')).length}</p>
                    </div>
                    <div class="glass p-5 rounded-3xl">
                        <p class="text-xs text-blue-500 font-black uppercase tracking-widest mb-1">Đang chờ/Retry</p>
                        <p class="text-3xl font-black text-blue-500">${logs.filter(l => l.status === 'pending' || l.status === 'retrying').length}</p>
                    </div>
                </div>

                <!-- Log Table -->
                <div class="glass rounded-[40px] overflow-hidden border border-white/5">
                    <div class="overflow-x-auto custom-scrollbar">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-black/40 border-b border-white/5">
                                    <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">THỜI GIAN</th>
                                    <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">EMAIL</th>
                                    <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">TRẠNG THÁI</th>
                                    <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">CHI TIẾT LỖI</th>
                                    <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">THAO TÁC</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logs.map(log => `
                                    <tr class="border-b border-white/5 hover:bg-white/2 transition-all group">
                                        <td class="px-8 py-5">
                                            <p class="text-xs font-bold text-gray-300">
                                                ${new Date(log.last_retry_time || log.created_at).toLocaleString('vi-VN')}
                                            </p>
                                        </td>
                                        <td class="px-8 py-5">
                                            <p class="text-sm font-black text-white">${log.email}</p>
                                            <p class="text-[10px] text-gray-600 font-mono">MST: ${log.customer_id}</p>
                                        </td>
                                        <td class="px-8 py-5">
                                            <span class="px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg ${getStatusColor(log.status)}">
                                                ${log.status}
                                            </span>
                                            ${log.retry_count > 0 ? `<span class="text-[9px] text-gray-500 ml-2 font-bold">(Lần ${log.retry_count})</span>` : ''}
                                        </td>
                                        <td class="px-8 py-5">
                                            <p class="text-xs text-red-400/80 italic line-clamp-2" title="${log.retry_reason || ''}">
                                                ${log.retry_reason || '-'}
                                            </p>
                                        </td>
                                        <td class="px-8 py-5">
                                            ${(log.status.includes('failed')) ? `
                                                <button onclick="retryEmail('${log.id}')" id="btn-${log.id}" class="text-orange-500 hover:text-white border border-orange-500/30 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
                                                    GỬI LẠI
                                                </button>
                                            ` : '-'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <script>
                function exportToExcel() {
                    let csv = '\uFEFFTHỜI GIAN,EMAIL,MST,TRẠNG THÁI,LỖI\n';
                    const rows = document.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        const cols = row.querySelectorAll('td');
                        if (cols.length < 4) return;
                        const time = cols[0].innerText.trim().replace(',', ' ');
                        const email = cols[1].querySelector('p').innerText.trim();
                        const mst = cols[1].querySelectorAll('p')[1].innerText.trim().replace('MST: ', '');
                        const status = cols[2].querySelector('span').innerText.trim();
                        const error = cols[3].innerText.trim().replace(',', ';');
                        csv += '"' + time + '","' + email + '","' + mst + '","' + status + '","' + error + '"\n';
                    });

                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.setAttribute("download", "Bao_cao_Campaign_${id}.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }

                async function retryAllErrors() {
                    const btn = document.getElementById('btn-retry-all');
                    if (!confirm('Bạn có chắc muốn gửi lại tất cả các email bị lỗi trong chiến dịch này?')) return;
                    btn.innerText = 'ĐANG XỬ LÝ...';
                    btn.disabled = true;
                    try {
                        const token = new URLSearchParams(window.location.search).get('access_token');
                        const res = await fetch('/api/campaigns/${id}/retry-all', {
                            method: 'POST',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        if (res.ok) {
                            alert('Đã đưa tất cả lỗi vào hàng đợi gửi lại!');
                            window.location.reload();
                        } else {
                            alert('Lỗi khi thực hiện.');
                            btn.innerText = 'THỬ LẠI TẤT CẢ LỖI';
                            btn.disabled = false;
                        }
                    } catch (e) {
                        alert('Lỗi kết nối: ' + e.message);
                        btn.innerText = 'THỬ LẠI TẤT CẢ LỖI';
                        btn.disabled = false;
                    }
                }

                async function retryEmail(logId) {
                    const btn = document.getElementById('btn-' + logId);
                    const originalText = btn.innerText;
                    btn.innerText = 'ĐANG ĐỢI...';
                    btn.disabled = true;

                    try {
                        const token = new URLSearchParams(window.location.search).get('access_token');
                        const res = await fetch('/api/email-logs/' + logId + '/retry', {
                            method: 'POST',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        
                        if (res.ok) {
                            btn.innerText = 'ĐÃ RESET';
                            btn.classList.replace('text-orange-500', 'text-green-500');
                        } else {
                            const err = await res.json();
                            alert('Lỗi: ' + err.error);
                            btn.innerText = originalText;
                            btn.disabled = false;
                        }
                    } catch (e) {
                        alert('Lỗi kết nối: ' + e.message);
                        btn.innerText = originalText;
                        btn.disabled = false;
                    }
                }
            </script>
        </body>
        </html>
        `;

        function getStatusColor(status) {
            switch(status) {
                case 'sent': return 'bg-green-500/10 text-green-500';
                case 'pending': return 'bg-blue-500/10 text-blue-500';
                case 'processing': return 'bg-orange-500/10 text-orange-500';
                case 'retrying': return 'bg-yellow-500/10 text-yellow-500';
                case 'failed': return 'bg-red-500/10 text-red-500';
                case 'failed_permanent': return 'bg-red-900/40 text-red-500 border border-red-500/20';
                default: return 'bg-gray-500/10 text-gray-500';
            }
        }

        res.send(html);
    } catch (error) {
        console.error('Report view error:', error);
        res.status(500).send('Lỗi máy chủ khi tạo báo cáo: ' + error.message);
    }
});

app.post('/api/email-logs/:id/retry', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        // Reset status to pending and reset retry count to allow worker to pick it up again
        const { error } = await supabase
            .from('email_logs')
            .update({ 
                status: 'pending', 
                retry_count: 0, 
                retry_reason: 'User manual retry trigger',
                last_retry_time: null 
            })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, message: 'Task has been reset to pending.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/campaigns/:id/retry-all', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('email_logs')
            .update({ 
                status: 'pending', 
                retry_count: 0, 
                retry_reason: 'User manual bulk retry',
                last_retry_time: null 
            })
            .eq('campaign_id', id)
            .ilike('status', '%failed%');

        if (error) throw error;
        
        // Also update the campaign status to "Đang gửi" if it was finished/error
        await supabase.from('campaigns').update({ status: 'Đang gửi' }).eq('id', id);

        res.json({ success: true, message: 'All failed tasks have been reset.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- LOCAL AUTOMATION ENDPOINTS ---

app.delete('/api/campaigns/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        // Delete logs first then campaign
        await supabase.from('email_logs').delete().eq('campaign_id', id);
        const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/campaigns/bulk-delete', authenticate, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });
        
        await supabase.from('email_logs').delete().in('campaign_id', ids);
        const { error } = await supabase.from('campaigns').delete().in('id', ids).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ success: true, count: ids.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/automation/fetch-single', async (req, res) => {
    const { MST, Serial, TenCongTy, companyName } = req.body;
    if (!MST) return res.status(400).json({ success: false, error: 'Thiếu MST' });
    
    console.log(`[Automation] Request fetch for MST: ${MST}`);
    
    let browser = null;
    let timeoutHandle = null;

    try {
        // Global safety timeout for the entire request
        const requestTimeout = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Request Timeout (90s) - Quá thời gian xử lý')), 90000);
        });

        const task = (async () => {
            browser = await scraperService.initBrowser();
            const customerInfo = { 
                taxCode: MST, 
                companyName: TenCongTy || companyName || 'Company' 
            };
            return await scraperService.getLatestCertificate(browser, MST, Serial, customerInfo);
        })();

        const result = await Promise.race([task, requestTimeout]);
        clearTimeout(timeoutHandle);

        if (result && result.status === 'Matched') {
            res.json({ 
                success: true, 
                filePath: result.filePath, 
                fileName: result.fileName 
            });
        } else {
            res.status(result?.status === 'Not Found' ? 404 : 500).json({ 
                success: false, 
                error: result?.message || 'Lỗi không xác định khi tải PDF' 
            });
        }
    } catch (err) {
        console.error(`[Automation] Error fetching ${MST}:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }
    }
});

app.post('/api/automation/sync', async (req, res) => {
    const { files } = req.body; // Array of { MST, Serial, filePath, fileName, companyName }
    console.log(`[Automation] Syncing ${files?.length} files to Supabase...`);

    if (!files || !Array.isArray(files)) {
        return res.status(400).json({ success: false, error: 'Invalid files array' });
    }

    const results = [];
    try {
        for (const file of files) {
            try {
                if (!fs.existsSync(file.filePath)) {
                    results.push({ MST: file.MST, status: 'Error', message: 'Local file missing' });
                    continue;
                }

                const fileBuffer = fs.readFileSync(file.filePath);
                const fileNameInBucket = `${file.MST}_${Date.now()}.pdf`;

                // 1. Upload to Storage (New 'pdfs' bucket)
                const { error: uploadError } = await supabase.storage
                    .from('pdfs')
                    .upload(fileNameInBucket, fileBuffer, { upsert: true, contentType: 'application/pdf' });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(fileNameInBucket);

                // 2. Upsert Certificate Record (New 'certificates' table)
                const { error: upsertError } = await supabase
                    .from('certificates')
                    .upsert({
                        mst: file.MST,
                        company_name: file.TenCongTy || file.companyName,
                        pdf_url: publicUrl,
                        serial: file.Serial,
                        // user_id: req.user?.id // Uncomment if using session
                    }, { onConflict: 'mst' });

                if (upsertError) throw upsertError;

                results.push({ MST: file.MST, status: 'Synced', url: publicUrl });
                // Cleanup local file
                // try { fs.unlinkSync(file.filePath); } catch(e) {}
            } catch (err) {
                console.error(`[Automation] Sync error for ${file.MST}:`, err.message);
                results.push({ MST: file.MST, status: 'Error', message: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/automation/download-tool', async (req, res) => {
    try {
        const zipFile = path.join(__dirname, 'public', 'CA2_Automation_Tool.zip');
        // Simple PowerShell command to create a zip of the root folder (Windows environment)
        // Adjust exclusions if needed
        const cmd = `powershell -Command "Compress-Archive -Path '${__dirname}\\*' -DestinationPath '${zipFile}' -Force -Exclude ('node_modules','dist','.git','.env','uploads','public\\*.zip')"`;
        
        console.log('[Download] Creating zip file...');
        require('child_process').exec(cmd, (err) => {
            if (err) {
                console.error('[Download] Zip Error:', err.message);
                return res.status(500).send('Lỗi tạo file nén: ' + err.message);
            }
            res.download(zipFile, 'CA2_Automation_Tool.zip');
        });
    } catch (err) {
        res.status(500).send('Lỗi xử lý tải về.');
    }
});

app.post('/api/automation/cleanup', (req, res) => {
    try {
        const certDir = path.join(__dirname, 'uploads', 'certs');
        if (fs.existsSync(certDir)) {
            const files = fs.readdirSync(certDir);
            for (const file of files) {
                const fullPath = path.join(certDir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
            }
        }
        res.json({ success: true, message: 'Đã dọn dẹp bộ nhớ tạm local thành công.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Lỗi dọn dẹp: ' + err.message });
    }
});

// --- Templates API ---
app.get('/api/templates', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('user_id', req.user.id)
            .order('name', { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/templates/:id', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/templates', authenticate, async (req, res) => {
    try {
        const { name, content } = req.body;
        const { data, error } = await supabase
            .from('templates')
            .upsert({ 
                name, 
                content, 
                user_id: req.user.id,
                updated_at: new Date().toISOString() 
            })
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/templates/:id', authenticate, async (req, res) => {
    try {
        const { error } = await supabase
            .from('templates')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ message: 'Deleted' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/download-tool', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'CA2_Automation_Tool.zip');
    res.download(filePath, 'CA2_Automation_Tool.zip');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Automation Tool: http://localhost:${port}/automation.html`);
    // Start the background worker
    emailService.startWorker();
});
