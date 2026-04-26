# Prompt cho Antigravity – Fix UI toàn bộ web app (iOS Style)

## MỤC TIÊU
1. Xóa khoảng trống đen thừa ở cuối trang trong **tất cả các tab menu**
2. Nâng cấp giao diện tổng thể theo phong cách **iOS / macOS** — clean, tinh tế, có chiều sâu

---

## PHẦN 1 – XÓA KHOẢNG TRỐNG ĐEN THỪA (áp dụng toàn bộ trang)

### Nguyên nhân thường gặp
```css
/* Tìm và xóa / sửa các khai báo sau trong toàn bộ codebase */

/* Sai 1: height cố định khiến phần còn lại là nền đen trống */
.main-content { height: 100vh; }         /* ← xóa */
.page-wrapper { min-height: 100vh; }     /* ← giữ min-height nhưng thêm align */

/* Sai 2: flex container không stretch con */
.layout { display: flex; }               /* ← thêm align-items: stretch */

/* Sai 3: nội dung ít nhưng container chiếm toàn màn hình */
.content-area { height: calc(100vh - 60px); } /* ← đổi thành min-height */
```

### Fix đúng – áp dụng cho LAYOUT CHÍNH
```css
/* Layout tổng thể */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;           /* ← chặn scroll ngoài */
}

/* Sidebar */
.sidebar {
  width: 200px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
}

/* Vùng nội dung chính */
.main-area {
  flex: 1;
  height: 100vh;
  overflow-y: auto;           /* ← scroll ở đây, không phải toàn trang */
  display: flex;
  flex-direction: column;
}

/* Wrapper bên trong mỗi trang */
.page-content {
  flex: 1;                    /* ← tự co dãn theo nội dung */
  padding: 24px 28px;
  /* KHÔNG dùng height cố định */
}
```

### Fix cho từng tab có ít nội dung
```css
/* Khi dữ liệu ít (1-2 dòng), trang vẫn lấp đầy chiều cao */
.page-content {
  min-height: 0;              /* ← để flex tính đúng */
}

/* Empty state thay thế khoảng đen */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0.4;
  padding: 40px;
}
.empty-state-icon { font-size: 32px; }
.empty-state-text { font-size: 14px; color: var(--text-muted); }
```

---

## PHẦN 2 – NÂNG CẤP SIDEBAR

### Trước (vấn đề)
- Các mục nav không có nhãn nhóm
- Không có border phân tách user area với nav
- Nav item active quá đơn giản

### Sau (iOS style)
```css
.sidebar {
  background: #111318;
  border-right: 0.5px solid rgba(255, 255, 255, 0.07);
}

/* Nhãn nhóm menu */
.nav-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(255,255,255,.2);
  padding: 12px 12px 4px;
}

/* Nav item */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  margin: 1px 8px;
  transition: background .15s;
  cursor: pointer;
}
.nav-item:hover {
  background: rgba(255,255,255,.05);
}
.nav-item.active {
  background: rgba(255,255,255,.08);
}
.nav-item.active .nav-label {
  color: #ffffff;
  font-weight: 600;
}
.nav-label {
  font-size: 13px;
  color: rgba(255,255,255,.55);
  transition: color .15s;
}
.nav-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

/* User area ở cuối sidebar */
.sidebar-user {
  margin-top: auto;
  padding: 12px;
  border-top: 0.5px solid rgba(255,255,255,.07);
}
.sidebar-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f47920;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.sidebar-user-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,.8);
}
.sidebar-user-email {
  font-size: 11px;
  color: rgba(255,255,255,.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}
```

---

## PHẦN 3 – NÂNG CẤP VÙNG NỘI DUNG CHÍNH

### 3.1 Page Header
```css
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -.01em;
}
.page-subtitle {
  font-size: 13px;
  color: rgba(255,255,255,.35);
  margin-top: 2px;
}
```

### 3.2 Thêm Filter Chips (quick filter bar)
Thêm thanh filter nhanh ngay dưới tiêu đề trang, áp dụng cho mọi tab có danh sách:

```html
<div class="filter-bar">
  <button class="chip active">Tất cả</button>
  <button class="chip">Đang chạy</button>
  <button class="chip">Hoàn thành</button>
</div>
```
```css
.filter-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}
.chip {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  border: 0.5px solid rgba(255,255,255,.1);
  background: transparent;
  color: rgba(255,255,255,.4);
  cursor: pointer;
  transition: all .15s;
}
.chip:hover {
  background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.7);
}
.chip.active {
  background: rgba(244,121,32,.15);
  border-color: rgba(244,121,32,.35);
  color: #f47920;
}
```

### 3.3 Thêm Stats Row (tóm tắt số liệu)
Thêm 3 card số liệu tóm tắt ngay dưới filter bar cho các trang có danh sách:

```html
<div class="stats-row">
  <div class="stat-card">
    <div class="stat-value">{total}</div>
    <div class="stat-label">Tổng chiến dịch</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{done}</div>
    <div class="stat-label">Hoàn thành</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:#4ade80">{pct}%</div>
    <div class="stat-label">Tỷ lệ hoàn thành</div>
  </div>
</div>
```
```css
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.stat-card {
  background: rgba(255,255,255,.04);
  border: 0.5px solid rgba(255,255,255,.07);
  border-radius: 12px;
  padding: 12px 14px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -.02em;
}
.stat-label {
  font-size: 11px;
  color: rgba(255,255,255,.3);
  margin-top: 3px;
}
```

### 3.4 Upgrade Table Rows → Cards
Đổi từ dạng bảng đơn thuần sang dạng card rows:

```css
/* TRƯỚC */
.table-row {
  border-bottom: 1px solid rgba(255,255,255,.05);
  padding: 12px 0;
}

/* SAU – iOS card row style */
.list-item {
  background: rgba(255,255,255,.03);
  border: 0.5px solid rgba(255,255,255,.07);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 6px;
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 12px;
  transition: background .12s;
  cursor: pointer;
}
.list-item:hover {
  background: rgba(255,255,255,.06);
  border-color: rgba(255,255,255,.12);
}
.list-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  line-height: 1.3;
}
.list-item-meta {
  font-size: 11px;
  color: rgba(255,255,255,.3);
  margin-top: 3px;
}
```

### 3.5 Upgrade Badge (trạng thái)
```css
/* HOÀN THÀNH */
.badge-done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(74,222,128,.1);
  color: #4ade80;
  border: 0.5px solid rgba(74,222,128,.25);
}
.badge-done::before {
  content: '';
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #4ade80;
}

/* ĐANG CHẠY */
.badge-running {
  background: rgba(244,121,32,.1);
  color: #f47920;
  border-color: rgba(244,121,32,.25);
}
.badge-running::before { background: #f47920; }

/* CHỜ */
.badge-pending {
  background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.4);
  border-color: rgba(255,255,255,.1);
}
```

### 3.6 Upgrade Progress Bar
```css
.progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 70px;
}
.progress-bar {
  height: 4px;
  background: rgba(255,255,255,.08);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #f47920, #ff9a4a);
  transition: width .3s ease;
}
.progress-fill.done { background: #4ade80; }
.progress-text {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,.4);
}
```

### 3.7 Upgrade Delete Button
```css
/* TRƯỚC: chấm đỏ tròn nhỏ, khó thấy */
/* SAU: icon button rõ ràng */
.btn-delete {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 0.5px solid rgba(239,68,68,.2);
  background: rgba(239,68,68,.08);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .15s;
  font-size: 13px;
}
.btn-delete:hover {
  background: rgba(239,68,68,.18);
  border-color: rgba(239,68,68,.4);
}
```

---

## PHẦN 4 – EMPTY STATE (thay thế khoảng đen)
Khi tab không có dữ liệu hoặc ít dữ liệu, phần còn lại hiển thị empty state thay vì nền đen:

```html
<!-- Hiển thị khi list rỗng -->
<div class="empty-state">
  <div class="empty-icon">📋</div>
  <div class="empty-title">Chưa có chiến dịch nào</div>
  <div class="empty-desc">Tạo chiến dịch đầu tiên để bắt đầu</div>
  <button class="btn-primary">+ Tạo chiến dịch</button>
</div>
```
```css
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 24px;
  text-align: center;
}
.empty-icon { font-size: 36px; opacity: .25; }
.empty-title { font-size: 15px; font-weight: 600; color: rgba(255,255,255,.3); }
.empty-desc  { font-size: 13px; color: rgba(255,255,255,.18); }
.btn-primary {
  margin-top: 12px;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  background: #f47920;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
```

---

## PHẦN 5 – BACKGROUND TỔNG THỂ

```css
/* Thay màu nền từ đen sẫm sang gradient tối nhẹ */
body, .app-root {
  background: #0f1117;     /* ← thay #0c0e13 hoặc #000 */
}
.main-area {
  background: #0f1117;
}
.sidebar {
  background: #111318;     /* ← sidebar đậm hơn main content 1 chút */
}
```

---

## TÓM TẮT CÁC THAY ĐỔI

| # | Vị trí | Thay đổi |
|---|--------|---------|
| 1 | Layout | `height: 100vh` → `min-height: 0` + `overflow-y: auto` ở đúng chỗ |
| 2 | Tất cả tab | Xóa khoảng đen cuối trang bằng `flex: 1` đúng cách |
| 3 | Sidebar nav | Thêm nhãn nhóm, border-radius item, border user area |
| 4 | Mọi trang | Thêm filter chips + stats row |
| 5 | Table rows | Đổi sang card rows có hover effect |
| 6 | Badge | Thêm chấm màu, border, nền tinted |
| 7 | Progress bar | Tăng lên 4px, thêm màu gradient + done state |
| 8 | Nút xóa | Từ chấm đỏ → icon button có border |
| 9 | Empty state | Thay khoảng đen bằng empty state có icon + CTA |
| 10 | Background | `#0c0e13` → `#0f1117` (tối nhẹ hơn, dễ nhìn hơn) |
