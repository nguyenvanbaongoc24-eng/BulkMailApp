-- Comprehensive Fix for 'campaigns' and 'email_logs' Tables

-- 1. Ensure 'campaigns' table has all required columns
DO $$ 
BEGIN 
    -- If table doesn't exist, create it
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
        CREATE TABLE public.campaigns (
            id TEXT PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            name TEXT,
            subject TEXT,
            sender_account_id TEXT,
            template TEXT,
            recipients JSONB DEFAULT '[]'::jsonb,
            attach_cert BOOLEAN DEFAULT false,
            status TEXT DEFAULT 'Chờ gửi',
            sent_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            total_recipients INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    ELSE
        -- Add missing columns one by one
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='attach_cert') THEN
            ALTER TABLE public.campaigns ADD COLUMN attach_cert BOOLEAN DEFAULT false;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='sent_count') THEN
            ALTER TABLE public.campaigns ADD COLUMN sent_count INTEGER DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='success_count') THEN
            ALTER TABLE public.campaigns ADD COLUMN success_count INTEGER DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='error_count') THEN
            ALTER TABLE public.campaigns ADD COLUMN error_count INTEGER DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='total_recipients') THEN
            ALTER TABLE public.campaigns ADD COLUMN total_recipients INTEGER DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='created_at') THEN
            ALTER TABLE public.campaigns ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='user_id') THEN
            ALTER TABLE public.campaigns ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 2. Ensure 'email_logs' table has all required columns
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_logs') THEN
        CREATE TABLE public.email_logs (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            campaign_id TEXT,
            customer_id TEXT,
            email TEXT,
            status TEXT,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    ELSE
        -- Add missing columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='error_message') THEN
            ALTER TABLE public.email_logs ADD COLUMN error_message TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='created_at') THEN
            ALTER TABLE public.email_logs ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        END IF;
    END IF;
END $$;

-- 3. Enable RLS (Optional but recommended)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create basic RLS policies if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campaigns' AND policyname='Users can manage own campaigns') THEN
        CREATE POLICY "Users can manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id);
    END IF;
    
    -- email_logs usually related to campaign, but for simplicity let's allow all auth users for now or keep it open for service role
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_logs' AND policyname='Users can view own email logs') THEN
        CREATE POLICY "Users can view own email logs" ON public.email_logs FOR SELECT USING (true); -- Refine later if needed
    END IF;
END $$;
