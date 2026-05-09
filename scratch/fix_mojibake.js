/**
 * Fix double/triple UTF-8 Mojibake in app.js
 * 
 * The corruption chain: UTF-8 bytes → read as Windows-1252 → saved as UTF-8
 * Fix: interpret each character's code point as a Windows-1252 byte → decode as UTF-8
 */
const fs = require('fs');
const path = require('path');

// Windows-1252 specific code points (0x80-0x9F range)
// These Unicode code points map back to their Windows-1252 byte values
const win1252Reverse = {
  0x20AC: 0x80, // €
  0x201A: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201E: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02C6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8A, // Š
  0x2039: 0x8B, // ‹
  0x0152: 0x8C, // Œ
  0x017D: 0x8E, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201C: 0x93, // "
  0x201D: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02DC: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9A, // š
  0x203A: 0x9B, // ›
  0x0153: 0x9C, // œ
  0x017E: 0x9E, // ž
  0x0178: 0x9F, // Ÿ
};

function charCodeToByte(code) {
  if (code < 0x80) return code;        // ASCII - same in all encodings
  if (code <= 0xFF) return code;        // Latin-1 range (0x80-0xFF)
  if (win1252Reverse[code] !== undefined) return win1252Reverse[code];
  return -1; // Can't represent in Windows-1252
}

function undoOneMojibakePass(str) {
  // Convert each character to its Windows-1252 byte value, then decode as UTF-8
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const b = charCodeToByte(code);
    if (b === -1) {
      // Can't convert - this char isn't from Windows-1252
      // Return null to indicate this string can't be decoded
      return null;
    }
    bytes.push(b);
  }

  try {
    const buf = Buffer.from(bytes);
    const decoded = buf.toString('utf8');
    // Check for replacement character (indicates invalid UTF-8)
    if (decoded.includes('\uFFFD')) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Process the file
const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove BOM if present
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
  console.log('Removed BOM');
}

// Apply iterative mojibake fix to the entire content
// ASCII chars (< 0x80) pass through unchanged, so this is safe for code
let iterations = 0;
const MAX_ITER = 5;

while (iterations < MAX_ITER) {
  const decoded = undoOneMojibakePass(content);
  if (decoded === null || decoded === content) {
    break;
  }
  console.log(`Iteration ${iterations + 1}: ${content.length} chars → ${decoded.length} chars`);
  content = decoded;
  iterations++;
}

console.log(`Applied ${iterations} decode pass(es).`);

// Also fix the \\uXXXX literal sequences that were accidentally written
// These should be actual \uXXXX JS escapes, not double-escaped \\u
// Check: if we see literal \\u1EA3 etc in string literals, they need to stay as \uXXXX
// Actually, \\u in source code IS the correct way to write unicode escapes in JS.
// The previous fix wrote them correctly. Let's leave them.

// Write back as UTF-8 without BOM
fs.writeFileSync(filePath, content, 'utf8');
console.log('File saved successfully.');

// Verify: count remaining non-ASCII lines
const lines = content.split('\n');
let nonAsciiCount = 0;
for (const line of lines) {
  if (/[^\x00-\x7F]/.test(line)) nonAsciiCount++;
}
console.log(`Remaining lines with non-ASCII: ${nonAsciiCount}`);

// Print a sample of Vietnamese strings to verify
const titleMapMatch = content.match(/const titleMap = \{[\s\S]*?\};/);
if (titleMapMatch) {
  console.log('\n--- titleMap sample ---');
  console.log(titleMapMatch[0].substring(0, 500));
}
