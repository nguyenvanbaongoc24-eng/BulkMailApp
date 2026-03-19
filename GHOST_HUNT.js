const fs = require('fs');
const path = require('path');

function searchInObj(obj, target, pathStr = '') {
    if (!obj || typeof obj !== 'object') return;
    for (let key in obj) {
        try {
            const val = obj[key];
            if (typeof val === 'string' && val.includes(target)) {
                console.log(`FOUND IN MEMORY: ${pathStr}.${key} = "${val}"`);
            } else if (typeof val === 'object') {
                searchInObj(val, target, `${pathStr}.${key}`);
            }
        } catch(e) {}
    }
}

console.log("Searching for 'Bắt buộc' in required modules...");
const scraper = require('./services/scraperService');
const email = require('./services/emailService');

searchInObj(scraper, 'Bắt buộc', 'scraper');
searchInObj(email, 'Bắt buộc', 'email');

console.log("\nSearching in files (manual read)...");
const files = [
    'services/scraperService.js',
    'services/emailService.js',
    'server.js'
];

files.forEach(f => {
    const content = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if (content.includes('Bắt buộc')) {
        console.log(`FOUND IN FILE: ${f}`);
    }
});

console.log("Done.");
