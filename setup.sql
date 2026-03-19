-- 1. Create the 'certificates' table
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    mst TEXT NOT NULL UNIQUE, -- Added UNIQUE for upsert
    company_name TEXT,
    serial TEXT,
    expiration_date DATE,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Create policies for the 'certificates' table
-- (Replace auth.uid() = user_id with your actual auth logic if needed)
CREATE POLICY "Users can view their own certificates" 
ON public.certificates FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own certificates" 
ON public.certificates FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own certificates" 
ON public.certificates FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own certificates" 
ON public.certificates FOR DELETE 
USING (auth.uid() = user_id);

-- 2. Create the 'pdfs' bucket (Public)
-- This SQL inserts the bucket metadata into the storage.buckets table.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for 'pdfs' bucket
-- Public Access (Read)
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'pdfs');

-- Authenticated users can upload (Insert)
CREATE POLICY "Authenticated users can upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'pdfs' AND auth.role() = 'authenticated');

-- Authenticated users can delete their own files (Optional)
CREATE POLICY "Users can delete their own pdfs" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'pdfs' AND auth.uid() = (storage.foldername(name))[1]::uuid);
