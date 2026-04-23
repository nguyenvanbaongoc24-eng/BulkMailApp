-- ============================================
-- CRM SERVICE PRICING SYSTEM SETUP
-- ============================================

-- 1. Create table for service pricing
CREATE TABLE IF NOT EXISTS service_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL,
    package_name TEXT NOT NULL,
    duration_months INTEGER NOT NULL,
    price DECIMAL(15, 0) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) -- Track who last updated
);

-- 2. Add sample data based on previous hardcoded list
INSERT INTO service_pricing (service_name, package_name, duration_months, price) VALUES
('CKS – Cấp mới', 'Công ty 12 tháng', 12, 1793880),
('CKS – Cấp mới', 'Công ty 24 tháng', 24, 2691360),
('CKS – Cấp mới', 'Công ty 36 tháng', 36, 3054240),
('CKS – Cấp mới', 'Cá nhân 12 tháng', 12, 1069200),
('Hóa đơn điện tử', '300 tờ', 0, 800000),
('Hóa đơn điện tử', '500 tờ', 0, 925000),
('Hóa đơn điện tử', '1000 tờ', 0, 1175000);

-- 3. Enable RLS
ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Everyone can read
CREATE POLICY "Public read pricing" ON service_pricing FOR SELECT USING (true);

-- Only admins/authenticated can modify (logic handled in server.js for now)
CREATE POLICY "Auth modify pricing" ON service_pricing FOR ALL USING (auth.uid() IS NOT NULL);
