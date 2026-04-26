
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
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-12', '12 tháng', 1161000, 500000, 132880, 1793880, '', true),
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-24', '24 tháng', 1992000, 500000, 199360, 2691360, '', true),
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-36', '36 tháng', 2828000, 0, 226240, 3054240, 'Miễn phí Token', true),
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-12', '12 tháng', 1161000, 0, 92880, 1253880, '', true),
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-24', '24 tháng', 1992000, 0, 159360, 2151360, '', true),
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-36', '36 tháng', 2643000, 0, 211440, 2854440, '', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Cấp mới', 'CKS-CN-NEW-12', '12 tháng', 490000, 500000, 79200, 1069200, '', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Cấp mới', 'CKS-CN-NEW-24', '24 tháng', 890000, 500000, 111200, 1501200, '', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Cấp mới', 'CKS-CN-NEW-36', '36 tháng', 1800000, 0, 144000, 1944000, 'Miễn phí Token', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Gia hạn', 'CKS-CN-RNW-12', '12 tháng', 490000, 0, 39200, 529200, '', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Gia hạn', 'CKS-CN-RNW-24', '24 tháng', 890000, 0, 71200, 961200, '', true),
    (v_version_id, 'CKS', 'Cá nhân, Hộ KD, CN thuộc TC', 'Gia hạn', 'CKS-CN-RNW-36', '36 tháng', 1300000, 0, 104000, 1404000, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN-1M', '1 tháng', 31800, 0, 2544, 34344, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN-3M', '3 tháng', 59000, 0, 4720, 63720, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN-6M', '6 tháng', 100000, 0, 8000, 108000, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Theo năm', 'RS-CN-1Y', '1 năm', 181800, 0, 14544, 196344, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Theo năm', 'RS-CN-2Y', '2 năm', 345500, 0, 27640, 373140, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Theo năm', 'RS-CN-3Y', '3 năm', 491000, 0, 39280, 530280, '', true),
    (v_version_id, 'RS', 'CN thuộc TC', 'Theo năm', 'RS-CNTC-1Y', '1 năm', 318000, 0, 25440, 343440, '', true),
    (v_version_id, 'RS', 'CN thuộc TC', 'Theo năm', 'RS-CNTC-2Y', '2 năm', 564000, 0, 45120, 609120, '', true),
    (v_version_id, 'RS', 'CN thuộc TC', 'Theo năm', 'RS-CNTC-3Y', '3 năm', 764000, 0, 61120, 825120, '', true),
    (v_version_id, 'RS', 'Hộ KD', 'Theo năm', 'RS-HKD-1Y', '1 năm', 318000, 0, 25440, 343440, '', true),
    (v_version_id, 'RS', 'Hộ KD', 'Theo năm', 'RS-HKD-2Y', '2 năm', 564000, 0, 45120, 609120, '', true),
    (v_version_id, 'RS', 'Hộ KD', 'Theo năm', 'RS-HKD-3Y', '3 năm', 764000, 0, 61120, 825120, '', true),
    (v_version_id, 'RS', 'Công ty', 'Theo năm', 'RS-DN-1Y', '1 năm', 1136000, 0, 90880, 1226880, '', true),
    (v_version_id, 'RS', 'Công ty', 'Theo năm', 'RS-DN-2Y', '2 năm', 2000000, 0, 160000, 2160000, '', true),
    (v_version_id, 'RS', 'Công ty', 'Theo năm', 'RS-DN-3Y', '3 năm', 2637000, 0, 210960, 2847960, '', true),
    (v_version_id, 'RS', 'Cá nhân', 'Theo lượt', 'RS-CN-10L', '10 lần/tháng', 18000, 0, 1440, 19440, '~1.944đ/lần', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-LITE', 'SP-Lite', 0, 0, 0, 0, 'Miễn phí vĩnh viễn', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-100', 'SP-100', 0, 0, 0, 250000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-300', 'SP-300', 0, 0, 0, 690000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-500', 'SP-500', 0, 0, 0, 1110000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-1000', 'SP-1000', 0, 0, 0, 2100000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-2000', 'SP-2000', 0, 0, 0, 4000000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-5000', 'SP-5000', 0, 0, 0, 9500000, '', true),
    (v_version_id, 'SP', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'SP-MAX', 'SP-MAX', 0, 0, 0, 0, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-300', 'CA2-eI300', 500000, 0, 0, 800000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-500', 'CA2-eI500', 500000, 0, 0, 925000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-1000', 'CA2-eI1.000', 500000, 0, 0, 1175000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-2000', 'CA2-eI2.000', 500000, 0, 0, 1600000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-5000', 'CA2-eI5.000', 500000, 0, 0, 2750000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-10000', 'CA2-eI10.000', 500000, 0, 0, 4000000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo lượt', 'EI-EXTRA', 'CA2-eIExtra', 500000, 0, 0, 0, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-100', 'IR-100', 0, 0, 0, 100000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-300', 'IR-300', 0, 0, 0, 200000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-500', 'IR-500', 0, 0, 0, 290000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-700', 'IR-700', 0, 0, 0, 380000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-1000', 'IR-1000', 0, 0, 0, 500000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-3000', 'IR-3000', 0, 0, 0, 990000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-5000', 'IR-5000', 0, 0, 0, 1200000, '', true),
    (v_version_id, 'eINVOICE', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IR-10000', 'IR-10.000', 0, 0, 0, 1999000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-100', 'IVM-100', 0, 0, 0, 100000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-300', 'IVM-300', 0, 0, 0, 200000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-500', 'IVM-500', 0, 0, 0, 290000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-700', 'IVM-700', 0, 0, 0, 380000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-1000', 'IVM-1000', 0, 0, 0, 500000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-3000', 'IVM-3000', 0, 0, 0, 990000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-5000', 'IVM-5000', 0, 0, 0, 1200000, '', true),
    (v_version_id, 'IVM', 'Cá nhân, Hộ KD, Công ty, CN thuộc TC', 'Theo năm', 'IVM-10000', 'IVM-10.000', 0, 0, 0, 1999000, '', true);
END $$;
