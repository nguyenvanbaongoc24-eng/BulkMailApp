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
    const launchOptions = {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--no-proxy-server',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-features=CalculateNativeWinOcclusion'
        ],
        ignoreHTTPSErrors: true,
        acceptInsecureCerts: true,
        defaultViewport: null,
        userDataDir: path.join(__dirname, '..', 'tmp_puppeteer'),
        extraPrefsCP: {
            'download.default_directory': DOWNLOAD_DIR,
            'download.prompt_for_download': false,
            'download.directory_upgrade': true,
            'safebrowsing.enabled': true
        }
    };

    let foundPath = null;

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        if (require('fs').existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
            foundPath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } else {
            delete process.env.PUPPETEER_EXECUTABLE_PATH;
        }
    }

    if (!foundPath) {
        const homeDir = require('os').homedir();
        const searchRoots = [
            path.join(process.cwd(), '.cache', 'puppeteer', 'chrome'),
            path.join(homeDir, '.cache', 'puppeteer', 'chrome'),
            path.join(process.env.LOCALAPPDATA || '', 'puppeteer', 'chrome'),
            '/opt/render/.cache/puppeteer/chrome',
            '/home/render/.cache/puppeteer/chrome'
        ];

        for (const root of searchRoots) {
            try {
                if (require('fs').existsSync(root)) {
                    const versions = require('fs').readdirSync(root);
                    for (const v of versions) {
                        const possiblePaths = [
                            path.join(root, v, 'chrome-linux64', 'chrome'),
                            path.join(root, v, 'chrome-win64', 'chrome.exe'),
                            path.join(root, v, 'chrome-win32', 'chrome.exe')
                        ];
                        for (const p of possiblePaths) {
                            if (require('fs').existsSync(p)) {
                                foundPath = p;
                                break;
                            }
                        }
                        if (foundPath) break;
                    }
                }
            } catch (e) {}
            if (foundPath) break;
        }
    }

    if (foundPath) {
        launchOptions.executablePath = foundPath;
    }

    return await puppeteer.launch(launchOptions);
}

function normalizeSerial(s) {
    if (!s) return '';
    return s.toString().replace(/\s/g, '').toUpperCase();
}

/**
 * Scrape the latest digital certificate for a given MST (tax code).
 * 
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} mst - Tax code to search
 * @param {string|string[]} excelSerials - Array or string of serials from Excel for validation
 * @param {Object} recipientInfo - Full recipient info for filename formatting
 * @returns {Object|null} { filePath, fileName, status, message } or null
 */
async function getLatestCertificate(browser, mst, excelSerials, recipientInfo) {
    let page = null;
    
    try {
        const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);
        if (!fs.existsSync(mstDownloadDir)) {
            fs.mkdirSync(mstDownloadDir, { recursive: true });
        }

        page = await browser.newPage();
        
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: mstDownloadDir
        });

        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Phase 15: Use specific ASP.NET selectors discovered via visual debug
        const mstInputSelector = 'input[name$="txtMasothue"], input[id$="txtMasothue"], input[name$="txtTaxCode"]';
        const searchBtnSelector = 'input[name$="btnTim"], input[id$="btnTim"], input[name$="btnSearch"], input[type="submit"]';

        console.log(`[Scraper] 🔍 Filling MST: ${mst}...`);
        await page.waitForSelector(mstInputSelector, { timeout: 15000 });
        
        await page.focus(mstInputSelector);
        await page.click(mstInputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(mstInputSelector, mst, { delay: 50 });

        const searchBtn = await page.$(searchBtnSelector);
        if (!searchBtn) throw new Error('Không tìm thấy nút Tìm kiếm');

        const tabPromise = new Promise(resolve => {
            const handler = async (target) => {
                const newPage = await target.page().catch(() => null);
                if (newPage) {
                    browser.off('targetcreated', handler);
                    resolve(newPage);
                }
            };
            browser.on('targetcreated', handler);
            setTimeout(() => {
                browser.off('targetcreated', handler);
                resolve(null);
            }, 8000);
        });

        await searchBtn.click();

        const newPage = await tabPromise;
        let resultPage = page;
        if (newPage) {
            resultPage = newPage;
            console.log('[Scraper] Bắt được kết quả ở Tab mới.');
            await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
        } else {
            console.log('[Scraper] Đang tìm kết quả trên trang hiện tại...');
            await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
        }

        await new Promise(r => setTimeout(r, 4000));

        // Check if results exist
        const noResult = await resultPage.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
        });

        if (noResult) {
            return { status: 'Not Found', message: `Không tìm thấy thông tin cho MST ${mst} trên hệ thống CA.` };
        }

        const scrapeResult = await resultPage.evaluate((targetSerials) => {
            const norm = (s) => s ? s.toString().replace(/\s/g, '').toUpperCase() : '';
            
            const targets = Array.isArray(targetSerials) 
                ? targetSerials.map(norm).filter(s => s !== '')
                : [norm(targetSerials)].filter(s => s !== '');
            
            const hasTarget = targets.length > 0;
            
            // Phase 15: Advanced Result Extraction for ASP.NET Block Layout
            const results = [];
            const tables = Array.from(document.querySelectorAll('table[id="tblresult"]'));
            
            tables.forEach(tbl => {
                const cells = Array.from(tbl.querySelectorAll('td')).map(td => td.innerText.trim());
                let serialText = '';
                
                const serialIdx = cells.findIndex(c => /Serial|S[ốố]\s*ch[ứứ]ng\s*th[ưư]/i.test(c));
                if (serialIdx !== -1 && cells[serialIdx + 1]) {
                    serialText = norm(cells[serialIdx + 1]);
                } else {
                    const match = tbl.innerText.match(/(?:Serial|S[ốố]\s*ch[ứứ]ng\s*th[ưư]|S\/N)[:\s]*([A-F0-9\s-]{10,})/i);
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

            // 1. Finding by Target Serial
            if (hasTarget) {
                const matched = results.find(r => targets.some(t => r.serial.includes(t) || t.includes(r.serial)));
                if (matched) return { found: true, id: matched.linkId, serial: matched.serial };
            }

            // 2. Fallback to Latest (preferring active ones first)
            const fallback = results.filter(r => r.isActive).pop() || results.pop();
            return { found: true, id: fallback.linkId, serial: fallback.serial || 'Latest' };
        }, excelSerials);

        if (!scrapeResult || !scrapeResult.found) {
            const searchList = Array.isArray(excelSerials) ? excelSerials.join(' / ') : (excelSerials || 'N/A');
            const msg = `Không khớp Serial mục tiêu (${searchList}). Tra cứu thất bại hoặc trang web đổi giao diện.`;
            console.error(`[Scraper] ✖ ${msg}`);
            return { status: 'Not Matched', message: msg };
        }

        console.log(`[Scraper] ✔ Khớp Serial: ${scrapeResult.serial}. Đang tải...`);
        const targetLink = await resultPage.$(`#${scrapeResult.id}`);
        if (!targetLink) {
            return { status: 'Error', message: 'Lỗi định vị link tải' };
        }

        await targetLink.click();

        await new Promise(r => setTimeout(r, 4000));

        const beforeDownload = Date.now();
        let downloadedFile = null;
        for (let i = 0; i < 30; i++) { 
            await new Promise(r => setTimeout(r, 1000));
            
            try {
                if (!fs.existsSync(mstDownloadDir)) break;
                const files = fs.readdirSync(mstDownloadDir);
                const validFiles = files.filter(f => !f.endsWith('.crdownload') && !f.endsWith('.part') && !f.endsWith('.tmp') && !f.startsWith('.com.google.Chrome'))
                    .map(f => ({ name: f, stat: fs.statSync(path.join(mstDownloadDir, f)) }))
                    .filter(f => f.stat.mtimeMs >= beforeDownload - 5000)
                    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); 
                    
                if (validFiles.length > 0) {
                    downloadedFile = validFiles[0].name;
                    break;
                }
            } catch (err) {}
        }

        if (downloadedFile) {
            const originalPath = path.join(mstDownloadDir, downloadedFile);
            const cleanTen = (recipientInfo.TenCongTy || '').replace(/[\\/:*?"<>|]/g, '-').trim();
            const cleanNgay = (recipientInfo.NgayHetHanChuKySo || '').replace(/\//g, '-');
            const newFileName = `${mst}*${cleanTen}*${cleanNgay}.pdf`;
            const newPath = path.join(mstDownloadDir, newFileName);
            
            try {
                fs.renameSync(originalPath, newPath);
                return { filePath: newPath, fileName: newFileName, dirPath: mstDownloadDir, status: 'Matched' };
            } catch (renameErr) {
                return { filePath: originalPath, fileName: downloadedFile, dirPath: mstDownloadDir, status: 'Matched' };
            }
        }

        try { fs.rmSync(mstDownloadDir, { recursive: true, force: true }); } catch(e) {}
        return null;

    } catch (error) {
        console.error(`[Scraper] ❌ Lỗi MST ${mst}:`, error.message);
        return null;
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
    }
}

function cleanupCerts() {
    try {
        if (fs.existsSync(DOWNLOAD_DIR)) {
            const files = fs.readdirSync(DOWNLOAD_DIR);
            files.forEach(file => {
                const filePath = path.join(DOWNLOAD_DIR, file);
                const stat = fs.statSync(filePath);
                if (Date.now() - stat.mtime.getTime() > 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                }
            });
        }
    } catch (err) {}
}

module.exports = { initBrowser, getLatestCertificate, cleanupCerts };
