const axios = require('axios');
const cheerio = require('cheerio');

async function testCrawler() {
    const sources = [
        { name: 'Luật Việt Nam', url: 'https://luatvietnam.vn/thue-phi-le-phi.html', titleSelector: 'h3.title-news a, h3 a', descSelector: '.sapo, .desc', baseUrl: 'https://luatvietnam.vn' },
        { name: 'WebKetoan', url: 'https://webketoan.com/categories/thue.3/', titleSelector: '.structItem-title a', descSelector: '.structItem-minor', baseUrl: 'https://webketoan.com' },
        { name: 'Tổng cục Thuế', url: 'https://gdt.gov.vn/wps/portal/home/tin-tuc', titleSelector: '.tin-tuc-title a, .news-title a', descSelector: '.tin-tuc-summary, .summary', baseUrl: 'https://gdt.gov.vn' },
        { name: 'VnExpress', url: 'https://vnexpress.net/tag/thue-129668', titleSelector: '.title-news a', descSelector: '.description a', baseUrl: '' }
    ];

    const allowedKeywords = ['thuế', 'kế toán', 'hóa đơn điện tử', 'nghĩa vụ thuế', 'kê khai thuế', 'quy định thuế', 'thông tư thuế', 'luật thuế', 'tổng cục thuế', 'bộ tài chính'];

    for (const source of sources) {
        console.log(`\n--- Testing Source: ${source.name} ---`);
        try {
            const response = await axios.get(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const titles = [];
            $(source.titleSelector).each((i, el) => {
                if (i < 5) titles.push($(el).text().trim());
            });

            if (titles.length === 0) {
                console.log('No titles found. Selector might be wrong or site blocked.');
            } else {
                titles.forEach((t, i) => console.log(`${i+1}. ${t}`));
                
                // Test keywords on the first title
                const firstTitle = titles[0].toLowerCase();
                let kwMatch = allowedKeywords.filter(kw => firstTitle.includes(kw));
                console.log(`Keyword matches in first title: ${kwMatch.join(', ') || 'None'}`);
            }
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
}

testCrawler();
