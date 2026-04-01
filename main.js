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

// Storage bucket name
const STORAGE_BUCKET = 'certificates';

// Writable Paths
const USER_DATA_PATH = app.getPath('userData');
const CERT_DIR = path.join(USER_DATA_PATH, 'certs');
const PUPPETEER_CACHE = path.join(USER_DATA_PATH, 'puppeteer_cache');

let mainWindow;

// =============================================
// LOGGING HELPER
// =============================================
function pipelineLog(mst, step, status, detail = '') {
    const ts = new Date().toISOString().substring(11, 19);
    const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : '🔄';
    const msg = `[${ts}] [PIPELINE] [${mst}] ${icon} ${step}${detail ? ': ' + detail : ''}`;
    console.log(msg);
    return msg;
}

// =============================================
// WINDOW CREATION
// =============================================
function createWindow() {
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

// =============================================
// IPC: PARSE EXCEL
// =============================================
ipcMain.handle('parse-excel', async (event, filePath) => {
    console.log('[ELECTRON] Attempting to parse Excel:', filePath);
    try {
        if (!filePath) throw new Error('No file path provided.');
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        if (rawData.length === 0) return { success: true, data: [] };

        // Find header row
        let headerIdx = -1;
        let colMap = { mst: 4, name: 3, address: 6, serial: 1, phone: 7, email: 8 };

        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const row = rawData[i];
            if (!row || !Array.isArray(row)) continue;

            let matchCount = 0;
            const tempMap = { mst: -1, name: -1, address: -1, serial: -1, email: -1 };

            row.forEach((cell, idx) => {
                const val = String(cell || '').toLowerCase().trim();
                if (val === 'mst' || val === 'mã số thuế' || (val.includes('mã số thuế') && val.length < 20)) {
                    tempMap.mst = idx; matchCount++;
                }
                if (val.includes('tên công ty') || val.includes('tên đơn vị') || val.includes('tên khách hàng')) {
                    tempMap.name = idx; matchCount++;
                }
                if (val.includes('địa chỉ') || val.includes('address')) {
                    tempMap.address = idx; matchCount++;
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
        console.log(`[ELECTRON] Column map: MST=${colMap.mst}(${String.fromCharCode(65+colMap.mst)}), Serial=${colMap.serial}(${String.fromCharCode(65+colMap.serial)}), Name=${colMap.name}(${String.fromCharCode(65+colMap.name)}), Address=${colMap.address}(${String.fromCharCode(65+colMap.address)}), Email=${colMap.email}(${String.fromCharCode(65+colMap.email)})`);

        const data = rawData.slice(startRow).map(row => {
            const mst = row[colMap.mst];
            if (!mst || String(mst).trim() === '') return null;

            let serial = row[colMap.serial] ? String(row[colMap.serial]).trim() : '';
            if (!serial && colMap.serial === 1) {
                serial = row[2] ? String(row[2]).trim() : '';
            }

            const ten = row[colMap.name] ? String(row[colMap.name]).trim() : '';
            const phone = row[colMap.phone] ? String(row[colMap.phone]).trim() : '';
            const email = row[colMap.email] ? String(row[colMap.email]).trim() : '';
            const diaChi = row[colMap.address] ? String(row[colMap.address]).trim() : '';

            return { MST: mst.toString().trim(), Ten: ten, Serial: serial, Email: email, DiaChi: diaChi, Phone: phone };
        }).filter(r => r !== null);

        console.log(`[ELECTRON] Successfully parsed ${data.length} rows.`);
        return { success: true, data };
    } catch (err) {
        console.error('[ELECTRON] Parse Error:', err.message);
        return { success: false, error: err.message };
    }
});

// =============================================
// IPC: SELECT FILE
// =============================================
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

// =============================================
// IPC: PROCESS SINGLE RECORD — STRICT 3-STEP PIPELINE
// =============================================
ipcMain.handle('process-single-record', async (event, { MST, Serial, companyName, email, diaChi, Phone }) => {
    let browser = null;
    let localFilePath = null;

    const sendStatus = (statusMsg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('record-status-update', { mst: MST, status: statusMsg });
        }
    };

    try {
        console.log(`\n${'='.repeat(60)}`);
        pipelineLog(MST, 'PIPELINE START', 'OK', companyName);

        // ============================================
        // STEP 1: CRAWL PDF
        // ============================================
        sendStatus('🌐 Crawling PDF...');

        browser = await scraperService.initBrowser();
        const crawlResult = await scraperService.getLatestCertificate(
            browser, MST, Serial, { companyName }, sendStatus
        );

        // STRICT CHECK: Crawl must return 'Matched' with a valid file
        if (!crawlResult || crawlResult.status !== 'Matched') {
            const reason = crawlResult?.message || 'Không tìm thấy chứng thư';
            pipelineLog(MST, 'CRAWL PDF', 'FAIL', reason);
            sendStatus(`❌ Crawl thất bại: ${reason}`);
            return { success: false, error: `CRAWL FAILED: ${reason}` };
        }

        // Verify file exists on disk
        if (!fs.existsSync(crawlResult.filePath)) {
            pipelineLog(MST, 'CRAWL PDF', 'FAIL', 'File không tồn tại trên disk sau khi crawl');
            sendStatus('❌ File PDF không tồn tại trên disk');
            return { success: false, error: 'CRAWL FAILED: File PDF không tồn tại sau khi crawl' };
        }

        localFilePath = crawlResult.filePath;
        const fileName = crawlResult.fileName; // {mst}.pdf
        pipelineLog(MST, 'CRAWL PDF', 'OK', `${fileName} (${(crawlResult.fileSize / 1024).toFixed(1)} KB)`);

        // ============================================
        // STEP 2: UPLOAD TO SUPABASE STORAGE
        // ============================================
        sendStatus('📤 Uploading to Supabase...');

        const fileContent = fs.readFileSync(localFilePath);
        const storagePath = `certs/${fileName}`; // certificates/certs/{mst}.pdf

        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, fileContent, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            pipelineLog(MST, 'UPLOAD STORAGE', 'FAIL', uploadError.message);
            sendStatus(`❌ Upload thất bại: ${uploadError.message}`);

            // If bucket doesn't exist, give clear error
            if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
                return { success: false, error: `UPLOAD FAILED: Bucket "${STORAGE_BUCKET}" không tồn tại trong Supabase. Vui lòng tạo bucket.` };
            }
            return { success: false, error: `UPLOAD FAILED: ${uploadError.message}` };
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        pipelineLog(MST, 'UPLOAD STORAGE', 'OK', publicUrl);

        // Delete local file after successful upload
        try { fs.rmSync(localFilePath, { force: true }); } catch (e) {}
        // Clean up the temp directory too
        try { fs.rmSync(crawlResult.dirPath, { recursive: true, force: true }); } catch (e) {}

        // ============================================
        // STEP 3: UPDATE DATABASE
        // ============================================
        sendStatus('💾 Updating database...');

        // Update certificates table
        const certData = {
            mst: MST,
            serial: Serial || '',
            pdf_url: publicUrl,
            pdf_status: 'ready',
            updated_at: new Date().toISOString()
        };

        // Upsert: check if exists first
        const { data: existingCerts } = await supabase
            .from('certificates')
            .select('id')
            .eq('mst', MST)
            .limit(1);

        let dbError = null;
        if (existingCerts && existingCerts.length > 0) {
            const { error } = await supabase
                .from('certificates')
                .update({
                    serial: Serial || '',
                    pdf_url: publicUrl,
                    pdf_status: 'ready',
                    updated_at: new Date().toISOString()
                })
                .eq('mst', MST);
            dbError = error;
        } else {
            const { error } = await supabase
                .from('certificates')
                .insert(certData);
            dbError = error;
        }

        if (dbError) {
            pipelineLog(MST, 'DB UPDATE (certificates)', 'FAIL', dbError.message);
            sendStatus(`❌ DB update thất bại: ${dbError.message}`);

            if (dbError.message.includes('row-level security')) {
                return { success: false, error: 'DB UPDATE FAILED: RLS đang chặn. Vui lòng tắt RLS hoặc cấp quyền cho role "anon".' };
            }
            return { success: false, error: `DB UPDATE FAILED: ${dbError.message}` };
        }

        pipelineLog(MST, 'DB UPDATE (certificates)', 'OK', 'pdf_status = ready');

        // Also update customers table (pdf_url) for email worker compatibility
        try {
            const { data: existingCustList } = await supabase
                .from('customers')
                .select('id')
                .eq('mst', MST)
                .limit(1);

            if (existingCustList && existingCustList.length > 0) {
                await supabase
                    .from('customers')
                    .update({
                        pdf_url: publicUrl,
                        company_name: companyName || '',
                        email: email || '',
                        phone: Phone || '',
                        status: 'active'
                    })
                    .eq('mst', MST);
                pipelineLog(MST, 'DB UPDATE (customers)', 'OK', 'Synced pdf_url');
            } else {
                await supabase
                    .from('customers')
                    .insert({
                        mst: MST,
                        company_name: companyName || '',
                        email: email || '',
                        phone: Phone || '',
                        pdf_url: publicUrl,
                        status: 'active',
                        notes: diaChi ? `Địa chỉ: ${diaChi}` : '',
                        created_at: new Date().toISOString()
                    });
                pipelineLog(MST, 'DB UPDATE (customers)', 'OK', 'Inserted new customer');
            }
        } catch (crmErr) {
            // CRM sync is non-critical — certificates table is the source of truth
            pipelineLog(MST, 'DB UPDATE (customers)', 'FAIL', crmErr.message + ' (non-critical)');
        }

        // ============================================
        // ALL 3 STEPS PASSED → SUCCESS
        // ============================================
        sendStatus('✅ SUCCESS');
        pipelineLog(MST, 'PIPELINE COMPLETE', 'OK', publicUrl);
        console.log(`${'='.repeat(60)}\n`);

        return { success: true, publicUrl };

    } catch (err) {
        console.error('[PIPELINE] UNEXPECTED ERROR:', err.message);
        pipelineLog(MST, 'PIPELINE', 'FAIL', err.message);
        sendStatus(`❌ ${err.message}`);

        return { success: false, error: err.message };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
});

// =============================================
// IPC: CLEANUP
// =============================================
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
