-- Chạy lệnh SQL này trong Supabase SQL Editor (Dashboard > SQL Editor)
-- Lệnh này sẽ xóa ràng buộc duy nhất ngăn chặn việc thêm cùng một dịch vụ cho cùng một khách hàng (MST).
-- Từ đó, CRM sẽ cho phép thêm nhiều sản phẩm/dịch vụ tương tự hoặc giống nhau cho cùng một khách hàng.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_mst_user_service_key;
