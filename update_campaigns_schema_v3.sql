-- SQL Cập nhật (V3 - CUỐI CÙNG)
-- Chạy đoạn mã này trong SQL Editor của Supabase để sửa lỗi thiếu cột

DO $$ 
BEGIN 
    -- 1. Nếu chưa có bảng campaigns, tạo mới hoàn toàn
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
        -- 2. Nếu bảng đã tồn tại, kiểm tra và thêm TỪNG cột một nếu thiếu
        
        -- Thông tin cơ bản
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='name') THEN
            ALTER TABLE public.campaigns ADD COLUMN name TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='subject') THEN
            ALTER TABLE public.campaigns ADD COLUMN subject TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='sender_account_id') THEN
            ALTER TABLE public.campaigns ADD COLUMN sender_account_id TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='template') THEN
            ALTER TABLE public.campaigns ADD COLUMN template TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='recipients') THEN
            ALTER TABLE public.campaigns ADD COLUMN recipients JSONB DEFAULT '[]'::jsonb;
        END IF;

        -- Cấu hình & Trạng thái
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='attach_cert') THEN
            ALTER TABLE public.campaigns ADD COLUMN attach_cert BOOLEAN DEFAULT false;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='status') THEN
            ALTER TABLE public.campaigns ADD COLUMN status TEXT DEFAULT 'Chờ gửi';
        END IF;

        -- Thống kê
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

        -- Hệ thống
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='created_at') THEN
            ALTER TABLE public.campaigns ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='user_id') THEN
            ALTER TABLE public.campaigns ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 3. Đảm bảo bảng 'email_logs' có đầy đủ các cột
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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='error_message') THEN
            ALTER TABLE public.email_logs ADD COLUMN error_message TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='created_at') THEN
            ALTER TABLE public.email_logs ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='campaign_id') THEN
            ALTER TABLE public.email_logs ADD COLUMN campaign_id TEXT;
        END IF;
    END IF;
END $$;

-- 4. Bật RLS và cấp quyền cho User
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campaigns' AND policyname='Users can manage own campaigns') THEN
        CREATE POLICY "Users can manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_logs' AND policyname='Service role full access logs') THEN
       CREATE POLICY "Service role full access logs" ON public.email_logs FOR ALL USING (true);
    END IF;
END $$;
