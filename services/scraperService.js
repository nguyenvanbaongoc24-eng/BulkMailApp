const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SEARCH_URL = 'http://118.71.99.154:8888/SearchInfoCert.aspx';
let DOWNLOAD_DIR = path.join(__dirname, '..', 'uploads', 'certs');
let PUPPETEER_CACHE = path.join(__dirname, '..', 'tmp_puppeteer');

function initPaths(certPath, cachePath) {
    DOWNLOAD_DIR = certPath;
    PUPPETEER_CACHE = cachePath;
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    if (!fs.existsSync(PUPPETEER_CACHE)) fs.mkdirSync(PUPPETEER_CACHE, { recursive: true });
    console.log(`[Scraper] Writable paths initialized: 
      Certs: ${DOWNLOAD_DIR}
      Cache: ${PUPPETEER_CACHE}`);
}

function sanitizeString(str) {
    if (!str) return 'Company';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '') // Remove accents
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .replace(/[^a-zA-Z0-9]/g, '_') // Replace everything else with _
              .replace(/_+/g, '_') // De-duplicate underscores
              .trim();
}

async function initBrowser() {
    console.log('[Scraper] Initializing browser configuration...');
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
        userDataDir: PUPPETEER_CACHE
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

    if (foundPath) {
        launchOptions.executablePath = foundPath;
        console.log(`[Scraper] Using detected executable: ${foundPath}`);
    } else {
        console.log('[Scraper] No specific executable detected, using default puppeteer launch config.');
    }

    try {
        console.log('[Scraper] Launching browser (with 30s timeout)...');
        return await Promise.race([
            puppeteer.launch(launchOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser Launch Timeout (30s)')), 30000))
        ]);
    } catch (launchErr) {
        console.error('[Scraper] CRITICAL: Browser launch failed:', launchErr.message);
        throw launchErr;
    }
}

async function getLatestCertificate(browser, mst, excelSerials, recipientInfo) {
    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let page = null;
        const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);
        
        try {
            if (attempt > 1) {
                console.log(`[Scraper] [${mst}] Retry attempt ${attempt}/${MAX_RETRIES}...`);
                await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
            }

            if (!fs.existsSync(mstDownloadDir)) fs.mkdirSync(mstDownloadDir, { recursive: true });

            page = await browser.newPage();
            // High-level timeout for the entire page operation
            page.setDefaultNavigationTimeout(60000);
            page.setDefaultTimeout(60000);

            const client = await page.createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: mstDownloadDir
            });

            console.log(`[Scraper] [${mst}] Navigating to ${SEARCH_URL}...`);
            await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const mstInputSelector = 'input[name$="txtMasothue"], input[id$="txtMasothue"]';
            const searchBtnSelector = 'input[name$="btnTim"], input[id$="btnTim"], input[type="submit"]';

            await page.waitForSelector(mstInputSelector, { timeout: 20000 });
            
            console.log(`[Scraper] [${mst}] Entering tax code...`);
            await page.focus(mstInputSelector);
            await page.click(mstInputSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(mstInputSelector, String(mst).trim(), { delay: 50 });

            const searchBtn = await page.$(searchBtnSelector);
            if (!searchBtn) throw new Error('Cổng CA: Nút Tìm kiếm không tồn tại.');

            const tabPromise = new Promise(resolve => {
                const handler = async (target) => {
                    const newPage = await target.page().catch(() => null);
                    if (newPage) {
                        browser.off('targetcreated', handler);
                        resolve(newPage);
                    }
                };
                browser.on('targetcreated', handler);
                setTimeout(() => { browser.off('targetcreated', handler); resolve(null); }, 15000);
            });

            console.log(`[Scraper] [${mst}] Clicking Search...`);
            await searchBtn.click();
            const newPage = await tabPromise;
            let resultPage = newPage || page;

            if (newPage) {
                console.log(`[Scraper] [${mst}] New result tab detected.`);
                try {
                    const newClient = await newPage.createCDPSession();
                    await newClient.send('Page.setDownloadBehavior', {
                        behavior: 'allow',
                        downloadPath: mstDownloadDir
                    });
                } catch(e) {}
            }

            console.log(`[Scraper] [${mst}] Waiting for results to load...`);
            await resultPage.waitForNetworkIdle({ timeout: 20000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 5000)); // Solid wait for table

            const noResult = await resultPage.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
            });

            if (noResult) {
                console.warn(`[Scraper] [${mst}] Gateway returned "No records found".`);
                return { status: 'Not Found', message: 'Hệ thống CA báo: Không tìm thấy chứng thư cho MST này.' };
            }

            const matchData = await resultPage.evaluate((targetSerials) => {
                const norm = (s) => s ? s.toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
                const targets = Array.isArray(targetSerials) 
                    ? targetSerials.map(norm).filter(s => s !== '')
                    : [norm(targetSerials)].filter(s => s !== '');
                
                const tables = Array.from(document.querySelectorAll('table[id="tblresult"]'));
                const results = [];
                
                tables.forEach((tbl, idx) => {
                    const cells = Array.from(tbl.querySelectorAll('td')).map(td => td.innerText.trim());
                    let serialText = '';
                    
                    // Col 3 (Index 2) is priority based on user feedback
                    if (cells[2]) serialText = norm(cells[2]);
                    else if (cells[1]) serialText = norm(cells[1]);

                    const link = tbl.querySelector('a');
                    if (link) {
                        results.push({
                            serial: serialText,
                            index: idx,
                            isActive: tbl.innerText.includes('Hoạt động')
                        });
                    }
                });

                if (results.length === 0) return { found: false, count: 0, foundSerials: [] };

                const matched = results.find(r => 
                    targets.some(t => r.serial === t || r.serial.includes(t) || t.includes(r.serial))
                );

                const finalMatch = matched || results.filter(r => r.isActive).pop() || results.pop();
                
                if (finalMatch) {
                    const targetTable = tables[finalMatch.index];
                    const downloadLink = targetTable.querySelector('a');
                    if (downloadLink) {
                        downloadLink.click();
                        return { found: true, serial: finalMatch.serial };
                    }
                }

                return { found: false, count: results.length, reason: 'Link not found in table' };
            }, excelSerials);

            if (!matchData || !matchData.found) {
                throw new Error('Không tìm thấy link "Tải về" cho Serial phù hợp.');
            }

            console.log(`[Scraper] [${mst}] Table link clicked. Waiting for secondary download button...`);
            
            // Step 5: Bấm "Tải giấy chứng nhận điện tử"
            // After clicking "Tải về", a new tab or the same page updates
            await new Promise(r => setTimeout(r, 5000));
            const pages = await browser.pages();
            const finalPage = pages[pages.length - 1]; // Often opens in new tab

            const finalDownloadSelector = 'input[value*="giấy chứng nhận"], a[href*="giấy chứng nhận"], button:contains("giấy chứng nhận")';
            
            const clicked = await finalPage.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], a, button'));
                const target = buttons.find(b => {
                    const val = (b.value || b.innerText || b.textContent || '').toLowerCase();
                    return val.includes('tải giấy chứng nhận') || val.includes('tải chứng nhận');
                });
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            });

            if (!clicked) {
                console.warn(`[Scraper] [${mst}] Could not find final download button. Proceeding with polling...`);
            }

            console.log(`[Scraper] [${mst}] Final download triggered. Polling for file...`);
            
            let downloadedFile = null;
            for (let i = 0; i < 40; i++) { 
                await new Promise(r => setTimeout(r, 1000));
                try {
                    const files = fs.readdirSync(mstDownloadDir);
                    const valid = files.filter(f => {
                        const low = f.toLowerCase();
                        return !low.endsWith('.crdownload') && !low.endsWith('.tmp') && 
                               !low.endsWith('.msi') && !low.endsWith('.exe');
                    });
                    if (valid.length > 0) {
                        downloadedFile = valid[0];
                        break;
                    }
                } catch (err) {}
            }

            if (downloadedFile) {
                const originalPath = path.join(mstDownloadDir, downloadedFile);
                const originalExt = path.extname(downloadedFile).toLowerCase() || '.pdf';
                const cleanTen = sanitizeString(recipientInfo.companyName);
                const newFileName = `${mst}_${cleanTen}${originalExt}`;
                const newPath = path.join(mstDownloadDir, newFileName);
                fs.renameSync(originalPath, newPath);
                return { filePath: newPath, fileName: newFileName, dirPath: mstDownloadDir, status: 'Matched' };
            }

            throw new Error('Tải file PDF thất bại (Timeout sau khi bấm nút cuối).');

        } catch (error) {
            console.error(`[Scraper] [${mst}] Attempt ${attempt} failed:`, error.message);
            lastError = error;
            // Immediate return for "Not Found" to avoid useless retries
            if (error.message.includes('Hệ thống CA báo')) return { status: 'Not Found', message: error.message };
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }

    return { status: 'Error', message: `Đã thử ${MAX_RETRIES} lần nhưng thất bại: ${lastError.message}` };
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

module.exports = { initPaths, initBrowser, getLatestCertificate, cleanupCerts };
