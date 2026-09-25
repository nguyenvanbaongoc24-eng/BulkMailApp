# PROMPT CHO ANTIGRAVITY — Bổ sung tính năng CRM khách hàng (Automation CA2)

## Bối cảnh
Hệ thống Automation CA2 đang chạy ổn định trên Render, backend Supabase. Tôi muốn **CHỈ THÊM** các tính năng mới cho phần "Quản lý Khách hàng" (CRM) bên dưới, **TUYỆT ĐỐI KHÔNG chỉnh sửa, refactor, đổi tên, hay động vào logic/code của các tính năng hiện có đang hoạt động tốt** (bảng khách hàng, bộ lọc dịch vụ/năm/tháng, xuất Excel, gửi mail từ CRM, các module khác như Email Campaign, Báo giá, SEO AI...).

## Nguyên tắc bắt buộc
1. **Additive only**: chỉ tạo file/component/hàm mới, hoặc thêm đoạn code mới vào cuối các file liên quan (không sửa dòng code cũ, không xoá field/logic cũ).
2. Nếu cần chèn UI mới vào trang CRM hiện có (ô tìm kiếm, tab lịch sử, badge người phụ trách), chỉ thêm component mới và render nó ở vị trí hợp lý, không thay đổi cấu trúc bảng/filter cũ đang chạy.
3. Không đổi tên bảng/field Supabase đang dùng cho khách hàng. Nếu cần bảng mới (ví dụ `customer_notes`, `customer_interactions`), tạo bảng riêng có khoá ngoại (foreign key) trỏ tới bảng khách hàng hiện tại — không ALTER cấu trúc bảng cũ trừ khi bắt buộc phải thêm cột optional (nullable, có default, không ảnh hưởng dữ liệu cũ).
4. Giữ nguyên style/theme (Dark/Light mode) và cách bảng dữ liệu đang hiển thị hiện tại.
5. Sau khi code xong, liệt kê rõ: file nào MỚI tạo, file nào có SỬA (chỉ nêu đoạn thêm vào, không có dòng xoá/sửa logic cũ).
6. Nếu phát hiện tính năng mới có thể xung đột với code cũ (ví dụ field trùng tên, filter cũ bị ảnh hưởng), DỪNG LẠI và hỏi tôi trước, không tự ý sửa code cũ để "cho chạy được".

---

## Tính năng cần thêm

### 1. Ô tìm kiếm nhanh (Quick Search)
- Thêm 1 ô input tìm kiếm ở đầu bảng "Quản lý Khách hàng" (cạnh các bộ lọc dịch vụ/năm/tháng hiện có, không thay thế chúng).
- Tìm theo: Tên công ty/khách hàng, Mã số thuế (MST), Số điện thoại — tìm gần đúng (LIKE/ILIKE), không phân biệt hoa thường, không dấu (nếu dữ liệu có dấu tiếng Việt thì nên chuẩn hoá bỏ dấu khi so khớp).
- Kết quả tìm kiếm kết hợp AND với các bộ lọc hiện có (dịch vụ, năm, tháng) — nghĩa là tìm kiếm hoạt động cùng lúc với filter cũ, không thay thế logic filter cũ.
- Debounce 300-500ms khi gõ để tránh gọi query liên tục.

### 2. Lịch sử tương tác khách hàng (Customer Interaction Log)
- Thêm 1 bảng mới `customer_interactions` (id, customer_id FK, type [call/email/note/meeting], content, created_by, created_at).
- Trong màn hình chi tiết khách hàng (hoặc thêm 1 nút "Lịch sử" mới trên mỗi dòng khách hàng trong bảng — dùng modal/drawer mới, không sửa modal "Lưu & Cập nhật" khách hàng hiện có), hiển thị:
  - Timeline các tương tác, mới nhất lên đầu.
  - Form thêm nhanh 1 ghi chú/cuộc gọi mới (chọn loại: Gọi điện / Gửi email / Ghi chú / Gặp mặt + nội dung).
- Tự động log 1 dòng "Gửi email" vào bảng này khi 1 email campaign gửi thành công tới khách hàng đó — chỉ đọc thêm sự kiện, KHÔNG sửa luồng gửi email hiện có, chỉ hook thêm 1 lệnh insert sau khi gửi thành công (nếu điểm hook này rủi ro ảnh hưởng luồng cũ, dừng lại và hỏi tôi).

### 3. Gắn nhân viên phụ trách (Owner) cho khách hàng
- Thêm cột mới optional `owner_user_id` (nullable) vào bảng khách hàng hiện có (migration ALTER TABLE ADD COLUMN, không ảnh hưởng dữ liệu cũ vì nullable).
- Thêm dropdown chọn "Người phụ trách" trong modal thêm/sửa khách hàng — chèn thêm 1 field mới vào form hiện có mà KHÔNG xoá/sửa các field cũ trong form đó.
- Thêm badge/tên người phụ trách hiển thị trên mỗi dòng trong bảng khách hàng (thêm 1 cột mới trong bảng, không sửa cột cũ).
- Thêm bộ lọc mới "Theo người phụ trách" cạnh các bộ lọc hiện có (dịch vụ/năm/tháng) — hoạt động độc lập, kết hợp AND với filter cũ.
- Về phân quyền hiển thị (ví dụ Staff chỉ thấy khách của mình): CHỈ đề xuất, không tự động implement ở bước này nếu hệ thống phân quyền hiện tại chưa rõ ràng — hỏi tôi xác nhận trước.

---

## Yêu cầu kỹ thuật
- Kiểm tra kỹ cấu trúc project hiện tại (tên bảng khách hàng thật, tên các field đang dùng, cách query/filter hiện có) trước khi viết code, để tránh trùng tên hoặc phá vỡ query cũ.
- Viết code rõ ràng, có comment tiếng Việt ngắn gọn cho phần mới thêm.
- Test kỹ: sau khi thêm tính năng, các luồng cũ (thêm/sửa khách hàng, lọc theo dịch vụ/năm/tháng, xuất Excel, gửi mail từ CRM) phải chạy y như trước, không có side effect hay lỗi field thiếu.
- Cung cấp migration SQL riêng cho bảng `customer_interactions` và cột `owner_user_id` để tôi review trước khi chạy trên Supabase production.

## Output mong muốn
1. Danh sách file mới tạo.
2. Danh sách file có thêm code (kèm đoạn code thêm vào, không phải toàn bộ file).
3. Migration SQL.
4. Hướng dẫn ngắn cách bật/tắt tính năng nếu cần rollback nhanh.
