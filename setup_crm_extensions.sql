-- ============================================================
-- CA2 AUTOMATION PRO – MIGRATION: CRM EXTENSIONS
-- Chạy file này trong Supabase SQL Editor trước khi bật tính năng.
-- Additive only: không sửa/xóa bảng/field hiện có.
-- ============================================================

-- 1. Thêm cột người phụ trách vào bảng customers (nullable, không ảnh hưởng dữ liệu cũ)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index cho filter theo owner
CREATE INDEX IF NOT EXISTS idx_customers_owner_user_id
    ON public.customers(user_id, owner_user_id);

-- 2. Bảng lịch sử tương tác khách hàng
CREATE TABLE IF NOT EXISTS public.customer_interactions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    type         TEXT        NOT NULL DEFAULT 'note', -- 'call', 'email', 'note', 'meeting'
    content      TEXT        NOT NULL,
    created_by   TEXT,       -- tên / email người tạo (lưu snapshot, không JOIN)
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer
    ON public.customer_interactions(customer_id, created_at DESC);

ALTER TABLE public.customer_interactions DISABLE ROW LEVEL SECURITY;

-- 3. Xác minh
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('customers', 'customer_interactions')
  AND column_name IN ('owner_user_id', 'id', 'type', 'content', 'created_by', 'customer_id')
ORDER BY table_name, ordinal_position;
