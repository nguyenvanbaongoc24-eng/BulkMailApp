const XLSX = require('xlsx');

function formatDate(dateVal) {
    if (!dateVal) return '';
    
    // Handle JS Date objects from SheetJS
    let date = dateVal;
    if (!(date instanceof Date)) {
        // Handle string format: 2026-07-28 00:00:00.000
        date = new Date(dateVal);
    }

    if (isNaN(date.getTime())) return dateVal; // Return original if invalid

    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

function parseExcel(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Read as array of arrays to handle indices precisely
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rawData.length === 0) return [];

    // Find header row (usually first row with MST or Tên)
    let headerIdx = -1;
    let colMap = { mst: 4, name: 3, address: 6, serial: 1, phone: 7, email: 8, expiry: 10 }; // Defaults (MST=4, Name=3, Address=6, Phone=7, Email=8)

    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        
        let matchCount = 0;
        const tempMap = { mst: -1, name: -1, address: -1, phone: -1, email: -1, serial: -1, expiry: -1 };
        
        row.forEach((cell, idx) => {
            const val = String(cell || '').toLowerCase().trim();
            if (val === 'mst' || val === 'mã số thuế' || (val.includes('mã số thuế') && val.length < 20)) {
                tempMap.mst = idx; matchCount++;
            }
            if (val.includes('tên công ty') || val.includes('tên đơn vị') || val.includes('tên khách hàng')) {
                tempMap.name = idx; matchCount++;
            }
            if (val.includes('địa chỉ')) {
                tempMap.address = idx; matchCount++;
            }
            if (val.includes('email')) {
                tempMap.email = idx; matchCount++;
            }
            if (val.includes('điện thoại') || val.includes('phone') || val.includes('sđt') || val === 'h') {
                tempMap.phone = idx; matchCount++;
            }
            if (val.includes('serial') || val.includes('số máy') || val.includes('số chứng thư')) {
                tempMap.serial = idx; matchCount++;
            }
            if (val.includes('hết hạn') || val.includes('ngày hết hạn')) {
                tempMap.expiry = idx; matchCount++;
            }
        });

        if (matchCount >= 2) {
            headerIdx = i;
            colMap = { ...colMap, ...Object.fromEntries(Object.entries(tempMap).filter(([_, v]) => v !== -1)) };
            break;
        }
    }

    // FALLBACK: If no headers found, try to PREDICT columns from the first data row
    if (headerIdx === -1 && rawData.length > 0) {
        console.log('[EXCEL] 🔍 No headers found. Attempting pattern-based prediction on Row 0...');
        const firstRow = rawData[0];
        firstRow.forEach((cell, idx) => {
            const val = String(cell || '').trim();
            // MST pattern: 10 or 13 digits
            if (/^\d{10}(\d{3})?$/.test(val.replace(/\s/g, ''))) {
                colMap.mst = idx;
                console.log(`[EXCEL] -> Predicted MST at Col ${idx}`);
            }
            else if (val.includes('@')) {
                colMap.email = idx;
                console.log(`[EXCEL] -> Predicted Email at Col ${idx}`);
            }
            else if (val.split(' ').length >= 2 && !/\d/.test(val) && val.length > 5) {
                // If it's a long string with no numbers and multiple words, it's likely a name
                if (colMap.name === 3) { 
                    colMap.name = idx;
                    console.log(`[EXCEL] -> Predicted Name at Col ${idx}`);
                }
            }
            else if (/(đường|phố|quận|huyện|tỉnh|số|khu)/i.test(val) && val.length > 15) {
                colMap.address = idx;
                console.log(`[EXCEL] -> Predicted Address at Col ${idx}`);
            }
        });
    }

    const startRow = headerIdx !== -1 ? headerIdx + 1 : 0;

    return rawData.slice(startRow).map(row => {
        const mst = row[colMap.mst];
        if (!mst || mst.toString().trim() === '') return null;

        // Serial check (Column B or C fallback if not found by header)
        let serial = row[colMap.serial] ? String(row[colMap.serial]).trim() : '';
        if (!serial && colMap.serial === 1) {
            serial = row[2] ? String(row[2]).trim() : ''; // Try index 2 if index 1 empty
        }

        return {
            Serial: serial,
            MST: mst.toString().trim(),
            TenCongTy: row[colMap.name] ? String(row[colMap.name]).trim() : '',
            DiaChi: row[colMap.address] ? String(row[colMap.address]).trim() : '',
            Phone: row[colMap.phone] ? String(row[colMap.phone]).trim() : '',
            Email: row[colMap.email] ? String(row[colMap.email]).trim() : '',
            NgayHetHanChuKySo: formatDate(row[colMap.expiry])
        };
    }).filter(row => row !== null);
}

module.exports = { parseExcel, formatDate };

