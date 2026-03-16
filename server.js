const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Added axios for fetching gsheets
const XLSX = require('xlsx');
require('dotenv').config();

const excelService = require('./services/excelService');
const emailService = require('./services/emailService');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure required directories exist
['data', 'uploads'].forEach(dir => {
    if (!fs.existsSync(path.join(__dirname, dir))) {
        fs.mkdirSync(path.join(__dirname, dir));
    }
});

const upload = multer({ dest: 'uploads/' });

// Campaigns mock database
const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');
const TEMPLATES_FILE = path.join(__dirname, 'data', 'templates.json');
const SENDERS_FILE = path.join(__dirname, 'data', 'senders.json');

function readData(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

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
app.get('/api/senders', (req, res) => {
    res.json(readData(SENDERS_FILE));
});

app.post('/api/senders', (req, res) => {
    const senders = readData(SENDERS_FILE);
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
    senders.push(newSender);
    writeData(SENDERS_FILE, senders);
    res.json(newSender);
});

// Template Routes
app.get('/api/templates', (req, res) => {
    res.json(readData(TEMPLATES_FILE));
});

app.post('/api/templates', (req, res) => {
    const templates = readData(TEMPLATES_FILE);
    const newTemplate = {
        id: Date.now().toString(),
        name: req.body.name || `Mẫu ${templates.length + 1}`,
        content: req.body.content,
        createdAt: new Date().toISOString()
    };
    templates.push(newTemplate);
    writeData(TEMPLATES_FILE, templates);
    res.json(newTemplate);
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
            const email = row[8]; // Column I

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

app.get('/api/campaigns', (req, res) => {
    res.json(readData(CAMPAIGNS_FILE));
});

app.post('/api/campaigns', (req, res) => {
    const campaigns = readData(CAMPAIGNS_FILE);
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
    campaigns.push(newCampaign);
    writeData(CAMPAIGNS_FILE, campaigns);
    res.json(newCampaign);
});

app.post('/api/campaigns/:id/send', async (req, res) => {
    const campaigns = readData(CAMPAIGNS_FILE);
    const campaignIndex = campaigns.findIndex(c => c.id === req.params.id);
    
    if (campaignIndex === -1) return res.status(404).send('Campaign not found');
    
    const campaign = campaigns[campaignIndex];
    
    // Fetch sender account details
    const senders = readData(SENDERS_FILE);
    const sender = senders.find(s => s.id === campaign.senderAccountId);
    
    if (!sender) return res.status(400).json({ error: 'Không tìm thấy cấu hình người gửi.' });

    campaign.status = 'Đang gửi';
    writeData(CAMPAIGNS_FILE, campaigns);

    res.json({ message: 'Bắt đầu gửi email...' });

    // Background sending process
    emailService.sendBulkEmails(campaign, sender, (updatedCampaign) => {
        const latestCampaigns = readData(CAMPAIGNS_FILE);
        const idx = latestCampaigns.findIndex(c => c.id === updatedCampaign.id);
        if (idx !== -1) {
            latestCampaigns[idx] = updatedCampaign;
            writeData(CAMPAIGNS_FILE, latestCampaigns);
        }
    });
});

app.delete('/api/campaigns/:id', (req, res) => {
    try {
        const campaigns = readData(CAMPAIGNS_FILE);
        const filteredCampaigns = campaigns.filter(c => c.id !== req.params.id);
        
        if (campaigns.length === filteredCampaigns.length) {
            return res.status(404).json({ error: 'Không tìm thấy chiến dịch.' });
        }
        
        writeData(CAMPAIGNS_FILE, filteredCampaigns);
        res.json({ message: 'Đã xóa chiến dịch thành công.' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi xóa chiến dịch.' });
    }
});

app.get('/api/stats', (req, res) => {
    const campaigns = readData(CAMPAIGNS_FILE);
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
