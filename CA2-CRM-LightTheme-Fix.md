# 🌤️ CA2 CRM — Light Theme Fix Guide
> Chẩn đoán & sửa toàn diện · Contrast · Depth · Color Harmony

---

## 1. CHẨN ĐOÁN GỐC RỄ VẤN ĐỀ

### Nguyên nhân cốt lõi khiến light theme trông xấu

```
❌ Vấn đề #1 — "White on White" (Cao nhất)
   Nền trang (#F5F6FA) và nền card (#FFFFFF) quá gần nhau
   → Cards không nổi lên, trông như text thả thẳng lên nền

❌ Vấn đề #2 — Không có shadow trên card
   Shadow = 0 → Không có depth, giao diện phẳng hoàn toàn
   → Mất cảm giác phân cấp tầng (background → surface → elevated)

❌ Vấn đề #3 — Stat cards layout vô nghĩa (Dashboard)
   3 ô lớn (70 / 100% / 0%) không có label → số liệu mồ côi
   Ô "91" chiếm 50% width nhưng trống rỗng → lãng phí không gian

❌ Vấn đề #4 — Badge màu bị wash out
   "CHƯA THANH TOÁN" → đỏ nhạt xám xịt, không đủ cảnh báo
   "ĐÃ THANH TOÁN" → xanh bị desaturate, thiếu sức sống
   "CÒN N NGÀY" → xám xanh, không rõ ý nghĩa

❌ Vấn đề #5 — Dark panel lạc chỗ (Filter date range)
   Panel chọn ngày màu navy tối (#1A1D2E) nổi cộm giữa light theme
   → Không theme-aware, hardcoded dark color

❌ Vấn đề #6 — Border quá mờ
   Border ~1px rgba(0,0,0,0.05) → Gần như vô hình
   → Row items chảy vào nhau, khó phân biệt

❌ Vấn đề #7 — Typography không có hierarchy
   Label phụ (MST, tên dịch vụ, hạn) cùng tone với tên khách hàng
   → Mắt không biết đọc gì trước
```

---

## 2. BẢNG SO SÁNH TRƯỚC / SAU

| Thành phần | Hiện tại ❌ | Sau fix ✅ |
|---|---|---|
| Nền trang | `#F5F6FA` (quá sáng) | `#ECEEF5` (đủ tối để card nổi) |
| Card background | `#FFFFFF` | `#FFFFFF` + shadow rõ |
| Card border | `rgba(0,0,0,0.05)` vô hình | `rgba(99,102,141,0.12)` rõ hơn |
| Card shadow | không có | `0 2px 8px rgba(30,40,80,0.08)` |
| Badge CHƯA TT | `rgba(239,68,68,0.08)` nhạt | `rgba(239,68,68,0.12)` + border đỏ |
| Badge ĐÃ TT | `rgba(34,197,94,0.08)` nhạt | `rgba(22,163,74,0.12)` + border xanh |
| Date filter panel | dark navy cứng | white card + border nhẹ |
| Stat card label | thiếu / quá nhỏ | label uppercase rõ ràng |
| Row separator | border vô hình | `margin-bottom: 8px` + shadow |
| Sidebar | dark (giữ) | dark (giữ nguyên — tốt) |

---

## 3. CSS FIX TOÀN DIỆN

### 3.1 — Background & Surface Layers

```css
/* ─── Root: Light Theme Foundation ─── */
:root[data-theme="light"],
.light-theme {

  /* Tầng nền — đủ tối để card #FFFFFF nổi lên rõ ràng */
  --bg-base:      #E8EAF2;   /* ← đây là fix quan trọng nhất */
  --bg-surface:   #FFFFFF;
  --bg-elevated:  #FFFFFF;
  --bg-subtle:    #F0F2F8;   /* dùng cho hover row, inner section */

  /* Shadows — tạo depth tầng lớp */
  --shadow-sm:    0 1px 3px rgba(30,40,90,0.07),
                  0 1px 2px rgba(30,40,90,0.05);
  --shadow-md:    0 4px 12px rgba(30,40,90,0.08),
                  0 2px 4px rgba(30,40,90,0.05);
  --shadow-lg:    0 8px 24px rgba(30,40,90,0.10),
                  0 4px 8px rgba(30,40,90,0.06);
  --shadow-focus: 0 0 0 3px rgba(255,107,43,0.20);

  /* Borders */
  --border-subtle:  rgba(99,102,141,0.10);
  --border-default: rgba(99,102,141,0.16);
  --border-strong:  rgba(99,102,141,0.28);

  /* Text */
  --text-primary:   #0F1225;
  --text-secondary: #4B5280;
  --text-muted:     #8B90B8;
  --text-placeholder: #B0B5D0;

  /* Accent — giữ nguyên */
  --accent-orange:       #FF6B2B;
  --accent-orange-soft:  rgba(255,107,43,0.10);
  --accent-orange-border: rgba(255,107,43,0.25);

  /* Status colors — đậm hơn bản hiện tại */
  --status-success:       #16A34A;
  --status-success-bg:    rgba(22,163,74,0.10);
  --status-success-border: rgba(22,163,74,0.22);

  --status-danger:        #DC2626;
  --status-danger-bg:     rgba(220,38,38,0.10);
  --status-danger-border: rgba(220,38,38,0.22);

  --status-warning:       #D97706;
  --status-warning-bg:    rgba(217,119,6,0.10);
  --status-warning-border: rgba(217,119,6,0.22);

  --status-info:          #2563EB;
  --status-info-bg:       rgba(37,99,235,0.10);
  --status-info-border:   rgba(37,99,235,0.22);

  --status-neutral:       #4B5280;
  --status-neutral-bg:    rgba(75,82,128,0.08);
  --status-neutral-border: rgba(75,82,128,0.18);
}
```

---

### 3.2 — Card Component (Stat Cards Fix)

```css
/* ─── Base Card ─── */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

/* ─── Stat Card Cụ thể ─── */
.stat-card {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  overflow: hidden;
}

/* Accent bar trên cùng theo màu metric */
.stat-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 0 0 4px 4px;
  background: var(--card-color, var(--accent-orange));
  opacity: 0.6;
}

.stat-card--expired  { --card-color: var(--status-danger); }
.stat-card--warn30   { --card-color: var(--status-warning); }
.stat-card--warn60   { --card-color: var(--status-warning); }
.stat-card--total    { --card-color: var(--status-info); }

/* Label trên stat card */
.stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Số stat */
.stat-number {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.stat-number.danger  { color: var(--status-danger); }
.stat-number.warning { color: var(--status-warning); }
.stat-number.info    { color: var(--status-info); }
.stat-number.success { color: var(--status-success); }
```

---

### 3.3 — Dashboard: Fix 3 Stat Lớn Trên Cùng

```css
/*
  VẤN ĐỀ: 3 ô "70 / 100% / 0%" không có label, trống rỗng.
  FIX: Thêm label bên dưới số, cụ thể hóa ý nghĩa.
*/

/* Layout grid mới cho 3 stat hero */
.dashboard-hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.hero-stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stat-card .number {
  font-size: 40px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.04em;
  line-height: 1;
}

.hero-stat-card .label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Thêm label vào HTML (nếu đang thiếu): */
/*
  <div class="hero-stat-card">
    <span class="number">70</span>
    <span class="label">Email đã gửi</span>
  </div>
  <div class="hero-stat-card">
    <span class="number">100%</span>
    <span class="label">Tỷ lệ gửi thành công</span>
  </div>
  <div class="hero-stat-card">
    <span class="number">0%</span>
    <span class="label">Tỷ lệ lỗi</span>
  </div>
*/
```

---

### 3.4 — Stat Layout: Fix Card "91" Chiếm Nửa Màn

```css
/*
  VẤN ĐỀ: Stat "91 — Đã hết hạn" nằm dưới, chiếm 50% width, còn lại trống
  → Bố cục mất cân bằng.

  FIX OPTION A: Gộp tất cả 4 stat vào 1 hàng 4 cột (cùng với 4 icon stat bên dưới)
  FIX OPTION B: Đưa stat "91" vào hàng đầu thành 4-up grid
*/

/* Option B — 4 stat trên cùng 1 hàng */
.crm-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

/* Stat tổng khách hàng */
.crm-stat--total   { border-top: 3px solid var(--status-info); }
/* Stat đang hoạt động */
.crm-stat--active  { border-top: 3px solid var(--status-success); }
/* Stat sắp hết hạn */
.crm-stat--expiring { border-top: 3px solid var(--status-warning); }
/* Stat đã hết hạn */
.crm-stat--expired  { border-top: 3px solid var(--status-danger); }
```

---

### 3.5 — Badge Fix (Quan trọng nhất về màu)

```css
/* ─── Base Badge ─── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  border-width: 1px;
  border-style: solid;
}

.badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* ── Đã thanh toán ── */
.badge-paid {
  background: var(--status-success-bg);
  color: var(--status-success);
  border-color: var(--status-success-border);
}

/* ── Chưa thanh toán ── */
.badge-unpaid {
  background: var(--status-danger-bg);
  color: var(--status-danger);
  border-color: var(--status-danger-border);
}

/* ── Còn N ngày (positive) ── */
.badge-days-ok {
  background: var(--status-info-bg);
  color: var(--status-info);
  border-color: var(--status-info-border);
}

/* ── Sắp hết hạn ── */
.badge-expiring {
  background: var(--status-warning-bg);
  color: var(--status-warning);
  border-color: var(--status-warning-border);
}

/* ── Đã hết hạn ── */
.badge-expired {
  background: var(--status-danger-bg);
  color: var(--status-danger);
  border-color: var(--status-danger-border);
}

/* ── Hoàn thành (campaign) ── */
.badge-complete {
  background: var(--status-success-bg);
  color: var(--status-success);
  border-color: var(--status-success-border);
  padding: 4px 10px;
  font-size: 10px;
}
```

---

### 3.6 — Customer Row Fix

```css
/* ─── Row Container ─── */
.customer-row {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;               /* gap thay vì border-bottom */
  box-shadow: var(--shadow-sm);
  transition: all 0.18s ease;
  cursor: pointer;
}

.customer-row:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-md);
  transform: translateX(2px);
  background: var(--bg-subtle);
}

/* ─── Avatar Icon ─── */
.customer-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Avatar màu theo loại dịch vụ */
.avatar-ks   { background: rgba(255,107,43,0.12); color: #FF6B2B; }
.avatar-hddt { background: rgba(37,99,235,0.12);  color: #2563EB; }
.avatar-bhxh { background: rgba(22,163,74,0.12);  color: #16A34A; }

/* ─── Info Text ─── */
.customer-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.customer-mst {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;  /* MST dùng mono cho sạch */
  margin-top: 2px;
}

.customer-service-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-orange);
  margin-left: 8px;
}

.customer-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.customer-meta svg {
  opacity: 0.5;
}
```

---

### 3.7 — Date Range Filter Panel Fix (Critical)

```css
/*
  VẤN ĐỀ: Panel date filter đang dùng dark navy (#1A1D2E)
  → Lạc hẳn giữa light theme, trông như bug

  FIX: Override thành light card khi ở light theme
*/

/* Light theme override */
[data-theme="light"] .filter-date-panel,
.light-theme .filter-date-panel {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-default) !important;
  color: var(--text-primary) !important;
  box-shadow: var(--shadow-md) !important;
  border-radius: 12px;
}

[data-theme="light"] .filter-date-panel label,
.light-theme .filter-date-panel label {
  color: var(--text-secondary) !important;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

[data-theme="light"] .filter-date-panel input,
.light-theme .filter-date-panel input {
  background: var(--bg-subtle) !important;
  border: 1px solid var(--border-default) !important;
  color: var(--text-primary) !important;
  border-radius: 8px;
  padding: 6px 10px;
}

[data-theme="light"] .filter-date-panel input:focus,
.light-theme .filter-date-panel input:focus {
  border-color: var(--accent-orange) !important;
  box-shadow: var(--shadow-focus) !important;
  outline: none;
}

/* Nút "Lọc dữ liệu" — giữ orange, fine */
.btn-filter {
  background: var(--accent-orange);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.btn-filter:hover {
  background: #e55a1e;
  box-shadow: 0 4px 12px rgba(255,107,43,0.30);
}
```

---

### 3.8 — Tab Bar Fix (Lọc dịch vụ)

```css
/* ─── Tab Container ─── */
.service-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 100px;
  padding: 4px;
  width: fit-content;
  margin-bottom: 20px;
}

/* ─── Tab Item ─── */
.service-tab {
  padding: 7px 18px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
  white-space: nowrap;
  user-select: none;
}

.service-tab:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255,107,43,0.06);
}

.service-tab.active {
  background: var(--accent-orange);
  color: #FFFFFF;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(255,107,43,0.30);
}
```

---

### 3.9 — "Còn hạn / Hết hạn" Toggle Fix

```css
/* ─── Status Toggle Bar ─── */
.status-toggle {
  display: inline-flex;
  align-items: center;
  gap: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 100px;
  padding: 8px 20px;
  box-shadow: var(--shadow-sm);
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.toggle-item:hover {
  color: var(--text-primary);
}

.toggle-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.toggle-item.active-ok   .toggle-dot { background: var(--status-success); }
.toggle-item.active-ok               { color: var(--status-success); font-weight: 600; }

.toggle-item.active-exp  .toggle-dot { background: var(--status-danger); }
.toggle-item.active-exp              { color: var(--status-danger); font-weight: 600; }

.toggle-count {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 100px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}
```

---

### 3.10 — Campaign Row Fix (Dashboard)

```css
/* ─── Campaign Section ─── */
.campaign-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.campaign-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.campaign-section-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.campaign-see-all {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-orange);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.campaign-see-all:hover { opacity: 0.7; }

/* ─── Campaign Row Item ─── */
.campaign-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  margin-bottom: 8px;
  transition: all 0.18s ease;
}

.campaign-row:last-child { margin-bottom: 0; }

.campaign-row:hover {
  border-color: var(--border-default);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

/* Check icon */
.campaign-check {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--status-success-bg);
  border: 1.5px solid var(--status-success-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--status-success);
  flex-shrink: 0;
}

.campaign-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  line-height: 1.3;
}

.campaign-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* Progress bar */
.progress-bar-wrap {
  width: 120px;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 100px;
  overflow: hidden;
  margin-top: 5px;
}

.progress-bar-fill {
  height: 100%;
  background: var(--status-success);
  border-radius: 100px;
  transition: width 0.6s cubic-bezier(0.22,1,0.36,1);
}
```

---

## 4. CHECKLIST TRIỂN KHAI (theo thứ tự)

```
BƯỚC 1 — Nền tảng màu sắc (5 phút)
──────────────────────────────────────
[!] Đổi --bg-base từ #F5F6FA → #E8EAF2
[!] Thêm --shadow-sm / --shadow-md vào root light
[!] Cập nhật --border-subtle / --border-default

BƯỚC 2 — Card shadow (5 phút)
──────────────────────────────────────
[!] Tất cả .card / .stat-card → thêm box-shadow: var(--shadow-sm)
[!] Thêm border: 1px solid var(--border-default)

BƯỚC 3 — Badge màu (10 phút)
──────────────────────────────────────
[!] Đổi badge "CHƯA THANH TOÁN" → status-danger (màu đậm)
[!] Đổi badge "ĐÃ THANH TOÁN" → status-success (màu đậm)
[!] Thêm border vào mỗi badge

BƯỚC 4 — Date filter panel (5 phút)
──────────────────────────────────────
[!] Override dark background → white khi light theme
[!] Đổi text color → var(--text-primary)

BƯỚC 5 — Row items (10 phút)
──────────────────────────────────────
[!] Thêm margin-bottom: 8px và box-shadow nhẹ
[!] Thêm hover state (translateX + bg subtle)

BƯỚC 6 — Stat layout (15 phút)
──────────────────────────────────────
[!] Dashboard: thêm label bên dưới 3 số lớn (70/100%/0%)
[!] CRM: gộp 4 stat vào 1 hàng 4 cột, bỏ ô trống 50%
```

---

## 5. VISUAL REFERENCE — MÀU SẮC CHUẨN

```
Nền trang   ████  #E8EAF2  (slate-200 tối hơn mặc định)
Card surface████  #FFFFFF  (thuần trắng — tương phản rõ)
Subtle bg   ████  #F0F2F8  (cho hover row, inner area)

Text chính  ████  #0F1225  (gần đen, không đen tuyệt đối)
Text phụ    ████  #4B5280  (slate-600)
Text mờ     ████  #8B90B8  (slate-400)

Border nhẹ  ────  rgba(99,102,141,0.10)
Border rõ   ────  rgba(99,102,141,0.16)

Badge thành công  ████  #16A34A  trên  rgba(22,163,74,0.10)
Badge cảnh báo    ████  #DC2626  trên  rgba(220,38,38,0.10)
Badge info        ████  #2563EB  trên  rgba(37,99,235,0.10)
Badge warning     ████  #D97706  trên  rgba(217,119,6,0.10)

CTA primary  ████  #FF6B2B  (giữ nguyên — đẹp)
```

---

## 6. KẾT LUẬN

Light theme bị lỗi không phải do thiếu màu sắc, mà do **thiếu độ tương phản tầng** (layering contrast). Một khi:

- Nền trang đủ tối để card trắng **nổi lên thấy rõ**
- Card có shadow nhẹ để tạo **cảm giác nổi (elevation)**
- Badge dùng màu đủ đậm với border để **dễ đọc nhanh**
- Panel date filter chuyển sang **light style nhất quán**

→ Toàn bộ giao diện sẽ có cảm giác **clean, professional và dễ nhìn** như thiết kế enterprise SaaS hiện đại (Linear, Notion, Vercel style).

---

*Chỉ sửa CSS/giao diện · Không thay đổi logic hay API*
