# CA2 Bulk Mail Automation

Hệ thống gửi email tự động (Bulk Mail) hỗ trợ Gmail API (OAuth2) và đính kèm chứng thư số tự động.

## 🚀 Tính năng chính
- **Gmail API Integration:** Gửi email an toàn qua OAuth2, tránh bị khóa tài khoản như SMTP truyền thống.
- **Auto-attachment:** Tự động lấy file PDF chứng thư từ Supabase Storage và đính kèm vào email.
- **Worker System:** Xử lý hàng đợi email chạy ngầm, hỗ trợ retry tự động khi gặp lỗi mạng.
- **Dashboard:** Quản lý chiến dịch, theo dõi tỷ lệ gửi thành công/lỗi trong thời gian thực.

## 🛠 Tech Stack
- **Backend:** Node.js, Express
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Email:** Google APIs (Gmail V1)
- **Frontend:** Vanila JS + CSS (Sleek UI)

## 🔧 Sửa lỗi Gmail API (Cập nhật mới nhất)
Hệ thống đã được xử lý các lỗi "silent failure" khi gửi mail:
1. **Graceful PDF Skip:** Nếu bật đính kèm nhưng không tìm thấy file PDF của khách hàng, hệ thống sẽ tự động gửi email nội dung thuần thay vì dừng xử lý.
2. **Comprehensive Logging:** Bổ sung log chi tiết từng bước (Step 1-6) trong Worker để dễ dàng trace lỗi trên Render/GitHub.
3. **OAuth2 Hardening:** Cơ chế tự động làm mới Access Token từ Refresh Token được tối ưu hóa.

## 📦 Triển khai
Dự án được cấu hình để chạy trên **Render.com** với kịch bản build tối ưu cho Puppeteer và Node.js.

---
© 2026 Nacencomm - CA 2. Digital
