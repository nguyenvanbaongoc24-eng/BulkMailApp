-- ============================================
-- CA2 AUTOMATION PRO - SEO MODULE DB SETUP SQL
-- Copy toàn bộ nội dung này vào Supabase SQL Editor rồi nhấn RUN
-- ============================================

-- 1. Bảng lưu trữ bản tin Thuế crawl được
CREATE TABLE IF NOT EXISTS tax_news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    source TEXT,
    url TEXT UNIQUE NOT NULL,
    publish_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bảng lưu trữ bài viết SEO
CREATE TABLE IF NOT EXISTS seo_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    keyword TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Bảng lưu trữ hình ảnh AI
CREATE TABLE IF NOT EXISTS seo_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Disable RLS để Desktop / Node Worker ghi dữ liệu dễ dàng (như các bảng khác)
ALTER TABLE tax_news DISABLE ROW LEVEL SECURITY;
ALTER TABLE seo_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE seo_images DISABLE ROW LEVEL SECURITY;

-- 5. Tạo index để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_tax_news_url ON tax_news(url);
CREATE INDEX IF NOT EXISTS idx_seo_posts_user_id ON seo_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_seo_images_user_id ON seo_images(user_id);
