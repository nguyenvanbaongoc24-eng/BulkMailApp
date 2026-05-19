# 🎨 CA2 CRM — Đánh Giá & Tinh Chỉnh Giao Diện
> Phân tích UI/UX · Dark Mode & Light Mode · iOS-smooth Refinement Guide

---

## 1. ĐÁNH GIÁ TỔNG QUAN

### ✅ Điểm mạnh hiện tại

| Hạng mục | Nhận xét |
|---|---|
| **Dark Mode** | Nền tối đậm (`#0f0f14`) tạo cảm giác chuyên nghiệp, phù hợp enterprise |
| **Màu accent** | Orange (`#FF6B2B`) làm nổi bật CTA — nhất quán giữa 2 mode |
| **Cấu trúc sidebar** | Phân nhóm menu rõ ràng theo nhóm chức năng |
| **Stat cards** | Số liệu lớn dễ đọc, màu phân biệt trạng thái (xanh / cam / đỏ) |
| **Bảng danh sách** | Row-based layout dễ scan, có badge trạng thái |

### ❌ Điểm cần cải thiện

| Hạng mục | Vấn đề hiện tại | Mức độ |
|---|---|---|
| **Stat cards spacing** | Cards số liệu quá cách nhau, thiếu liên kết thị giác | 🔴 Cao |
| **Light mode card** | Nền trắng phẳng, không có depth/shadow rõ ràng | 🔴 Cao |
| **Typography hierarchy** | Label phụ quá nhỏ, khó đọc tên metric | 🟠 Trung bình |
| **Tab bar** | Tabs lọc (Tất cả / Chữ ký số...) thiếu pill indicator mượt | 🟠 Trung bình |
| **Row list items** | Quá dày đặc, thiếu breathing room giữa các dòng | 🟠 Trung bình |
| **Badge "CHƯA THANH TOÁN"** | Màu đỏ xám quá nặng, thiếu rounded mềm | 🟡 Thấp |
| **Sidebar active state** | Active item dùng highlight vuông — thiếu pill/rounded | 🟡 Thấp |
| **Animation/transition** | Hầu như không có transition khi chuyển trang/hover | 🔴 Cao |
| **Filter area** | Toolbar filter cứng, thiếu glassmorphism hoặc separator nhẹ | 🟠 Trung bình |
| **Report log rows** | Danh sách nhật ký gửi mail quá thô, thiếu visual grouping | 🟠 Trung bình |

---

## 2. PHÂN TÍCH CHI TIẾT TỪNG MÀN HÌNH

### 2.1 Màn hình CA2 CRM — Quản lý Khách hàng

#### Dark Mode
```
Vấn đề:
- Stat cards (269 / 170 / 8 / 91) có border rất mờ, khó phân biệt
- Khoảng cách giữa 3 cards trên và 1 card dưới không cân đối
- Tabs lọc dịch vụ thiếu transition khi switch
- Toolbar lọc dữ liệu (dropdown + date range) nằm cạnh nhau quá sát
```

#### Light Mode
```
Vấn đề:
- Cards số liệu không có shadow → trông như text thô trên nền trắng
- Stat "269" mờ dần (bị ẩn) trong ảnh light → UX lỗi nhẹ
- Row list items có border mờ khó nhìn
- Badge "CHƯA THANH TOÁN" màu xám-hồng thiếu cảm giác cảnh báo
```

### 2.2 Màn hình Báo cáo — Nhật ký gửi mail

```
Vấn đề:
- Mỗi log item chỉ có bullet point, thiếu visual container (card/row nền)
- Badge "Thành công" màu xanh nằm lệch phải, thiếu cân bằng layout
- Timestamp và tên chiến dịch cùng cỡ chữ → khó scan nhanh
- Không có phân tách nhóm (theo ngày / chiến dịch)
```

### 2.3 Màn hình Bảng điều khiển (Dashboard)

```
Điểm tốt:
- Stat cards với icon phân biệt màu rõ ràng
- Progress bar % chiến dịch dễ hiểu

Cần cải thiện:
- 3 stat lớn trên cùng (70 / 100% / 0%) quá thô, thiếu label rõ
- Section "Chiến dịch gần đây" thiếu hover state rõ ràng
- Không có empty state animation khi 0%
```

---

## 3. DESIGN TOKENS ĐỀ XUẤT

### 3.1 Color System (CSS Variables)

```css
/* ─── DARK MODE ─── */
:root[data-theme="dark"] {
  /* Background layers */
  --bg-base:        #0A0B14;   /* nền chính */
  --bg-surface:     #12141F;   /* card, panel */
  --bg-elevated:    #1A1D2E;   /* dropdown, modal */
  --bg-overlay:     rgba(255,255,255,0.04);

  /* Sidebar */
  --sidebar-bg:     #0D0F1C;
  --sidebar-active: rgba(255, 107, 43, 0.15);
  --sidebar-border: rgba(255,255,255,0.06);

  /* Text */
  --text-primary:   #F0F2FF;
  --text-secondary: #8B90B0;
  --text-muted:     #4A4F6A;

  /* Accent */
  --accent-orange:  #FF6B2B;
  --accent-orange-soft: rgba(255,107,43,0.12);
  --accent-green:   #22C55E;
  --accent-green-soft: rgba(34,197,94,0.12);
  --accent-red:     #EF4444;
  --accent-red-soft: rgba(239,68,68,0.12);
  --accent-amber:   #F59E0B;
  --accent-blue:    #3B82F6;

  /* Border */
  --border-subtle:  rgba(255,255,255,0.06);
  --border-default: rgba(255,255,255,0.10);
  --border-strong:  rgba(255,255,255,0.18);

  /* Shadows */
  --shadow-card:    0 2px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3);
  --shadow-elevated: 0 8px 32px rgba(0,0,0,0.5);
}

/* ─── LIGHT MODE ─── */
:root[data-theme="light"] {
  --bg-base:        #F4F6FB;
  --bg-surface:     #FFFFFF;
  --bg-elevated:    #FFFFFF;
  --bg-overlay:     rgba(0,0,0,0.02);

  --sidebar-bg:     #1A1D2E;   /* sidebar giữ dark luôn — đẹp hơn */
  --sidebar-active: rgba(255,107,43,0.18);
  --sidebar-border: rgba(255,255,255,0.06);

  --text-primary:   #0F1120;
  --text-secondary: #5A6082;
  --text-muted:     #9BA3C0;

  --accent-orange:  #FF6B2B;
  --accent-orange-soft: rgba(255,107,43,0.08);

  --border-subtle:  rgba(0,0,0,0.05);
  --border-default: rgba(0,0,0,0.08);
  --border-strong:  rgba(0,0,0,0.14);

  --shadow-card:    0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-elevated: 0 8px 24px rgba(0,0,0,0.10);
}
```

### 3.2 Border Radius & Spacing

```css
:root {
  /* Radius — iOS-style rounded */
  --radius-sm:  8px;
  --radius-md:  12px;
  --radius-lg:  16px;
  --radius-xl:  20px;
  --radius-pill: 100px;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Typography */
  --font-display: 'Plus Jakarta Sans', sans-serif;  /* heading */
  --font-body:    'Inter', sans-serif;              /* body */
  --font-mono:    'JetBrains Mono', monospace;      /* code/id */
}
```

---

## 4. TINH CHỈNH COMPONENT CỤ THỂ

### 4.1 Sidebar — Active State

```css
/* Thay thế highlight vuông bằng pill indicator */
.sidebar-item.active {
  background: var(--sidebar-active);
  border-radius: var(--radius-md);
  position: relative;
}

.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--accent-orange);
  border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
}
```

### 4.2 Stat Cards — Redesign

```css
.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

/* Glow accent top-left theo màu metric */
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 60px; height: 3px;
  background: var(--card-accent-color); /* bind per card */
  border-radius: 0 0 var(--radius-sm) 0;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}

.stat-number {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-top: var(--space-2);
}
```

### 4.3 Tab Bar — iOS-style Pill Switcher

```css
.tab-bar {
  display: flex;
  gap: var(--space-1);
  background: var(--bg-overlay);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 3px;
  width: fit-content;
}

.tab-item {
  padding: 6px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}

.tab-item.active {
  background: var(--accent-orange);
  color: #fff;
  box-shadow: 0 2px 8px rgba(255,107,43,0.35);
}

.tab-item:hover:not(.active) {
  color: var(--text-primary);
  background: var(--bg-overlay);
}
```

### 4.4 Badge / Status Pill

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.badge-danger {
  background: var(--accent-red-soft);
  color: var(--accent-red);
  border: 1px solid rgba(239,68,68,0.20);
}

.badge-success {
  background: var(--accent-green-soft);
  color: var(--accent-green);
  border: 1px solid rgba(34,197,94,0.20);
}

.badge-warning {
  background: rgba(245,158,11,0.10);
  color: var(--accent-amber);
  border: 1px solid rgba(245,158,11,0.20);
}
```

### 4.5 List Row Items

```css
.customer-row {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-2);

  /* iOS-like spring transition */
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}

.customer-row:hover {
  border-color: var(--border-default);
  background: var(--bg-elevated);
  transform: translateX(2px);
  box-shadow: var(--shadow-card);
}

.customer-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--accent-orange-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--accent-orange);
  flex-shrink: 0;
}

.customer-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.customer-meta {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-top: 2px;
}
```

### 4.6 Filter Toolbar

```css
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(12px);  /* glassmorphism nhẹ */
}

.filter-select {
  background: var(--bg-overlay);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color 0.15s ease;
  cursor: pointer;
  appearance: none;
}

.filter-select:hover {
  border-color: var(--border-default);
}

.filter-select:focus {
  border-color: var(--accent-orange);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-orange-soft);
}
```

### 4.7 Report Log Row — Redesign

```css
.log-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: var(--space-2);
  transition: background 0.15s ease;
}

.log-row:hover {
  background: var(--bg-elevated);
}

.log-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent-green-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-green);
}

.log-email {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.log-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.log-campaign {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-blue);
  margin-top: 3px;
}
```

---

## 5. ANIMATION — iOS-SMOOTH SYSTEM

```css
/* ─── Global Transition Presets ─── */

/* Spring — dùng cho hover card, button press */
.spring {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Ease out — dùng cho fade in, slide in */
.ease-out {
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

/* Snappy — dùng cho toggle, tab switch */
.snappy {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ─── Page Enter Animation ─── */
@keyframes pageSlideIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-enter {
  animation: pageSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

/* ─── Staggered List Animation ─── */
@keyframes rowFadeUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.customer-row {
  animation: rowFadeUp 0.3s ease both;
}

.customer-row:nth-child(1) { animation-delay: 0.05s; }
.customer-row:nth-child(2) { animation-delay: 0.10s; }
.customer-row:nth-child(3) { animation-delay: 0.15s; }
.customer-row:nth-child(4) { animation-delay: 0.20s; }
.customer-row:nth-child(5) { animation-delay: 0.25s; }

/* ─── Stat Number Count Up ─── */
/* Dùng JS CountUp.js hoặc Framer Motion animate() */
/* Target: 0 → actual value trong 0.8s easeOut */

/* ─── Button Press Effect ─── */
.btn-primary:active {
  transform: scale(0.96);
  transition: transform 0.1s ease;
}

/* ─── Skeleton Loading ─── */
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.skeleton {
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--bg-surface) 25%,
    var(--bg-elevated) 50%,
    var(--bg-surface) 75%
  );
  background-size: 200% auto;
  animation: shimmer 1.5s infinite linear;
}

/* ─── Sidebar Item Hover ─── */
.sidebar-item {
  transition: background 0.18s ease, padding-left 0.2s ease;
}

.sidebar-item:hover {
  padding-left: calc(var(--space-4) + 4px);
  background: var(--bg-overlay);
}
```

---

## 6. PROMPT AI ĐỂ TẠO ASSETS UI

### 6.1 Prompt — Dashboard Hero Banner (Midjourney / Gemini)

```
A sleek enterprise SaaS dashboard interface, dark navy background (#0A0B14),
glass-morphism card panels with subtle blue-purple glow edges,
orange accent buttons (#FF6B2B), data visualization charts with cyan gradients,
floating stat cards showing CRM metrics (customers, contracts, expiry dates),
minimal icon set, professional typography, soft ambient light from bottom-left,
8K ultra-sharp, product UI mockup style, no text overlay, 16:9 aspect ratio,
inspired by Linear.app and Vercel dashboard aesthetics
```

### 6.2 Prompt — Light Mode Marketing Screenshot (Gemini)

```
Professional CRM web application screenshot, light mode UI,
white card surfaces with subtle drop shadows, orange primary buttons,
sidebar with dark navy background (contrast split design),
Vietnamese business data management interface, customer list view with status badges,
clean sans-serif typography, soft gray background (#F4F6FB),
enterprise software aesthetic, no people visible, isometric or flat perspective,
high fidelity product UI render
```

### 6.3 Prompt — Email Campaign Feature Banner (Canva AI / Adobe Firefly)

```
Digital marketing automation concept illustration,
dark tech background with glowing email envelope icons floating in space,
orange and teal gradient data streams connecting nodes,
abstract CRM funnel visualization, Vietnamese text placeholder style,
neon accent lights, glassmorphism panels, B2B SaaS enterprise aesthetic,
1:1 ratio, high quality digital art
```

---

## 7. CHECKLIST TINH CHỈNH THEO THỨ TỰ ƯU TIÊN

```
PHASE 1 — Nền tảng (Ưu tiên cao, ít risk)
────────────────────────────────────────
[ ] Cập nhật CSS variables theo Design Tokens ở Section 3
[ ] Thay border-radius vuông → rounded-md/lg trên cards và rows
[ ] Thêm box-shadow nhẹ vào stat cards (light mode)
[ ] Cập nhật badge CHƯA THANH TOÁN → pill style + soft color

PHASE 2 — Tab & Navigation (Trung bình)
────────────────────────────────────────
[ ] Đổi tab lọc dịch vụ sang pill-switcher style
[ ] Sidebar active state → pill indicator bên trái + tint background
[ ] Smooth transition khi navigate sidebar (0.25s ease)

PHASE 3 — Animation & Polish (Nâng cao)
────────────────────────────────────────
[ ] Thêm pageSlideIn khi chuyển trang
[ ] Thêm staggered rowFadeUp cho danh sách khách hàng
[ ] Thêm CountUp animation cho stat numbers
[ ] Hover state translateX cho rows (iOS-feel)
[ ] Skeleton loading khi fetch data

PHASE 4 — Detail & QA
────────────────────────────────────────
[ ] Kiểm tra contrast ratio (WCAG AA minimum)
[ ] Dark/Light toggle transition (opacity fade 0.3s)
[ ] Test responsive mobile ≤ 768px
[ ] Kiểm tra focus states cho accessibility
```

---

## 8. TÓM TẮT ĐỊNH HƯỚNG

| Chiều | Trước | Sau đề xuất |
|---|---|---|
| **Cảm giác** | Functional nhưng cứng | iOS-smooth, enterprise premium |
| **Cards** | Flat, ít depth | Shadow + accent bar + hover lift |
| **Tabs** | Square highlighted | Pill switcher với spring transition |
| **Badges** | Hard red rectangle | Soft pill với dot indicator |
| **Animation** | Gần như không có | Page enter + stagger + count-up |
| **List rows** | Dense, khó phân biệt | Rounded card row + hover slide |
| **Dark mode** | Tốt — giữ nguyên hướng | Tinh chỉnh border + glow nhẹ |
| **Light mode** | Flat, thiếu depth | Shadow + bg tách biệt rõ hơn |

> 💡 **Ghi nhớ**: Sidebar nên giữ dark trong cả 2 mode — tạo split-tone design đặc trưng, tăng tính nhận diện thương hiệu CA2 và tách biệt navigation khỏi content area.

---

*Tài liệu này chỉ đề cập tinh chỉnh giao diện (CSS/UI/Animation).  
Không thay đổi logic nghiệp vụ, API, hay cấu trúc dữ liệu.*
