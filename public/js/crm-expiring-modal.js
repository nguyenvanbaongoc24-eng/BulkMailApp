/**
 * CRM Expiring Customers Modal
 * Quản lý & hiển thị pop-up danh sách khách hàng sắp hết hạn CKS, PMBH, HĐĐT
 * Sắp xếp theo thời hạn sắp hết hạn gần nhất từ trên xuống dưới
 */

(function() {
    // State của modal
    const expiringModalState = {
        timeFilter: '30',        // '30', '60', 'all_expiring', 'expired', 'all'
        serviceFilter: 'all',    // 'all', 'CKS', 'PMBH', 'HDDT'
        searchQuery: '',
        isLoading: false
    };

    /**
     * Chuẩn hoá chuỗi tiếng Việt để so sánh / tìm kiếm
     */
    function normalizeStr(val) {
        if (!val) return '';
        return val.toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    }

    /**
     * Phân loại dịch vụ: CKS hay PMBH hay HDDT
     */
    function detectServiceCategory(serviceType) {
        const norm = normalizeStr(serviceType);
        if (norm.includes('cks') || norm.includes('chu ky') || norm.includes('token') || norm.includes('remote signing') || norm.includes('sign platform')) {
            return 'CKS';
        }
        if (norm.includes('ebh') || norm.includes('bao hiem') || norm.includes('pmbh') || norm.includes('bhxh')) {
            return 'PMBH';
        }
        if (norm.includes('hoa don') || norm.includes('hddt') || norm.includes('einvoice')) {
            return 'HDDT';
        }
        return 'OTHER';
    }

    /**
     * Tính số ngày còn lại (hoặc đã quá hạn)
     */
    function getRemainingDays(dateStr) {
        if (!dateStr) return null;
        try {
            const exp = new Date(dateStr);
            if (isNaN(exp.getTime())) return null;
            const now = new Date();
            // Reset giờ về 0 để tính trọn vẹn số ngày
            const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffTime = expDay - today;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch (e) {
            return null;
        }
    }

    /**
     * Format ngày dd/mm/yyyy
     */
    function formatExpDate(dateStr) {
        if (!dateStr) return 'Chưa có hạn';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            return dateStr;
        }
    }

    /**
     * Mở modal pop-up
     * @param {string} defaultTimeFilter '30' | '60' | 'all_expiring' | 'expired' | 'all'
     * @param {string} defaultServiceFilter 'all' | 'CKS' | 'PMBH'
     */
    window.openExpiringCustomersModal = async function(defaultTimeFilter = '30', defaultServiceFilter = 'all') {
        const modal = document.getElementById('modal-expiring-customers');
        if (!modal) {
            console.error('[ExpiringModal] Element #modal-expiring-customers not found!');
            return;
        }

        // Thiết lập filter ban đầu
        expiringModalState.timeFilter = defaultTimeFilter;
        expiringModalState.serviceFilter = defaultServiceFilter;
        expiringModalState.searchQuery = '';

        // Reset ô tìm kiếm nếu có
        const searchInput = document.getElementById('expiring-search-input');
        if (searchInput) searchInput.value = '';

        // Hiển thị modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '1000003';
        modal.style.pointerEvents = 'auto';
        modal.style.opacity = '1';

        // Đảm bảo dữ liệu CRM đã được load
        if (!window.currentCRMData || window.currentCRMData.length === 0) {
            showLoadingInModal(true);
            try {
                const res = await (typeof authedFetch === 'function' ? authedFetch('/api/ca2-crm') : fetch('/api/ca2-crm'));
                const json = await res.json();
                const rawList = Array.isArray(json) ? json : (json.data || []);
                window.currentCRMData = (rawList || []).map(item => {
                    return typeof sanitizeCRMRecord === 'function' ? sanitizeCRMRecord(item) : item;
                });
            } catch (err) {
                console.error('[ExpiringModal] Lỗi tải dữ liệu CRM:', err);
            } finally {
                showLoadingInModal(false);
            }
        }

        // Cập nhật giao diện tabs và danh sách
        updateTabsUI();
        renderExpiringList();
    };

    /**
     * Đóng modal
     */
    window.closeExpiringCustomersModal = function() {
        const modal = document.getElementById('modal-expiring-customers');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    };

    /**
     * Đổi filter thời gian
     */
    window.setExpiringTimeFilter = function(filterVal) {
        expiringModalState.timeFilter = filterVal;
        updateTabsUI();
        renderExpiringList();
    };

    /**
     * Đổi filter dịch vụ
     */
    window.setExpiringServiceFilter = function(serviceVal) {
        expiringModalState.serviceFilter = serviceVal;
        updateServiceButtonsUI();
        renderExpiringList();
    };

    /**
     * Xử lý tìm kiếm tức thì
     */
    window.handleExpiringSearch = function(query) {
        expiringModalState.searchQuery = (query || '').trim();
        renderExpiringList();
    };

    /**
     * Hiển thị trạng thái đang tải
     */
    function showLoadingInModal(isLoading) {
        const bodyEl = document.getElementById('expiring-customers-list');
        if (!bodyEl) return;
        if (isLoading) {
            bodyEl.innerHTML = `
                <div class="py-16 flex flex-col items-center justify-center text-center">
                    <div class="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                    <p class="text-sm font-bold text-gray-300">Đang đồng bộ danh sách khách hàng...</p>
                    <p class="text-xs text-gray-500 mt-1">Vui lòng chờ trong giây lát</p>
                </div>
            `;
        }
    }

    /**
     * Cập nhật UI cho các Tab thời gian và Badge số lượng
     */
    function updateTabsUI() {
        const data = window.currentCRMData || [];
        let cnt30 = 0, cnt60 = 0, cntExpired = 0, cntAllExpiring = 0;

        data.forEach(c => {
            const days = getRemainingDays(c.expired_date);
            if (days !== null) {
                if (days < 0) {
                    cntExpired++;
                } else {
                    if (days <= 60) cntAllExpiring++;
                    if (days <= 30) cnt30++;
                    else if (days <= 60) cnt60++;
                }
            }
        });

        // Cập nhật text badge số lượng trên các tab
        const b30 = document.getElementById('badge-count-30');
        const b60 = document.getElementById('badge-count-60');
        const bAllExp = document.getElementById('badge-count-allexp');
        const bExpired = document.getElementById('badge-count-expired');
        const bAll = document.getElementById('badge-count-all');

        if (b30) b30.innerText = cnt30;
        if (b60) b60.innerText = cnt60;
        if (bAllExp) bAllExp.innerText = cntAllExpiring;
        if (bExpired) bExpired.innerText = cntExpired;
        if (bAll) bAll.innerText = data.length;

        // Cập nhật style nút active
        const tabBtns = document.querySelectorAll('.exp-time-tab');
        tabBtns.forEach(btn => {
            const val = btn.dataset.timeFilter;
            if (val === expiringModalState.timeFilter) {
                btn.className = 'exp-time-tab px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25';
            } else {
                btn.className = 'exp-time-tab px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5';
            }
        });

        updateServiceButtonsUI();
    }

    /**
     * Cập nhật UI cho nút lọc dịch vụ
     */
    function updateServiceButtonsUI() {
        const svcBtns = document.querySelectorAll('.exp-svc-btn');
        svcBtns.forEach(btn => {
            const val = btn.dataset.serviceFilter;
            if (val === expiringModalState.serviceFilter) {
                btn.className = 'exp-svc-btn px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-white/20 text-white border border-white/20 shadow-sm';
            } else {
                btn.className = 'exp-svc-btn px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-transparent text-gray-400 hover:text-white hover:bg-white/5 border border-transparent';
            }
        });
    }

    /**
     * Render danh sách khách hàng sắp hết hạn
     */
    function renderExpiringList() {
        const bodyEl = document.getElementById('expiring-customers-list');
        const countHeaderEl = document.getElementById('expiring-results-count');
        if (!bodyEl) return;

        const allCustomers = window.currentCRMData || [];
        if (allCustomers.length === 0) {
            bodyEl.innerHTML = `
                <div class="py-16 text-center text-gray-400">
                    <div class="text-5xl mb-3">📭</div>
                    <div class="text-base font-bold text-white">Chưa có dữ liệu khách hàng</div>
                    <p class="text-xs text-gray-500 mt-1">Dữ liệu CRM đang trống hoặc chưa được nhập</p>
                </div>
            `;
            if (countHeaderEl) countHeaderEl.innerText = '0 khách hàng';
            return;
        }

        // Lọc dữ liệu
        let list = allCustomers.filter(c => {
            const days = getRemainingDays(c.expired_date);

            // 1. Lọc theo thời hạn
            if (expiringModalState.timeFilter === '30') {
                if (days === null || days < 0 || days > 30) return false;
            } else if (expiringModalState.timeFilter === '60') {
                if (days === null || days <= 30 || days > 60) return false;
            } else if (expiringModalState.timeFilter === 'all_expiring') {
                if (days === null || days < 0 || days > 60) return false;
            } else if (expiringModalState.timeFilter === 'expired') {
                if (days === null || days >= 0) return false;
            }
            // 'all' thì giữ lại tất cả

            // 2. Lọc theo loại dịch vụ
            if (expiringModalState.serviceFilter !== 'all') {
                const cat = detectServiceCategory(c.service_type);
                if (cat !== expiringModalState.serviceFilter) return false;
            }

            // 3. Tìm kiếm theo Từ khoá (MST, Tên Cty, SĐT)
            if (expiringModalState.searchQuery) {
                const q = normalizeStr(expiringModalState.searchQuery);
                const mstNorm = normalizeStr(c.mst);
                const nameNorm = normalizeStr(c.company_name);
                const phoneNorm = normalizeStr(c.phone);
                const svcNorm = normalizeStr(c.service_type);

                if (!mstNorm.includes(q) && !nameNorm.includes(q) && !phoneNorm.includes(q) && !svcNorm.includes(q)) {
                    return false;
                }
            }

            return true;
        });

        // 4. SẮP XẾP: Thời hạn sắp hết hạn gần nhất xếp thứ tự từ trên xuống dưới
        list.sort((a, b) => {
            const daysA = getRemainingDays(a.expired_date);
            const daysB = getRemainingDays(b.expired_date);

            // Nếu không có ngày hết hạn, đưa xuống cuối
            if (daysA === null && daysB === null) return 0;
            if (daysA === null) return 1;
            if (daysB === null) return -1;

            if (expiringModalState.timeFilter === 'expired') {
                // Với khách đã hết hạn: ngày hết hạn gần nhất (quá hạn ít nhất) lên đầu
                return daysB - daysA; 
            } else {
                // Với khách sắp hết hạn: còn ít ngày nhất (gần nhất) lên trên cùng
                // Ví dụ: 0 ngày -> 1 ngày -> 2 ngày -> ... -> 30 ngày -> 60 ngày
                return daysA - daysB;
            }
        });

        // Cập nhật số lượng đếm
        if (countHeaderEl) {
            countHeaderEl.innerText = `${list.length} khách hàng`;
        }

        // Nếu không có kết quả
        if (list.length === 0) {
            bodyEl.innerHTML = `
                <div class="py-16 text-center text-gray-400">
                    <div class="text-5xl mb-3">🔍</div>
                    <div class="text-base font-bold text-white">Không tìm thấy khách hàng phù hợp</div>
                    <p class="text-xs text-gray-500 mt-1">Thử thay đổi bộ lọc thời hạn, dịch vụ hoặc từ khóa tìm kiếm</p>
                </div>
            `;
            return;
        }

        // Render từng khách hàng
        bodyEl.innerHTML = list.map((c, index) => {
            const days = getRemainingDays(c.expired_date);
            const category = detectServiceCategory(c.service_type);
            const expFormatted = formatExpDate(c.expired_date);

            // Xác định thời hạn còn lại & Badge hiển thị
            let countdownBadge = '';
            let countdownSub = '';
            let cardBorderHighlight = '';

            if (days === null) {
                countdownBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">Chưa xác định</span>`;
            } else if (days < 0) {
                const overDays = Math.abs(days);
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <i class="fas fa-ban text-[11px]"></i> Quá hạn ${overDays} ngày
                </span>`;
                countdownSub = `<span class="text-[11px] text-rose-400/80 font-semibold block mt-1">Đã hết ngày ${expFormatted}</span>`;
                cardBorderHighlight = 'border-rose-500/20 hover:border-rose-500/40 bg-gradient-to-r from-rose-500/[0.03] to-transparent';
            } else if (days === 0) {
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40">
                    <i class="fas fa-bell text-[11px]"></i> Hết hạn HÔM NAY!
                </span>`;
                countdownSub = `<span class="text-[11px] text-red-400 font-bold block mt-1">Hạn cuối: ${expFormatted}</span>`;
                cardBorderHighlight = 'border-red-500/50 hover:border-red-500 bg-red-500/[0.05]';
            } else if (days <= 7) {
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                    <i class="fas fa-fire text-[11px]"></i> Khẩn cấp: Còn ${days} ngày
                </span>`;
                countdownSub = `<span class="text-[11px] text-rose-300 font-semibold block mt-1">Hạn: ${expFormatted}</span>`;
                cardBorderHighlight = 'border-rose-500/30 hover:border-rose-500/60 bg-rose-500/[0.02]';
            } else if (days <= 30) {
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/35">
                    <i class="fas fa-hourglass-half text-[11px]"></i> Còn ${days} ngày
                </span>`;
                countdownSub = `<span class="text-[11px] text-orange-300/80 font-semibold block mt-1">Hạn: ${expFormatted}</span>`;
                cardBorderHighlight = 'border-orange-500/25 hover:border-orange-500/50 bg-orange-500/[0.02]';
            } else if (days <= 60) {
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    <i class="fas fa-triangle-exclamation text-[11px]"></i> Còn ${days} ngày
                </span>`;
                countdownSub = `<span class="text-[11px] text-yellow-300/80 font-semibold block mt-1">Hạn: ${expFormatted}</span>`;
                cardBorderHighlight = 'border-yellow-500/20 hover:border-yellow-500/40 bg-yellow-500/[0.01]';
            } else {
                countdownBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    <i class="fas fa-circle-check text-[11px]"></i> Còn ${days} ngày
                </span>`;
                countdownSub = `<span class="text-[11px] text-gray-400 font-medium block mt-1">Hạn: ${expFormatted}</span>`;
                cardBorderHighlight = 'border-white/10 hover:border-white/20';
            }

            // Badge dịch vụ: CKS / PMBH / HDDT
            let serviceBadge = '';
            if (category === 'CKS') {
                serviceBadge = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        <i class="fas fa-signature text-[10px]"></i> CKS (Chữ ký số)
                    </span>
                `;
            } else if (category === 'PMBH') {
                serviceBadge = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <i class="fas fa-shield-heart text-[10px]"></i> PMBH (Bảo hiểm EBH)
                    </span>
                `;
            } else if (category === 'HDDT') {
                serviceBadge = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        <i class="fas fa-receipt text-[10px]"></i> Hóa đơn điện tử
                    </span>
                `;
            } else {
                serviceBadge = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-500/15 text-gray-300 border border-gray-500/30">
                        <i class="fas fa-box text-[10px]"></i> ${escapeHtml(c.service_type || 'Dịch vụ')}
                    </span>
                `;
            }

            const rawPkg = c.package_name || c.duration || '';
            const pkgInfo = rawPkg ? `<span class="text-[11px] text-gray-400 font-medium bg-white/5 px-2 py-0.5 rounded border border-white/5"><i class="fas fa-cubes text-[10px] mr-1 text-gray-500"></i>${escapeHtml(rawPkg)}</span>` : '';

            // Safe attributes for inline functions
            const safeMst = escapeHtml(c.mst || '');
            const safeComp = escapeHtml(c.company_name || 'Không rõ tên công ty');
            const safePhone = escapeHtml(c.phone || '');
            const safeId = escapeHtml(c.id || '');

            return `
                <div class="group relative rounded-2xl p-4 sm:p-5 border transition-all duration-200 bg-white/[0.02] hover:bg-white/[0.05] ${cardBorderHighlight} flex flex-col md:flex-row md:items-center justify-between gap-4">
                    
                    <!-- Cột 1 & 2: Thông tin công ty, MST & Dịch vụ -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-gray-400 flex-shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                                #${index + 1}
                            </div>
                            <div class="min-w-0 flex-1">
                                <!-- Tên công ty -->
                                <h4 class="text-base font-black text-white hover:text-orange-400 transition-colors truncate drop-shadow-sm leading-snug cursor-pointer" onclick="openCRMEditFromExpiring('${safeId}')" title="${safeComp}">
                                    ${safeComp}
                                </h4>

                                <!-- MST & Dịch vụ & Gói -->
                                <div class="flex flex-wrap items-center gap-2 mt-2">
                                    <!-- MST -->
                                    <div class="inline-flex items-center gap-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/25 px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer transition-colors"
                                         onclick="copyExpiringMST('${safeMst}', this)" title="Click để sao chép MST">
                                        <i class="far fa-copy text-[10px]"></i>
                                        <span>MST: ${safeMst || '---'}</span>
                                    </div>

                                    <!-- Loại dịch vụ (CKS/PMBH) -->
                                    ${serviceBadge}

                                    <!-- Gói cước -->
                                    ${pkgInfo}
                                </div>

                                <!-- Thông tin liên hệ -->
                                <div class="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-400 mt-2.5">
                                    ${safePhone ? `
                                        <a href="tel:${safePhone}" class="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors">
                                            <i class="fas fa-phone-alt text-[10px]"></i> ${safePhone}
                                        </a>
                                    ` : ''}
                                    ${c.email ? `
                                        <a href="mailto:${escapeHtml(c.email)}" class="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors truncate max-w-[220px]">
                                            <i class="fas fa-envelope text-[10px]"></i> ${escapeHtml(c.email)}
                                        </a>
                                    ` : ''}
                                    ${c.specific_service ? `
                                        <span class="text-gray-500 text-[11px]"><i class="fas fa-tag text-[10px] mr-1"></i>${escapeHtml(c.specific_service)}</span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Cột 3: Thời hạn sắp hết hạn khoảng bao lâu & Nút thao tác -->
                    <div class="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-white/5 flex-shrink-0">
                        <!-- Countdown / Thời hạn còn lại -->
                        <div class="text-left md:text-right">
                            ${countdownBadge}
                            ${countdownSub}
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex items-center gap-2">
                            <!-- Nút Tạo báo giá -->
                            <button onclick="createQuotationForCustomerById('${safeId}')" 
                                    class="px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                                    title="Tạo báo giá gia hạn nhanh cho khách hàng này">
                                <i class="fas fa-file-invoice-dollar text-[11px]"></i>
                                <span>Báo giá</span>
                            </button>

                            <!-- Nút Xem / Sửa CRM -->
                            <button onclick="openCRMEditFromExpiring('${safeId}')" 
                                    class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                                    title="Xem và chỉnh sửa chi tiết trong CRM">
                                <i class="fas fa-pen-to-square text-[11px]"></i>
                                <span>Chi tiết</span>
                            </button>
                        </div>
                    </div>

                </div>
            `;
        }).join('');
    }

    /**
     * Copy MST vào clipboard
     */
    window.copyExpiringMST = function(mst, element) {
        if (!mst || mst === '---') return;
        navigator.clipboard.writeText(mst).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = `<i class="fas fa-check text-[10px] text-emerald-400"></i> <span class="text-emerald-400 font-bold">Đã sao chép!</span>`;
            setTimeout(() => {
                element.innerHTML = originalHTML;
            }, 1800);
        }).catch(err => {
            console.error('Lỗi sao chép:', err);
        });
    };

    /**
     * Tạo báo giá từ ID khách hàng
     */
    window.createQuotationForCustomerById = function(id) {
        const cust = (window.currentCRMData || []).find(c => String(c.id) === String(id));
        if (cust) {
            window.createQuotationForCustomer(cust.company_name || '', cust.mst || '', cust.phone || '');
        }
    };

    /**
     * Tạo báo giá từ khách hàng
     */
    window.createQuotationForCustomer = function(compName, mst, phone) {
        window.closeExpiringCustomersModal();
        setTimeout(() => {
            if (typeof window.forceOpenQuotationModal === 'function') {
                window.forceOpenQuotationModal();
            } else if (typeof window.openCreateQuotationModal === 'function') {
                window.openCreateQuotationModal();
            }
            setTimeout(() => {
                const cInp = document.getElementById('quote-company-inp');
                const mInp = document.getElementById('quote-mst-inp');
                const pInp = document.getElementById('quote-phone-inp');
                if (cInp && compName) cInp.value = compName;
                if (mInp && mst) mInp.value = mst;
                if (pInp && phone) pInp.value = phone;
            }, 150);
        }, 120);
    };

    /**
     * Mở modal edit CRM của khách hàng
     */
    window.openCRMEditFromExpiring = function(id) {
        window.closeExpiringCustomersModal();
        if (typeof showPage === 'function') {
            showPage('ca2-crm');
        }
        setTimeout(() => {
            if (typeof editCRM === 'function') {
                editCRM(id);
            }
        }, 200);
    };

    /**
     * Xuất danh sách đang lọc ra file Excel
     */
    window.exportExpiringToExcel = function() {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện Excel đang tải, vui lòng thử lại sau giây lát!');
            return;
        }

        const allCustomers = window.currentCRMData || [];
        const filteredList = allCustomers.filter(c => {
            const days = getRemainingDays(c.expired_date);
            if (expiringModalState.timeFilter === '30') {
                if (days === null || days < 0 || days > 30) return false;
            } else if (expiringModalState.timeFilter === '60') {
                if (days === null || days <= 30 || days > 60) return false;
            } else if (expiringModalState.timeFilter === 'all_expiring') {
                if (days === null || days < 0 || days > 60) return false;
            } else if (expiringModalState.timeFilter === 'expired') {
                if (days === null || days >= 0) return false;
            }
            if (expiringModalState.serviceFilter !== 'all') {
                const cat = detectServiceCategory(c.service_type);
                if (cat !== expiringModalState.serviceFilter) return false;
            }
            if (expiringModalState.searchQuery) {
                const q = normalizeStr(expiringModalState.searchQuery);
                const mstNorm = normalizeStr(c.mst);
                const nameNorm = normalizeStr(c.company_name);
                if (!mstNorm.includes(q) && !nameNorm.includes(q)) return false;
            }
            return true;
        });

        // Sắp xếp hạn gần nhất trước
        filteredList.sort((a, b) => {
            const daysA = getRemainingDays(a.expired_date);
            const daysB = getRemainingDays(b.expired_date);
            if (daysA === null) return 1;
            if (daysB === null) return -1;
            if (expiringModalState.timeFilter === 'expired') {
                return daysB - daysA;
            }
            return daysA - daysB;
        });

        const rows = filteredList.map((c, i) => {
            const days = getRemainingDays(c.expired_date);
            let statusText = '';
            if (days === null) statusText = 'Chưa có hạn';
            else if (days < 0) statusText = `Quá hạn ${Math.abs(days)} ngày`;
            else if (days === 0) statusText = 'Hết hạn hôm nay';
            else statusText = `Còn ${days} ngày`;

            return {
                'STT': i + 1,
                'Mã số thuế': c.mst || '',
                'Tên doanh nghiệp': c.company_name || '',
                'Dịch vụ': c.service_type || '',
                'Gói cước': c.package_name || c.duration || '',
                'Ngày hết hạn': formatExpDate(c.expired_date),
                'Số ngày còn lại': days !== null ? days : '',
                'Tình trạng': statusText,
                'Số điện thoại': c.phone || '',
                'Email': c.email || '',
                'Địa chỉ': c.address || '',
                'Ghi chú': c.notes || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Khach_Hang_Sap_Het_Han");
        const filename = `DS_Khach_Hang_Sap_Het_Han_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    /**
     * Helper escape HTML
     */
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

})();
