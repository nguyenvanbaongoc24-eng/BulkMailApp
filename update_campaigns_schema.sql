-- 1. Update 'campaigns' table schema
DO $$ 
BEGIN 
    -- Add attach_cert if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='attach_cert') THEN
        ALTER TABLE public.campaigns ADD COLUMN attach_cert BOOLEAN DEFAULT false;
    END IF;

    -- Add statistical columns if missing (to ensure real-time tracking works)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='sent_count') THEN
        ALTER TABLE public.campaigns ADD COLUMN sent_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='success_count') THEN
        ALTER TABLE public.campaigns ADD COLUMN success_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='error_count') THEN
        ALTER TABLE public.campaigns ADD COLUMN error_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='total_recipients') THEN
        ALTER TABLE public.campaigns ADD COLUMN total_recipients INTEGER DEFAULT 0;
    END IF;
    
    -- Ensure recipients is jsonb
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='recipients') THEN
        ALTER TABLE public.campaigns ADD COLUMN recipients JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 2. Update 'email_logs' table schema
DO $$ 
BEGIN 
    -- Ensure table exists
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
        -- Add error_message if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_logs' AND column_name='error_message') THEN
            ALTER TABLE public.email_logs ADD COLUMN error_message TEXT;
        END IF;
    END IF;
END $$;
