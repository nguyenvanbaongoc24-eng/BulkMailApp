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

-- 4. Pricing Items (The actual prices)
CREATE TABLE IF NOT EXISTS pricing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES pricing_versions(id) ON DELETE CASCADE,
    service_id UUID REFERENCES pricing_services(id) ON DELETE CASCADE,
    duration TEXT NOT NULL, -- e.g., "1 năm", "300 số"
    price DECIMAL(15, 0) NOT NULL,
    description TEXT,
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
CREATE POLICY "Public read pricing versions" ON pricing_versions FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON service_categories FOR SELECT USING (true);
CREATE POLICY "Public read services" ON pricing_services FOR SELECT USING (true);
CREATE POLICY "Public read items" ON pricing_items FOR SELECT USING (true);

CREATE POLICY "Auth manage versions" ON pricing_versions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage categories" ON service_categories FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage services" ON pricing_services FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage items" ON pricing_items FOR ALL USING (auth.uid() IS NOT NULL);

-- 8. Seed Initial Data
-- Insert Categories
INSERT INTO service_categories (name) VALUES ('Công ty'), ('Cá nhân/HKD') ON CONFLICT DO NOTHING;

-- Insert Services for 'Công ty'
DO $$ 
DECLARE 
    company_id UUID;
    individual_id UUID;
BEGIN
    SELECT id INTO company_id FROM service_categories WHERE name = 'Công ty';
    SELECT id INTO individual_id FROM service_categories WHERE name = 'Cá nhân/HKD';

    -- Company Services
    INSERT INTO pricing_services (name, category_id) VALUES 
    ('Chữ ký số (CA2)', company_id),
    ('Hóa đơn điện tử', company_id),
    ('Remote Signing', company_id)
    ON CONFLICT DO NOTHING;

    -- Individual Services
    INSERT INTO pricing_services (name, category_id) VALUES 
    ('Chữ ký số (CA2)', individual_id),
    ('Remote Signing', individual_id)
    ON CONFLICT DO NOTHING;
END $$;

-- 9. Create an initial active version
DO $$
DECLARE
    version_id UUID;
    company_id UUID;
    individual_id UUID;
    service_id UUID;
BEGIN
    -- Create version
    INSERT INTO pricing_versions (name, is_active) VALUES ('Bảng giá mặc định', true) RETURNING id INTO version_id;

    SELECT id INTO company_id FROM service_categories WHERE name = 'Công ty';
    
    -- Add items for CA2 (Company)
    SELECT id INTO service_id FROM pricing_services WHERE name = 'Chữ ký số (CA2)' AND category_id = company_id;
    INSERT INTO pricing_items (version_id, service_id, duration, price) VALUES 
    (version_id, service_id, '1 năm', 1793880),
    (version_id, service_id, '2 năm', 2691360),
    (version_id, service_id, '3 năm', 3054240);

    -- Add items for Hóa đơn điện tử (Company)
    SELECT id INTO service_id FROM pricing_services WHERE name = 'Hóa đơn điện tử' AND category_id = company_id;
    INSERT INTO pricing_items (version_id, service_id, duration, price) VALUES 
    (version_id, service_id, '300 số', 800000),
    (version_id, service_id, '500 số', 925000),
    (version_id, service_id, '1000 số', 1175000);
END $$;
