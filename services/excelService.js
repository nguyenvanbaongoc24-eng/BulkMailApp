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
    let colMap = { mst: 4, name: 3, address: 6, serial: 1, email: 8, expiry: 10 }; // Defaults

    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.join('|').toLowerCase();
        if (rowStr.includes('mst') || rowStr.includes('mã số thuế') || rowStr.includes('tên công ty') || rowStr.includes('tên đơn vị')) {
            headerIdx = i;
            row.forEach((cell, idx) => {
                const val = String(cell || '').toLowerCase().trim();
                if (val === 'mst' || val.includes('mã số thuế')) colMap.mst = idx;
                if (val.includes('tên công ty') || val.includes('tên đơn vị')) colMap.name = idx;
                if (val.includes('địa chỉ')) colMap.address = idx;
                if (val.includes('email')) colMap.email = idx;
                if (val.includes('serial') || val.includes('số máy')) colMap.serial = idx;
                if (val.includes('hết hạn') || val.includes('ngày hết hạn')) colMap.expiry = idx;
            });
            break;
        }
    }

    // Start parsing from next row after header, or from row 0 if no header found
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
            Email: row[colMap.email] ? String(row[colMap.email]).trim() : '',
            NgayHetHanChuKySo: formatDate(row[colMap.expiry])
        };
    }).filter(row => row !== null);
}

module.exports = { parseExcel, formatDate };

