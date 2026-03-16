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
const supabase = require('./services/supabaseClient');

const app = express();
const port = process.env.PORT || 3000;

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
            const mst = row[4];
            const tenCongTy = row[3];
            const diaChi = row[6];
            const ngayHetHan = row[10];
            const email = row[8];

            if (!mst) return null;

            return {
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
    const newCampaign = {
        id: Date.now().toString(),
        userId: req.user.id,
        name: req.body.name,
        subject: req.body.subject,
        senderAccountId: req.body.senderAccountId,
        template: req.body.template,
        recipients: (req.body.recipients || []).map(r => ({ ...r, status: 'Chưa gửi', sentTime: null })),
        status: 'Nháp',
        sentCount: 0,
        successCount: 0,
        errorCount: 0,
        createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('campaigns').insert([newCampaign]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
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

    res.json({ message: 'Bắt đầu gửi email...' });

    // Background sending process
    emailService.sendBulkEmails(campaign, sender, async (updatedCampaign) => {
        // Persist update to Supabase
        await supabase.from('campaigns').update({
            recipients: updatedCampaign.recipients,
            status: updatedCampaign.status,
            sentCount: updatedCampaign.sentCount,
            successCount: updatedCampaign.successCount,
            errorCount: updatedCampaign.errorCount
        }).eq('id', updatedCampaign.id);
    });
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
        id: (c.MST || Date.now().toString() + Math.random().toString(36).substr(2, 5)).toString(),
        userId: req.user.id,
        taxCode: c.MST,
        companyName: c.TenCongTy,
        email: c.Email,
        expirationDate: c.NgayHetHanChuKySo,
        status: 'Chưa liên hệ'
    }));

    const { error } = await supabase.from('customers').upsert(customers);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: `Đã nhập ${customers.length} khách hàng.` });
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
});
