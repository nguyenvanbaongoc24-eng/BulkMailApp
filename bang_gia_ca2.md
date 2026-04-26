# BẢNG GIÁ SẢN PHẨM DỊCH VỤ CA2 – NACENCOMM
<!-- 
  FILE NÀY LÀ NGUỒN DỮ LIỆU CHÍNH CHO WEB APP.
  Antigravity đọc file này để:
  1. Hiển thị đúng giá trong dropdown CRM khi thêm khách hàng
  2. Cho phép user chỉnh sửa giá qua giao diện "Cập nhật báo giá"
  3. Tự động tính Thành tiền khi user chọn gói

  CẤU TRÚC MỖI GÓI:
  - id: mã định danh duy nhất (không đổi)
  - nhom: nhóm sản phẩm
  - doi_tuong: đối tượng áp dụng
  - loai: cấp mới | gia hạn | theo_luot | theo_nam
  - goi: tên gói hiển thị
  - phi_dv: phí dịch vụ (VNĐ)
  - token: phí token (VNĐ, 0 nếu không có)
  - vat: thuế VAT (VNĐ)
  - thanh_tien: tổng thành tiền (VNĐ) ← GIÁ HIỂN THỊ TRONG CRM
  - ghi_chu: ghi chú thêm
  - hieu_luc: ngày hiệu lực
  - an: true/false – ẩn khỏi CRM nếu true
-->

**Hiệu lực từ:** 18/07/2025  
**Nhà cung cấp:** Công ty Cổ phần Công nghệ thẻ Nacencomm  
**Hotline:** 1900 545407 | **Email:** support@cavn.vn

---

## HƯỚNG DẪN CHO ANTIGRAVITY

```
KHI USER NHẤN "CẬP NHẬT BÁO GIÁ":
1. Đọc toàn bộ dữ liệu từ các bảng bên dưới
2. Render form cho phép user chỉnh sửa cột [thanh_tien] của từng gói
3. User có thể bật/tắt hiển thị từng gói (trường [an])
4. Sau khi lưu → cập nhật ngay vào dropdown CRM và tính năng xuất Excel
5. Lưu lịch sử thay đổi: ngày sửa, giá cũ, giá mới, người sửa

TRƯỜNG CHO PHÉP USER SỬA:
- thanh_tien (bắt buộc, số dương)
- ghi_chu (tuỳ chọn)
- an (toggle ẩn/hiện)
- hieu_luc (ngày áp dụng giá mới)

TRƯỜNG KHÔNG CHO SỬA QUA UI (chỉ dev):
- id, nhom, doi_tuong, loai, goi
```

---

## A. CHỮ KÝ SỐ CA2 TOKEN (CKS)

### A1. Tổ chức / Doanh nghiệp – Cấp mới

| id | goi | phi_dv | token | vat | thanh_tien | ghi_chu | an |
|----|-----|--------|-------|-----|-----------|---------|-----|
| CKS-DN-NEW-12 | 12 tháng | 1.161.000 | 500.000 | 132.880 | **1.793.880** | | false |
| CKS-DN-NEW-24 | 24 tháng | 1.992.000 | 500.000 | 199.360 | **2.691.360** | | false |
| CKS-DN-NEW-36 | 36 tháng | 2.828.000 | 0 | 226.240 | **3.054.240** | Miễn phí Token | false |

```
nhom: CKS_TOKEN
doi_tuong: [CONG_TY]
loai: cap_moi
```

### A2. Tổ chức / Doanh nghiệp – Gia hạn

| id | goi | phi_dv | vat | thanh_tien | ghi_chu | an |
|----|-----|--------|-----|-----------|---------|-----|
| CKS-DN-RNW-12 | 12 tháng | 1.161.000 | 92.880 | **1.253.880** | | false |
| CKS-DN-RNW-24 | 24 tháng | 1.992.000 | 159.360 | **2.151.360** | | false |
| CKS-DN-RNW-36 | 36 tháng | 2.643.000 | 211.440 | **2.854.440** | | false |

```
nhom: CKS_TOKEN
doi_tuong: [CONG_TY]
loai: gia_han
```

### A3. Cá nhân / Hộ Kinh Doanh – Cấp mới

| id | goi | phi_dv | token | vat | thanh_tien | ghi_chu | an |
|----|-----|--------|-------|-----|-----------|---------|-----|
| CKS-CN-NEW-12 | 12 tháng | 490.000 | 500.000 | 79.200 | **1.069.200** | | false |
| CKS-CN-NEW-24 | 24 tháng | 890.000 | 500.000 | 111.200 | **1.501.200** | | false |
| CKS-CN-NEW-36 | 36 tháng | 1.800.000 | 0 | 144.000 | **1.944.000** | Miễn phí Token | false |

```
nhom: CKS_TOKEN
doi_tuong: [CA_NHAN, HO_KD, CA_NHAN_TC]
loai: cap_moi
```

### A4. Cá nhân / Hộ Kinh Doanh – Gia hạn

| id | goi | phi_dv | vat | thanh_tien | ghi_chu | an |
|----|-----|--------|-----|-----------|---------|-----|
| CKS-CN-RNW-12 | 12 tháng | 490.000 | 39.200 | **529.200** | | false |
| CKS-CN-RNW-24 | 24 tháng | 890.000 | 71.200 | **961.200** | | false |
| CKS-CN-RNW-36 | 36 tháng | 1.300.000 | 104.000 | **1.404.000** | | false |

```
nhom: CKS_TOKEN
doi_tuong: [CA_NHAN, HO_KD, CA_NHAN_TC]
loai: gia_han
```

---

## B. CHỮ KÝ SỐ TỪ XA CA2 REMOTE SIGNING (RS)

> Không phí khởi tạo. Không có giá gia hạn – khách gia hạn mua theo gói niêm yết.

### B1. RS Cá nhân – Theo thời gian

| id | goi | phi_dv | vat | thanh_tien | an |
|----|-----|--------|-----|-----------|-----|
| RS-CN-1M | 1 tháng | 31.800 | 2.544 | **34.344** | false |
| RS-CN-3M | 3 tháng | 59.000 | 4.720 | **63.720** | false |
| RS-CN-6M | 6 tháng | 100.000 | 8.000 | **108.000** | false |
| RS-CN-1Y | 1 năm | 181.800 | 14.544 | **196.344** | false |
| RS-CN-2Y | 2 năm | 345.500 | 27.640 | **373.140** | false |
| RS-CN-3Y | 3 năm | 491.000 | 39.280 | **530.280** | false |

```
nhom: REMOTE_SIGNING
doi_tuong: [CA_NHAN]
loai: theo_thoi_gian
```

### B2. RS Cá nhân thuộc Tổ chức – Theo năm

| id | goi | phi_dv | vat | thanh_tien | an |
|----|-----|--------|-----|-----------|-----|
| RS-CNTC-1Y | 1 năm | 318.000 | 25.440 | **343.440** | false |
| RS-CNTC-2Y | 2 năm | 564.000 | 45.120 | **609.120** | false |
| RS-CNTC-3Y | 3 năm | 764.000 | 61.120 | **825.120** | false |

```
nhom: REMOTE_SIGNING
doi_tuong: [CA_NHAN_TC]
loai: theo_thoi_gian
```

### B3. RS Hộ Kinh Doanh – Theo năm

| id | goi | phi_dv | vat | thanh_tien | an |
|----|-----|--------|-----|-----------|-----|
| RS-HKD-1Y | 1 năm | 318.000 | 25.440 | **343.440** | false |
| RS-HKD-2Y | 2 năm | 564.000 | 45.120 | **609.120** | false |
| RS-HKD-3Y | 3 năm | 764.000 | 61.120 | **825.120** | false |

```
nhom: REMOTE_SIGNING
doi_tuong: [HO_KD]
loai: theo_thoi_gian
```

### B4. RS Tổ chức / Doanh nghiệp – Theo năm

| id | goi | phi_dv | vat | thanh_tien | an |
|----|-----|--------|-----|-----------|-----|
| RS-DN-1Y | 1 năm | 1.136.000 | 90.880 | **1.226.880** | false |
| RS-DN-2Y | 2 năm | 2.000.000 | 160.000 | **2.160.000** | false |
| RS-DN-3Y | 3 năm | 2.637.000 | 210.960 | **2.847.960** | false |

```
nhom: REMOTE_SIGNING
doi_tuong: [CONG_TY]
loai: theo_thoi_gian
```

### B5. RS Cá nhân – Theo lượt

| id | goi | mo_ta | phi_dv | vat | thanh_tien | ghi_chu | an |
|----|-----|-------|--------|-----|-----------|---------|-----|
| RS-CN-10L | 10 lần/tháng | Ký 10 lần/01 tháng | 18.000 | 1.440 | **19.440** | ~1.944đ/lần | false |

```
nhom: REMOTE_SIGNING
doi_tuong: [CA_NHAN]
loai: theo_luot
```

---

## C. CA2 SIGN PLATFORM (CA2-SP)

> Phần mềm **không chịu thuế VAT**.  
> SP-Lite được dùng vĩnh viễn miễn phí.  
> Khi số HĐ vượt ngưỡng: tính theo đơn giá Tier hoặc nâng gói.

| id | goi | so_hd | don_gia_hd | thanh_tien | ghi_chu | an |
|----|-----|-------|-----------|-----------|---------|-----|
| SP-LITE | SP-Lite | 10 | 0 | **0** | Miễn phí vĩnh viễn | false |
| SP-100 | SP-100 | 100 | 2.500 | **250.000** | | false |
| SP-300 | SP-300 | 300 | 2.300 | **690.000** | | false |
| SP-500 | SP-500 | 500 | 2.200 | **1.110.000** | | false |
| SP-1000 | SP-1000 | 1.000 | 2.100 | **2.100.000** | | false |
| SP-2000 | SP-2000 | 2.000 | 2.000 | **4.000.000** | | false |
| SP-5000 | SP-5000 | 5.000 | 1.900 | **9.500.000** | | false |
| SP-MAX | SP-MAX | ≥10.000 | 1.500 | **Tính theo lượt vượt** | | false |

```
nhom: SIGN_PLATFORM
doi_tuong: [CA_NHAN, HO_KD, CONG_TY, CA_NHAN_TC]
loai: theo_nam
vat: 0
```

---

## D. HÓA ĐƠN ĐIỆN TỬ CA2-EINVOICE

> Phần mềm **không chịu thuế VAT**.

### D1. Gói theo số tờ (bao gồm phí phần mềm 500.000đ)

| id | goi | phi_pm | so_to | don_gia_to | thanh_tien_hd | tong_thanh_toan | an |
|----|-----|--------|-------|-----------|--------------|----------------|-----|
| EI-300 | CA2-eI300 | 500.000 | 300 | 1.000 | 300.000 | **800.000** | false |
| EI-500 | CA2-eI500 | 500.000 | 500 | 850 | 425.000 | **925.000** | false |
| EI-1000 | CA2-eI1.000 | 500.000 | 1.000 | 675 | 675.000 | **1.175.000** | false |
| EI-2000 | CA2-eI2.000 | 500.000 | 2.000 | 550 | 1.100.000 | **1.600.000** | false |
| EI-5000 | CA2-eI5.000 | 500.000 | 5.000 | 450 | 2.250.000 | **2.750.000** | false |
| EI-10000 | CA2-eI10.000 | 500.000 | 10.000 | 350 | 3.500.000 | **4.000.000** | false |
| EI-EXTRA | CA2-eIExtra | 500.000 | >10.000 | 300 | Tính theo lượt vượt | **Tính theo lượt vượt** | false |

```
nhom: EINVOICE
doi_tuong: [CA_NHAN, HO_KD, CONG_TY, CA_NHAN_TC]
loai: theo_so_to
vat: 0
thanh_tien_crm: tong_thanh_toan
```

### D2. CA2-EINVOICE theo thời hạn năm (IR)

| id | goi | so_hd | don_gia | thanh_tien | an |
|----|-----|-------|---------|-----------|-----|
| IR-100 | IR-100 | 100 | 1.000 | **100.000** | false |
| IR-300 | IR-300 | 300 | 667 | **200.000** | false |
| IR-500 | IR-500 | 500 | 580 | **290.000** | false |
| IR-700 | IR-700 | 700 | 543 | **380.000** | false |
| IR-1000 | IR-1000 | 1.000 | 500 | **500.000** | false |
| IR-3000 | IR-3000 | 3.000 | 330 | **990.000** | false |
| IR-5000 | IR-5000 | 5.000 | 240 | **1.200.000** | false |
| IR-10000 | IR-10.000 | 10.000 | 200 | **1.999.000** | false |

```
nhom: EINVOICE
doi_tuong: [CA_NHAN, HO_KD, CONG_TY, CA_NHAN_TC]
loai: theo_nam
vat: 0
```

---

## E. QUẢN LÝ HÓA ĐƠN ĐẦU VÀO CA2-IVM

> Phần mềm **không chịu thuế VAT**. Không tính phí khởi tạo.

| id | goi | so_hd | don_gia | thanh_tien | an |
|----|-----|-------|---------|-----------|-----|
| IVM-100 | IVM-100 | 100 | 1.000 | **100.000** | false |
| IVM-300 | IVM-300 | 300 | 667 | **200.000** | false |
| IVM-500 | IVM-500 | 500 | 580 | **290.000** | false |
| IVM-700 | IVM-700 | 700 | 543 | **380.000** | false |
| IVM-1000 | IVM-1000 | 1.000 | 500 | **500.000** | false |
| IVM-3000 | IVM-3000 | 3.000 | 330 | **990.000** | false |
| IVM-5000 | IVM-5000 | 5.000 | 240 | **1.200.000** | false |
| IVM-10000 | IVM-10.000 | 10.000 | 200 | **1.999.000** | false |

```
nhom: IVM
doi_tuong: [CA_NHAN, HO_KD, CONG_TY, CA_NHAN_TC]
loai: theo_nam
vat: 0
```

---

## QUY TẮC HIỂN THỊ TRONG CRM

```
MAPPING: đối tượng KH → các gói được hiển thị

CA_NHAN (Cá nhân):
  CKS  → A3 (cấp mới), A4 (gia hạn)
  RS   → B1 (theo thời gian), B5 (theo lượt)
  SP   → toàn bộ C
  HDDT → toàn bộ D1, D2

HO_KD (Hộ Kinh Doanh):
  CKS  → A3 (cấp mới), A4 (gia hạn)
  RS   → B3 (theo năm), B5 (theo lượt)
  SP   → toàn bộ C
  HDDT → toàn bộ D1, D2

CONG_TY (Công ty / Tổ chức / Doanh nghiệp):
  CKS  → A1 (cấp mới), A2 (gia hạn)
  RS   → B4 (theo năm)
  SP   → toàn bộ C
  HDDT → toàn bộ D1, D2

CA_NHAN_TC (Cá nhân thuộc Tổ chức):
  CKS  → A3 (cấp mới), A4 (gia hạn)
  RS   → B2 (theo năm)
  SP   → toàn bộ C
  HDDT → toàn bộ D1, D2

GIÁ HIỂN THỊ TRONG CRM:
  Cột "Thành tiền" lấy từ [thanh_tien] hoặc [tong_thanh_toan]
  (tùy nhóm sản phẩm, xem ghi chú thanh_tien_crm ở mỗi nhóm)

GÓI BỊ ẨN (an: true):
  Không hiển thị trong dropdown CRM
  Không xuất ra file Excel báo cáo
```

---

## HÀNH VI NÚT "CẬP NHẬT BÁO GIÁ"

```
1. Hiển thị danh sách tất cả gói giá từ file này (nhóm theo tab A/B/C/D/E)
2. Mỗi dòng gói giá có:
   - Thông tin tĩnh: id, goi, phi_dv, vat (chỉ đọc)
   - Ô [thanh_tien] có thể chỉnh sửa trực tiếp
   - Toggle [an] để ẩn/hiện gói
   - Ô [ghi_chu] có thể chỉnh sửa
3. Nút "Lưu thay đổi" → ghi đè [thanh_tien] mới vào hệ thống
4. Nút "Khôi phục mặc định" → reset về giá gốc trong file này
5. Trường [hieu_luc] tự cập nhật thành ngày hiện tại khi lưu
6. Sau khi lưu → CRM và báo cáo Excel phản ánh giá mới ngay lập tức
```

---

*Báo giá có thể được điều chỉnh tuỳ từng thời điểm.*  
*Hiệu lực từ ngày: 18/07/2025*
