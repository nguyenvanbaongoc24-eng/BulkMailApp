-- SQL V6: TOTAL FIX - CHUẨN HÓA TOÀN DIỆN & RPC

-- 1. Chuẩn hóa bảng 'campaigns'
DO $$ 
BEGIN
    -- Xử lý userId -> user_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'userId') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'user_id') THEN
            ALTER TABLE public.campaigns RENAME COLUMN "userId" TO user_id;
        ELSE
            -- Nếu cả 2 tồn tại, chỉ cần xóa cột cũ thừa
            ALTER TABLE public.campaigns DROP COLUMN "userId";
        END IF;
    END IF;

    -- Xử lý sentCount -> sent_count
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'sentCount') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'sent_count') THEN
            ALTER TABLE public.campaigns RENAME COLUMN "sentCount" TO sent_count;
        ELSE
            ALTER TABLE public.campaigns DROP COLUMN "sentCount";
        END IF;
    END IF;

    -- Xử lý successCount -> success_count
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'successCount') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'success_count') THEN
            ALTER TABLE public.campaigns RENAME COLUMN "successCount" TO success_count;
        ELSE
            ALTER TABLE public.campaigns DROP COLUMN "successCount";
        END IF;
    END IF;

    -- Xử lý errorCount -> error_count
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'errorCount') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'error_count') THEN
            ALTER TABLE public.campaigns RENAME COLUMN "errorCount" TO error_count;
        ELSE
            ALTER TABLE public.campaigns DROP COLUMN "errorCount";
        END IF;
    END IF;
END $$;

-- 2. Chuẩn hóa bảng 'email_logs'
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'userId') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'user_id') THEN
            ALTER TABLE public.email_logs RENAME COLUMN "userId" TO user_id;
        ELSE
            ALTER TABLE public.email_logs DROP COLUMN "userId";
        END IF;
    END IF;
END $$;

-- 3. Cập nhật RLS Policies sử dụng user_id đồng nhất
DROP POLICY IF EXISTS "Users can manage own campaigns" ON public.campaigns;
CREATE POLICY "Users can manage own campaigns" ON public.campaigns 
FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own logs" ON public.email_logs;
CREATE POLICY "Users can manage own logs" ON public.email_logs 
FOR ALL USING (auth.uid() = user_id);

-- 4. Tạo RPC cập nhật tiến độ chiến dịch
CREATE OR REPLACE FUNCTION increment_campaign_success(campaign_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.campaigns
    SET sent_count = sent_count + 1,
        success_count = success_count + 1
    WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_campaign_error(campaign_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.campaigns
    SET sent_count = sent_count + 1,
        error_count = error_count + 1
    WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC Khôi phục các task bị kẹt (Locking)
CREATE OR REPLACE FUNCTION pick_email_tasks(batch_size INT)
RETURNS SETOF public.email_logs AS $$
DECLARE
    task_record public.email_logs;
BEGIN
    RETURN QUERY
    WITH selected_tasks AS (
        SELECT id FROM public.email_logs
        WHERE status IN ('pending', 'retrying')
          AND (last_retry_time IS NULL OR last_retry_time < now() - interval '5 minutes')
        ORDER BY created_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_logs
    SET status = 'processing',
        last_retry_time = now()
    FROM selected_tasks
    WHERE public.email_logs.id = selected_tasks.id
    RETURNING public.email_logs.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
