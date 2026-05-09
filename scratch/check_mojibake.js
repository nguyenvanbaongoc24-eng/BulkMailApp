const fs = require('fs');
const c = fs.readFileSync('public/js/app.js', 'utf8');
const lines = c.split('\n');
let bad = 0;
lines.forEach((l, i) => {
  // Detect mojibake: sequences like Ã followed by another high byte
  if (/[\xC0-\xFF][\x80-\xBF]/.test(l)) {
    bad++;
    if (bad <= 15) console.log(`L${i+1}: ${l.trim().substring(0, 150)}`);
  }
});
console.log(`\nTotal potential mojibake lines: ${bad}`);
