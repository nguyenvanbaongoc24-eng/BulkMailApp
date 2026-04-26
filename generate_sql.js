const fs = require('fs');

function parseNumber(str) {
    if (!str) return 0;
    str = str.replace(/\./g, '').replace(/,/g, '').replace(/đ/g, '').replace(/\*/g, '').trim();
    const val = parseInt(str, 10);
    return isNaN(val) ? 0 : val;
}

function mapSubject(code) {
    const map = {
        'CA_NHAN': 'Cá nhân',
        'HO_KD': 'Hộ KD',
        'CONG_TY': 'Công ty',
        'CA_NHAN_TC': 'CN thuộc TC'
    };
    return map[code] || code;
}

function mapTransaction(loai) {
    const map = {
        'cap_moi': 'Cấp mới',
        'gia_han': 'Gia hạn',
        'theo_luot': 'Theo lượt',
        'theo_nam': 'Theo năm',
        'theo_thoi_gian': 'Cấp mới', // Default
        'theo_so_to': 'Theo lượt'
    };
    return map[loai] || loai;
}

async function main() {
    const mdContent = fs.readFileSync('bang_gia_ca2.md', 'utf-8');
    const lines = mdContent.split('\n');

    let items = [];
    let currentTableRows = [];
    let currentColumns = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line.startsWith('|') && line.includes('id') && line.includes('goi')) {
            const rawParts = line.split('|');
            currentColumns = rawParts.slice(1, -1).map(s => s.trim());
            currentTableRows = [];
            continue;
        }

        if (line.startsWith('|') && line.includes('---')) {
            continue;
        }

        if (line.startsWith('|')) {
            const rawParts = line.split('|');
            const parts = rawParts.slice(1, -1).map(s => s.trim());
            if (parts.length === currentColumns.length) {
                let rowData = {};
                for (let j = 0; j < currentColumns.length; j++) {
                    rowData[currentColumns[j]] = parts[j];
                }
                currentTableRows.push(rowData);
            }
        }

        if (line.startsWith('```') && currentTableRows.length > 0) {
            let metadata = {};
            let j = i + 1;
            while (j < lines.length && !lines[j].trim().startsWith('```')) {
                const metaLine = lines[j].trim();
                if (metaLine.includes(':')) {
                    const [key, ...valParts] = metaLine.split(':');
                    let val = valParts.join(':').trim();
                    if (val.startsWith('[')) {
                        val = val.replace('[', '').replace(']', '').split(',').map(s => s.trim());
                    }
                    metadata[key] = val;
                }
                j++;
            }
            i = j;

            for (const row of currentTableRows) {
                const subjects = Array.isArray(metadata.doi_tuong) 
                    ? metadata.doi_tuong.map(mapSubject).join(', ') 
                    : mapSubject(metadata.doi_tuong);

                let productGroup = metadata.nhom;
                if (productGroup === 'CKS_TOKEN') productGroup = 'CKS';
                if (productGroup === 'REMOTE_SIGNING') productGroup = 'RS';
                if (productGroup === 'SIGN_PLATFORM') productGroup = 'SP';
                if (productGroup === 'EINVOICE') productGroup = 'eINVOICE';

                let transactionType = mapTransaction(metadata.loai);
                if (metadata.loai === 'theo_thoi_gian') {
                    transactionType = row.goi.includes('năm') ? 'Theo năm' : 'Cấp mới';
                }

                let total_price = 0;
                let crmField = metadata.thanh_tien_crm || 'thanh_tien';
                if (row[crmField]) {
                    if (row[crmField].includes('tính theo lượt') || row[crmField].toLowerCase().includes('tính theo')) {
                        total_price = 0;
                    } else {
                        total_price = parseNumber(row[crmField]);
                    }
                }

                items.push({
                    product_group: productGroup,
                    subject_type: subjects,
                    transaction_type: transactionType,
                    product_code: row.id,
                    package_name: row.goi,
                    service_fee: parseNumber(row.phi_dv || row.phi_pm || 0),
                    token_fee: parseNumber(row.token || 0),
                    vat_fee: parseNumber(row.vat || 0),
                    total_price: total_price,
                    notes: row.ghi_chu || row.mo_ta || '',
                    is_active: row.an !== 'true',
                });
            }

            currentTableRows = [];
            currentColumns = [];
        }
    }

    // Now write to SQL
    let sql = `
-- ============================================
-- 9. Create an initial active version from bang_gia_ca2.md
-- ============================================
DO $$
DECLARE
    v_version_id UUID;
BEGIN
    -- Get or Create version
    SELECT id INTO v_version_id FROM pricing_versions WHERE name = 'Bảng giá CA2 - Nguồn file MD' LIMIT 1;
    
    IF v_version_id IS NULL THEN
        UPDATE pricing_versions SET is_active = false;
        INSERT INTO pricing_versions (name, is_active) VALUES ('Bảng giá CA2 - Nguồn file MD', true) RETURNING id INTO v_version_id;
    ELSE
        UPDATE pricing_versions SET is_active = false;
        UPDATE pricing_versions SET is_active = true WHERE id = v_version_id;
        DELETE FROM pricing_items WHERE version_id = v_version_id;
    END IF;

    -- Insert all items
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes, is_active) VALUES 
`;

    const values = items.map(item => {
        return `    (v_version_id, '${item.product_group}', '${item.subject_type}', '${item.transaction_type}', '${item.product_code}', '${item.package_name}', ${item.service_fee}, ${item.token_fee}, ${item.vat_fee}, ${item.total_price}, '${item.notes}', ${item.is_active})`;
    });

    sql += values.join(',\n') + ';\nEND $$;\n';

    fs.writeFileSync('setup_pricing_system_new.sql', sql);
    console.log(`Generated setup_pricing_system_new.sql with ${items.length} items`);
}

main();
