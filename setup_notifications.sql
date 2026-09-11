-- ============================================
-- CA2 AUTOMATION PRO - MIGRATION: NOTIFICATIONS & TASKS
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. BẢNG THÔNG BÁO (NOTIFICATIONS)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,           -- 'crm_expiry', 'campaign_error', 'task_reminder', v.v.
    title TEXT NOT NULL,          -- Tiêu đề ngắn gọn
    message TEXT,                 -- Nội dung chi tiết
    ref_id TEXT,                  -- ID tham chiếu (Mã số thuế, ID chiến dịch, ID task...)
    is_read BOOLEAN DEFAULT false,-- Trạng thái đã đọc
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index tối ưu truy vấn thông báo theo user và trạng thái chưa đọc
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON public.notifications(user_id, is_read, created_at DESC);

-- Tắt RLS để đồng bộ với cơ chế xác thực nội bộ của CA2 Tool (Backend Express xử lý quyền qua Bearer token)
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;


-- 2. BẢNG CÔNG VIỆC BÁO CÁO TUẦN (WEEKLY TASKS - OPTIONAL SYNC)
CREATE TABLE IF NOT EXISTS public.weekly_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_done BOOLEAN DEFAULT false,
    due_date DATE,
    task_type TEXT DEFAULT 'next_week', -- 'this_week' hoặc 'next_week'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_tasks_user 
    ON public.weekly_tasks(user_id, due_date);

ALTER TABLE public.weekly_tasks DISABLE ROW LEVEL SECURITY;


-- 3. XÁC MINH SCHEMA
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('notifications', 'weekly_tasks')
ORDER BY table_name, ordinal_position;
