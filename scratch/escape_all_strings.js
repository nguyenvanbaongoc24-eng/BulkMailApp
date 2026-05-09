tab hconst fs = require('fs');
const file = 'public/js/app.js';
let content = fs.readFileSync(file, 'utf8');

// Function to escape non-ASCII to \uXXXX
function escapeUnicode(str) {
    return str.replace(/[\u0080-\uFFFF]/g, function (c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
}

// Regex to find single-quoted, double-quoted, and template literal strings
let matches = 0;
content = content.replace(/(['"`])([\s\S]*?)\1/g, function (match, quote, innerString) {
    // Only escape if it contains non-ASCII characters
    if (/[\u0080-\uFFFF]/.test(innerString)) {
        // Exclude the regex in getMojibakeScore so we don't break the detector
        if (innerString.includes('Ã') || innerString.includes('Â')) {
            return match;
        }
        matches++;
        return quote + escapeUnicode(innerString) + quote;
    }
    return match;
});

fs.writeFileSync(file, content, 'utf8');
console.log(`Successfully escaped ${matches} string literals in ${file}`);
