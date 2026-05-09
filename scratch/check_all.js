const fs = require('fs');
const path = require('path');

const files = [
  'public/js/premium-ui.js',
  'public/index.html',
  'public/js/quote-components.js',
];

files.forEach(f => {
  try {
    const c = fs.readFileSync(f, 'utf8');
    const lines = c.split('\n');
    let bad = 0;
    const samples = [];
    lines.forEach((l, i) => {
      if (/[\xC0-\xFF][\x80-\xBF]/.test(l) && !/getMojibakeScore|mojibakeMarker/.test(l)) {
        bad++;
        if (samples.length < 5) samples.push(`  L${i+1}: ${l.trim().substring(0, 120)}`);
      }
    });
    console.log(`${f}: ${bad} mojibake lines`);
    samples.forEach(s => console.log(s));
  } catch(e) {
    console.log(`${f}: SKIP (${e.message})`);
  }
});
