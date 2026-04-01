-- ============================================
-- CA2 AUTOMATION PRO - SUPABASE SETUP SQL
-- Copy toàn bộ nội dung này vào Supabase SQL Editor rồi nhấn RUN
-- ============================================

-- 1. ADD MISSING COLUMNS to certificates table
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_status TEXT DEFAULT 'pending';
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. DISABLE RLS on certificates (cho Desktop Tool ghi dữ liệu)
ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;

-- 3. DISABLE RLS on customers (cho Desktop Tool sync dữ liệu)
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- 4. CREATE STORAGE BUCKET "certificates"
-- (Bucket phải tạo qua Dashboard: Storage > New Bucket > name: certificates > Public: ON)
-- SQL không thể tạo storage bucket trực tiếp.
-- Nhưng có thể insert vào bảng nội bộ:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificates', 'certificates', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. STORAGE POLICY: Cho phép tất cả upload/download
-- Allow public read
CREATE POLICY "Public Read certificates" ON storage.objects
  FOR SELECT USING (bucket_id = 'certificates');

-- Allow anon upload
CREATE POLICY "Allow anon upload certificates" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'certificates');

-- Allow anon update (upsert)
CREATE POLICY "Allow anon update certificates" ON storage.objects
  FOR UPDATE USING (bucket_id = 'certificates');

-- Allow anon delete
CREATE POLICY "Allow anon delete certificates" ON storage.objects
  FOR DELETE USING (bucket_id = 'certificates');

-- 6. VERIFY
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'certificates' ORDER BY ordinal_position;
