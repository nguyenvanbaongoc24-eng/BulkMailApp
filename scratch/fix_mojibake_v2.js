/**
 * Fix remaining single-level Mojibake in app.js
 * Process non-ASCII SEGMENTS individually rather than the whole file
 */
const fs = require('fs');
const path = require('path');

const win1252Reverse = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function charCodeToByte(code) {
  if (code < 0x100) return code;
  if (win1252Reverse[code] !== undefined) return win1252Reverse[code];
  return -1;
}

function tryDecodeMojibake(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const b = charCodeToByte(code);
    if (b === -1) return null;
    bytes.push(b);
  }
  try {
    const buf = Buffer.from(bytes);
    const decoded = buf.toString('utf8');
    if (decoded.includes('\uFFFD')) return null;
    // Only accept if result is shorter (indicates successful decode)
    if (decoded.length >= str.length) return null;
    return decoded;
  } catch { return null; }
}

// Known Vietnamese Mojibake marker characters (Latin-1 interpretations of UTF-8 lead bytes)
const mojibakeMarkers = /[\xC0-\xFF][\x80-\xBF]/;

function isMojibake(str) {
  return mojibakeMarkers.test(str);
}

const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove BOM
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

// Strategy: find contiguous runs of non-ASCII characters (with up to 3 ASCII chars between them)
// and try to decode each run individually.
// This preserves emoji and other correct Unicode while fixing Mojibake.

let fixCount = 0;
let totalPasses = 0;

function fixPass(text) {
  let changed = false;
  // Match: non-ASCII char, then any mix of chars that could be part of Mojibake
  // Mojibake sequences contain chars in 0x80-0xFF range (Latin-1 high chars)
  const result = text.replace(
    // Match segments containing high Latin-1 chars (Ã, Â, etc.) mixed with ASCII
    /([\x80-\xFF](?:[\x00-\xFF])*?)(?=[\x00-\x7F]{4,}|$)/g,
    (match) => {
      if (!isMojibake(match)) return match;
      const decoded = tryDecodeMojibake(match);
      if (decoded && decoded !== match) {
        changed = true;
        fixCount++;
        return decoded;
      }
      return match;
    }
  );
  return { result, changed };
}

// Process line by line for better granularity
const lines = content.split('\n');
const fixedLines = [];

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  
  // Skip lines that are pure ASCII
  if (!/[^\x00-\x7F]/.test(line)) {
    fixedLines.push(line);
    continue;
  }
  
  // For lines with non-ASCII content, try to fix string-by-string
  // Find quoted strings and fix them individually
  let fixedLine = line.replace(
    /('[^']*[^\x00-\x7F][^']*'|"[^"]*[^\x00-\x7F][^"]*"|`[^`]*[^\x00-\x7F][^`]*`)/g,
    (quotedStr) => {
      const quote = quotedStr[0];
      const inner = quotedStr.slice(1, -1);
      
      // Skip if it's a \uXXXX escape sequence (already fixed)
      if (/\\u[0-9A-Fa-f]{4}/.test(inner)) return quotedStr;
      
      // Try iterative decode
      let current = inner;
      let iters = 0;
      while (iters < 5) {
        const decoded = tryDecodeMojibake(current);
        if (!decoded || decoded === current) break;
        current = decoded;
        iters++;
      }
      
      if (current !== inner) {
        fixCount++;
        return quote + current + quote;
      }
      return quotedStr;
    }
  );
  
  // Also fix non-quoted non-ASCII (like in comments, template literals)
  // Find remaining non-ASCII runs outside quotes
  fixedLine = fixedLine.replace(
    /[^\x00-\x7F]+(?:[\x20-\x7E]{1,3}[^\x00-\x7F]+)*/g,
    (match) => {
      // Skip if already valid Vietnamese (check for common correct patterns)
      // Try decode
      let current = match;
      let iters = 0;
      while (iters < 5) {
        const decoded = tryDecodeMojibake(current);
        if (!decoded || decoded === current) break;
        current = decoded;
        iters++;
      }
      if (current !== match) {
        fixCount++;
        return current;
      }
      return match;
    }
  );
  
  fixedLines.push(fixedLine);
}

content = fixedLines.join('\n');

// Write back as UTF-8 without BOM
fs.writeFileSync(filePath, content, 'utf8');

console.log(`Fixed ${fixCount} mojibake segments.`);

// Verify some key strings
const checks = [
  { line: 549, expected: 'Lỗi kết nối server' },
  { line: 1011, expected: 'năm' },
  { line: 1582, expected: 'Cập nhật khách hàng' },
];

const finalLines = content.split('\n');
for (const check of checks) {
  const lineContent = finalLines[check.line - 1] || '';
  const hasExpected = lineContent.includes(check.expected);
  console.log(`Line ${check.line}: ${hasExpected ? '✓' : '✗'} (looking for "${check.expected}")`);
  if (!hasExpected) {
    console.log(`  Actual: ${lineContent.trim().substring(0, 100)}`);
  }
}
