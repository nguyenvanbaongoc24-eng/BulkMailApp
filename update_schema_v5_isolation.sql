-- SQL V5: BẢO MẬT & CÔ LẬP DỮ LIỆU (ISOLATION)

-- 1. Chuẩn hóa bảng 'senders' (Tài khoản gửi mail)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'userId') THEN
        ALTER TABLE public.senders RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'createdAt') THEN
        ALTER TABLE public.senders RENAME COLUMN "createdAt" TO created_at;
    END IF;
END $$;

-- 2. Đảm bảo 'email_logs' có 'user_id'
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Bật Row Level Security (RLS) cho TẤT CẢ các bảng
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senders ENABLE ROW LEVEL SECURITY;

-- 4. Tạo chính sách RLS (Xóa cũ tạo mới để đảm bảo chính xác)
-- Lưu ý: Chính sách này chỉ cho phép User truy cập dữ liệu có user_id trùng với ID của họ

-- Campaigns
DROP POLICY IF EXISTS "Users can manage own campaigns" ON public.campaigns;
CREATE POLICY "Users can manage own campaigns" ON public.campaigns 
FOR ALL USING (auth.uid() = user_id);

-- Email Logs
DROP POLICY IF EXISTS "Users can manage own logs" ON public.email_logs;
CREATE POLICY "Users can manage own logs" ON public.email_logs 
FOR ALL USING (auth.uid() = user_id);

-- Customers (CA2 CRM)
DROP POLICY IF EXISTS "Users can manage own customers" ON public.customers;
CREATE POLICY "Users can manage own customers" ON public.customers 
FOR ALL USING (auth.uid() = user_id);

-- Templates
DROP POLICY IF EXISTS "Users can manage own templates" ON public.templates;
CREATE POLICY "Users can manage own templates" ON public.templates 
FOR ALL USING (auth.uid() = user_id);

-- Senders
DROP POLICY IF EXISTS "Users can manage own senders" ON public.senders;
CREATE POLICY "Users can manage own senders" ON public.senders 
FOR ALL USING (auth.uid() = user_id);

-- 5. Cho phép Service Role truy cập không giới hạn (Quan trọng cho Worker ngầm)
-- Mặc định Service Role của Supabase đã vượt qua RLS.
