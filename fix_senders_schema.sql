-- SQL: FIX SENDERS TABLE SCHEMA
DO $$ 
BEGIN
    -- 1. Rename userId to user_id for consistency
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'userId') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'user_id') THEN
            ALTER TABLE public.senders RENAME COLUMN "userId" TO user_id;
        ELSE
            ALTER TABLE public.senders DROP COLUMN "userId";
        END IF;
    END IF;

    -- 2. Add SMTP columns if they are missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'smtpHost') THEN
        ALTER TABLE public.senders ADD COLUMN "smtpHost" TEXT DEFAULT 'smtp.gmail.com';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'smtpPort') THEN
        ALTER TABLE public.senders ADD COLUMN "smtpPort" INTEGER DEFAULT 587;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'smtpUser') THEN
        ALTER TABLE public.senders ADD COLUMN "smtpUser" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'smtpPassword') THEN
        ALTER TABLE public.senders ADD COLUMN "smtpPassword" TEXT;
    END IF;

    -- 3. Update RLS Policy for 'senders'
    DROP POLICY IF EXISTS "Users can manage own senders" ON public.senders;
    CREATE POLICY "Users can manage own senders" ON public.senders 
    FOR ALL USING (auth.uid() = user_id);
    
    ALTER TABLE public.senders ENABLE ROW LEVEL SECURITY;
END $$;
