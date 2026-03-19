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
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Allow multiple records per MST if they are different services or for different users
    -- If you want strictly one MST per system, use UNIQUE(mst)
    CONSTRAINT customers_mst_user_key UNIQUE (mst, user_id) 
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own customers" 
ON public.customers FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own customers" 
ON public.customers FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers" 
ON public.customers FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customers" 
ON public.customers FOR DELETE 
USING (auth.uid() = user_id);
