const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SEARCH_URL = 'http://www.cavn.vn/SearchInfoCert.aspx';
const DOWNLOAD_DIR = path.join(__dirname, '..', 'uploads', 'certs');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Scrape the latest digital certificate for a given MST (tax code).
 * 
 * Flow:
 * 1. Navigate to SearchInfoCert.aspx
 * 2. Enter MST in search field and submit
 * 3. Handle potential new tab opening
 * 4. Find all "Tải về" links and click the LAST one (latest cert)
 * 5. Download the certificate file
 * 
 * @param {string} mst - Tax code to search
 * @returns {Object|null} { filePath, fileName } or null if not found
 */
async function getLatestCertificate(mst) {
    let browser = null;
    
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Set download behavior
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: DOWNLOAD_DIR
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

            // Select the LAST "Tải về" link (latest certificate)
            const lastLink = matchingLinks[matchingLinks.length - 1];
            
            // Get the href to determine if it's a direct download link
            const href = await resultPage.evaluate(el => el.href, lastLink);
            
            if (href && (href.endsWith('.cer') || href.endsWith('.crt') || href.endsWith('.p7b') || href.includes('download'))) {
                // Direct download link - download via fetch
                const fileName = `cert_${mst}_${Date.now()}.cer`;
                const filePath = path.join(DOWNLOAD_DIR, fileName);
                
                const response = await resultPage.goto(href, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
                
                if (response) {
                    const buffer = await response.buffer();
                    fs.writeFileSync(filePath, buffer);
                    console.log(`[Scraper] ✅ Đã tải chứng thư số cho MST ${mst}: ${fileName}`);
                    return { filePath, fileName };
                }
            } else {
                // Click-based download
                const fileName = `cert_${mst}_${Date.now()}.cer`;
                const expectedPath = path.join(DOWNLOAD_DIR, fileName);

                await lastLink.click();
                
                // Wait for download to complete
                await new Promise(r => setTimeout(r, 5000));

                // Check for downloaded files
                const files = fs.readdirSync(DOWNLOAD_DIR)
                    .filter(f => f.includes(mst) || f.endsWith('.cer') || f.endsWith('.crt') || f.endsWith('.p7b'))
                    .sort((a, b) => {
                        const statA = fs.statSync(path.join(DOWNLOAD_DIR, a));
                        const statB = fs.statSync(path.join(DOWNLOAD_DIR, b));
                        return statB.mtime - statA.mtime; // newest first
                    });

                if (files.length > 0) {
                    const downloadedFile = files[0];
                    const filePath = path.join(DOWNLOAD_DIR, downloadedFile);
                    console.log(`[Scraper] ✅ Đã tải chứng thư số cho MST ${mst}: ${downloadedFile}`);
                    return { filePath, fileName: downloadedFile };
                }
            }

            console.log(`[Scraper] ⚠️ Không thể tải chứng thư số cho MST: ${mst}`);
            return null;

        } else {
            console.error(`[Scraper] Không tìm thấy nút tìm kiếm.`);
            return null;
        }

    } catch (error) {
        console.error(`[Scraper] Lỗi khi tra cứu MST ${mst}:`, error.message);
        return null;
    } finally {
        if (browser) {
            await browser.close();
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

module.exports = { getLatestCertificate, cleanupCerts };
