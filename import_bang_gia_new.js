const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
        'theo_thoi_gian': 'Cấp mới', // Treated as Cấp mới usually, or Theo năm based on context
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
            // Header row
            currentColumns = line.split('|').map(s => s.trim()).filter(Boolean);
            currentTableRows = [];
            continue;
        }

        if (line.startsWith('|') && line.includes('---')) {
            // Separator row
            continue;
        }

        if (line.startsWith('|')) {
            // Data row
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length === currentColumns.length) {
                let rowData = {};
                for (let j = 0; j < currentColumns.length; j++) {
                    rowData[currentColumns[j]] = parts[j];
                }
                currentTableRows.push(rowData);
            }
        }

        if (line.startsWith('```') && currentTableRows.length > 0) {
            // Metadata block following a table
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

            // Apply metadata to currentTableRows and push to items
            for (const row of currentTableRows) {
                const subjects = Array.isArray(metadata.doi_tuong) 
                    ? metadata.doi_tuong.map(mapSubject).join(', ') 
                    : mapSubject(metadata.doi_tuong);

                let productGroup = metadata.nhom;
                if (productGroup === 'CKS_TOKEN') productGroup = 'CKS';
                if (productGroup === 'REMOTE_SIGNING') productGroup = 'RS';
                if (productGroup === 'SIGN_PLATFORM') productGroup = 'SP';

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
                    effective_date: '2025-07-18'
                });
            }

            currentTableRows = [];
            currentColumns = [];
        }
    }

    console.log(`Parsed ${items.length} items from bang_gia_ca2.md`);

    // Create a new pricing version and insert items
    try {
        // Deactivate old
        await supabase.from('pricing_versions').update({ is_active: false }).eq('is_active', true);

        // Create new
        const { data: version, error: vErr } = await supabase
            .from('pricing_versions')
            .insert({ name: 'Bảng giá CA2 - Nguồn file MD', is_active: true })
            .select()
            .single();

        if (vErr) throw vErr;

        // Insert items
        const itemsToInsert = items.map(item => ({ ...item, version_id: version.id }));
        
        // We will insert in chunks if needed, but it's < 100 items so one insert is fine
        const { error: iErr } = await supabase.from('pricing_items').insert(itemsToInsert);

        if (iErr) throw iErr;

        console.log(`Successfully inserted ${items.length} items into version ${version.name}`);
    } catch (err) {
        console.error('Error updating Supabase:', err);
    }
}

main();
