-- SQL for CA2 CRM customers table
DROP TABLE IF EXISTS public.customers;
CREATE TABLE public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    mst TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    service_type TEXT,
    start_date DATE,
    duration TEXT,
    expired_date DATE,
    pdf_url TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    status_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT customers_mst_user_key UNIQUE (mst, user_id) 
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Per-user isolation: each user can only access their own data
CREATE POLICY "Users can view own customers" 
ON public.customers FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers" 
ON public.customers FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers" 
ON public.customers FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers" 
ON public.customers FOR DELETE 
USING (auth.uid() = user_id);

-- Service role bypass: allow backend with service_role key to manage all data
CREATE POLICY "Service role full access"
ON public.customers FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
