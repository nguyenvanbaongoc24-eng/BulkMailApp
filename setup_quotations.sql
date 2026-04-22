-- ============================================
-- SETUP QUOTATIONS MODULE (ENHANCED SCHEMA)
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create the quotations table with full tracking
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    mst TEXT,
    service TEXT,
    package_id TEXT,
    duration TEXT,
    quantity NUMERIC DEFAULT 0,
    price NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Disable RLS for quotations (to match the project's internal tool pattern)
ALTER TABLE public.quotations DISABLE ROW LEVEL SECURITY;

-- 3. Initialize the storage bucket "marketing-docs"
-- Bucket must be public to allow URL generation
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketing-docs', 'marketing-docs', true, 10485760, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Storage Policies for marketing-docs
-- Allow public read so the generated links work
CREATE POLICY "Public Read marketing-docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketing-docs');

-- Allow authenticated users to perform operations
CREATE POLICY "Allow auth operations marketing-docs" ON storage.objects
  FOR ALL USING (bucket_id = 'marketing-docs');

-- 5. Verification
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'quotations';
