-- ============================================
-- CRM SERVICE PRICING SYSTEM SETUP
-- ============================================

-- 1. Pricing Versioning
CREATE TABLE IF NOT EXISTS pricing_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Service Categories (e.g., Công ty, Cá nhân)
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- 3. Services (e.g., CA2, Hóa đơn điện tử)
CREATE TABLE IF NOT EXISTS pricing_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category_id UUID REFERENCES service_categories(id) ON DELETE CASCADE,
    UNIQUE(name, category_id)
);

-- 4. Pricing Items (The actual prices - Upgraded for CRUD)
CREATE TABLE IF NOT EXISTS pricing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES pricing_versions(id) ON DELETE CASCADE,
    product_group TEXT, -- CKS, RS, SP, eINVOICE, IVM
    subject_type TEXT, -- Cá nhân, Hộ KD, Công ty, CN thuộc TC
    transaction_type TEXT, -- Cấp mới, Gia hạn, Theo lượt, Theo năm
    product_code TEXT, -- e.g., CKS-DN-NEW-12
    package_name TEXT, -- e.g., "12 tháng"
    service_fee DECIMAL(15, 0) DEFAULT 0,
    token_fee DECIMAL(15, 0) DEFAULT 0,
    vat_fee DECIMAL(15, 0) DEFAULT 0,
    total_price DECIMAL(15, 0) NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_items_version ON pricing_items(version_id);
CREATE INDEX IF NOT EXISTS idx_pricing_versions_active ON pricing_versions(is_active) WHERE is_active = true;

-- 6. Enable RLS
ALTER TABLE pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_items ENABLE ROW LEVEL SECURITY;

-- 7. Policies
DROP POLICY IF EXISTS "Public read pricing versions" ON pricing_versions;
CREATE POLICY "Public read pricing versions" ON pricing_versions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read categories" ON service_categories;
CREATE POLICY "Public read categories" ON service_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read services" ON pricing_services;
CREATE POLICY "Public read services" ON pricing_services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read items" ON pricing_items;
CREATE POLICY "Public read items" ON pricing_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth manage versions" ON pricing_versions;
CREATE POLICY "Auth manage versions" ON pricing_versions FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth manage categories" ON service_categories;
CREATE POLICY "Auth manage categories" ON service_categories FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth manage services" ON pricing_services;
CREATE POLICY "Auth manage services" ON pricing_services FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth manage items" ON pricing_items;
CREATE POLICY "Auth manage items" ON pricing_items FOR ALL USING (auth.uid() IS NOT NULL);

-- 8. Seed Initial Data
-- Insert Categories
INSERT INTO service_categories (name) VALUES ('Công ty'), ('Cá nhân/HKD') ON CONFLICT DO NOTHING;

-- Insert Services for 'Công ty'
DO $$ 
DECLARE 
    v_company_id UUID;
    v_individual_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM service_categories WHERE name = 'Công ty';
    SELECT id INTO v_individual_id FROM service_categories WHERE name = 'Cá nhân/HKD';

    -- Company Services
    INSERT INTO pricing_services (name, category_id) VALUES 
    ('Chữ ký số (CA2)', v_company_id),
    ('Hóa đơn điện tử', v_company_id),
    ('Remote Signing', v_company_id),
    ('Bảo hiểm EBH', v_company_id)
    ON CONFLICT DO NOTHING;

    -- Individual Services
    INSERT INTO pricing_services (name, category_id) VALUES 
    ('Chữ ký số (CA2)', v_individual_id),
    ('Remote Signing', v_individual_id)
    ON CONFLICT DO NOTHING;
END $$;

-- 9. Create an initial active version
DO $$
DECLARE
    v_version_id UUID;
    v_company_id UUID;
    v_individual_id UUID;
    v_service_id UUID;
BEGIN
    -- Get or Create version
    SELECT id INTO v_version_id FROM pricing_versions WHERE name = 'Bảng giá 18/07/2025' LIMIT 1;
    
    IF v_version_id IS NULL THEN
        UPDATE pricing_versions SET is_active = false;
        INSERT INTO pricing_versions (name, is_active) VALUES ('Bảng giá 18/07/2025', true) RETURNING id INTO v_version_id;
    ELSE
        UPDATE pricing_versions SET is_active = false;
        UPDATE pricing_versions SET is_active = true WHERE id = v_version_id;
        DELETE FROM pricing_items WHERE version_id = v_version_id;
    END IF;

    -- ============================================
    -- A. CHỮ KÝ SỐ CA2 TOKEN (CKS)
    -- ============================================
    -- A1. Tổ chức / Doanh nghiệp – Cấp mới
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-12', '12 tháng', 1161000, 500000, 132880, 1793880, ''),
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-24', '24 tháng', 1992000, 500000, 199360, 2691360, ''),
    (v_version_id, 'CKS', 'Công ty', 'Cấp mới', 'CKS-DN-NEW-36', '36 tháng', 2828000, 0, 226240, 3054240, 'Miễn phí Token');

    -- A2. Tổ chức / Doanh nghiệp – Gia hạn
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-12', '12 tháng', 1161000, 0, 92880, 1253880, ''),
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-24', '24 tháng', 1992000, 0, 159360, 2151360, ''),
    (v_version_id, 'CKS', 'Công ty', 'Gia hạn', 'CKS-DN-RNW-36', '36 tháng', 2643000, 0, 211440, 2854440, '');

    -- A3. Cá nhân / Cá nhân thuộc tổ chức / Hộ KD – Cấp mới
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'CKS', 'Cá nhân', 'Cấp mới', 'CKS-CN-NEW-12', '12 tháng', 490000, 500000, 79200, 1069200, ''),
    (v_version_id, 'CKS', 'Cá nhân', 'Cấp mới', 'CKS-CN-NEW-24', '24 tháng', 890000, 500000, 111200, 1501200, ''),
    (v_version_id, 'CKS', 'Cá nhân', 'Cấp mới', 'CKS-CN-NEW-36', '36 tháng', 1800000, 0, 144000, 1944000, 'Miễn phí Token');

    -- A4. Cá nhân / Hộ KD – Gia hạn
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'CKS', 'Cá nhân', 'Gia hạn', 'CKS-CN-RNW-12', '12 tháng', 490000, 0, 39200, 529200, ''),
    (v_version_id, 'CKS', 'Cá nhân', 'Gia hạn', 'CKS-CN-RNW-24', '24 tháng', 890000, 0, 71200, 961200, ''),
    (v_version_id, 'CKS', 'Cá nhân', 'Gia hạn', 'CKS-CN-RNW-36', '36 tháng', 1300000, 0, 104000, 1404000, '');

    -- ============================================
    -- B. CHỮ KÝ SỐ TỪ XA CA2 REMOTE SIGNING (RS)
    -- ============================================
    -- B1. RS Cá nhân (RS-CN)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN1m', '1 tháng', 31800, 0, 2544, 34344, ''),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN3m', '3 tháng', 59000, 0, 4720, 63720, ''),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN6m', '6 tháng', 100000, 0, 8000, 108000, ''),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN1y', '1 năm', 181800, 0, 14544, 196344, ''),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN2y', '2 năm', 345500, 0, 27640, 373140, ''),
    (v_version_id, 'RS', 'Cá nhân', 'Cấp mới', 'RS-CN3y', '3 năm', 491000, 0, 39280, 530280, '');

    -- B2. RS Cá nhân thuộc tổ chức (RS-CNTC)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'RS', 'CN thuộc TC', 'Cấp mới', 'RS-CNTC1y', '1 năm', 318000, 0, 25440, 343440, ''),
    (v_version_id, 'RS', 'CN thuộc TC', 'Cấp mới', 'RS-CNTC2y', '2 năm', 564000, 0, 45120, 609120, ''),
    (v_version_id, 'RS', 'CN thuộc TC', 'Cấp mới', 'RS-CNTC3y', '3 năm', 764000, 0, 61120, 825120, '');

    -- B3. RS Hộ Kinh Doanh (RS-HKD)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'RS', 'Hộ KD', 'Cấp mới', 'RS-HKD1y', '1 năm', 318000, 0, 25440, 343440, ''),
    (v_version_id, 'RS', 'Hộ KD', 'Cấp mới', 'RS-HKD2y', '2 năm', 564000, 0, 45120, 609120, ''),
    (v_version_id, 'RS', 'Hộ KD', 'Cấp mới', 'RS-HKD3y', '3 năm', 764000, 0, 61120, 825120, '');

    -- B4. RS Tổ chức / Doanh nghiệp (RS-DN)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'RS', 'Công ty', 'Cấp mới', 'RS-DN1y', '1 năm', 1136000, 0, 90880, 1226880, ''),
    (v_version_id, 'RS', 'Công ty', 'Cấp mới', 'RS-DN2y', '2 năm', 2000000, 0, 160000, 2160000, ''),
    (v_version_id, 'RS', 'Công ty', 'Cấp mới', 'RS-DN3y', '3 năm', 2637000, 0, 210960, 2847960, '');

    -- ============================================
    -- C. CA2 SIGN PLATFORM (CA2-SP)
    -- ============================================
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-Lite', '10 HĐ', 0, 0, 0, 0, 'Sử dụng vĩnh viễn'),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-100', '100 HĐ', 250000, 0, 0, 250000, ''),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-300', '300 HĐ', 690000, 0, 0, 690000, ''),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-500', '500 HĐ', 1110000, 0, 0, 1110000, ''),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-1000', '1.000 HĐ', 2100000, 0, 0, 2100000, ''),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-2000', '2.000 HĐ', 4000000, 0, 0, 4000000, ''),
    (v_version_id, 'SP', 'Công ty', 'Theo năm', 'SP-5000', '5.000 HĐ', 9500000, 0, 0, 9500000, '');

    -- ============================================
    -- D. HÓA ĐƠN ĐIỆN TỬ CA2-EINVOICE
    -- ============================================
    -- D1. Gói theo số tờ
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI300', '300 tờ', 800000, 0, 0, 800000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI500', '500 tờ', 925000, 0, 0, 925000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI1.000', '1.000 tờ', 1175000, 0, 0, 1175000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI2.000', '2.000 tờ', 1600000, 0, 0, 1600000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI5.000', '5.000 tờ', 2750000, 0, 0, 2750000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo lượt', 'CA2-eI10.000', '10.000 tờ', 4000000, 0, 0, 4000000, '');

    -- D2. Gói theo thời hạn năm (IR)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-100', '100 HĐ', 100000, 0, 0, 100000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-300', '300 HĐ', 200000, 0, 0, 200000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-500', '500 HĐ', 290000, 0, 0, 290000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-700', '700 HĐ', 380000, 0, 0, 380000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-1000', '1.000 HĐ', 500000, 0, 0, 500000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-3000', '3.000 HĐ', 990000, 0, 0, 990000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-5000', '5.000 HĐ', 1200000, 0, 0, 1200000, ''),
    (v_version_id, 'eINVOICE', 'Công ty', 'Theo năm', 'IR-10.000', '10.000 HĐ', 1999000, 0, 0, 1999000, '');

    -- D3. Quản lý HĐ đầu vào (IVM)
    INSERT INTO pricing_items (version_id, product_group, subject_type, transaction_type, product_code, package_name, service_fee, token_fee, vat_fee, total_price, notes) VALUES 
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-100', '100 HĐ', 100000, 0, 0, 100000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-300', '300 HĐ', 200000, 0, 0, 200000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-500', '500 HĐ', 290000, 0, 0, 290000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-700', '700 HĐ', 380000, 0, 0, 380000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-1000', '1.000 HĐ', 500000, 0, 0, 500000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-3000', '3.000 HĐ', 990000, 0, 0, 990000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-5000', '5.000 HĐ', 1200000, 0, 0, 1200000, ''),
    (v_version_id, 'IVM', 'Công ty', 'Theo năm', 'IVM-10.000', '10.000 HĐ', 1999000, 0, 0, 1999000, '');
END $$;
