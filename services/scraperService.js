const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SEARCH_URL = 'http://118.71.99.154:8888/SearchInfoCert.aspx';
const DOWNLOAD_DIR = path.join(__dirname, '..', 'uploads', 'certs');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

async function initBrowser() {
    console.log('[Scraper] Initializing browser...');
    const launchOptions = {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--ignore-certificate-errors'
        ],
        ignoreHTTPSErrors: true,
        acceptInsecureCerts: true,
        defaultViewport: null,
        userDataDir: path.join(__dirname, '..', 'tmp_puppeteer')
    };

    // Auto-detect Chrome executable for Render
    let foundPath = null;
    const searchRoots = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome'),
        '/opt/render/.cache/puppeteer/chrome',
        '/home/render/.cache/puppeteer/chrome'
    ];

    for (const root of searchRoots) {
        if (root && fs.existsSync(root)) {
            if (fs.statSync(root).isFile()) {
                foundPath = root;
                break;
            }
            // If it's a directory, look for binary
            try {
                const items = fs.readdirSync(root);
                for (const item of items) {
                    const p = path.join(root, item, 'chrome-linux64', 'chrome');
                    if (fs.existsSync(p)) { foundPath = p; break; }
                }
            } catch(e) {}
        }
        if (foundPath) break;
    }

    if (foundPath) launchOptions.executablePath = foundPath;

    return await puppeteer.launch(launchOptions);
}

/**
 * Scrape the latest digital certificate for a given MST (tax code).
 * Returns { status: 'Matched'|'Not Found'|'Not Matched'|'Error', message, filePath, fileName, dirPath }
 */
async function getLatestCertificate(browser, mst, excelSerials, recipientInfo) {
    let page = null;
    const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);
    
    try {
        if (!fs.existsSync(mstDownloadDir)) fs.mkdirSync(mstDownloadDir, { recursive: true });

        page = await browser.newPage();
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: mstDownloadDir
        });

        console.log(`[Scraper] [${mst}] Navigating to ${SEARCH_URL}...`);
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 45000 });

        const mstInputSelector = 'input[name$="txtMasothue"], input[id$="txtMasothue"]';
        const searchBtnSelector = 'input[name$="btnTim"], input[id$="btnTim"], input[type="submit"]';

        await page.waitForSelector(mstInputSelector, { timeout: 10000 });
        
        console.log(`[Scraper] [${mst}] Entering tax code...`);
        await page.focus(mstInputSelector);
        await page.click(mstInputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(mstInputSelector, String(mst).trim(), { delay: 30 });

        const searchBtn = await page.$(searchBtnSelector);
        if (!searchBtn) throw new Error('Search button not found in DOM.');

        // Intercept new tab results (ASP.NET common behavior)
        const tabPromise = new Promise(resolve => {
            const handler = async (target) => {
                const newPage = await target.page().catch(() => null);
                if (newPage) {
                    browser.off('targetcreated', handler);
                    resolve(newPage);
                }
            };
            browser.on('targetcreated', handler);
            setTimeout(() => { browser.off('targetcreated', handler); resolve(null); }, 6000);
        });

        await searchBtn.click();
        const newPage = await tabPromise;
        let resultPage = newPage || page;

        console.log(`[Scraper] [${mst}] Waiting for result evaluation...`);
        await resultPage.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));

        // 1. Check for "No Records"
        const noResult = await resultPage.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
        });

        if (noResult) {
            return { status: 'Not Found', message: 'MST không tồn tại trên hệ thống CA.' };
        }

        // 2. Evaluate Results & Matches
        const matchData = await resultPage.evaluate((targetSerials) => {
            const norm = (s) => s ? s.toString().replace(/\s/g, '').toUpperCase() : '';
            const targets = Array.isArray(targetSerials) 
                ? targetSerials.map(norm).filter(s => s !== '')
                : [norm(targetSerials)].filter(s => s !== '');
            
            const tables = Array.from(document.querySelectorAll('table[id="tblresult"]'));
            const results = [];
            
            tables.forEach(tbl => {
                const cells = Array.from(tbl.querySelectorAll('td')).map(td => td.innerText.trim());
                let serialText = '';
                
                const serialIdx = cells.findIndex(c => /Serial|S[ốố]\s*ch[ứứ]ng\s*th[ưư]/i.test(c));
                if (serialIdx !== -1 && cells[serialIdx + 1]) {
                    serialText = norm(cells[serialIdx + 1]);
                } else {
                    const match = tbl.innerText.match(/(?:Serial|S[ốố]|S\/N)[:\s]*([A-F0-9\s-]{10,})/i);
                    if (match) serialText = norm(match[1]);
                }

                const link = tbl.querySelector('a');
                if (link) {
                    const id = 'dl_' + Math.random().toString(36).substr(2, 9);
                    link.setAttribute('id', id);
                    results.push({
                        serial: serialText,
                        linkId: id,
                        isActive: tbl.innerText.includes('Hoạt động')
                    });
                }
            });

            if (results.length === 0) return null;

            // Priority 1: Exact match by serial
            if (targets.length > 0) {
                const matched = results.find(r => targets.some(t => r.serial.includes(t) || t.includes(r.serial)));
                if (matched) return { found: true, id: matched.linkId, serial: matched.serial };
            }

            // Priority 2: Fallback to latest active (if no serial provided)
            const fallback = results.filter(r => r.isActive).pop() || results.pop();
            return { found: true, id: fallback.linkId, serial: fallback.serial || 'Latest' };
        }, excelSerials);

        if (!matchData || !matchData.found) {
            return { status: 'Not Matched', message: 'Không tìm thấy Serial khớp với yêu cầu.' };
        }

        // 3. Trigger Download
        console.log(`[Scraper] [${mst}] Match found: ${matchData.serial}. Clicking download...`);
        const targetLink = await resultPage.$(`#${matchData.id}`);
        if (!targetLink) return { status: 'Error', message: 'Lỗi định vị link tải (DOM error).' };

        await targetLink.click();
        await new Promise(r => setTimeout(r, 5000));

        // 4. Wait for file
        const beforeDownload = Date.now();
        let downloadedFile = null;
        for (let i = 0; i < 25; i++) { 
            await new Promise(r => setTimeout(r, 1000));
            try {
                const files = fs.readdirSync(mstDownloadDir);
                const valid = files.filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && !f.startsWith('.com.google.Chrome'));
                if (valid.length > 0) {
                    downloadedFile = valid[0];
                    break;
                }
            } catch (err) {}
        }

        if (downloadedFile) {
            const originalPath = path.join(mstDownloadDir, downloadedFile);
            const cleanTen = (recipientInfo.TenCongTy || 'Company').replace(/[\\/:*?"<>|]/g, '-').trim();
            const newFileName = `${mst}_${cleanTen}.pdf`;
            const newPath = path.join(mstDownloadDir, newFileName);
            
            fs.renameSync(originalPath, newPath);
            return { filePath: newPath, fileName: newFileName, dirPath: mstDownloadDir, status: 'Matched' };
        }

        return { status: 'Error', message: 'Tải file thất bại (Timeout).' };

    } catch (error) {
        console.error(`[Scraper] [${mst}] ❌ Error:`, error.message);
        return { status: 'Error', message: error.message };
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

function cleanupCerts() {
    try {
        if (fs.existsSync(DOWNLOAD_DIR)) {
            const files = fs.readdirSync(DOWNLOAD_DIR);
            files.forEach(file => {
                const filePath = path.join(DOWNLOAD_DIR, file);
                const stat = fs.statSync(filePath);
                if (Date.now() - stat.mtime.getTime() > 12 * 60 * 60 * 1000) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                }
            });
        }
    } catch (err) {}
}

module.exports = { initBrowser, getLatestCertificate, cleanupCerts };
