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
            // Disable download prompt and force path
            '--no-proxy-server',
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--disable-infobars',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-features=CalculateNativeWinOcclusion'
        ],
        ignoreHTTPSErrors: true,
        acceptInsecureCerts: true,
        defaultViewport: null,
        userDataDir: path.join(__dirname, '..', 'tmp_puppeteer'),
        // Add more specific preferences
        extraPrefsCP: {
            'download.default_directory': DOWNLOAD_DIR,
            'download.prompt_for_download': false,
            'download.directory_upgrade': true,
            'safebrowsing.enabled': true
        }
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    return await puppeteer.launch(launchOptions);
}

/**
 * Scrape the latest digital certificate for a given MST (tax code).
 * 
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} mst - Tax code to search
 * @returns {Object|null} { filePath, fileName } or null if not found
 */
async function getLatestCertificate(browser, mst) {
    let page = null;
    
    try {
        // Create unique download directory for this MST to avoid concurrent collisions
        const mstDownloadDir = path.join(DOWNLOAD_DIR, `${mst}_${Date.now()}`);
        if (!fs.existsSync(mstDownloadDir)) {
            fs.mkdirSync(mstDownloadDir, { recursive: true });
        }

        page = await browser.newPage();
        
        // Set download behavior for this specific page
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: mstDownloadDir
        });

        // Navigate to search page
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Find the search input and enter MST
        // Common ASP.NET patterns: input with id containing "txtSearch" or similar
        const searchInput = await page.$('input[type="text"]');
        if (!searchInput) {
            console.error(`[Scraper] Không tìm thấy ô tìm kiếm trên trang.`);
            return null;
        }

        await searchInput.click({ clickCount: 3 }); // Select all existing text
        await searchInput.type(mst, { delay: 50 });

        // Find and click the search button
        const searchBtn = await page.$('input[type="submit"], button[type="submit"], .btn-search, #btnSearch');
        if (searchBtn) {
            // Listen for potential new tab/popup
            const newPagePromise = new Promise(resolve => {
                browser.once('targetcreated', async (target) => {
                    const newPage = await target.page();
                    resolve(newPage);
                });
                // Fallback timeout: if no new tab opens within 5s, resolve with null
                setTimeout(() => resolve(null), 5000);
            });

            await searchBtn.click();

            // Wait for navigation or new tab
            const newPage = await newPagePromise;

            // Switch context to new tab if one opened
            let resultPage = page;
            if (newPage) {
                resultPage = newPage;
                await resultPage.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
            } else {
                // Stay on same page, wait for results to load
                await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
            }

            // Wait a bit more for dynamic content
            await new Promise(r => setTimeout(r, 2000));

            // Find all "Tải về" download links using page.$$
            const downloadLinks = await resultPage.$$('a');
            const matchingLinks = [];

            for (const link of downloadLinks) {
                const text = await resultPage.evaluate(el => el.innerText || el.textContent, link);
                if (text && text.trim().toLowerCase().includes('tải về')) {
                    matchingLinks.push(link);
                } else if (text && /t[ảả]i v[ềề]/i.test(text)) { // Regex for accented variations
                    matchingLinks.push(link);
                }
            }

            if (matchingLinks.length === 0) {
                // Try alternate: look for download icons or buttons
                const altLinks = await resultPage.$$('a[href*="download"], a[href*="Download"], a[href*=".cer"], a[href*=".crt"], a[href*=".p7b"]');
                if (altLinks.length > 0) {
                    matchingLinks.push(...altLinks);
                }
            }

            if (matchingLinks.length === 0) {
                console.log(`[Scraper] Không tìm thấy link "Tải về" cho MST: ${mst}`);
                return null;
            }

            // Select the latest "Tải về" link
            const lastLink = matchingLinks[matchingLinks.length - 1];

            // Click 'Tải về' to go to the certificate details/install page
            console.log(`[Scraper] Chuyển đến trang chi tiết chứng thư...`);
            await lastLink.click();

            // Wait for navigation and the actual PDF download link to appear
            // The user says the last page has "Tải giấy chứng nhận điện tử"
            try {
                await resultPage.waitForFunction(
                    () => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.some(l => l.innerText.includes('Tải giấy chứng nhận điện tử') || l.innerText.includes('Tải file chứng thư'));
                    },
                    { timeout: 15000 }
                );
            } catch (e) {
                console.warn(`[Scraper] ⚠️ Không thấy link tải PDF trên trang chi tiết: ${e.message}`);
            }

            // Find the PDF download link
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

            // Fallback to .CER button if PDF link not found
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
                console.error(`[Scraper] ❌ Không tìm thấy nút tải xuống PDF/CER trên trang cuối.`);
                return null;
            }

            console.log(`[Scraper] 📥 Đang bắt đầu tải xuống file...`);
            const beforeDownload = Date.now();
            await downloadBtn.click();
            
            // Wait for download to complete, checking periodically up to 15 seconds
            let downloadedFile = null;
            for (let i = 0; i < 30; i++) { // 30 * 500ms = 15s
                await new Promise(r => setTimeout(r, 500));
                
                try {
                    if (!fs.existsSync(mstDownloadDir)) break;
                    const files = fs.readdirSync(mstDownloadDir);
                    // Find files that do NOT have temporary chrome extensions or partial downloads
                    const validFiles = files.filter(f => !f.endsWith('.crdownload') && !f.endsWith('.part') && !f.endsWith('.tmp') && !f.startsWith('.com.google.Chrome'))
                        .map(f => ({ name: f, stat: fs.statSync(path.join(mstDownloadDir, f)) }))
                        // Must be created/modified roughly after we clicked the download button
                        .filter(f => f.stat.mtimeMs >= beforeDownload - 3000 || f.stat.ctimeMs >= beforeDownload - 3000)
                        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // newest first
                        
                    if (validFiles.length > 0) {
                        downloadedFile = validFiles[0].name;
                        // Extra time to ensure file handle is fully released by OS
                        await new Promise(r => setTimeout(r, 1000));
                        break;
                    }
                } catch (err) {
                    console.error('[Scraper] Lỗi đọc thư mục tải xuống:', err.message);
                }
            }

            if (downloadedFile) {
                const filePath = path.join(mstDownloadDir, downloadedFile);
                console.log(`[Scraper] ✅ Đã tải chứng thư số cho MST ${mst}: ${downloadedFile}`);
                return { filePath, fileName: downloadedFile, dirPath: mstDownloadDir };
            }

            console.log(`[Scraper] ⚠️ Không thể tải chứng thư số cho MST: ${mst} (Time Out hoặc Blocked)`);
            // Cleanup empty dir if timeout
            try { fs.rmSync(mstDownloadDir, { recursive: true, force: true }); } catch(e) {}
            return null;

        } else {
            console.error(`[Scraper] Không tìm thấy nút tìm kiếm.`);
            return null;
        }

    } catch (error) {
        if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
            console.warn(`[Scraper] ⚠️ Bị chặn bởi phần mềm bảo mật/AdBlock trên máy chủ: ${error.message}`);
        } else {
            console.error(`[Scraper] ❌ Lỗi khi tra cứu MST ${mst}:`, error.message);
        }
        return null;
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
    }
}

/**
 * Clean up old certificate files
 */
function cleanupCerts() {
    try {
        if (fs.existsSync(DOWNLOAD_DIR)) {
            const files = fs.readdirSync(DOWNLOAD_DIR);
            files.forEach(file => {
                const filePath = path.join(DOWNLOAD_DIR, file);
                const stat = fs.statSync(filePath);
                // Remove files older than 24 hours
                if (Date.now() - stat.mtime.getTime() > 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                }
            });
        }
    } catch (err) {
        console.error('[Scraper] Lỗi cleanup:', err.message);
    }
}

module.exports = { initBrowser, getLatestCertificate, cleanupCerts };
