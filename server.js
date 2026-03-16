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
app.get('/api/senders', async (req, res) => {
    const { data, error } = await supabase.from('senders').select('*').order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/senders', async (req, res) => {
    const newSender = {
        id: Date.now().toString(),
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

// Template Routes
app.get('/api/templates', async (req, res) => {
    const { data, error } = await supabase.from('templates').select('*').order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/templates', async (req, res) => {
    const newTemplate = {
        id: Date.now().toString(),
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

app.get('/api/campaigns', async (req, res) => {
    const { data, error } = await supabase.from('campaigns').select('*').order('createdAt', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/campaigns', async (req, res) => {
    const newCampaign = {
        id: Date.now().toString(),
        name: req.body.name,
        subject: req.body.subject,
        senderAccountId: req.body.senderAccountId,
        template: req.body.template,
        recipients: req.body.recipients.map(r => ({ ...r, status: 'Chưa gửi', sentTime: null })),
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

app.post('/api/campaigns/:id/send', async (req, res) => {
    // Fetch campaign from Supabase
    const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', req.params.id)
        .single();
    
    if (campaignError || !campaign) return res.status(404).send('Campaign not found');
    
    // Fetch sender account details
    const { data: sender, error: senderError } = await supabase
        .from('senders')
        .select('*')
        .eq('id', campaign.senderAccountId)
        .single();
    
    if (senderError || !sender) return res.status(400).json({ error: 'Không tìm thấy cấu hình người gửi.' });

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

app.delete('/api/campaigns/:id', async (req, res) => {
    const { error } = await supabase.from('campaigns').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Lỗi khi xóa chiến dịch.' });
    res.json({ message: 'Đã xóa chiến dịch thành công.' });
});

app.get('/api/stats', async (req, res) => {
    const { data: campaigns, error } = await supabase.from('campaigns').select('sentCount, successCount, errorCount');
    if (error) return res.status(500).json({ error: error.message });

    const stats = campaigns.reduce((acc, c) => {
        acc.totalSent += c.sentCount || 0;
        acc.totalSuccess += c.successCount || 0;
        acc.totalError += c.errorCount || 0;
        return acc;
    }, { totalSent: 0, totalSuccess: 0, totalError: 0 });
    
    res.json(stats);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
