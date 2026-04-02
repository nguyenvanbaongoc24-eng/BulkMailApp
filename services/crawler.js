// =============================================
// crawler.js — Deterministic CA Certificate Crawler
// Verified against live website: April 2026
// =============================================
const puppeteer = require('puppeteer');
const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');

const SEARCH_URL = 'http://118.71.99.154:8888/SearchInfoCert.aspx';
const BASE_URL = 'http://118.71.99.154:8888';

// Verified selectors from live website inspection
const SELECTORS = {
    mstInput: '#ContentPlaceHolder1_SearchInfoCert1_txtMasothue',
    searchBtn: '#ContentPlaceHolder1_SearchInfoCert1_btnTim',
    downloadLinks: "a[id*='rpt_lnkCert_']"
};

// =============================================
// LOGGING
// =============================================
function log(mst, step, status, detail = '') {
    const ts = new Date().toISOString().substring(11, 19);
    const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : status === 'INFO' ? 'ℹ️' : '🔄';
    console.log(`[${ts}] [Crawler] [${mst}] ${icon} ${step}${detail ? ': ' + detail : ''}`);
}

// =============================================
// BROWSER INITIALIZATION
// =============================================
async function initBrowser() {
    console.log('[Crawler] Initializing browser...');

    const launchOptions = {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--ignore-certificate-errors',
            '--disable-extensions',
            '--no-first-run'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null
    };

    // Auto-detect Chrome / Edge executable
    const searchPaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    for (const p of searchPaths) {
        if (!p) continue;
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                launchOptions.executablePath = p;
                console.log(`[Crawler] Using browser: ${p}`);
                break;
            }
        } catch (e) { /* skip */ }
    }

    try {
        const browser = await Promise.race([
            puppeteer.launch(launchOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser launch timeout (30s)')), 30000))
        ]);
        console.log('[Crawler] Browser launched successfully');
        return browser;
    } catch (err) {
        console.error('[Crawler] CRITICAL: Browser launch failed:', err.message);
        throw err;
    }
}

// =============================================
// MAIN CRAWL FUNCTION
// =============================================
async function crawlCertificate(browser, mst, serial, onStatus) {
    const status = (msg) => {
        log(mst, msg, 'INFO');
        if (typeof onStatus === 'function') onStatus(msg);
    };

    let page = null;

    try {
        page = await browser.newPage();
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        // Chặn mở tab mới nếu link là MSI (do JS tự động bật)
        await page.evaluateOnNewDocument(() => {
            const originalOpen = window.open;
            window.open = function(url, name, features) {
                if (url && (url.toLowerCase().endsWith('.msi') || url.toLowerCase().includes('ca2plugin'))) {
                    return null;
                }
                return originalOpen.apply(this, arguments);
            };
        });

        // Block popup/automatic downloads of MSI completely via network level
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const rUrl = request.url().toLowerCase();
            if (rUrl.endsWith('.msi') || rUrl.includes('ca2plugin.msi')) {
                log(mst, 'INTERCEPT', 'INFO', `Blocked MSI download request: ${rUrl}`);
                request.abort();
            } else {
                request.continue();
            }
        });

        // ======== STEP 1: Navigate to search page ========
        status('🔍 SEARCHING — Truy cập cổng CA...');
        log(mst, 'NAVIGATE', 'INFO', SEARCH_URL);

        await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for MST input — confirms page loaded
        try {
            await page.waitForSelector(SELECTORS.mstInput, { timeout: 15000 });
        } catch (e) {
            // Fallback: try broader selector
            await page.waitForSelector('input[id*="txtMasothue"]', { timeout: 10000 });
        }
        log(mst, 'PAGE LOADED', 'OK', 'MST input ready');

        // ======== STEP 2: Enter MST and search ========
        status('🔍 SEARCHING — Nhập MST...');

        // Clear field completely then type
        await page.click(SELECTORS.mstInput, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(SELECTORS.mstInput, String(mst).trim(), { delay: 30 });

        // Click search and wait for postback
        log(mst, 'SEARCH', 'INFO', 'Submitting search...');

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
            page.click(SELECTORS.searchBtn)
        ]);

        // Extra wait — ASP.NET postback may need time to render DOM
        await new Promise(r => setTimeout(r, 3000));

        // Verify results loaded by checking for download links OR no-result text
        try {
            await page.waitForFunction(() => {
                const links = document.querySelectorAll("a[id*='rpt_lnkCert_']");
                const allLinks = Array.from(document.querySelectorAll('a'));
                const taiVe = allLinks.some(a => (a.innerText || '').trim() === 'Tải về');
                const noResult = document.body.innerText.toLowerCase().includes('không tìm thấy');
                return links.length > 0 || taiVe || noResult;
            }, { timeout: 20000 });
        } catch (e) {
            log(mst, 'WAIT RESULTS', 'FAIL', 'Timeout waiting for results');
        }

        // ======== STEP 3: Check for "no results" ========
        const noResult = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes('không tìm thấy') ||
                   text.includes('no records') ||
                   text.includes('không có dữ liệu');
        });

        if (noResult) {
            log(mst, 'SEARCH', 'FAIL', 'No certificates found for this MST');
            return { success: false, error: 'Không tìm thấy chứng thư cho MST này' };
        }

        // ======== STEP 4: Match serial in results ========
        status('🔍 SEARCHING — Tìm serial khớp...');

        const matchResult = await page.evaluate((targetSerial) => {
            const normalize = (s) => s ? s.toString().replace(/[\s\-]/g, '').toUpperCase() : '';
            const target = normalize(targetSerial);

            // Find all "Tải về" links
            let links = Array.from(document.querySelectorAll("a[id*='rpt_lnkCert_']"));

            // Fallback if specific IDs not found
            if (links.length === 0) {
                links = Array.from(document.querySelectorAll('a'))
                    .filter(a => (a.innerText || '').trim() === 'Tải về');
            }

            if (links.length === 0) {
                return { found: false, error: 'Không tìm thấy link "Tải về" trên trang kết quả' };
            }

            // For each download link, traverse up to find its container section
            // and check if the serial matches
            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                let container = link;

                // Walk up to find the certificate info section
                for (let depth = 0; depth < 15; depth++) {
                    container = container.parentElement;
                    if (!container) break;

                    const containerText = container.innerText || '';
                    const normalizedText = normalize(containerText);

                    // Check if this section contains the target serial
                    if (target && normalizedText.includes(target)) {
                        // Extract CertIns ID
                        let certInsId = null;

                        // Method 1: From the link href
                        const href = link.getAttribute('href') || '';
                        const hrefMatch = href.match(/CertIns[=:](\d+)/i);
                        if (hrefMatch) certInsId = hrefMatch[1];

                        // Method 2: From "Số" field in the section
                        if (!certInsId) {
                            // Look for "Số" label followed by a number
                            const soMatch = containerText.match(/Số\s*[:\s]\s*(\d{4,})/);
                            if (soMatch) certInsId = soMatch[1];
                        }

                        // Method 3: From bold elements (the ID is usually in bold)
                        if (!certInsId) {
                            const bolds = container.querySelectorAll('b, strong');
                            for (const b of bolds) {
                                const bText = b.innerText.trim();
                                if (/^\d{4,}$/.test(bText)) {
                                    certInsId = bText;
                                    break;
                                }
                            }
                        }

                        return {
                            found: true,
                            certInsId,
                            linkHref: href,
                            linkIndex: i,
                            matchedSerial: target
                        };
                    }
                }
            }

            // If no serial provided, use the first link
            if (!target && links.length > 0) {
                const href = links[0].getAttribute('href') || '';
                const hrefMatch = href.match(/CertIns[=:](\d+)/i);
                return {
                    found: true,
                    certInsId: hrefMatch ? hrefMatch[1] : null,
                    linkHref: href,
                    linkIndex: 0,
                    matchedSerial: '',
                    note: 'No serial provided, using first certificate'
                };
            }

            // Fallback: serial exists on page but couldn't match to specific link
            const fullPageText = normalize(document.body.innerText);
            if (target && fullPageText.includes(target)) {
                if (links.length === 1) {
                    const href = links[0].getAttribute('href') || '';
                    const hrefMatch = href.match(/CertIns[=:](\d+)/i);
                    return {
                        found: true,
                        certInsId: hrefMatch ? hrefMatch[1] : null,
                        linkHref: href,
                        linkIndex: 0,
                        matchedSerial: target,
                        note: 'Fallback: single link match'
                    };
                }
                return { found: false, error: `Serial tìm thấy trên trang nhưng không xác định được link tải. Có ${links.length} links.` };
            }

            return { found: false, error: `Serial ${targetSerial} không tìm thấy trong kết quả` };
        }, serial);

        if (!matchResult.found) {
            log(mst, 'SERIAL MATCH', 'FAIL', matchResult.error);
            return { success: false, error: matchResult.error };
        }

        log(mst, 'SERIAL MATCH', 'OK', `CertIns ID: ${matchResult.certInsId || 'unknown'}`);
        if (matchResult.note) log(mst, 'SERIAL MATCH', 'INFO', matchResult.note);

        // ======== STEP 5: Navigate to install.asp page ========
        status('📥 DOWNLOADING — Mở trang chứng thư...');

        if (matchResult.certInsId) {
            // Direct navigation — most reliable
            const installUrl = `${BASE_URL}/install.asp?CertIns=${matchResult.certInsId}`;
            log(mst, 'NAVIGATE', 'INFO', installUrl);
            await page.goto(installUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } else if (matchResult.linkHref) {
            // Navigate using the href
            const url = matchResult.linkHref.startsWith('http')
                ? matchResult.linkHref
                : `${BASE_URL}/${matchResult.linkHref.replace(/^\//, '')}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } else {
            // Click the link directly as last resort
            const links = await page.$$(SELECTORS.downloadLinks);
            if (links[matchResult.linkIndex]) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
                    links[matchResult.linkIndex].click()
                ]);
            } else {
                return { success: false, error: 'Không thể navigate đến trang download' };
            }
        }

        await new Promise(r => setTimeout(r, 2000));
        log(mst, 'INSTALL PAGE', 'OK', page.url());

        // ======== STEP 6: Set up download + Click PDF link ========
        status('📥 DOWNLOADING — Tải PDF...');

        // Create temp download directory
        const tmpDir = path.join(require('os').tmpdir(), `cert_${mst}_${Date.now()}`);
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // Set up CDP download behavior BEFORE clicking
        const client = await page.createCDPSession();
        await client.send('Browser.setDownloadBehavior', {
            behavior: 'allowAndName',
            downloadPath: tmpDir,
            eventsEnabled: true
        });
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tmpDir
        });

        log(mst, 'CDP DOWNLOAD', 'INFO', `Download dir: ${tmpDir}`);

        // Find and click the "Tải giấy chứng nhận điện tử" link directly in the browser
        // This is critical — the server requires browser cookies/session context
        const clickResult = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            for (const link of links) {
                const text = (link.innerText || '').trim().toLowerCase();
                const href = (link.getAttribute('href') || '').toLowerCase();

                // Strictly ignore MSI and EXE files
                if (href.endsWith('.msi') || href.endsWith('.exe') || text.includes('cài đặt') || text.includes('phần mềm') || href.includes('ca2plugin')) {
                    continue;
                }

                if (text === 'tải về' || text.includes('tải giấy chứng nhận') || text.includes('chứng nhận điện tử') || text.includes('bản pdf')) {
                    // Rất quan trọng: Xóa thuộc tính target="_blank" (nếu có) để ép file PDF tải về trên tab hiện tại
                    // Vì CDP download context chỉ cài đặt trên tab này
                    link.removeAttribute('target');
                    link.click();
                    return { clicked: true, href, text: link.innerText.trim() };
                }

                if (href.includes('mail.nacencomm.vn') || href.includes('default.aspx?idcts')) {
                    link.click();
                    return { clicked: true, href, text: link.innerText.trim() };
                }
            }
            return { clicked: false };
        });

        if (!clickResult.clicked) {
            log(mst, 'PDF LINK', 'FAIL', 'No PDF download link found on install page');
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
            return { success: false, error: 'Không tìm thấy link "Tải giấy chứng nhận điện tử" trên trang' };
        }

        log(mst, 'PDF LINK CLICKED', 'OK', `${clickResult.text} → ${clickResult.href}`);

        // ======== STEP 7: Wait for download to complete ========
        status('📥 DOWNLOADING — Đang tải file...');

        let pdfBuffer = null;

        // Strategy A: Poll for downloaded file (primary — most reliable)
        try {
            pdfBuffer = await pollForDownload(tmpDir, mst, 45);
        } catch (pollErr) {
            log(mst, 'FILE POLL', 'FAIL', pollErr.message);

            // Strategy B: Try navigating directly using the href 
            if (clickResult.href) {
                log(mst, 'FALLBACK', 'INFO', 'Trying direct navigation to PDF URL...');
                try {
                    // Open in a new page to avoid losing context
                    const dlPage = await browser.newPage();
                    const dlClient = await dlPage.createCDPSession();
                    await dlClient.send('Browser.setDownloadBehavior', {
                        behavior: 'allowAndName',
                        downloadPath: tmpDir,
                        eventsEnabled: true
                    });

                    await dlPage.goto(clickResult.href, { 
                        waitUntil: 'domcontentloaded', 
                        timeout: 30000 
                    }).catch(() => {});

                    // Wait a bit then poll again
                    pdfBuffer = await pollForDownload(tmpDir, mst, 30);
                    await dlPage.close().catch(() => {});
                } catch (navErr) {
                    log(mst, 'NAV FALLBACK', 'FAIL', navErr.message);
                }
            }

            // Strategy C: Direct HTTP as last resort
            if (!pdfBuffer && clickResult.href) {
                log(mst, 'FALLBACK', 'INFO', 'Trying direct HTTP download...');
                try {
                    pdfBuffer = await downloadPdfDirect(clickResult.href, mst);
                } catch (httpErr) {
                    log(mst, 'HTTP FALLBACK', 'FAIL', httpErr.message);
                }
            }
        }

        // Cleanup temp directory
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

        if (!pdfBuffer || pdfBuffer.length < 100) {
            return { success: false, error: `PDF tải về thất bại hoặc quá nhỏ (${pdfBuffer ? pdfBuffer.length : 0} bytes)` };
        }

        // Validate it's not HTML
        const header = pdfBuffer.slice(0, 50).toString('utf8').toLowerCase();
        if (header.includes('<html') || header.includes('<!doctype')) {
            return { success: false, error: 'Server trả về HTML thay vì PDF' };
        }

        const serialSuffix = serial ? String(serial).trim().slice(-8) : 'cert';
        const fileName = `${String(mst).trim()}_${serialSuffix}.pdf`;

        log(mst, 'DOWNLOAD COMPLETE', 'OK', `${fileName} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

        return {
            success: true,
            buffer: pdfBuffer,
            fileName,
            fileSize: pdfBuffer.length
        };

    } finally {
        if (page) await page.close().catch(() => {});
    }
}

// =============================================
// POLL FOR DOWNLOADED FILE
// =============================================
async function pollForDownload(tmpDir, mst, timeoutSecs = 45) {
    log(mst, 'FILE POLL', 'INFO', `Polling ${tmpDir} for up to ${timeoutSecs}s...`);

    for (let i = 0; i < timeoutSecs; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const files = fs.readdirSync(tmpDir);
            const valid = files.filter(f => {
                const low = f.toLowerCase();
                // We STRICTLY only want PDF files
                return low.endsWith('.pdf');
            });
            if (valid.length > 0) {
                const filePath = path.join(tmpDir, valid[0]);
                const stat = fs.statSync(filePath);
                
                // Wait for file to finish writing (size stable for 1s)
                if (stat.size > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                    const newStat = fs.statSync(filePath);
                    if (newStat.size === stat.size && newStat.size > 100) {
                        const buffer = fs.readFileSync(filePath);
                        log(mst, 'FILE POLL', 'OK', `${valid[0]} (${(buffer.length / 1024).toFixed(1)} KB)`);
                        return buffer;
                    }
                }
            }
        } catch (e) { /* still waiting */ }

        if ((i + 1) % 10 === 0) {
            log(mst, 'FILE POLL', 'INFO', `${i + 1}s elapsed, still waiting...`);
        }
    }

    throw new Error(`Download timeout after ${timeoutSecs}s — no file appeared in ${tmpDir}`);
}

// =============================================
// DIRECT HTTP DOWNLOAD (last resort fallback)
// =============================================
async function downloadPdfDirect(pdfUrl, mst) {
    log(mst, 'HTTP DOWNLOAD', 'INFO', `Fetching ${pdfUrl}`);

    const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        maxRedirects: 5,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*'
        }
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length < 100) {
        throw new Error(`Response too small (${buffer.length} bytes)`);
    }

    const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
    if (header.includes('<html') || header.includes('<!doctype') || header.includes('<head')) {
        throw new Error('Server returned HTML instead of PDF');
    }

    log(mst, 'HTTP DOWNLOAD', 'OK', `${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
}

module.exports = { initBrowser, crawlCertificate };
