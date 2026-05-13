const axios = require('axios');
const cheerio = require('cheerio');

async function testSingle() {
    const url = 'https://luatvietnam.vn/tin-phap-luat/thue-c652-article.html';
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });
        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        const titles = $('.list-news .title-news a').map((i, el) => $(el).text().trim()).get();
        console.log(`Titles found: ${titles.length}`);
        titles.forEach((t, i) => console.log(`${i+1}. ${t}`));
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

testSingle();
