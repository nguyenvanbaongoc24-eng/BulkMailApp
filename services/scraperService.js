const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SEARCH_URL = 'http://118.71.99.154:8888/SearchInfoCert.aspx';
let DOWNLOAD_DIR = path.join(__dirname, '..', 'uploads', 'certs');
let PUPPETEER_CACHE = path.join(__dirname, '..', 'tmp_puppeteer');

// =============================================
// PATH INITIALIZATION
// =============================================
function initPaths(certPath, cachePath) {
    DOWNLOAD_DIR = certPath;
    PUPPETEER_CACHE = cachePath;
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    if (!fs.existsSync(PUPPETEER_CACHE)) fs.mkdirSync(PUPPETEER_CACHE, { recursive: true });
    console.log(`[Scraper] Writable paths initialized:\n  Certs: ${DOWNLOAD_DIR}\n  Cache: ${PUPPETEER_CACHE}`);
}

// =============================================
// HELPERS
// =============================================
function sanitizeString(str) {
    if (!str) return 'Company';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .replace(/[^a-zA-Z0-9]/g, '_')
              .replace(/_+/g, '_')
              .trim();
}

function log(mst, step, status, detail = '') {
    const ts = new Date().toISOString().substring(11, 19);
    const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : status === 'INFO' ? 'ℹ️' : '🔄';
    console.log(`[${ts}] [Scraper] [${mst}] ${icon} ${step}${detail ? ': ' + detail : ''}`);
}

// =============================================
// BROWSER INITIALIZATION
// =============================================
async function initBrowser() {
    console.log('[Scraper] Initializing browser configuration...');
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--ignore-certificate-errors',
            '--disable-features=DownloadBubble,DownloadBubbleV2',
            '--disable-extensions',
            '--no-default-browser-check',
            '--no-first-run'
        ],
        ignoreHTTPSErrors: true,
        acceptInsecureCerts: true,
        defaultViewport: null,
        userDataDir: PUPPETEER_CACHE
    };

    // Auto-detect browser executable
    let foundPath = null;
    const isWindows = process.platform === 'win32';

    const searchRoots = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
    ];

    if (isWindows) {
        searchRoots.push(
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        );
    } else {
        searchRoots.push(
            path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome'),
            '/opt/render/.cache/puppeteer/chrome',
            '/home/render/.cache/puppeteer/chrome'
        );
    }

    for (const root of searchRoots) {
        if (!root) continue;
        if (fs.existsSync(root)) {
            if (fs.statSync(root).isFile()) {
                foundPath = root;
                break;
            }
            try {
                const items = fs.readdirSync(root);
                for (const item of items) {
                    const pLinux = path.join(root, item, 'chrome-linux64', 'chrome');
                    if (fs.existsSync(pLinux)) { foundPath = pLinux; break; }
                    const pWin = path.join(root, item, 'chrome-win64', 'chrome.exe');
                    if (fs.existsSync(pWin)) { foundPath = pWin; break; }
                }
            } catch(e) {}
        }
        if (foundPath) break;
    }

    if (foundPath) {
        launchOptions.executablePath = foundPath;
        console.log(`[Scraper] Using detected executable: ${foundPath}`);
    } else {
        console.log('[Scraper] No specific executable detected, letting Puppeteer try default path.');
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

// =============================================
// MAIN CRAWL FUNCTION — HARDENED
// =============================================
async function getLatestCertificate(browser, mst, excelSerials, recipientInfo, onStatus) {
    const MAX_RETRIES = 5;
    const DOWNLOAD_POLL_TIMEOUT = 60; // 60 seconds polling
    const NAV_TIMEOUT = 20000; // 20s navigation timeout
    let lastError = null;

    // Status callback helper
    const status = (msg) => {
        log(mst, msg, 'INFO');
        if (typeof onStatus === 'function') onStatus(msg);
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let page = null;
        const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);

        try {
            if (attempt > 1) {
                status(`🔁 RETRYING (${attempt}/${MAX_RETRIES})...`);
                await new Promise(r => setTimeout(r, 3000 * attempt)); // Exponential backoff
            }

            if (!fs.existsSync(mstDownloadDir)) fs.mkdirSync(mstDownloadDir, { recursive: true });

            page = await browser.newPage();
            page.setDefaultNavigationTimeout(NAV_TIMEOUT);
            page.setDefaultTimeout(NAV_TIMEOUT);

            // Setup download behavior
            const client = await page.createCDPSession();
            await client.send('Browser.setDownloadBehavior', {
                behavior: 'allowAndName',
                downloadPath: mstDownloadDir,
                eventsEnabled: true
            });
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: mstDownloadDir
            });

            // ---- STEP 1: Navigate to search page ----
            status('🌐 Đang truy cập cổng CA...');
            log(mst, 'NAVIGATE', 'INFO', SEARCH_URL);
            
            await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
            
            // Verify page actually loaded
            const mstInputSelector = 'input[name$="txtMasothue"], input[id$="txtMasothue"]';
            const searchBtnSelector = 'input[name$="btnTim"], input[id$="btnTim"], input[type="submit"]';

            try {
                await page.waitForSelector(mstInputSelector, { timeout: 10000 });
            } catch (e) {
                throw new Error('Cổng CA không phản hồi — input MST không xuất hiện sau 10s');
            }
            
            log(mst, 'PAGE LOADED', 'OK', 'Input MST đã sẵn sàng');

            // ---- STEP 2: Enter MST and search ----
            status('🔍 Đang tìm kiếm chứng thư...');
            await page.focus(mstInputSelector);
            await page.click(mstInputSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(mstInputSelector, String(mst).trim(), { delay: 50 });

            const searchBtn = await page.$(searchBtnSelector);
            if (!searchBtn) throw new Error('Cổng CA: Nút Tìm kiếm không tồn tại.');

            // Listen for new tab
            const tabPromise = new Promise(resolve => {
                const handler = async (target) => {
                    const newPage = await target.page().catch(() => null);
                    if (newPage) {
                        browser.off('targetcreated', handler);
                        resolve(newPage);
                    }
                };
                browser.on('targetcreated', handler);
                setTimeout(() => { browser.off('targetcreated', handler); resolve(null); }, 30000);
            });

            log(mst, 'SEARCH', 'INFO', 'Clicking search button...');
            await searchBtn.click();
            const newPage = await tabPromise;
            let resultPage = newPage || page;

            if (newPage) {
                log(mst, 'NEW TAB', 'OK', 'Result tab detected');
                try {
                    const newClient = await newPage.createCDPSession();
                    await newClient.send('Browser.setDownloadBehavior', {
                        behavior: 'allowAndName',
                        downloadPath: mstDownloadDir,
                        eventsEnabled: true
                    });
                    await newClient.send('Page.setDownloadBehavior', {
                        behavior: 'allow',
                        downloadPath: mstDownloadDir
                    });
                } catch(e) {}
            }

            // ---- STEP 3: Wait for results + verify ----
            status('⏳ Đang chờ kết quả...');
            await resultPage.waitForNetworkIdle({ timeout: 20000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 5000));

            // Check for "no result"
            const noResult = await resultPage.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
            });

            if (noResult) {
                log(mst, 'SEARCH RESULT', 'FAIL', 'Không tìm thấy chứng thư');
                return { status: 'Not Found', message: 'Hệ thống CA báo: Không tìm thấy chứng thư cho MST này.' };
            }

            // ---- STEP 4: Find and click serial match ----
            status('📋 Đang tìm Serial khớp...');
            const matchData = await resultPage.evaluate((targetSerials) => {
                const norm = (s) => s ? s.toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
                const targets = Array.isArray(targetSerials)
                    ? targetSerials.map(norm).filter(s => s !== '')
                    : [norm(targetSerials)].filter(s => s !== '');

                const allLinks = Array.from(document.querySelectorAll('a, input[type="button"], input[type="submit"]'));
                const downloadLinks = allLinks.filter(l => {
                    const text = (l.innerText || l.value || '').toLowerCase();
                    return text.includes('tải về') || text.includes('download');
                });

                if (downloadLinks.length === 0) {
                    return { found: false, reason: 'Không tìm thấy bất kỳ link "Tải về" nào trên trang.' };
                }

                for (const link of downloadLinks) {
                    let container = link.parentElement;
                    for (let i = 0; i < 5; i++) {
                        if (!container) break;
                        const containerText = norm(container.innerText);
                        const match = targets.find(t => containerText.includes(t));
                        if (match) {
                            link.click();
                            return { found: true, serial: match };
                        }
                        container = container.parentElement;
                    }
                }

                const fullPageText = norm(document.body.innerText);
                const globalMatch = targets.find(t => fullPageText.includes(t));

                if (globalMatch) {
                    if (downloadLinks.length === 1) {
                        downloadLinks[0].click();
                        return { found: true, serial: globalMatch, note: 'Matched globally, clicked only available link' };
                    }
                    return { found: false, reason: `Tìm thấy Serial ${globalMatch} trên trang nhưng không xác định được link tải tương ứng.` };
                }

                return { found: false, reason: 'Không tìm thấy Serial khớp trong nội dung trang.' };
            }, excelSerials);

            if (!matchData || !matchData.found) {
                throw new Error(matchData?.reason || 'Không tìm thấy link "Tải về" cho Serial phù hợp.');
            }

            log(mst, 'SERIAL MATCH', 'OK', matchData.serial);

            // ---- STEP 5: Click final download button ----
            status('📥 Đang tải PDF...');
            await new Promise(r => setTimeout(r, 5000));
            const pages = await browser.pages();
            const finalPage = pages[pages.length - 1];

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
                log(mst, 'FINAL BUTTON', 'INFO', 'Could not find final download button. Proceeding with polling...');
            }

            // ---- STEP 6: Poll for downloaded file (60 seconds) ----
            log(mst, 'DOWNLOAD POLL', 'INFO', `Polling for ${DOWNLOAD_POLL_TIMEOUT}s...`);
            let downloadedFile = null;
            for (let i = 0; i < DOWNLOAD_POLL_TIMEOUT; i++) {
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

                // Log progress every 10s
                if ((i + 1) % 10 === 0) {
                    log(mst, 'DOWNLOAD POLL', 'INFO', `${i + 1}s elapsed, still waiting...`);
                }
            }

            if (!downloadedFile) {
                throw new Error(`DOWNLOAD FAILED: Không tải được file PDF sau ${DOWNLOAD_POLL_TIMEOUT}s`);
            }

            // ---- STEP 7: Rename and return ----
            const originalPath = path.join(mstDownloadDir, downloadedFile);
            const fileSize = fs.statSync(originalPath).size;
            
            // Validate file is not empty
            if (fileSize < 100) {
                throw new Error(`DOWNLOAD FAILED: File tải về quá nhỏ (${fileSize} bytes) — có thể bị lỗi`);
            }

            const newFileName = `${mst}.pdf`;
            const newPath = path.join(mstDownloadDir, newFileName);
            fs.renameSync(originalPath, newPath);

            log(mst, 'DOWNLOAD PDF', 'OK', `${newFileName} (${(fileSize / 1024).toFixed(1)} KB)`);

            return { 
                filePath: newPath, 
                fileName: newFileName, 
                dirPath: mstDownloadDir, 
                fileSize,
                status: 'Matched' 
            };

        } catch (error) {
            log(mst, `ATTEMPT ${attempt}/${MAX_RETRIES}`, 'FAIL', error.message);
            lastError = error;
            
            // Immediate return for "Not Found" to avoid useless retries
            if (error.message.includes('Hệ thống CA báo')) {
                return { status: 'Not Found', message: error.message };
            }
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }

    log(mst, 'DOWNLOAD PDF', 'FAIL', `Đã thử ${MAX_RETRIES} lần: ${lastError.message}`);
    return { status: 'Error', message: `CRAWL FAILED sau ${MAX_RETRIES} lần: ${lastError.message}` };
}

// =============================================
// CLEANUP
// =============================================
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
