const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crawler = require('./services/crawler');
const pdfPipeline = require('./services/pdfPipeline');
const xlsx = require('xlsx');

// Load .env explicitly from the same directory as main.js
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
    // Ensure cert download directory exists
    if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });

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
// IPC: PROCESS SINGLE RECORD — DETERMINISTIC 3-STEP PIPELINE
// Uses: crawler.js → supabaseUpload.js (via pdfPipeline.js)
// Email system is NOT modified here.
// =============================================
ipcMain.handle('process-single-record', async (event, { MST, Serial, companyName, email, diaChi, Phone }) => {
    let browser = null;

    const sendStatus = (statusMsg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('record-status-update', { mst: MST, status: statusMsg });
        }
    };

    try {
        pipelineLog(MST, 'PIPELINE START', 'OK', companyName);

        // Launch browser once per record
        browser = await crawler.initBrowser();

        // Run the full pipeline: Crawl → Upload → DB Update
        // Retry logic (3x, 10s delay) is handled inside pdfPipeline
        const result = await pdfPipeline.processSingleRecord(browser, {
            MST, Serial, companyName, email, diaChi, Phone
        }, sendStatus);

        return result;

    } catch (err) {
        console.error('[PIPELINE] UNEXPECTED ERROR:', err.message);
        pipelineLog(MST, 'PIPELINE', 'FAIL', err.message);
        sendStatus(`❌ FAILED: ${err.message}`);
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
