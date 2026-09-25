# PROMPT CHO ANTIGRAVITY — Áp dụng phong cách UI "Dark Admin Dashboard" (tham khảo MyPanel) cho Automation CA2

## Bối cảnh
Tôi muốn nâng cấp giao diện tổng thể của Automation CA2 theo phong cách **Dark-mode Sidebar Admin Dashboard** — lấy cảm hứng từ các control panel như MyPanel/aaPanel/1Panel: sidebar cố định bên trái dùng outline icon (kiểu Lucide/Tabler), nội dung chính dạng card-based, biểu đồ line chart mảnh, status indicator dạng chấm màu + text.

Đây là thay đổi **về mặt hiển thị (visual/UI)**, không phải thêm tính năng mới. Vì vậy phạm vi khác với các prompt trước: lần này ĐƯỢC PHÉP chỉnh sửa các file UI/CSS/component hiện có, nhưng phải tuân thủ nghiêm ngặt nguyên tắc bên dưới để không làm hỏng chức năng.

## Nguyên tắc bắt buộc — CỰC KỲ QUAN TRỌNG
1. **Chỉ đổi phần hiển thị (UI/CSS/markup/icon), TUYỆT ĐỐI KHÔNG đổi logic nghiệp vụ**: không sửa hàm xử lý dữ liệu, không đổi API call, không đổi cấu trúc state, không đổi luồng xử lý của CRM/Email Campaign/Báo giá/SEO AI/Notification.
2. **Làm từng bước nhỏ, không đại tu toàn bộ 1 lần**:
   - Bước 1: Đổi bộ icon (icon set) trước — giữ nguyên layout, chỉ thay icon cũ bằng icon mới cùng vị trí, cùng kích thước tương đối.
   - Bước 2: Sau khi icon chạy ổn, mới điều chỉnh layout sidebar (spacing, active state, hover state) cho giống phong cách tham khảo.
   - Bước 3: Sau đó mới điều chỉnh style card ở khu vực nội dung chính (bo góc, độ tương phản nền, shadow).
   - Dừng lại sau mỗi bước để tôi xác nhận trước khi làm bước tiếp theo.
3. **Backup/rollback dễ dàng**: trước khi sửa, tạo 1 branch/nhánh riêng (hoặc git commit riêng) cho phần restyle này, để có thể rollback nhanh nếu có vấn đề, không merge trực tiếp vào code đang chạy production.
4. **Không đổi cấu trúc route/URL, không đổi tên component/props hiện có** — chỉ đổi phần render UI bên trong, để không ảnh hưởng tới các chỗ khác đang import/sử dụng các component đó.
5. Kiểm tra kỹ: font, spacing, breakpoint responsive sau khi đổi vẫn hoạt động tốt trên cả desktop/tablet/mobile.

---

## Chi tiết cần thay đổi

### 1. Bộ icon (Icon Set)
- Thay toàn bộ icon hiện tại trong sidebar và các khu vực chính bằng bộ **outline icon nét mảnh, bo góc nhẹ**, phong cách giống **Lucide Icons** (ưu tiên vì nhẹ, tree-shakable, nhiều icon, license MIT) hoặc **Tabler Icons** nếu Lucide thiếu icon cần dùng.
- Nếu project chưa có `lucide-react` (hoặc tương đương với framework đang dùng), đề xuất thêm dependency này — hỏi tôi xác nhận trước khi cài.
- Map lại từng icon cũ sang icon mới tương ứng theo đúng ngữ nghĩa (ví dụ: icon "Tổng quan/Dashboard" → `LayoutDashboard`, "Khách hàng/CRM" → `Users`, "Email Campaign" → `Mail`, "Báo giá" → `FileText`, "Cài đặt" → `Settings`, "Thông báo" → `Bell`, "Cơ sở dữ liệu" nếu có → `Database`...).
- Giữ nguyên kích thước icon hiện tại (không phóng to/thu nhỏ đột ngột làm lệch layout).

### 2. Layout Sidebar
- Giữ cấu trúc sidebar cố định bên trái (dark background, ví dụ tông `#0f0f14` hoặc gần với theme dark hiện tại của tool).
- Mỗi mục menu: icon outline + label, khi active (đang ở trang đó) có:
  - Nền highlight nhẹ (ví dụ tím/xanh nhạt với opacity thấp, giống thanh active trong ảnh tham khảo).
  - Icon + text đổi màu sáng hơn so với trạng thái không active.
- Hover state: nền sáng nhẹ hơn nền sidebar, transition mượt (150-200ms).
- Giữ nguyên phần footer sidebar hiện có (trạng thái hệ thống dạng chấm màu + text, ví dụ "Hoạt động ổn định" — nếu tool đã có sẵn khái niệm tương tự thì tái sử dụng, không tạo trùng).
- Có thể nhóm menu theo section nếu danh sách quá dài (ví dụ thêm 1 divider nhẹ giữa nhóm "Quản lý" và nhóm "Công cụ AI") — chỉ thêm divider UI, không đổi thứ tự chức năng.

### 3. Card-based Layout cho nội dung chính
- Các khối thông tin trên Dashboard/CRM/Báo giá... trình bày dạng card: nền tối hơn/khác nhẹ so với nền chính, bo góc (`border-radius` khoảng 12-16px), padding thoáng, có thể thêm shadow nhẹ hoặc border 1px mờ để phân tách card với nền.
- Biểu đồ (nếu có, như biểu đồ doanh thu/tỷ lệ gia hạn đã thêm ở phần Dashboard trước đó) giữ nguyên logic vẽ, chỉ chỉnh style: line/bar mảnh hơn, màu sắc theo palette tham khảo (tím/xanh dương nổi bật trên nền tối).
- Progress bar ngang (nếu áp dụng cho các chỉ số dạng tỷ lệ, ví dụ tỷ lệ gia hạn hợp đồng) style theo dạng thanh ngang mảnh, bo tròn 2 đầu, màu gradient hoặc solid theo palette chính.
- Status indicator (chấm màu + text) dùng nhất quán ở các nơi có trạng thái (ví dụ trạng thái gửi email, trạng thái hợp đồng...).

### 4. Bảng màu & Typography tham khảo
- Nền chính: đen/xám rất đậm (gần `#0a0a0f` – `#121218`).
- Nền card: tối hơn nền chính 1 chút hoặc có viền mờ để phân tách (ví dụ `#16161d` + border `rgba(255,255,255,0.06)`).
- Màu nhấn (accent) chính: tím (`#7c3aed`-ish) hoặc theo màu thương hiệu hiện tại của Automation CA2 nếu đã có — ưu tiên giữ màu thương hiệu cũ nếu tool đã có palette riêng, chỉ áp dụng tông tối/sáng theo phong cách tham khảo.
- Font: giữ font hiện tại của hệ thống nếu đã đẹp/dễ đọc, không nhất thiết đổi font chỉ vì đổi style.

---

## Yêu cầu kỹ thuật
- Trước khi code, liệt kê toàn bộ nơi đang dùng icon cũ (danh sách file/component) để tôi biết phạm vi ảnh hưởng.
- Ưu tiên tạo 1 file config/theme tập trung (ví dụ `theme.ts` hoặc `iconMap.ts`) để dễ maintain, thay vì hardcode rải rác — nhưng nếu project hiện tại chưa có pattern này, đề xuất cách làm và hỏi tôi trước khi tái cấu trúc.
- Không được xoá icon cũ khỏi project nếu chưa chắc chắn không còn nơi nào dùng — kiểm tra kỹ trước khi xoá dependency icon cũ.

## Output mong muốn (theo từng bước)
1. **Bước 1 (Icon)**: danh sách mapping icon cũ → icon mới, danh sách file bị ảnh hưởng, screenshot/mô tả trước-sau nếu có thể.
2. **Bước 2 (Sidebar layout)**: mô tả thay đổi CSS/style, đảm bảo responsive vẫn ổn.
3. **Bước 3 (Card layout)**: mô tả thay đổi, đảm bảo không phá vỡ dữ liệu/biểu đồ đang hiển thị đúng.
4. Sau mỗi bước, dừng lại chờ tôi xác nhận "OK, tiếp tục" trước khi làm bước kế tiếp.
