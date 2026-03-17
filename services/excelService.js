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
    
    // Column D -> Index 3 (TenCongTy)
    // Column E -> Index 4 (MST)
    // Column G -> Index 6 (DiaChi)
    // Column K -> Index 10 (NgayHetHanChuKySo)
    
    return rawData.map(row => {
        const serial = row[2]; // Column C
        const mst = row[4];
        const tenCongTy = row[3];
        const diaChi = row[6];
        const ngayHetHan = row[10];
        const email = row[8]; // Column I

        // Skip rows with empty MST (Column E)
        if (!mst || mst.toString().trim() === '') return null;

        return {
            Serial: serial ? serial.toString().trim() : '',
            MST: mst.toString().trim(),
            TenCongTy: tenCongTy ? tenCongTy.toString().trim() : '',
            DiaChi: diaChi ? diaChi.toString().trim() : '',
            Email: email ? email.toString().trim() : '',
            NgayHetHanChuKySo: formatDate(ngayHetHan)
        };
    }).filter(row => row !== null);
}

module.exports = { parseExcel, formatDate };

