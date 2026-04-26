const fs = require('fs');

const mdContent = fs.readFileSync('bang_gia_ca2.md', 'utf-8');
const lines = mdContent.split('\n');

const packages = [];
let currentGroup = '';

for (let line of lines) {
    if (line.startsWith('## A.') || line.startsWith('### A.')) currentGroup = 'CKS';
    else if (line.startsWith('## B.') || line.startsWith('### B.')) currentGroup = 'RS';
    else if (line.startsWith('## C.') || line.startsWith('### C.')) currentGroup = 'SP';
    else if (line.startsWith('## D.') || line.startsWith('### D.')) currentGroup = 'eINVOICE';
    else if (line.startsWith('## E.') || line.startsWith('### E.')) currentGroup = 'IVM';
    else if (line.startsWith('## F.') || line.startsWith('### F.')) currentGroup = 'EBH';

    if (line.trim().startsWith('|') && !line.includes('---') && !line.includes('Mã SP')) {
        const parts = line.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 10) {
            // | CKS-DN-NEW-12 | Công ty | C?p m?i | 1 nam | 1,280,000 | 500,000 | 178,000 | 1,958,000 | Ðã g?m Token | FALSE |
            const [id, subject, type, pkg, feeService, feeToken, vat, total, note, hidden] = parts;
            packages.push({
                id,
                product_group: currentGroup,
                subject_type: subject,
                transaction_type: type,
                product_code: id,
                package_name: pkg,
                service_fee: parseInt(feeService.replace(/,/g, '')) || 0,
                token_fee: parseInt(feeToken.replace(/,/g, '')) || 0,
                vat_fee: parseInt(vat.replace(/,/g, '')) || 0,
                total_price: parseInt(total.replace(/,/g, '')) || 0,
                notes: note,
                is_active: hidden.toUpperCase() !== 'TRUE',
                effective_date: '2025-07-18'
            });
        }
    }
}

fs.writeFileSync('data/crm_prices.json', JSON.stringify(packages, null, 2));
console.log('Parsed ' + packages.length + ' packages');
