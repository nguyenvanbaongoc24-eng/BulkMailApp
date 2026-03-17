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

    // Phase 7: Robust failsafe path discovery
    let foundPath = null;

    // 1. Try environment variable (if it actually exists)
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        foundPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } 

    // 2. If no valid env var, search Render's cache aggressively
    if (!foundPath && process.env.RENDER) {
        const searchRoots = [
            '/opt/render/.cache/puppeteer/chrome',
            '/home/render/.cache/puppeteer/chrome',
            path.join(__dirname, '../.cache/puppeteer/chrome') // Local relative
        ];

        console.log('[Scraper] Searching for Chrome on Render...');
        for (const root of searchRoots) {
            try {
                if (fs.existsSync(root)) {
                    const versions = fs.readdirSync(root);
                    for (const v of versions) {
                        const p = path.join(root, v, 'chrome-linux64', 'chrome');
                        if (fs.existsSync(p)) {
                            console.log(`[Scraper] ✅ Found Chrome at: ${p}`);
                            foundPath = p;
                            break;
                        }
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
 * @param {string} excelSerial - Serial from Excel for validation
 * @param {Object} recipientInfo - Full recipient info for filename formatting
 * @returns {Object|null} { filePath, fileName, status, message } or null
 */
async function getLatestCertificate(browser, mst, excelSerial, recipientInfo) {
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

        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        const searchInput = await page.$('input[type="text"]');
        if (!searchInput) {
            console.error(`[Scraper] Không tìm thấy ô tìm kiếm trên trang.`);
            return null;
        }

        await searchInput.click({ clickCount: 3 }); 
        await searchInput.type(mst, { delay: 50 });

        const searchBtn = await page.$('input[type="submit"], button[type="submit"], .btn-search, #btnSearch');
        if (searchBtn) {
            const newPagePromise = new Promise(resolve => {
                browser.once('targetcreated', async (target) => {
                    const newPage = await target.page().catch(() => null);
                    resolve(newPage);
                });
                setTimeout(() => resolve(null), 5000);
            });

            await searchBtn.click();

            const newPage = await newPagePromise;

            let resultPage = page;
            if (newPage) {
                resultPage = newPage;
                await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
            } else {
                await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
            }

            await new Promise(r => setTimeout(r, 2000));

            // Check if results exist
            const noResult = await resultPage.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
            });

            if (noResult) {
                return { status: 'Not Found', message: `Không tìm thấy thông tin cho MST ${mst} trên hệ thống CA.` };
            }

            const matchingIndex = await resultPage.evaluate((targetSerial) => {
                const norm = (s) => s.toString().replace(/\s/g, '').toUpperCase();
                const target = targetSerial ? norm(targetSerial) : null;
                
                const allElements = Array.from(document.querySelectorAll('td, span, div, p, b, li'));
                const serialLabels = allElements.filter(el => el.innerText.includes('Serial'));
                
                for (let labelEl of serialLabels) {
                    const labelText = labelEl.innerText;
                    let val = null;
                    const match = labelText.match(/Serial[:\s]+([A-Z0-9]{10,})/i);
                    if (match) val = match[1];
                    else if (labelEl.nextElementSibling) val = labelEl.nextElementSibling.innerText;
                    
                    // IF we have a target, it MUST match.
                    // IF we don't have a target, we take the first label we find (latest).
                    if (!target || (val && norm(val) === target)) {
                        let current = labelEl;
                        let searchCount = 0;
                        while (current && searchCount < 50) {
                            searchCount++;
                            if (current.tagName === 'A' && (current.innerText.toLowerCase().includes('tải về') || current.innerText.toLowerCase().includes('tải xuống'))) {
                                const tempId = 'target_download_' + Date.now();
                                current.setAttribute('id', tempId);
                                return tempId;
                            }
                            current = current.nextElementSibling || current.parentElement;
                        }
                    }
                }
                return null;
            }, excelSerial);

            if (!matchingIndex) {
                const msg = `PDF mismatch or not found (Serial: ${excelSerial || 'N/A'})`;
                console.error(`[Scraper] ✖ ${msg}`);
                return { status: 'Not Matched', message: msg };
            }

            console.log(`[Scraper] ✔ Khớp Serial. Đang tải...`);
            const targetLink = await resultPage.$(`#${matchingIndex}`);
            if (!targetLink) {
                return { status: 'Error', message: 'Lỗi định vị link tải' };
            }

            await targetLink.click();

            try {
                await resultPage.waitForFunction(
                    () => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.some(l => l.innerText.includes('Tải giấy chứng nhận điện tử') || l.innerText.includes('Tải file chứng thư'));
                    },
                    { timeout: 15000 }
                ).catch(() => {});
            } catch (e) {}

            await new Promise(r => setTimeout(r, 2500));

            const pdfLinks = await resultPage.$$('a');
            let downloadBtn = null;
            for (const link of pdfLinks) {
                const text = await resultPage.evaluate(el => el.innerText || el.textContent, link);
                if (!text) continue;
                const normalizedText = text.trim().toLowerCase();
                if (normalizedText.includes('tải giấy chứng nhận điện tử') || /t[ảả]i gi[ấấ]y ch[ứứ]ng nh[ậậ]n/i.test(normalizedText)) {
                    downloadBtn = link;
                    break;
                }
            }

            if (!downloadBtn) {
                for (const link of pdfLinks) {
                    const text = await resultPage.evaluate(el => el.innerText || el.textContent, link);
                    if (text && text.trim().toLowerCase().includes('tải file chứng thư')) {
                        downloadBtn = link;
                        break;
                    }
                }
            }

            if (!downloadBtn) {
                console.error(`[Scraper] ❌ Không tìm thấy nút tải chứng nhận.`);
                return null;
            }

            const beforeDownload = Date.now();
            await downloadBtn.click();
            
            let downloadedFile = null;
            for (let i = 0; i < 30; i++) { 
                await new Promise(r => setTimeout(r, 500));
                
                try {
                    if (!fs.existsSync(mstDownloadDir)) break;
                    const files = fs.readdirSync(mstDownloadDir);
                    const validFiles = files.filter(f => !f.endsWith('.crdownload') && !f.endsWith('.part') && !f.endsWith('.tmp') && !f.startsWith('.com.google.Chrome'))
                        .map(f => ({ name: f, stat: fs.statSync(path.join(mstDownloadDir, f)) }))
                        .filter(f => f.stat.mtimeMs >= beforeDownload - 3000 || f.stat.ctimeMs >= beforeDownload - 3000)
                        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); 
                        
                    if (validFiles.length > 0) {
                        downloadedFile = validFiles[0].name;
                        await new Promise(r => setTimeout(r, 1000));
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

        } else {
            console.error(`[Scraper] Không tìm thấy nút tìm kiếm.`);
            return null;
        }

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
