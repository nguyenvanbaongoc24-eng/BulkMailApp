-- SQL Bổ sung (Templates & Logs)

-- 1. Tạo bảng mẫu email (templates) 
-- (Sử dụng IF NOT EXISTS, nếu đã có bảng cũ sẽ chạy phần RENAME bên dưới)
CREATE TABLE IF NOT EXISTS public.templates (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Xử lý trường hợp bảng đã tồn tại với tên cột cũ (camelCase)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'userId') THEN
        ALTER TABLE public.templates RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'createdAt') THEN
        ALTER TABLE public.templates RENAME COLUMN "createdAt" TO created_at;
    END IF;
END $$;

-- Bật RLS cho templates
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='templates' AND policyname='Users can manage own templates') THEN
        CREATE POLICY "Users can manage own templates" ON public.templates FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Bổ sung các cột phục vụ báo cáo chi tiết trong email_logs
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS sent_time TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS retry_reason TEXT;
