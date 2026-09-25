/**
 * NOTIFICATIONS MODULE (CA2 Automation Pro)
 * 
 * Quản lý chuông thông báo real-time, badge, dropdown và đồng bộ trạng thái đã đọc.
 * Nguồn thông báo:
 *  1. CRM Expiry: Khách hàng sắp hết hạn (30d / 60d) hoặc đã hết hạn
 *  2. Campaign Error: Chiến dịch email có tỷ lệ lỗi vượt ngưỡng (> 20%)
 *  3. Task Reminder: Nhắc việc tuần sắp đến hạn (1 ngày) hoặc quá hạn chưa hoàn thành
 * 
 * Độc lập 100%, tự render vào Header và polling định kỳ 45s.
 */

(function () {
    'use strict';

    // State
    let notificationList = [];
    let readIds = new Set();
    let pollTimer = null;
    let isDropdownOpen = false;
    let isModuleInitialized = false;

    // Local storage key for fallback
    const LOCAL_READ_KEY = 'ca2_read_notifications_v1';

    // Kiểm tra người dùng đã xác thực chưa (có token hợp lệ)
    function isAuthenticated() {
        const token = localStorage.getItem('sb-token');
        return !!token;
    }

    function initNotificationModule() {
        // Bảo vệ: chỉ chạy 1 lần và khi đã đăng nhập
        if (isModuleInitialized) return;
        if (!isAuthenticated()) {
            console.warn('[NOTIF] Bỏ qua init - chưa xác thực.');
            return;
        }
        isModuleInitialized = true;

        loadLocalReadIds();
        injectBellUI();
        fetchAndRefreshNotifications();

        // Bắt đầu Polling định kỳ mỗi 45 giây
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (!isAuthenticated()) return; // dừng nếu token bị xóa
            fetchAndRefreshNotifications();
        }, 45000);

        // Lắng nghe sự kiện click ra ngoài để đóng dropdown
        document.addEventListener('click', (e) => {
            const container = document.getElementById('notif-bell-container');
            const dropdown = document.getElementById('notif-dropdown');
            if (container && dropdown && !container.contains(e.target)) {
                closeDropdown();
            }
        });
    }

    // Nạp cache đã đọc từ LocalStorage
    function loadLocalReadIds() {
        try {
            const raw = localStorage.getItem(LOCAL_READ_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    readIds = new Set(arr);
                }
            }
        } catch (e) {
            console.warn('[NOTIF] Lỗi đọc local read ids:', e);
        }
    }

    function saveLocalReadIds() {
        try {
            localStorage.setItem(LOCAL_READ_KEY, JSON.stringify([...readIds]));
        } catch (e) {
            console.warn('[NOTIF] Lỗi lưu local read ids:', e);
        }
    }

    // Chèn chuông thông báo vào Header
    function injectBellUI() {
        if (document.getElementById('notif-bell-container')) return;

        // Tìm vị trí thích hợp trong header: trước các nút thao tác
        const headerActions = document.querySelector('header .flex.items-center.gap-4') || 
                              document.querySelector('header div:last-child');
        if (!headerActions) return;

        const container = document.createElement('div');
        container.id = 'notif-bell-container';
        container.className = 'relative inline-block text-left';
        container.innerHTML = `
            <button id="notif-bell-btn" type="button" 
                class="notif-bell-button"
                title="Thông báo hệ thống">
                <i class="fas fa-bell text-[15px]"></i>
                <!-- Unread Badge -->
                <span id="notif-badge" class="hidden">0</span>
            </button>

            <!-- Dropdown Panel -->
            <div id="notif-dropdown" class="hidden notif-dropdown-panel">
                <!-- Header -->
                <div class="notif-header">
                    <div class="notif-title-group">
                        <span class="text-sm">🔔</span>
                        <h3 class="notif-header-title">Thông báo</h3>
                        <span id="notif-count-label" class="notif-count-badge">0 chưa đọc</span>
                    </div>
                    <button id="notif-read-all-btn" class="notif-read-all-button" type="button">
                        <i class="fas fa-check-double text-[11px]"></i> Đọc tất cả
                    </button>
                </div>

                <!-- Notification Items List -->
                <div id="notif-list-body" class="notif-list-container custom-scrollbar">
                    <div class="p-6 text-center text-xs text-gray-400">
                        <i class="fas fa-spinner fa-spin mr-1"></i> Đang tải thông báo...
                    </div>
                </div>

                <!-- Footer -->
                <div class="notif-footer">
                    <i class="fas fa-sync-alt text-[10px] opacity-60"></i>
                    <span>Tự động cập nhật mỗi 45 giây</span>
                </div>
            </div>
        `;

        // Chèn vào đầu nhóm nút bên phải của header
        headerActions.insertBefore(container, headerActions.firstChild);

        // Gắn sự kiện click chuông
        const bellBtn = document.getElementById('notif-bell-btn');
        bellBtn.addEventListener('click', toggleDropdown);

        // Gắn sự kiện "Đọc tất cả"
        const readAllBtn = document.getElementById('notif-read-all-btn');
        readAllBtn.addEventListener('click', markAllAsRead);
    }

    function toggleDropdown(e) {
        if (e) e.stopPropagation();
        const dropdown = document.getElementById('notif-dropdown');
        if (!dropdown) return;
        isDropdownOpen = !isDropdownOpen;
        if (isDropdownOpen) {
            dropdown.classList.remove('hidden');
            renderNotificationItems();
        } else {
            dropdown.classList.add('hidden');
        }
    }

    function closeDropdown() {
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        isDropdownOpen = false;
    }

    // ==========================================
    // DATA FETCHING & AGGREGATION
    // ==========================================
    async function fetchAndRefreshNotifications() {
        // Guard: không gọi API nếu chưa xác thực
        if (!isAuthenticated()) return;
        try {
            const [crmNotifications, campaignNotifications, taskNotifications, serverReadRes] = await Promise.all([
                fetchCRMExpirations(),
                fetchCampaignErrors(),
                fetchWeeklyTaskReminders(),
                fetchServerNotifications()
            ]);

            // Tổng hợp và sắp xếp
            const combined = [...taskNotifications, ...campaignNotifications, ...crmNotifications];
            
            // Lọc trùng theo id
            const uniqueMap = new Map();
            combined.forEach(n => {
                if (!uniqueMap.has(n.id)) {
                    uniqueMap.set(n.id, n);
                }
            });

            notificationList = Array.from(uniqueMap.values());
            
            // Áp dụng trạng thái đã đọc
            notificationList.forEach(n => {
                if (readIds.has(n.id)) {
                    n.is_read = true;
                }
            });

            // Sắp xếp: Chưa đọc lên đầu, sau đó theo thời gian giảm dần
            notificationList.sort((a, b) => {
                if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

            updateBadge();
            if (isDropdownOpen) {
                renderNotificationItems();
            }
        } catch (err) {
            console.warn('[NOTIF] Lỗi làm mới thông báo:', err);
        }
    }

    // 1. CRM Expiry Notifications
    async function fetchCRMExpirations() {
        const items = [];
        try {
            // Guard: không gọi API nếu chưa xác thực
            if (!isAuthenticated()) return items;
            let data = window.currentCRMData;
            if (!data || data.length === 0) {
                if (typeof authedFetch === 'function') {
                    const res = await authedFetch('/api/ca2-crm');
                    if (!res || !res.ok) return items;
                    const json = await res.json();
                    data = json.data || [];
                }
            }
            if (!Array.isArray(data)) return items;

            const now = new Date();
            data.forEach(c => {
                if (!c.expired_date) return;
                const expDate = new Date(c.expired_date);
                if (isNaN(expDate.getTime())) return;

                const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                const name = c.company_name || c.customer_name || c.mst || 'Khách hàng';
                const mst = c.mst || '';

                if (daysLeft < 0) {
                    // Đã hết hạn
                    items.push({
                        id: `crm-exp-${c.id || mst}-${c.expired_date}`,
                        type: 'crm_expiry',
                        badgeText: 'Đã hết hạn',
                        badgeClass: 'notif-badge-danger',
                        iconClass: 'notif-icon-danger',
                        iconHtml: '<i class="fas fa-file-invoice"></i>',
                        title: name,
                        desc: `MST: ${mst || '—'} • Quá hạn ${Math.abs(daysLeft)} ngày (${formatVNDate(c.expired_date)})`,
                        timestamp: c.expired_date,
                        ref_id: mst,
                        targetPage: 'ca2-crm',
                        is_read: false
                    });
                } else if (daysLeft <= 30) {
                    // Sắp hết hạn (<= 30 ngày)
                    items.push({
                        id: `crm-exp30-${c.id || mst}-${c.expired_date}`,
                        type: 'crm_expiry',
                        badgeText: `Còn ${daysLeft} ngày`,
                        badgeClass: 'notif-badge-danger',
                        iconClass: 'notif-icon-danger',
                        iconHtml: '<i class="fas fa-hourglass-half"></i>',
                        title: name,
                        desc: `MST: ${mst || '—'} • Hạn chót: ${formatVNDate(c.expired_date)}`,
                        timestamp: c.expired_date,
                        ref_id: mst,
                        targetPage: 'ca2-crm',
                        is_read: false
                    });
                } else if (daysLeft <= 60) {
                    // Sắp hết hạn (<= 60 ngày)
                    items.push({
                        id: `crm-exp60-${c.id || mst}-${c.expired_date}`,
                        type: 'crm_expiry',
                        badgeText: `Còn ${daysLeft} ngày`,
                        badgeClass: 'notif-badge-warning',
                        iconClass: 'notif-icon-warning',
                        iconHtml: '<i class="fas fa-calendar-alt"></i>',
                        title: name,
                        desc: `MST: ${mst || '—'} • Chuẩn bị gia hạn (${formatVNDate(c.expired_date)})`,
                        timestamp: c.expired_date,
                        ref_id: mst,
                        targetPage: 'ca2-crm',
                        is_read: false
                    });
                }
            });
        } catch (e) {
            console.warn('[NOTIF] Lỗi lấy CRM Expirations:', e);
        }
        return items;
    }

    // 2. Campaign Error Rate Notifications (> 20%)
    async function fetchCampaignErrors() {
        const items = [];
        try {
            if (typeof authedFetch !== 'function') return items;
            const res = await authedFetch('/api/campaigns');
            if (!res.ok) return items;
            const campaigns = await res.json();
            if (!Array.isArray(campaigns)) return items;

            campaigns.forEach(c => {
                const total = c.total_recipients || (c.recipients && c.recipients.length) || 0;
                const errCount = c.error_count || 0;
                if (total > 0 && errCount > 0) {
                    const errRate = Math.round((errCount / total) * 100);
                    if (errRate >= 20) {
                        items.push({
                            id: `camp-err-${c.id}`,
                            type: 'campaign_error',
                            badgeText: `Lỗi gửi ${errRate}%`,
                            badgeClass: 'notif-badge-danger',
                            iconClass: 'notif-icon-danger',
                            iconHtml: '<i class="fas fa-paper-plane"></i>',
                            title: c.name || 'Chiến dịch email',
                            desc: `${errCount}/${total} email bị lỗi gửi. Vui lòng kiểm tra nhật ký gửi!`,
                            timestamp: c.created_at || new Date().toISOString(),
                            ref_id: c.id,
                            targetPage: 'campaigns',
                            is_read: false
                        });
                    }
                }
            });
        } catch (e) {
            console.warn('[NOTIF] Lỗi lấy Campaign Errors:', e);
        }
        return items;
    }

    // 3. Weekly Report Task Reminders (1 ngày hoặc quá hạn)
    async function fetchWeeklyTaskReminders() {
        const items = [];
        try {
            // Lấy từ nháp Báo cáo tuần hiện tại trong localStorage
            const rawDraft = localStorage.getItem('ca2_weekly_report_draft');
            if (!rawDraft) return items;
            const draft = JSON.parse(rawDraft);
            if (!draft) return items;

            const allTasks = [
                ...(draft.nextWorkItems || []).map(t => ({ ...normalizeTask(t), source: 'Kế hoạch tuần tới' })),
                ...(draft.workItems || []).map(t => ({ ...normalizeTask(t), source: 'Công việc trong tuần' }))
            ];

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            allTasks.forEach((t, idx) => {
                if (!t.due_date || t.is_done) return;
                const due = new Date(t.due_date);
                due.setHours(0, 0, 0, 0);

                const diffTime = due.getTime() - today.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    // Đã quá hạn
                    items.push({
                        id: `task-overdue-${t.due_date}-${idx}-${encodeURIComponent(t.text.slice(0, 15))}`,
                        type: 'task_reminder',
                        badgeText: 'Quá hạn',
                        badgeClass: 'notif-badge-danger',
                        iconClass: 'notif-icon-danger',
                        iconHtml: '<i class="fas fa-calendar-times"></i>',
                        title: t.text,
                        desc: `${t.source} • Hạn chót: ${formatVNDate(t.due_date)} (${Math.abs(diffDays)} ngày trước)`,
                        timestamp: t.due_date,
                        ref_id: 'weekly-report',
                        targetAction: 'openWeeklyReport',
                        is_read: false
                    });
                } else if (diffDays <= 1) {
                    // Còn 1 ngày hoặc hôm nay
                    const dayLabel = diffDays === 0 ? 'Hôm nay' : 'Ngày mai';
                    items.push({
                        id: `task-due-${t.due_date}-${idx}-${encodeURIComponent(t.text.slice(0, 15))}`,
                        type: 'task_reminder',
                        badgeText: `Hạn: ${dayLabel}`,
                        badgeClass: 'notif-badge-warning',
                        iconClass: 'notif-icon-warning',
                        iconHtml: '<i class="fas fa-calendar-check"></i>',
                        title: t.text,
                        desc: `${t.source} • Hạn chót: ${formatVNDate(t.due_date)}`,
                        timestamp: t.due_date,
                        ref_id: 'weekly-report',
                        targetAction: 'openWeeklyReport',
                        is_read: false
                    });
                }
            });
        } catch (e) {
            console.warn('[NOTIF] Lỗi lấy Task Reminders:', e);
        }
        return items;
    }

    function normalizeTask(item) {
        if (typeof item === 'string') {
            return { text: item, is_done: false, due_date: null };
        }
        return {
            text: item.text || '',
            is_done: !!item.is_done,
            due_date: item.due_date || null
        };
    }

    // 4. Đồng bộ danh sách thông báo đã đọc từ Server Supabase
    async function fetchServerNotifications() {
        try {
            if (typeof authedFetch !== 'function') return;
            const res = await authedFetch('/api/notifications');
            if (res.ok) {
                const json = await res.json();
                const list = json.data || [];
                list.forEach(n => {
                    if (n.is_read) {
                        readIds.add(n.ref_id || n.id);
                        readIds.add(n.id);
                    }
                });
                saveLocalReadIds();
            }
        } catch (e) {
            // Không ngắt mạch nếu server lỗi
        }
    }

    // ==========================================
    // RENDER UI
    // ==========================================
    function updateBadge() {
        const badge = document.getElementById('notif-badge');
        const countLabel = document.getElementById('notif-count-label');
        if (!badge) return;

        const unreadCount = notificationList.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (countLabel) {
            countLabel.innerText = unreadCount > 0 ? `${unreadCount} chưa đọc` : '0 chưa đọc';
        }
    }

    function renderNotificationItems() {
        const body = document.getElementById('notif-list-body');
        if (!body) return;

        if (notificationList.length === 0) {
            body.innerHTML = `
                <div class="notif-empty-state">
                    <div class="notif-empty-icon">
                        <i class="fas fa-bell-slash"></i>
                    </div>
                    <div class="notif-empty-title">Không có thông báo mới</div>
                    <div class="notif-empty-sub">Mọi việc đều đang hoạt động tốt</div>
                </div>
            `;
            return;
        }

        body.innerHTML = notificationList.map(item => {
            const isUnread = !item.is_read;
            const timeAgo = formatRelativeTime(item.timestamp);
            const badgeText = item.badgeText || (
                item.type === 'crm_expiry' ? 'Hết hạn' :
                item.type === 'campaign_error' ? 'Lỗi gửi' :
                item.type === 'task_reminder' ? 'Nhắc việc' : 'Thông báo'
            );
            const iconHtml = item.iconHtml || (item.icon ? (item.icon.startsWith('<') ? item.icon : `<span class="text-sm">${item.icon}</span>`) : '<i class="far fa-bell"></i>');
            const iconClass = item.iconClass || 'notif-icon-info';
            const badgeClass = item.badgeClass || 'notif-badge-info';

            return `
                <div class="notif-item ${isUnread ? 'is-unread' : 'is-read'}"
                    onclick="window.CA2Notifications.handleItemClick('${item.id}')">
                    <div class="notif-status-col">
                        ${isUnread ? '<span class="notif-unread-dot" title="Chưa đọc"></span>' : '<span class="notif-read-dot"></span>'}
                    </div>
                    <div class="notif-icon-box ${iconClass}">
                        ${iconHtml}
                    </div>
                    <div class="notif-content-col">
                        <div class="notif-meta-row">
                            <span class="notif-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
                            <span class="notif-time">${timeAgo}</span>
                        </div>
                        <h4 class="notif-title" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title)}
                        </h4>
                        <p class="notif-desc">
                            ${escapeHtml(item.desc)}
                        </p>
                    </div>
                    <button type="button" 
                        onclick="event.stopPropagation(); window.CA2Notifications.markAsRead('${item.id}')"
                        class="notif-mark-single-btn"
                        title="${isUnread ? 'Đánh dấu đã đọc' : 'Đã đọc'}">
                        <i class="fas ${isUnread ? 'fa-check' : 'fa-check-circle text-orange-500'}"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    // ==========================================
    // ACTIONS: MARK READ & NAVIGATION
    // ==========================================
    async function markAsRead(id) {
        readIds.add(id);
        saveLocalReadIds();

        const item = notificationList.find(n => n.id === id);
        if (item) {
            item.is_read = true;
            // Gửi API server
            if (typeof authedFetch === 'function') {
                authedFetch('/api/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id, ref_id: item.ref_id })
                }).catch(() => {});
            }
        }

        updateBadge();
        renderNotificationItems();
    }

    async function markAllAsRead() {
        notificationList.forEach(n => {
            n.is_read = true;
            readIds.add(n.id);
        });
        saveLocalReadIds();

        if (typeof authedFetch === 'function') {
            authedFetch('/api/notifications/read-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).catch(() => {});
        }

        updateBadge();
        renderNotificationItems();
    }

    function handleItemClick(id) {
        const item = notificationList.find(n => n.id === id);
        if (!item) return;

        // Đánh dấu đã đọc
        markAsRead(id);
        closeDropdown();

        // Điều hướng tới đúng trang / mục
        if (item.targetAction === 'openWeeklyReport') {
            if (typeof openWeeklyReportModal === 'function') {
                openWeeklyReportModal();
            }
        } else if (item.targetPage === 'ca2-crm') {
            if (typeof showPage === 'function') {
                showPage('ca2-crm');
            }
            // Tìm và highlight khách hàng trong CRM
            setTimeout(() => {
                const searchInput = document.getElementById('crm-search-input') || 
                                    document.querySelector('input[placeholder*="Tìm kiếm"]');
                if (searchInput && item.ref_id) {
                    searchInput.value = item.ref_id;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 300);
        } else if (item.targetPage === 'campaigns') {
            if (typeof showPage === 'function') {
                showPage('campaigns');
            }
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function formatRelativeTime(dateInput) {
        if (!dateInput) return 'Vừa xong';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return 'Gần đây';

        const now = new Date();
        const diffMs = now - d;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'Vừa xong';
        if (diffMin < 60) return `${diffMin} phút trước`;
        if (diffHour < 24) return `${diffHour} giờ trước`;
        if (diffDay === 1) return 'Hôm qua';
        if (diffDay < 7) return `${diffDay} ngày trước`;
        return formatVNDate(dateInput);
    }

    function formatVNDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Expose API
    window.CA2Notifications = {
        init: initNotificationModule,
        refresh: fetchAndRefreshNotifications,
        markAsRead: markAsRead,
        markAllAsRead: markAllAsRead,
        handleItemClick: handleItemClick
    };

    // Auto-init: chờ event 'ca2:auth:ready' do app.js phát ra SAU KHI đăng nhập thành công
    // Điều này đảm bảo không gọi API khi chưa xác thực
    document.addEventListener('ca2:auth:ready', function() {
        setTimeout(initNotificationModule, 200);
    });

    // Fallback: nếu app.js đã login xong rồi (ví dụ reload trang có token hợp lệ),
    // kiểm tra lại sau 2s
    setTimeout(function() {
        if (!isModuleInitialized && isAuthenticated()) {
            initNotificationModule();
        }
    }, 2000);

})();
