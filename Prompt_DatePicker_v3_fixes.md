# Prompt cho Antigravity – Fix Date Picker (dựa trên ảnh thực tế v3)

Dưới đây là 5 lỗi cụ thể quan sát từ ảnh chụp màn hình thực tế.
Sửa đúng theo mô tả, không thay đổi bất kỳ thứ gì khác.

---

## LỖI 1 – Ngày được chọn dùng hình chữ nhật thay vì hình tròn

**Quan sát:** Ngày 13 đang được highlight bằng nền hình chữ nhật bo góc (`border-radius: 8px` hoặc tương tự).

**Yêu cầu sửa:** Ngày được chọn (selected) phải là hình **tròn hoàn toàn**.

```css
/* XÓA */
.day-selected {
  border-radius: 8px;       /* ← sai, tạo hình chữ nhật */
}

/* THAY BẰNG */
.day-selected {
  width: 36px;
  height: 36px;
  border-radius: 50%;           /* ← hình tròn */
  background: #f47920;
  color: #ffffff;
  font-weight: 700;
}
```

> Lưu ý: Khi là ngày bắt đầu hoặc kết thúc của một range, áp dụng bo nửa:
> - Start: `border-radius: 50% 0 0 50%`
> - End: `border-radius: 0 50% 50% 0`
> - Chọn đơn (start = end): `border-radius: 50%`

---

## LỖI 2 – Ngày hôm nay có glow/shadow quá nặng

**Quan sát:** Ngày 23 đang có `box-shadow` lan rộng màu cam (`0 0 16px rgba(244,121,32,.5)` hoặc tương tự), trông chói và không tinh tế.

**Yêu cầu sửa:** Bỏ hoàn toàn `box-shadow`. Chỉ giữ viền liền nét + chấm nhỏ bên dưới.

```css
/* XÓA toàn bộ box-shadow trên .today */
.day-today {
  /* KHÔNG dùng: box-shadow: 0 0 ... rgba(244,121,32,...) */

  border: 2px solid #f47920;    /* ← viền cam liền nét, không glow */
  border-radius: 50%;
  color: #f47920;
  font-weight: 700;
  position: relative;
}

/* Chấm nhỏ bên dưới số (tùy chọn, giữ nếu đang có) */
.day-today::after {
  content: '';
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #f47920;
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
}
```

---

## LỖI 3 – Dropdown tháng hiển thị "Tháng" thay vì "Tháng 4"

**Quan sát:** Dropdown tháng chỉ hiện chữ "Tháng" mà không kèm số tháng.

**Yêu cầu sửa:** Giá trị hiển thị trong dropdown phải là `"Tháng {N}"` đầy đủ.

```js
// Mảng option phải là:
const months = [
  { value: 0, label: 'Tháng 1' },
  { value: 1, label: 'Tháng 2' },
  { value: 2, label: 'Tháng 3' },
  { value: 3, label: 'Tháng 4' },
  { value: 4, label: 'Tháng 5' },
  { value: 5, label: 'Tháng 6' },
  { value: 6, label: 'Tháng 7' },
  { value: 7, label: 'Tháng 8' },
  { value: 8, label: 'Tháng 9' },
  { value: 9, label: 'Tháng 10' },
  { value: 10, label: 'Tháng 11' },
  { value: 11, label: 'Tháng 12' },
];
```

Nếu dùng `<select>` HTML thuần, đảm bảo `min-width: 100px` để text không bị cắt.

---

## LỖI 4 – Nút "Hủy" và "Áp dụng" cùng kiểu border cam

**Quan sát:** Cả 2 nút đang dùng `border: 2px solid #f47920` + nền tối — trông không phân cấp, người dùng khó biết đâu là hành động chính.

**Yêu cầu sửa:** Hai nút phải khác nhau hoàn toàn:

```css
/* NÚT HỦY – trung tính, lùi về sau */
.btn-cancel {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);   /* ← xám mờ, không cam */
  background: transparent;
  color: #5a6480;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.btn-cancel:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: #8892b0;
}

/* NÚT ÁP DỤNG – nền cam đặc, nổi bật */
.btn-apply {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  border: none;                                  /* ← không border */
  background: #f47920;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 14px rgba(244, 121, 32, 0.35);
  transition: all .15s;
}
.btn-apply:hover {
  background: #ff8c35;
  box-shadow: 0 3px 20px rgba(244, 121, 32, 0.45);
}
.btn-apply:disabled {
  background: #2a2010;
  color: #4a3820;
  box-shadow: none;
  cursor: not-allowed;
}
```

---

## LỖI 5 – Thiếu dải highlight khi chọn khoảng ngày (range)

**Quan sát:** Sau khi chọn ngày bắt đầu và ngày kết thúc, các ngày ở giữa không được tô màu gì cả.

**Yêu cầu sửa:** Khi `startDate` và `endDate` đều có giá trị, các ngày nằm giữa phải có nền cam nhạt liên tục.

```css
/* Ngày nằm trong khoảng đã chọn */
.day-in-range {
  background: rgba(244, 121, 32, 0.13);
  border-radius: 0;           /* ← phải là 0 để tạo dải liên tục, không bo góc */
  color: #dda87a;
}

/* Xử lý đầu hàng (cột T2, index % 7 === 0) */
.day-in-range.row-first,
.day-end.row-first {
  border-radius: 50% 0 0 50% !important;
}

/* Xử lý cuối hàng (cột CN, index % 7 === 6) */
.day-in-range.row-last,
.day-start.row-last {
  border-radius: 0 50% 50% 0 !important;
}
```

**Logic JS để gán class:**
```js
// Với mỗi ô ngày khi render:
const isInRange = startDate && endDate && day > startDate && day < endDate;
const isStart   = startDate && isSameDay(day, startDate);
const isEnd     = endDate   && isSameDay(day, endDate);
const colIndex  = cellIndex % 7; // 0=T2, 6=CN

if (isStart)   cell.classList.add('day-start');
if (isEnd)     cell.classList.add('day-end');
if (isInRange) cell.classList.add('day-in-range');

// Bo đầu/cuối hàng để dải không bị vỡ
if ((isInRange || isEnd)   && colIndex === 0) cell.classList.add('row-first');
if ((isInRange || isStart) && colIndex === 6) cell.classList.add('row-last');
```

---

## TÓM TẮT THAY ĐỔI

| # | Vị trí | Thay đổi |
|---|--------|----------|
| 1 | Ngày selected | `border-radius: 8px` → `border-radius: 50%` |
| 2 | Ngày today | Xóa `box-shadow` glow, giữ `border: 2px solid #f47920` |
| 3 | Dropdown tháng | "Tháng" → "Tháng 4" (có số tháng đầy đủ) |
| 4 | Nút Hủy | Đổi từ `border: 2px solid #f47920` sang `border: 1px solid rgba(255,255,255,.1)` + màu xám |
| 5 | Range highlight | Thêm CSS + JS để tô dải màu giữa 2 ngày đã chọn |

**Không thay đổi:** background tổng thể, font, icon, layout, dropdown năm, màu T7/CN, nút điều hướng ‹ ›.
