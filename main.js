const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const scraperService = require('./services/scraperService');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

// Load .env explicitly from the same directory as main.js
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('CRITICAL: Supabase environment variables are missing!');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.co', SUPABASE_KEY || 'placeholder');

// Writable Paths
const USER_DATA_PATH = app.getPath('userData');
const CERT_DIR = path.join(USER_DATA_PATH, 'certs');
const PUPPETEER_CACHE = path.join(USER_DATA_PATH, 'puppeteer_cache');

let mainWindow;

function createWindow() {
    // Initialize Scraper Paths BEFORE starting logic
    scraperService.initPaths(CERT_DIR, PUPPETEER_CACHE);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        title: "CA2 Automation Pro - Desktop",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'public', 'automation.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// 1. Parsing Excel (CA Vietnam Standard)
ipcMain.handle('parse-excel', async (event, filePath) => {
    console.log('[ELECTRON] Attempting to parse Excel:', filePath);
    try {
        if (!filePath) throw new Error('No file path provided.');
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Use row-index based parsing similar to excelService.js for reliability
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const data = rawData.map(row => {
            const mst = row[4];
            if (!mst || String(mst).trim() === '') return null;

            // Serial can be in Col B (1) or Col C (2)
            const serial = (row[1] || row[2] || '').toString().trim();
            const ten = (row[3] || '').toString().trim();
            const email = (row[8] || '').toString().trim();

            return { MST: mst.toString().trim(), Ten: ten, Serial: serial, Email: email };
        }).filter(r => r !== null);

        console.log(`[ELECTRON] Successfully parsed ${data.length} rows.`);
        return { success: true, data };
    } catch (err) {
        console.error('[ELECTRON] Parse Error:', err.message);
        return { success: false, error: err.message };
    }
});

// 2. Select File (Native Dialog)
ipcMain.handle('select-file', async () => {
    console.log('[ELECTRON] Opening file dialog...');
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    });
    
    if (result.canceled || result.filePaths.length === 0) return null;
    console.log('[ELECTRON] File selected:', result.filePaths[0]);
    return result.filePaths[0];
});

// 3. Fetch Single PDF (via Scraper)
ipcMain.handle('fetch-single-pdf', async (event, { MST, Serial, companyName }) => {
    let browser = null;
    try {
        browser = await scraperService.initBrowser();
        const result = await scraperService.getLatestCertificate(browser, MST, Serial, { companyName });
        return { success: true, result };
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (browser) await browser.close();
    }
});

// 4. Upload to Cloud (Supabase) + Sync with Web App CRM
ipcMain.handle('upload-to-supabase', async (event, { filePath, fileName, mst, companyName, serial }) => {
    console.log('[ELECTRON] Syncing to Cloud:', mst);
    try {
        const fileContent = fs.readFileSync(filePath);
        
        // 1. Try to upload to "pdf-attachments" (Web App bucket) first, fallback to "pdfs"
        let bucketName = 'pdf-attachments';
        let { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(`certs/${fileName}`, fileContent, { upsert: true });

        if (uploadError && uploadError.message.includes('not found')) {
            console.log('[ELECTRON] bucket "pdf-attachments" not found, falling back to "pdfs"');
            bucketName = 'pdfs';
            const { error: retryError } = await supabase.storage
                .from(bucketName)
                .upload(`certs/${fileName}`, fileContent, { upsert: true });
            uploadError = retryError;
        }

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(`certs/${fileName}`);

        // 3. Update 'certificates' table (MANUAL UPSERT to avoid Unique Constraint Error)
        console.log('[ELECTRON] Updating certificates table...');
        const { data: existingCert } = await supabase.from('certificates').select('id').eq('mst', mst).maybeSingle();
        
        if (existingCert) {
            const { error: updateError } = await supabase.from('certificates')
                .update({ company_name: companyName, serial, pdf_url: publicUrl, created_at: new Date().toISOString() })
                .eq('mst', mst);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase.from('certificates')
                .insert({ mst, company_name: companyName, serial, pdf_url: publicUrl, created_at: new Date().toISOString() });
            if (insertError) throw insertError;
        }

        // 4. Update 'customers' table (Main CRM)
        console.log('[ELECTRON] Updating customers table...');
        const { error: customerError } = await supabase
            .from('customers')
            .update({ pdf_url: publicUrl })
            .eq('taxCode', mst);

        if (customerError) {
            console.warn('[ELECTRON] Customer update warning:', customerError.message);
        }

        console.log('[ELECTRON] Sync completed successfully.');
        return { success: true, publicUrl };
    } catch (err) {
        console.error('[ELECTRON] Sync Error:', err.message);
        let friendlyMessage = err.message;
        if (err.message.includes('row-level security')) {
            friendlyMessage = 'Lỗi bảo mật (RLS). Bạn cần tắt RLS hoặc cấp quyền Insert/Update cho role "anon" trên Table/Storage của Supabase.';
        } else if (err.message.includes('unique or exclusion constraint')) {
            friendlyMessage = 'Lỗi ràng buộc. (Đã được khắc phục bằng Manual Upsert, nếu vẫn bị hãy báo lại).';
        }
        return { success: false, error: friendlyMessage };
    }
});

// 5. Cleanup
ipcMain.handle('cleanup-temp', async () => {
    try {
        if (fs.existsSync(CERT_DIR)) {
            fs.rmSync(CERT_DIR, { recursive: true, force: true });
            fs.mkdirSync(CERT_DIR, { recursive: true });
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
