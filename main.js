const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
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

// Protocol registration
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('ca2-automation', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('ca2-automation');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(createWindow);
}

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
        if (rawData.length === 0) return { success: true, data: [] };

        // Find header row (consistent with excelService.js)
        let headerIdx = -1;
        let colMap = { mst: 4, name: 3, serial: 1, email: 8 };

        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const row = rawData[i];
            if (!row || !Array.isArray(row)) continue;
            
            let matchCount = 0;
            const tempMap = { mst: -1, name: -1, serial: -1, email: -1 };

            row.forEach((cell, idx) => {
                const val = String(cell || '').toLowerCase().trim();
                if (val === 'mst' || val === 'mã số thuế' || (val.includes('mã số thuế') && val.length < 20)) {
                    tempMap.mst = idx; matchCount++;
                }
                if (val.includes('tên công ty') || val.includes('tên đơn vị') || val.includes('tên khách hàng')) {
                    tempMap.name = idx; matchCount++;
                }
                if (val.includes('serial') || val.includes('số máy') || val.includes('số chứng thư')) {
                    tempMap.serial = idx; matchCount++;
                }
                if (val.includes('email')) {
                    tempMap.email = idx; matchCount++;
                }
            });

            if (matchCount >= 2) {
                headerIdx = i;
                colMap = { ...colMap, ...Object.fromEntries(Object.entries(tempMap).filter(([_, v]) => v !== -1)) };
                break;
            }
        }

        const startRow = headerIdx !== -1 ? headerIdx + 1 : 0;
        const data = rawData.slice(startRow).map(row => {
            const mst = row[colMap.mst];
            if (!mst || String(mst).trim() === '') return null;

            // Serial check (Col B or C fallback)
            let serial = row[colMap.serial] ? String(row[colMap.serial]).trim() : '';
            if (!serial && colMap.serial === 1) {
                serial = row[2] ? String(row[2]).trim() : '';
            }

            const ten = row[colMap.name] ? String(row[colMap.name]).trim() : '';
            const email = row[colMap.email] ? String(row[colMap.email]).trim() : '';
            const diaChi = row[colMap.address] ? String(row[colMap.address]).trim() : '';

            return { MST: mst.toString().trim(), Ten: ten, Serial: serial, Email: email, DiaChi: diaChi };
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

// 3. Process Single Record (Crawl -> Upload -> DB Update)
ipcMain.handle('process-single-record', async (event, { MST, Serial, companyName, email, diaChi }) => {
    let browser = null;
    let localFileResult = null;
    try {
        console.log(`\n[ELECTRON] Processing: ${MST} - ${companyName}`);
        
        // Step 1: Crawl PDF
        browser = await scraperService.initBrowser();
        localFileResult = await scraperService.getLatestCertificate(browser, MST, Serial, { companyName });
        
        if (!localFileResult || localFileResult.status !== 'Matched') {
            throw new Error(localFileResult?.message || 'Không tìm thấy chứng thư');
        }
        
        const { filePath, fileName } = localFileResult;
        console.log("[ELECTRON] UPLOAD PDF:", fileName);
        
        // Step 2: Upload to Supabase Storage
        const fileContent = fs.readFileSync(filePath);
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

        // Step 3: Get Public URL
        const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(`certs/${fileName}`);
        console.log("[ELECTRON] PUBLIC URL:", publicUrl);

        // Step 4: Delete local file explicitly as requested
        try { fs.rmSync(filePath, { force: true }); } catch (e) { console.warn('[ELECTRON] Could not delete temp file', e); }

        // Step 5: Update 'certificates' table (MANUAL UPSERT)
        console.log('[ELECTRON] Updating certificates table...');
        const { data: existingCertList } = await supabase.from('certificates').select('id').eq('mst', MST).limit(1);
        const existingCert = existingCertList && existingCertList.length > 0 ? existingCertList[0] : null;
        if (existingCert) {
            await supabase.from('certificates')
                .update({ company_name: companyName, serial: Serial, pdf_url: publicUrl, created_at: new Date().toISOString() })
                .eq('mst', MST);
        } else {
            await supabase.from('certificates')
                .insert({ mst: MST, company_name: companyName, serial: Serial, pdf_url: publicUrl, created_at: new Date().toISOString() });
        }

        // Step 6: Update 'customers' table (Main CRM)
        console.log('[ELECTRON] Upserting into customers table...');
        const { data: existingCustList } = await supabase.from('customers').select('id').eq('mst', MST).limit(1);
        const existingCust = existingCustList && existingCustList.length > 0 ? existingCustList[0] : null;
        
        if (existingCust) {
            const { error: customerError } = await supabase
                .from('customers')
                .update({ 
                    pdf_url: publicUrl,
                    company_name: companyName,
                    dia_chi: diaChi || '',
                    email: email || ''
                })
                .eq('id', existingCust.id);
            if (customerError) throw new Error(`Lỗi cập nhật CRM: ${customerError.message}`);
        } else {
            console.log('[ELECTRON] Customer missing, performing INSERT...');
            const { error: insertCustError } = await supabase
                .from('customers')
                .insert({
                    mst: MST,
                    company_name: companyName,
                    dia_chi: diaChi || '',
                    email: email || '',
                    pdf_url: publicUrl,
                    created_at: new Date().toISOString()
                });
            if (insertCustError) throw new Error(`Lỗi thêm mới CRM: ${insertCustError.message}`);
        }

        console.log(`[ELECTRON] Sync completed successfully for ${MST}.`);
        return { success: true, publicUrl };

    } catch (err) {
        console.error('[ELECTRON] Process Error:', err.message);
        let friendlyMessage = err.message;
        if (err.message.includes('row-level security')) {
            friendlyMessage = 'Lỗi bảo mật (RLS). Bạn cần tắt RLS hoặc cấp quyền Insert/Update cho role "anon" trên Table/Storage của Supabase.';
        }
        return { success: false, error: friendlyMessage };
    } finally {
        if (browser) await browser.close().catch(() => {});
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
