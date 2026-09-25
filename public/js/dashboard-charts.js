/**
 * DASHBOARD CHARTS MODULE (CA2 Automation Pro)
 * 
 * Hiển thị 2 biểu đồ xu hướng chuyên nghiệp trên Dashboard:
 *  1. Biểu đồ doanh thu theo tháng (Line/Bar chart kết hợp CRM & Báo giá)
 *  2. Biểu đồ tỷ lệ gia hạn (Hợp đồng gia hạn thành công vs Hết hạn không gia hạn)
 * 
 * Tương thích mượt mà với cả Dark Mode và Light Mode.
 * Độc lập 100%, không sửa logic tính KPI hiện có.
 */

(function () {
    'use strict';

    let revenueChartInstance = null;
    let renewalChartInstance = null;
    let isInitialized = false;

    function isAuthenticated() {
        return !!localStorage.getItem('sb-token');
    }

    function initDashboardCharts() {
        if (!isAuthenticated()) return;
        if (!document.getElementById('view-dashboard')) return;

        injectChartsContainer();
        loadAndRenderCharts();

        if (isInitialized) return;
        isInitialized = true;

        // Lắng nghe thay đổi Theme (Dark/Light mode) để vẽ lại biểu đồ cho phù hợp màu nền
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    updateChartsTheme();
                }
            });
        });
        observer.observe(document.body, { attributes: true });

        // Hook an toàn vào showPage để vẽ lại biểu đồ mỗi khi người dùng bấm vào Dashboard
        if (typeof window.showPage === 'function' && !window.showPage._chartsHooked) {
            const originalShowPage = window.showPage;
            window.showPage = function (pageId) {
                originalShowPage(pageId);
                if (pageId === 'dashboard') {
                    setTimeout(() => {
                        injectChartsContainer();
                        loadAndRenderCharts();
                    }, 100);
                }
            };
            window.showPage._chartsHooked = true;
        }

        // Lắng nghe sự kiện chuyển trang để cập nhật nếu đang ở dashboard
        window.addEventListener('popstate', checkAndRefresh);
    }

    function checkAndRefresh() {
        const dashView = document.getElementById('view-dashboard');
        if (dashView && !dashView.classList.contains('hidden')) {
            loadAndRenderCharts();
        }
    }

    // Chèn container chứa 2 biểu đồ vào dưới hàng thống kê CRM
    function injectChartsContainer() {
        if (document.getElementById('dashboard-charts-container')) return;

        const dashView = document.getElementById('view-dashboard');
        if (!dashView) return;

        // Tìm vị trí: sau CRM Overview Row hoặc trước Recent Campaigns
        const recentCampaigns = dashView.querySelector('.card.section') || dashView.children[2];

        const container = document.createElement('div');
        container.id = 'dashboard-charts-container';
        container.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6 my-6 animate-fade-in';
        container.innerHTML = `
            <!-- Chart 1: Doanh thu theo tháng -->
            <div class="card p-6 rounded-2xl border border-white/5 bg-white/[0.02] shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-sm font-bold border border-emerald-500/20">
                                <i data-lucide="trending-up" class="w-4 h-4"></i>
                            </span>
                            <h3 class="text-sm font-black text-white uppercase tracking-wider">Xu hướng doanh thu theo tháng</h3>
                        </div>
                        <p class="text-[11px] text-gray-500 mt-1">Tổng hợp doanh thu chốt từ CRM & Báo giá</p>
                    </div>
                    <div id="chart-rev-total-badge" class="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-black">
                        0 đ
                    </div>
                </div>
                <div class="relative h-64 w-full flex items-center justify-center">
                    <canvas id="canvas-revenue-trend"></canvas>
                </div>
            </div>

            <!-- Chart 2: Tỷ lệ gia hạn hợp đồng -->
            <div class="card p-6 rounded-2xl border border-white/5 bg-white/[0.02] shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div class="flex items-center justify-between mb-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold border border-indigo-500/20">
                                <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                            </span>
                            <h3 class="text-sm font-black text-white uppercase tracking-wider">Tỷ lệ gia hạn hợp đồng</h3>
                        </div>
                        <p class="text-[11px] text-gray-500 mt-1">Hợp đồng gia hạn thành công vs Hết hạn theo tháng</p>
                    </div>
                    <div id="chart-renewal-rate-badge" class="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 text-xs font-black">
                        0% Gia hạn
                    </div>
                </div>
                <!-- Progress bar ngang thanh thoát -->
                <div class="w-full bg-white/5 rounded-full h-1.5 mb-3 overflow-hidden">
                    <div id="chart-renewal-progress-bar" class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700" style="width: 0%"></div>
                </div>
                <div class="relative h-64 w-full flex items-center justify-center">
                    <canvas id="canvas-renewal-rate"></canvas>
                </div>
            </div>
        `;

        if (recentCampaigns) {
            dashView.insertBefore(container, recentCampaigns);
        } else {
            dashView.appendChild(container);
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // ==========================================
    // DATA EXTRACTION & AGGREGATION
    // ==========================================
    async function loadAndRenderCharts() {
        if (!isAuthenticated()) return;
        if (typeof Chart === 'undefined') {
            console.warn('[CHARTS] Chart.js chưa được nạp. Sẽ thử lại sau...');
            setTimeout(loadAndRenderCharts, 500);
            return;
        }

        try {
            // Nạp dữ liệu CRM và Báo giá
            const [crmData, quoteData] = await Promise.all([
                fetchCRMDataSafe(),
                fetchQuotesDataSafe()
            ]);

            // Sinh nhãn 6 tháng gần nhất
            const monthBuckets = generateLastMonths(6);

            // 1. Tính toán Doanh thu theo từng tháng
            const revenueMap = {};
            monthBuckets.forEach(m => revenueMap[m.key] = 0);

            // Cộng doanh thu từ CRM
            crmData.forEach(c => {
                const dateStr = c.start_date || c.created_at;
                if (!dateStr) return;
                const mKey = getMonthKey(dateStr);
                if (revenueMap[mKey] !== undefined) {
                    revenueMap[mKey] += extractPrice(c);
                }
            });

            // Cộng doanh thu từ Báo giá
            quoteData.forEach(q => {
                const dateStr = q.created_at || q.date;
                if (!dateStr) return;
                const mKey = getMonthKey(dateStr);
                if (revenueMap[mKey] !== undefined) {
                    let total = 0;
                    if (q.items && Array.isArray(q.items)) {
                        total = q.items.reduce((s, it) => s + (Number(it.total) || (Number(it.price) * (Number(it.quantity) || 1)) || 0), 0);
                    } else {
                        total = Number(q.total) || Number(q.price) || 0;
                    }
                    revenueMap[mKey] += total;
                }
            });

            // 2. Tính toán Hợp đồng Gia hạn vs Hết hạn
            const renewedMap = {};
            const expiredMap = {};
            monthBuckets.forEach(m => {
                renewedMap[m.key] = 0;
                expiredMap[m.key] = 0;
            });

            const now = new Date();
            crmData.forEach(c => {
                const sType = String(c.service_type || '').toLowerCase();
                const isRenewal = sType.includes('gia hạn') || sType.includes('gia han');

                // Nếu là hợp đồng gia hạn (tính theo start_date hoặc created_at)
                if (isRenewal) {
                    const mKey = getMonthKey(c.start_date || c.created_at);
                    if (renewedMap[mKey] !== undefined) {
                        renewedMap[mKey]++;
                    }
                }

                // Nếu là hợp đồng đã hết hạn (tính theo expired_date)
                if (c.expired_date) {
                    const expDate = new Date(c.expired_date);
                    if (!isNaN(expDate.getTime()) && expDate < now) {
                        const mKey = getMonthKey(c.expired_date);
                        if (expiredMap[mKey] !== undefined) {
                            expiredMap[mKey]++;
                        }
                    }
                }
            });

            // Render 2 Charts
            renderRevenueChart(monthBuckets, revenueMap);
            renderRenewalChart(monthBuckets, renewedMap, expiredMap);

        } catch (err) {
            console.error('[CHARTS] Lỗi nạp dữ liệu vẽ biểu đồ:', err);
        }
    }

    async function fetchCRMDataSafe() {
        if (window.currentCRMData && window.currentCRMData.length > 0) {
            return window.currentCRMData;
        }
        if (typeof authedFetch === 'function' && isAuthenticated()) {
            try {
                const res = await authedFetch('/api/ca2-crm');
                if (res.ok) {
                    const json = await res.json();
                    return json.data || [];
                }
            } catch (e) {}
        }
        return [];
    }

    async function fetchQuotesDataSafe() {
        if (window.quoteManagerInstance?.state?.quotations) {
            return window.quoteManagerInstance.state.quotations;
        }
        if (typeof authedFetch === 'function' && isAuthenticated()) {
            try {
                const res = await authedFetch('/api/quotations');
                if (res.ok) {
                    const json = await res.json();
                    return Array.isArray(json) ? json : [];
                }
            } catch (e) {}
        }
        return [];
    }

    function extractPrice(c) {
        if (!c) return 0;
        if (c.amount) {
            const p = parseInt(String(c.amount).replace(/\D/g, ''), 10);
            if (!isNaN(p) && p > 0) return p;
        }
        if (c.price) {
            const p = parseInt(String(c.price).replace(/\D/g, ''), 10);
            if (!isNaN(p) && p > 0) return p;
        }
        if (c.package_name && typeof c.package_name === 'string') {
            const m = c.package_name.match(/-\s*([\d.,]+)\s*đ?/i);
            if (m && m[1]) {
                const p = parseInt(m[1].replace(/[.,]/g, ''), 10);
                if (!isNaN(p) && p > 0) return p;
            }
        }
        return 0;
    }

    function generateLastMonths(count = 6) {
        const months = [];
        const now = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = `Th ${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
            months.push({ key, label });
        }
        return months;
    }

    function getMonthKey(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // ==========================================
    // CHART RENDERING (Chart.js)
    // ==========================================
    function isLightMode() {
        return document.body.classList.contains('light-mode');
    }

    function getThemeColors() {
        const light = isLightMode();
        return {
            textColor: light ? '#475569' : '#94a3b8',
            gridColor: light ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)',
            tooltipBg: light ? '#ffffff' : '#1e293b',
            tooltipText: light ? '#0f172a' : '#f8fafc',
            tooltipBorder: light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
        };
    }

    function renderRevenueChart(buckets, revenueMap) {
        const canvas = document.getElementById('canvas-revenue-trend');
        if (!canvas) return;

        const labels = buckets.map(b => b.label);
        const dataValues = buckets.map(b => revenueMap[b.key] || 0);
        const totalRev = dataValues.reduce((a, b) => a + b, 0);

        // Update badge
        const badge = document.getElementById('chart-rev-total-badge');
        if (badge) {
            badge.innerText = new Intl.NumberFormat('vi-VN').format(totalRev) + ' đ';
        }

        const theme = getThemeColors();

        if (revenueChartInstance) {
            revenueChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const light = isLightMode();
        const primaryColor = light ? '#7c3aed' : '#a78bfa';
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, light ? 'rgba(124, 58, 237, 0.22)' : 'rgba(167, 139, 250, 0.25)');
        gradient.addColorStop(1, 'rgba(167, 139, 250, 0.00)');

        revenueChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Doanh thu (VNĐ)',
                    data: dataValues,
                    borderColor: primaryColor,
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: primaryColor,
                    pointBorderColor: light ? '#ffffff' : '#16161d',
                    pointBorderWidth: 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.tooltipBg,
                        titleColor: theme.tooltipText,
                        bodyColor: theme.tooltipText,
                        borderColor: theme.tooltipBorder,
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        callbacks: {
                            label: function (context) {
                                return `Doanh thu: ${new Intl.NumberFormat('vi-VN').format(context.parsed.y)} đ`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.gridColor, drawBorder: false },
                        ticks: { color: theme.textColor, font: { size: 11, weight: 'bold' } }
                    },
                    y: {
                        grid: { color: theme.gridColor, drawBorder: false },
                        ticks: {
                            color: theme.textColor,
                            font: { size: 10 },
                            callback: function (val) {
                                if (val >= 1000000) return (val / 1000000) + 'M';
                                if (val >= 1000) return (val / 1000) + 'k';
                                return val;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderRenewalChart(buckets, renewedMap, expiredMap) {
        const canvas = document.getElementById('canvas-renewal-rate');
        if (!canvas) return;

        const labels = buckets.map(b => b.label);
        const renewedData = buckets.map(b => renewedMap[b.key] || 0);
        const expiredData = buckets.map(b => expiredMap[b.key] || 0);

        const totalRenewed = renewedData.reduce((a, b) => a + b, 0);
        const totalExpired = expiredData.reduce((a, b) => a + b, 0);
        const totalAll = totalRenewed + totalExpired;
        const rate = totalAll > 0 ? Math.round((totalRenewed / totalAll) * 100) : 0;

        const badge = document.getElementById('chart-renewal-rate-badge');
        if (badge) {
            badge.innerText = `${rate}% Gia hạn (${totalRenewed}/${totalAll})`;
        }

        const pbar = document.getElementById('chart-renewal-progress-bar');
        if (pbar) {
            pbar.style.width = `${Math.min(100, Math.max(0, rate))}%`;
        }

        const theme = getThemeColors();

        if (renewalChartInstance) {
            renewalChartInstance.destroy();
        }

        renewalChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Gia hạn thành công',
                        data: renewedData,
                        backgroundColor: '#6366f1',
                        borderRadius: 4,
                        barPercentage: 0.5,
                        categoryPercentage: 0.65
                    },
                    {
                        label: 'Hết hạn không gia hạn',
                        data: expiredData,
                        backgroundColor: '#f43f5e',
                        borderRadius: 4,
                        barPercentage: 0.5,
                        categoryPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: theme.textColor,
                            font: { size: 11, weight: 'bold' },
                            boxWidth: 12,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: theme.tooltipBg,
                        titleColor: theme.tooltipText,
                        bodyColor: theme.tooltipText,
                        borderColor: theme.tooltipBorder,
                        borderWidth: 1,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.gridColor, drawBorder: false },
                        ticks: { color: theme.textColor, font: { size: 11, weight: 'bold' } }
                    },
                    y: {
                        grid: { color: theme.gridColor, drawBorder: false },
                        ticks: {
                            color: theme.textColor,
                            stepSize: 1,
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
    }

    function updateChartsTheme() {
        if (revenueChartInstance || renewalChartInstance) {
            loadAndRenderCharts();
        }
    }

    // Expose API
    window.CA2DashboardCharts = {
        init: initDashboardCharts,
        refresh: loadAndRenderCharts
    };

    // Auto-init: chỉ khởi động sau khi app.js xác thực thành công (phát event 'ca2:auth:ready')
    document.addEventListener('ca2:auth:ready', function () {
        setTimeout(initDashboardCharts, 100);
    });

    // Fallback: nếu reload trang mà token hợp lệ
    setTimeout(function () {
        if (isAuthenticated()) {
            initDashboardCharts();
        }
    }, 800);

})();
