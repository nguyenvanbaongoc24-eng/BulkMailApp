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

async function getLatestCertificate(browser, mst, excelSerials, recipientInfo) {
    let page = null;
    const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);
    
    try {
        if (!fs.existsSync(mstDownloadDir)) fs.mkdirSync(mstDownloadDir, { recursive: true });

        page = await browser.newPage();
        
        // Setup Global Interception and Download Path for all newly created tabs as well
        const setupInterception = async (p) => {
            try {
                const client = await p.createCDPSession();
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: mstDownloadDir
                });
            } catch (e) {}

            await p.setRequestInterception(true);
            p.on('request', (request) => {
                const url = request.url().toLowerCase();
                if (url.endsWith('.msi') || url.endsWith('.exe') || url.includes('ca2plugin.msi')) {
                    console.log(`[Scraper] [${mst}] Global blocking installer: ${url}`);
                    request.abort();
                } else {
                    request.continue();
                }
            });
        };

        await setupInterception(page);

        // Persistent interceptor for ALL future tabs (results, downloads, etc)
        const targetCreatedHandler = async (target) => {
            if (target.type() === 'page') {
                const newP = await target.page().catch(() => null);
                if (newP) {
                    console.log(`[Scraper] [${mst}] Persistent Intercept applied to new tab: ${target.url()}`);
                    await setupInterception(newP).catch(() => {});
                }
            }
        };
        browser.on('targetcreated', targetCreatedHandler);

        // We still need a promise to wait for the specific Search Result tab
        const resultTabPromise = new Promise(resolve => {
            const handler = async (target) => {
                if (target.type() === 'page') {
                    const newP = await target.page().catch(() => null);
                    if (newP) {
                        browser.off('targetcreated', handler);
                        resolve(newP);
                    }
                }
            };
            browser.on('targetcreated', handler);
            setTimeout(() => { browser.off('targetcreated', handler); resolve(null); }, 10000);
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
        if (!searchBtn) throw new Error('Cổng CA: Nút Tìm kiếm không tồn tại.');

        console.log(`[Scraper] [${mst}] Clicking Search...`);
        await searchBtn.click();
        const newPage = await tabPromise;
        let resultPage = newPage || page;

        if (newPage) console.log(`[Scraper] [${mst}] New result tab detected (Interception applied).`);

        console.log(`[Scraper] [${mst}] Waiting for results to load...`);
        await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 4000)); // Solid wait for table to render

        const noResult = await resultPage.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes('không tìm thấy') || text.includes('no records found') || text.includes('không có dữ liệu');
        });

        if (noResult) {
            console.warn(`[Scraper] [${mst}] Gateway returned "No records found".`);
            return { status: 'Not Found', message: '[v18] Hệ thống CA báo: Không tìm thấy chứng thư cho MST này.' };
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
                
                const serialIdx = cells.findIndex(c => /Serial|S[ốố]\s*ch[ứứ]ng\s*th[ưư]/i.test(c));
                if (serialIdx !== -1 && cells[serialIdx + 1]) {
                    serialText = norm(cells[serialIdx + 1]);
                } else {
                    const match = tbl.innerText.match(/(?:Serial|S[ốố]|S\/N)[:\s]*([A-F0-9\s-]{10,})/i);
                    if (match) serialText = norm(match[1]);
                }

                // Find all links in the table and pick the most relevant one
                const links = Array.from(tbl.querySelectorAll('a'));
                console.log(`Table ${idx} links:`, links.map(a => a.innerText.trim()));
                
                const bestLink = links.find(a => {
                    const txt = a.innerText.toLowerCase();
                    return (txt.includes('giấy chứng nhận') || txt.includes('gcn') || txt.includes('pdf')) &&
                           !txt.includes('plugin') && !txt.includes('token') && !txt.includes('driver');
                }) || links.find(a => a.innerText.toLowerCase().includes('tải')) || links[0];

                if (bestLink) {
                    results.push({
                        serial: serialText,
                        index: idx,
                        isActive: tbl.innerText.includes('Hoạt động'),
                        linkText: bestLink.innerText.trim()
                    });
                }
            });

            if (results.length === 0) return { found: false, count: 0, foundSerials: [] };

            const foundSerials = results.map(r => r.serial);
            let targetIdx = -1;
            let finalSerial = '';

            const matched = results.find(r => 
                targets.some(t => r.serial === t || r.serial.includes(t) || t.includes(r.serial))
            );

            const finalMatch = matched || results.filter(r => r.isActive).pop() || results.pop();
            
            if (finalMatch) {
                targetIdx = finalMatch.index;
                finalSerial = finalMatch.serial;
            }

            const isMatched = !!matched;
            if (!isMatched && targets.length > 0) {
                return { found: false, count: results.length, foundSerials: foundSerials, targets: targets };
            }

            // Perform Click immediately on the BEST link in the target table
            const targetTable = tables[targetIdx];
            const targetLinks = Array.from(targetTable.querySelectorAll('a'));
            const downloadLink = targetLinks.find(a => {
                const txt = a.innerText.toLowerCase();
                return (txt.includes('giấy chứng nhận') || txt.includes('gcn') || txt.includes('pdf')) &&
                       !txt.includes('plugin') && !txt.includes('token') && !txt.includes('driver');
            }) || targetLinks.find(a => a.innerText.toLowerCase().includes('tải')) || targetLinks[0];

            if (downloadLink) {
                downloadLink.click();
                return { found: true, serial: finalSerial, count: results.length };
            }

            return { found: false, count: results.length, reason: 'Link not found in table' };
        }, excelSerials);

        if (!matchData || !matchData.found) {
            if (matchData.foundSerials) {
                 return { 
                    status: 'Not Matched', 
                    message: `[v18] Tìm thấy ${matchData.foundSerials.length} chứng thư nhưng không khớp Serial [${matchData.foundSerials.join('|')}] vs [${matchData.targets.join('|')}].` 
                };
            }
            return { status: 'Error', message: `[v18] ${matchData?.reason || 'Lỗi nạp bảng kết quả từ Cổng CA.'}` };
        }

        console.log(`[Scraper] [${mst}] Match & Click successful for Serial: ${matchData.serial}. Waiting for download...`);
        await new Promise(r => setTimeout(r, 8000)); // Wait for download to start

        const beforeDownload = Date.now();
        let downloadedFile = null;
        for (let i = 0; i < 25; i++) { 
            await new Promise(r => setTimeout(r, 1000));
            try {
                const files = fs.readdirSync(mstDownloadDir);
                const valid = files.filter(f => {
                    const low = f.toLowerCase();
                    return !low.endsWith('.crdownload') && !low.endsWith('.tmp') && 
                           !low.endsWith('.msi') && !low.endsWith('.exe') && !low.endsWith('.bat') && !low.endsWith('.cmd');
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
            
            if (['.msi', '.exe', '.bat', '.cmd'].includes(originalExt)) {
                return { status: 'Error', message: `Phát hiện file cài đặt (${originalExt}) thay vì chứng thư. Bỏ qua để an toàn.` };
            }

            const cleanTen = (recipientInfo.TenCongTy || 'Company').replace(/[\\/:*?"<>|]/g, '-').trim();
            const newFileName = `${mst}_${cleanTen}${originalExt}`;
            const newPath = path.join(mstDownloadDir, newFileName);
            fs.renameSync(originalPath, newPath);
            console.log(`[Scraper] [${mst}] Downloaded file: ${downloadedFile} -> renamed to: ${newFileName}`);
            return { filePath: newPath, fileName: newFileName, dirPath: mstDownloadDir, status: 'Matched' };
        }

        return { status: 'Error', message: 'Tải file thất bại.' };

    } catch (error) {
        console.error(`[Scraper] [${mst}] Error:`, error.message);
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
