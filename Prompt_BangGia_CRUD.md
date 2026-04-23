# Prompt cho Antigravity – Cập nhật đầy đủ Bảng giá CA2 + Tính năng Sửa/Xóa/Cập nhật

## MỤC TIÊU
1. Cập nhật **toàn bộ dữ liệu bảng giá** còn thiếu vào hệ thống (dựa trên báo giá chính thức ngày 18/07/2025)
2. Xây dựng tính năng **CRUD** (Thêm / Sửa / Xóa / Cập nhật) cho bảng giá trong giao diện quản trị

---

## PHẦN 1 – DỮ LIỆU BÁO GIÁ ĐẦY ĐỦ CẦN CẬP NHẬT

### CẤU TRÚC DỮ LIỆU MỖI GÓI

Mỗi gói giá gồm các trường:
```
id, nhom_san_pham, loai_doi_tuong, loai_giao_dich, ma_san_pham,
goi_cuoc, phi_dv, tien_token, vat, thanh_tien, ghi_chu
```

---

### A. CHỮ KÝ SỐ CA2 TOKEN (CKS)

#### A1. Tổ chức / Doanh nghiệp – Cấp mới

| Mã SP | Gói | Phí DV | Token | VAT | Thành tiền | Ghi chú |
|-------|-----|--------|-------|-----|-----------|---------|
| CKS-DN-NEW-12 | 12 tháng | 1.161.000 | 500.000 | 132.880 | 1.793.880 | |
| CKS-DN-NEW-24 | 24 tháng | 1.992.000 | 500.000 | 199.360 | 2.691.360 | |
| CKS-DN-NEW-36 | 36 tháng | 2.828.000 | 0 | 226.240 | 3.054.240 | Miễn phí Token |

#### A2. Tổ chức / Doanh nghiệp – Gia hạn

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| CKS-DN-RNW-12 | 12 tháng | 1.161.000 | 92.880 | 1.253.880 |
| CKS-DN-RNW-24 | 24 tháng | 1.992.000 | 159.360 | 2.151.360 |
| CKS-DN-RNW-36 | 36 tháng | 2.643.000 | 211.440 | 2.854.440 |

#### A3. Cá nhân / Cá nhân thuộc tổ chức / Hộ KD – Cấp mới

| Mã SP | Gói | Phí DV | Token | VAT | Thành tiền | Ghi chú |
|-------|-----|--------|-------|-----|-----------|---------|
| CKS-CN-NEW-12 | 12 tháng | 490.000 | 500.000 | 79.200 | 1.069.200 | |
| CKS-CN-NEW-24 | 24 tháng | 890.000 | 500.000 | 111.200 | 1.501.200 | |
| CKS-CN-NEW-36 | 36 tháng | 1.800.000 | 0 | 144.000 | 1.944.000 | Miễn phí Token |

#### A4. Cá nhân / Hộ KD – Gia hạn

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| CKS-CN-RNW-12 | 12 tháng | 490.000 | 39.200 | 529.200 |
| CKS-CN-RNW-24 | 24 tháng | 890.000 | 71.200 | 961.200 |
| CKS-CN-RNW-36 | 36 tháng | 1.300.000 | 104.000 | 1.404.000 |

---

### B. CHỮ KÝ SỐ TỪ XA CA2 REMOTE SIGNING (RS)

> Không phí khởi tạo. Không có giá gia hạn – khách gia hạn mua theo gói niêm yết.

#### B1. RS Cá nhân (RS-CN)

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| RS-CN1m | 1 tháng | 31.800 | 2.544 | 34.344 |
| RS-CN3m | 3 tháng | 59.000 | 4.720 | 63.720 |
| RS-CN6m | 6 tháng | 100.000 | 8.000 | 108.000 |
| RS-CN1y | 1 năm | 181.800 | 14.544 | 196.344 |
| RS-CN2y | 2 năm | 345.500 | 27.640 | 373.140 |
| RS-CN3y | 3 năm | 491.000 | 39.280 | 530.280 |

#### B2. RS Cá nhân thuộc tổ chức (RS-CNTC)

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| RS-CNTC1y | 1 năm | 318.000 | 25.440 | 343.440 |
| RS-CNTC2y | 2 năm | 564.000 | 45.120 | 609.120 |
| RS-CNTC3y | 3 năm | 764.000 | 61.120 | 825.120 |

#### B3. RS Hộ Kinh Doanh (RS-HKD)

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| RS-HKD1y | 1 năm | 318.000 | 25.440 | 343.440 |
| RS-HKD2y | 2 năm | 564.000 | 45.120 | 609.120 |
| RS-HKD3y | 3 năm | 764.000 | 61.120 | 825.120 |

#### B4. RS Tổ chức / Doanh nghiệp (RS-DN)

| Mã SP | Gói | Phí DV | VAT | Thành tiền |
|-------|-----|--------|-----|-----------|
| RS-DN1y | 1 năm | 1.136.000 | 90.880 | 1.226.880 |
| RS-DN2y | 2 năm | 2.000.000 | 160.000 | 2.160.000 |
| RS-DN3y | 3 năm | 2.637.000 | 210.960 | 2.847.960 |

#### B5. RS theo lượt – Cá nhân

| Mã SP | Mô tả | Phí DV | VAT | Thành tiền | Ghi chú |
|-------|-------|--------|-----|-----------|---------|
| RS-C10 | Ký 10 lần/tháng | 18.000 | 1.440 | 19.440 | ~1.944đ/lần |

---

### C. CA2 SIGN PLATFORM (CA2-SP)

> Phần mềm không chịu thuế VAT. SP-Lite được dùng vĩnh viễn.
> Khi số HĐ vượt ngưỡng: tính theo đơn giá Tier đó hoặc nâng gói.

| Mã SP | Số HĐ | Đơn giá/HĐ | Thành tiền |
|-------|-------|-----------|-----------|
| SP-Lite | 10 | 0 | 0 |
| SP-100 | 100 | 2.500 | 250.000 |
| SP-300 | 300 | 2.300 | 690.000 |
| SP-500 | 500 | 2.200 | 1.110.000 |
| SP-1000 | 1.000 | 2.100 | 2.100.000 |
| SP-2000 | 2.000 | 2.000 | 4.000.000 |
| SP-5000 | 5.000 | 1.900 | 9.500.000 |
| SP-MAX | ≥10.000 | 1.500 | Tính theo số HĐ vượt |

---

### D. HÓA ĐƠN ĐIỆN TỬ CA2-EINVOICE

> Phần mềm không chịu thuế VAT.

#### D1. Gói theo số tờ (bao gồm phí PM 500.000đ)

| Mã SP | Số tờ | Đơn giá/tờ | Thành tiền HĐ | Tổng thanh toán |
|-------|-------|-----------|--------------|----------------|
| CA2-eI300 | 300 | 1.000 | 300.000 | 800.000 |
| CA2-eI500 | 500 | 850 | 425.000 | 925.000 |
| CA2-eI1.000 | 1.000 | 675 | 675.000 | 1.175.000 |
| CA2-eI2.000 | 2.000 | 550 | 1.100.000 | 1.600.000 |
| CA2-eI5.000 | 5.000 | 450 | 2.250.000 | 2.750.000 |
| CA2-eI10.000 | 10.000 | 350 | 3.500.000 | 4.000.000 |
| CA2-eIExtra | >10.000 | 300 | Tính theo lượt vượt | Tính theo lượt vượt |

#### D2. Gói theo thời hạn năm (IR – không tính phí khởi tạo)

| Mã SP | Số HĐ | Đơn giá | Thành tiền |
|-------|-------|---------|-----------|
| IR-100 | 100 | 1.000 | 100.000 |
| IR-300 | 300 | 667 | 200.000 |
| IR-500 | 500 | 580 | 290.000 |
| IR-700 | 700 | 543 | 380.000 |
| IR-1000 | 1.000 | 500 | 500.000 |
| IR-3000 | 3.000 | 330 | 990.000 |
| IR-5000 | 5.000 | 240 | 1.200.000 |
| IR-10.000 | 10.000 | 200 | 1.999.000 |

#### D3. Phần mềm quản lý HĐ điện tử đầu vào CA2-IVM (theo năm)

| Mã SP | Số HĐ | Đơn giá | Thành tiền |
|-------|-------|---------|-----------|
| IVM-100 | 100 | 1.000 | 100.000 |
| IVM-300 | 300 | 667 | 200.000 |
| IVM-500 | 500 | 580 | 290.000 |
| IVM-700 | 700 | 543 | 380.000 |
| IVM-1000 | 1.000 | 500 | 500.000 |
| IVM-3000 | 3.000 | 330 | 990.000 |
| IVM-5000 | 5.000 | 240 | 1.200.000 |
| IVM-10.000 | 10.000 | 200 | 1.999.000 |

> Hiệu lực: **18/07/2025**. Có thể điều chỉnh tuỳ từng thời điểm.

---

## PHẦN 2 – TÍNH NĂNG CRUD BẢNG GIÁ

Xây dựng màn hình quản lý bảng giá trong phần Admin/Cài đặt của Antigravity.

---

### 2.1 MÀN HÌNH DANH SÁCH GIÁ

**Layout:**
```
[ Nhóm SP ▼ ]  [ Đối tượng ▼ ]  [ Loại GD ▼ ]     [ + Thêm gói mới ]
─────────────────────────────────────────────────────────────────────
 Mã SP          Gói cước    Thành tiền     Trạng thái    Hành động
─────────────────────────────────────────────────────────────────────
 CKS-DN-NEW-12  12 tháng    1.793.880đ     ● Đang dùng   ✎ Sửa  🗑 Xóa
 CKS-DN-NEW-24  24 tháng    2.691.360đ     ● Đang dùng   ✎ Sửa  🗑 Xóa
 ...
```

**Bộ lọc filter:**
- Nhóm sản phẩm: CKS Token / Remote Signing / Sign Platform / eINVOICE / IVM
- Đối tượng: Tất cả / Cá nhân / Hộ KD / Công ty / Cá nhân thuộc TC
- Loại giao dịch: Tất cả / Cấp mới / Gia hạn / Theo lượt / Theo năm

---

### 2.2 FORM THÊM / SỬA GÓI GIÁ

Khi nhấn **"+ Thêm gói mới"** hoặc **"✎ Sửa"**, hiển thị modal/panel với các trường:

```
Nhóm sản phẩm *     [ Dropdown: CKS / RS / SP / eINVOICE / IVM ]
Đối tượng áp dụng * [ Checkbox multi: Cá nhân / Hộ KD / Công ty / CN thuộc TC ]
Loại giao dịch *    [ Dropdown: Cấp mới / Gia hạn / Theo lượt / Theo năm ]
Mã sản phẩm *       [ Text input ]
Gói cước *          [ Text input, ví dụ: "12 tháng", "1 năm", "300 tờ" ]
Phí dịch vụ (đ) *  [ Number input ]
Phí Token (đ)       [ Number input, mặc định 0 ]
VAT (đ)             [ Number input, hoặc checkbox "Tự tính 8%" ]
Thành tiền (đ)      [ Read-only, tự tính = phí DV + Token + VAT ]
Ghi chú             [ Textarea, ví dụ: "Miễn phí Token", "Không chịu VAT" ]
Ngày hiệu lực *     [ Date picker, mặc định hôm nay ]
Trạng thái          [ Toggle: Đang dùng / Ẩn ]

              [ Hủy ]     [ Lưu gói giá ]
```

**Validation:**
- Mã sản phẩm: không trùng với mã đã có (báo lỗi inline nếu trùng)
- Phí DV: chỉ nhập số dương
- Thành tiền tự cập nhật realtime khi thay đổi Phí DV / Token / VAT

---

### 2.3 SỬA GIÁ NHANH (Inline Edit)

Cho phép click thẳng vào ô **Thành tiền** trong bảng danh sách để sửa trực tiếp mà không cần mở modal:

```
CKS-DN-NEW-12  12 tháng   [ 1.793.880 ]  ← click để sửa, Enter để lưu, Esc để hủy
```

Sau khi lưu: hiển thị badge **"Đã cập nhật"** mờ dần trong 2 giây.

---

### 2.4 XÓA GÓI GIÁ

Khi nhấn **"🗑 Xóa"**:
- Hiển thị dialog xác nhận: *"Bạn có chắc muốn xóa gói [Mã SP]? Hành động này không thể hoàn tác."*
- Nút: **[ Hủy ]** | **[ Xóa ]** (nút đỏ)
- Sau khi xóa: dòng biến mất, hiển thị toast *"Đã xóa gói CKS-DN-NEW-12"* với nút **Hoàn tác** (undo trong 5 giây)

---

### 2.5 CẬP NHẬT HÀNG LOẠT (Batch Update)

Khi báo giá mới được phát hành, cho phép cập nhật nhiều gói cùng lúc:

**Nút "Cập nhật hàng loạt"** mở panel:
```
Áp dụng thay đổi cho:
[ ] Chọn tất cả
[ ] CKS-DN-NEW-12    1.793.880đ  →  [ input mới ]
[ ] CKS-DN-NEW-24    2.691.360đ  →  [ input mới ]
[ ] CKS-CN-NEW-12    1.069.200đ  →  [ input mới ]
...

Ngày hiệu lực mới: [ date picker ]

              [ Hủy ]     [ Áp dụng X gói đã chọn ]
```

---

### 2.6 LỊCH SỬ THAY ĐỔI GIÁ

Mỗi gói giá có tab **"Lịch sử"** hiển thị:
```
Ngày          Người sửa    Giá cũ        Giá mới       Ghi chú
18/07/2025    Admin        1.750.000đ    1.793.880đ    Cập nhật báo giá Q3/2025
...
```

---

### 2.7 LIÊN KẾT VỚI MODULE THÊM KHÁCH HÀNG

Khi giá được cập nhật trong module Bảng giá, tự động cập nhật vào dropdown **Thành tiền** ở form Thêm khách hàng CRM mà không cần deploy lại.

- Nếu có gói bị **ẩn** (trạng thái = Ẩn): không hiện trong dropdown CRM
- Nếu có gói **mới thêm**: tự động xuất hiện trong dropdown tương ứng

---

## PHẦN 3 – PHÂN QUYỀN

| Vai trò | Xem giá | Sửa giá | Xóa | Thêm mới | Batch update |
|---------|---------|---------|-----|---------|-------------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manager | ✓ | ✓ | ✗ | ✓ | ✓ |
| Staff (NV bán hàng) | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## GHI CHÚ TRIỂN KHAI

- Giá `Thành tiền` trong bảng giá = giá người dùng trả, dùng trực tiếp ở CRM
- Các gói không chịu VAT (SP, eINVOICE, IVM): trường VAT = 0, thêm nhãn "Không chịu VAT"
- Ngày hiệu lực báo giá hiện tại: **18/07/2025**
- Nên tách bảng giá thành bảng database riêng (không hardcode trong code) để dễ cập nhật sau này
