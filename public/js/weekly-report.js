/**
 * Weekly Report Module for CA2 CRM
 * Generates weekly reports and exports to Word (.docx) format
 * 
 * Dependencies: docx (UMD), FileSaver.js
 * Uses global: currentCRMData, getCRMPrice, currentUser
 */

// ==========================================
// MODAL OPEN / CLOSE
// ==========================================
async function openWeeklyReportModal() {
    const modal = document.getElementById('modal-weekly-report');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setupRevenueInput();

    // Try to load draft first
    const hasDraft = loadWeeklyReportDraft();

    if (!hasDraft) {
        // Auto-detect current week (Monday → Sunday)
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const fmt = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        document.getElementById('wr-from-date').value = fmt(monday);
        document.getElementById('wr-to-date').value = fmt(sunday);

        // Reset form fields
        document.getElementById('wr-call-count').value = '';
        document.getElementById('wr-evaluation').value = '';
        document.getElementById('wr-advantages').value = '';
        document.getElementById('wr-difficulties').value = '';
        document.getElementById('wr-next-call-count').value = '';
        document.getElementById('wr-revenue').value = '';
        document.getElementById('wr-revenue-target').value = '';
        document.getElementById('wr-suggestions').value = '';

        // Reset dynamic work items — keep 1 placeholder each
        resetWorkItems('wr-work-list');
        resetWorkItems('wr-next-work-list');

        await calculateAndFillWeeklyRevenue(false);
    } else {
        const currentRev = document.getElementById('wr-revenue')?.value?.trim();
        if (!currentRev || currentRev === '0') {
            await calculateAndFillWeeklyRevenue(false);
        }
    }
}

function closeWeeklyReportModal() {
    const modal = document.getElementById('modal-weekly-report');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ==========================================
// DYNAMIC WORK ITEMS (Add / Remove)
// ==========================================
function resetWorkItems(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    addWorkItem(containerId);
}

function addWorkItem(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'wr-work-row flex items-center gap-3 mb-2 animate-fade-in';
    row.innerHTML = `
        <span class="text-orange-400 font-bold text-xs select-none">+</span>
        <input type="text" placeholder="Nhập công việc..." 
            class="flex-1 bg-white/5 border border-white/10 focus:border-orange-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none transition-all" />
        <button type="button" onclick="removeWorkItem(this)" 
            class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center text-xs">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(row);
    saveWeeklyReportDraft();
}

function removeWorkItem(btn) {
    const row = btn.closest('.wr-work-row');
    const container = row.parentElement;
    if (container.children.length > 1) {
        row.remove();
        saveWeeklyReportDraft();
    }
}

// Helper: parse date to local date (start of day or end of day)
function parseLocalDate(str, isEnd = false) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return isEnd ? new Date(year, month, day, 23, 59, 59, 999) : new Date(year, month, day, 0, 0, 0, 0);
    }
    const d = new Date(str);
    if (isEnd) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
}

// Helper: parse price from CRM record (package_name, amount, price, total)
function extractCRMPrice(c) {
    if (!c) return 0;

    // 1. Extract from package_name string: e.g. "12 tháng - 1.793.880đ", "3 Năm - 1.100.000đ", "300 Số - 300.000đ", "10000 Số - 3.500.000đ"
    if (c.package_name && typeof c.package_name === 'string') {
        const match = c.package_name.match(/-\s*([\d.,]+)\s*đ?/i);
        if (match && match[1]) {
            const rawNum = match[1].replace(/[.,]/g, '');
            const parsed = parseInt(rawNum, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }

    // 2. Extract from amount, price, total fields if present
    if (c.amount) {
        const parsed = parseInt(String(c.amount).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (c.price) {
        const parsed = parseInt(String(c.price).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (c.total) {
        const parsed = parseInt(String(c.total).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 3. Fallback: getCRMPrice
    if (typeof getCRMPrice === 'function') {
        const price = getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration);
        if (price && price > 0) return price;
    }

    return 0;
}

// ==========================================
// REVENUE CALCULATION (CRM & Báo giá)
// ==========================================
async function calculateAndFillWeeklyRevenue(isUserTriggered = false) {
    const fromStr = document.getElementById('wr-from-date')?.value;
    const toStr = document.getElementById('wr-to-date')?.value;
    const revenueEl = document.getElementById('wr-revenue');

    if (!fromStr || !toStr || !revenueEl) return;

    const fromDate = parseLocalDate(fromStr, false);
    const toDate = parseLocalDate(toStr, true);

    let totalRevenue = 0;
    let matchCount = 0;

    // 1. Luôn tải dữ liệu CRM mới nhất
    let crmData = window.currentCRMData || [];
    try {
        const resCRM = await authedFetch('/api/ca2-crm');
        if (resCRM.ok) {
            const { data } = await resCRM.json();
            if (Array.isArray(data)) {
                crmData = data.map(sanitizeCRMRecord);
                window.currentCRMData = crmData;
            }
        }
    } catch (e) {
        console.warn('[WeeklyReport] CRM fetch error:', e);
    }

    // 2. Tính doanh thu từ dữ liệu CRM trong khoảng tuần đã chọn (start_date hoặc created_at)
    if (crmData && crmData.length > 0) {
        crmData.forEach(c => {
            const dateStr = c.start_date || c.created_at;
            if (!dateStr) return;
            const d = new Date(dateStr);
            if (d >= fromDate && d <= toDate) {
                const price = extractCRMPrice(c);
                if (price > 0) {
                    totalRevenue += price;
                    matchCount++;
                }
            }
        });
    }

    // 3. Bổ sung thêm từ Báo giá (Quotations) nếu có
    if (totalRevenue === 0) {
        let quotations = window.quoteManagerInstance?.state?.quotations || [];
        try {
            const res = await authedFetch('/api/quotations');
            if (res.ok) {
                const data = await res.json();
                quotations = Array.isArray(data) ? data : [];
                if (window.quoteManagerInstance) {
                    window.quoteManagerInstance.state.quotations = quotations;
                }
            }
        } catch (err) {}

        if (quotations && quotations.length > 0) {
            quotations.forEach(q => {
                const qDateStr = q.created_at || q.date;
                if (!qDateStr) return;
                const d = new Date(qDateStr);
                if (d >= fromDate && d <= toDate) {
                    let quoteTotal = 0;
                    if (q.items && Array.isArray(q.items) && q.items.length > 0) {
                        quoteTotal = q.items.reduce((sum, it) => sum + (Number(it.total) || (Number(it.price) * (Number(it.quantity) || 1)) || 0), 0);
                    } else {
                        quoteTotal = Number(q.total) || Number(q.price) || 0;
                    }
                    if (quoteTotal > 0) {
                        totalRevenue += quoteTotal;
                        matchCount++;
                    }
                }
            });
        }
    }

    if (totalRevenue > 0) {
        revenueEl.value = new Intl.NumberFormat('vi-VN').format(totalRevenue);
        revenueEl.dataset.raw = totalRevenue;
        if (isUserTriggered && typeof showToast === 'function') {
            showToast(`Đã tính doanh thu: ${new Intl.NumberFormat('vi-VN').format(totalRevenue)} đ (${matchCount} đơn)`, 'success');
        }
    } else {
        if (isUserTriggered) {
            revenueEl.value = '0';
            revenueEl.dataset.raw = 0;
            if (typeof showToast === 'function') {
                showToast('Không có giao dịch/báo giá trong tuần này. Bạn có thể tự nhập số tiền.', 'info');
            }
        }
    }

    saveWeeklyReportDraft();
}

function setupRevenueInput() {
    const revEl = document.getElementById('wr-revenue');
    if (revEl && !revEl.dataset.listenerAttached) {
        revEl.dataset.listenerAttached = 'true';
        revEl.addEventListener('input', (e) => {
            let raw = e.target.value.replace(/\D/g, '');
            if (raw) {
                const num = parseInt(raw, 10);
                e.target.value = new Intl.NumberFormat('vi-VN').format(num);
                e.target.dataset.raw = num;
            } else {
                e.target.value = '';
                e.target.dataset.raw = '0';
            }
            saveWeeklyReportDraft();
        });
    }
}

// ==========================================
// COLLECT FORM DATA
// ==========================================
function collectWorkItems(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const items = [];
    container.querySelectorAll('.wr-work-row input[type="text"]').forEach(input => {
        const val = input.value.trim();
        if (val) items.push(val);
    });
    return items;
}

function collectWeeklyReportData() {
    return {
        fromDate: document.getElementById('wr-from-date').value,
        toDate: document.getElementById('wr-to-date').value,
        callCount: document.getElementById('wr-call-count').value || '0',
        workItems: collectWorkItems('wr-work-list'),
        revenue: document.getElementById('wr-revenue').value || '0',
        revenueRaw: parseInt(document.getElementById('wr-revenue').dataset.raw || '0', 10),
        evaluation: document.getElementById('wr-evaluation').value.trim(),
        advantages: document.getElementById('wr-advantages').value.trim(),
        difficulties: document.getElementById('wr-difficulties').value.trim(),
        nextCallCount: document.getElementById('wr-next-call-count').value || '0',
        nextWorkItems: collectWorkItems('wr-next-work-list'),
        revenueTarget: document.getElementById('wr-revenue-target').value.trim(),
        suggestions: document.getElementById('wr-suggestions').value.trim(),
        reporterName: (window.currentUser && window.currentUser.full_name) || 'Nhân viên'
    };
}

// ==========================================
// EXPORT TO WORD (.docx)
// ==========================================
async function exportWeeklyReportToWord() {
    const data = collectWeeklyReportData();

    if (data.workItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('Vui lòng nhập ít nhất 1 công việc trong tuần', 'warning');
        } else {
            alert('Vui lòng nhập ít nhất 1 công việc trong tuần');
        }
        return;
    }

    // Access docx library from window (UMD build)
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        AlignmentType,
        TabStopPosition,
        TabStopType,
        convertInchesToTwip
    } = window.docx;

    // Helper: bold + normal text in one paragraph
    const mixedParagraph = (boldText, normalText, options = {}) => {
        const runs = [];
        if (boldText) {
            runs.push(new TextRun({ text: boldText, bold: true, font: 'Times New Roman', size: 26 }));
        }
        if (normalText) {
            runs.push(new TextRun({ text: normalText, font: 'Times New Roman', size: 26 }));
        }
        return new Paragraph({
            children: runs,
            spacing: { after: options.spacingAfter || 80 },
            indent: options.indent ? { left: convertInchesToTwip(options.indent) } : undefined,
            ...options.paragraphOptions
        });
    };

    // Helper: bullet item
    const bulletItem = (text, indentLevel = 0.5) => {
        return new Paragraph({
            children: [
                new TextRun({ text: '+ ', font: 'Times New Roman', size: 26 }),
                new TextRun({ text: text, font: 'Times New Roman', size: 26 })
            ],
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(indentLevel) }
        });
    };

    // Helper: dash item
    const dashItem = (label, value, indentLevel = 0.3) => {
        return new Paragraph({
            children: [
                new TextRun({ text: '-   ', font: 'Times New Roman', size: 26 }),
                new TextRun({ text: label, bold: true, font: 'Times New Roman', size: 26, underline: label.includes(':') ? {} : undefined }),
                new TextRun({ text: value ? ` ${value}` : '', font: 'Times New Roman', size: 26 })
            ],
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(indentLevel) }
        });
    };

    // Format dates for title
    const fmtDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    };

    const weekLabel = `${fmtDate(data.fromDate)} - ${fmtDate(data.toDate)}`;

    // Build document sections
    const children = [];

    // Title
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: 'Mẫu báo cáo hàng tuần',
                font: 'Times New Roman',
                size: 28,
                bold: true
            })
        ],
        spacing: { after: 120 }
    }));

    // Subtitle - Week range & Reporter
    children.push(new Paragraph({
        children: [
            new TextRun({ text: `Tuần: ${weekLabel}`, font: 'Times New Roman', size: 24, italics: true }),
            new TextRun({ text: `    |    Người báo cáo: ${data.reporterName}`, font: 'Times New Roman', size: 24, italics: true })
        ],
        spacing: { after: 200 }
    }));

    // ===== SECTION 1: Công việc hoạt động trong tuần =====
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '1.  ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: 'Công việc hoạt động trong tuần:', font: 'Times New Roman', size: 26, bold: true })
        ],
        spacing: { after: 80 }
    }));

    // Số lượng gọi KH
    children.push(dashItem('Số lượng gọi khách hàng :', ` ${data.callCount}`));

    // Các công việc làm trong tuần
    children.push(dashItem('Các công việc làm trong tuần ( liệt kê các việc làm ):', ''));

    data.workItems.forEach(item => {
        children.push(bulletItem(item));
    });

    children.push(new Paragraph({ children: [], spacing: { after: 120 } })); // spacer

    // ===== SECTION 2: Kết quả đạt được =====
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '2.  ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: 'Kết quả đạt được', font: 'Times New Roman', size: 26, bold: true })
        ],
        spacing: { after: 80 }
    }));

    // Doanh thu
    let displayRevenue = data.revenue ? String(data.revenue).trim() : '0';
    if (!displayRevenue || displayRevenue === '0') {
        if (data.revenueRaw && data.revenueRaw > 0) {
            displayRevenue = new Intl.NumberFormat('vi-VN').format(data.revenueRaw);
        } else {
            displayRevenue = '0';
        }
    }
    const finalRevenueStr = (displayRevenue.toLowerCase().includes('đ') || displayRevenue.toLowerCase().includes('vnđ')) 
        ? displayRevenue 
        : `${displayRevenue} đ`;

    children.push(new Paragraph({
        children: [
            new TextRun({ text: '-   ', font: 'Times New Roman', size: 26 }),
            new TextRun({ text: 'Doanh thu đạt bao nhiêu : ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: finalRevenueStr, font: 'Times New Roman', size: 26, bold: true })
        ],
        spacing: { after: 60 },
        indent: { left: convertInchesToTwip(0.3) }
    }));

    // Đánh giá
    children.push(dashItem('Đánh giá kết quả xếp loại so chỉ tiêu tuần trước:', ` ${data.evaluation}`));

    // Thuận lợi
    children.push(dashItem('Thuận lợi :', ` ${data.advantages}`));

    // Khó khăn
    children.push(dashItem('Khó khăn :', ` ${data.difficulties}`));

    children.push(new Paragraph({ children: [], spacing: { after: 120 } }));

    // ===== SECTION 3: Kế hoạch tuần tới =====
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '3.  ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: 'Kế hoạch tuần tới', font: 'Times New Roman', size: 26, bold: true })
        ],
        spacing: { after: 80 }
    }));

    children.push(dashItem('Số lượng gọi khách hàng :', ` ${data.nextCallCount}`));
    children.push(dashItem('Các công việc làm trong tuần ( liệt kê các việc làm ):', ''));

    data.nextWorkItems.forEach(item => {
        children.push(bulletItem(item));
    });

    // Chỉ tiêu doanh thu
    children.push(dashItem('Chỉ tiêu doanh thu:', ` ${data.revenueTarget}`));

    children.push(new Paragraph({ children: [], spacing: { after: 120 } }));

    // ===== SECTION 4: Đề xuất, kiến nghị =====
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '4.  ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: 'Đề xuất, kiến nghị', font: 'Times New Roman', size: 26, bold: true })
        ],
        spacing: { after: 80 }
    }));

    if (data.suggestions) {
        children.push(new Paragraph({
            children: [
                new TextRun({ text: data.suggestions, font: 'Times New Roman', size: 26 })
            ],
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(0.3) }
        }));
    }

    // Create document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: convertInchesToTwip(1),
                        right: convertInchesToTwip(1),
                        bottom: convertInchesToTwip(1),
                        left: convertInchesToTwip(1.2)
                    }
                }
            },
            children: children
        }]
    });

    try {
        const blob = await Packer.toBlob(doc);
        const fileName = `Bao_Cao_Tuan_${data.fromDate}_${data.toDate}.docx`;
        window.saveAs(blob, fileName);

        if (typeof showToast === 'function') {
            showToast('Xuất báo cáo tuần thành công!', 'success');
        }
    } catch (err) {
        console.error('[WeeklyReport] Export error:', err);
        if (typeof showToast === 'function') {
            showToast('Lỗi khi xuất báo cáo: ' + err.message, 'error');
        } else {
            alert('Lỗi khi xuất báo cáo: ' + err.message);
        }
    }
}

// ==========================================
// DRAFT STORAGE (Save / Load / Clear)
// ==========================================
function saveWeeklyReportDraft() {
    try {
        const data = collectWeeklyReportData();
        localStorage.setItem('ca2_weekly_report_draft', JSON.stringify(data));
        console.log('[WeeklyReport] Draft saved automatically.');
    } catch (e) {
        console.error('[WeeklyReport] Error saving draft:', e);
    }
}

function loadWeeklyReportDraft() {
    try {
        const draftStr = localStorage.getItem('ca2_weekly_report_draft');
        if (!draftStr) return false;
        
        const data = JSON.parse(draftStr);
        if (!data) return false;

        if (data.fromDate) document.getElementById('wr-from-date').value = data.fromDate;
        if (data.toDate) document.getElementById('wr-to-date').value = data.toDate;
        if (data.callCount) document.getElementById('wr-call-count').value = data.callCount;
        
        // Restore work list
        if (data.workItems && data.workItems.length > 0) {
            const container = document.getElementById('wr-work-list');
            if (container) {
                container.innerHTML = '';
                data.workItems.forEach(itemText => {
                    const row = document.createElement('div');
                    row.className = 'wr-work-row flex items-center gap-3 mb-2 animate-fade-in';
                    row.innerHTML = `
                        <span class="text-orange-400 font-bold text-xs select-none">+</span>
                        <input type="text" placeholder="Nhập công việc..." value="${itemText.replace(/"/g, '&quot;')}" 
                            class="flex-1 bg-white/5 border border-white/10 focus:border-orange-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none transition-all" />
                        <button type="button" onclick="removeWorkItem(this)" 
                            class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center text-xs">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    container.appendChild(row);
                });
            }
        }

        if (data.evaluation) document.getElementById('wr-evaluation').value = data.evaluation;
        if (data.advantages) document.getElementById('wr-advantages').value = data.advantages;
        if (data.difficulties) document.getElementById('wr-difficulties').value = data.difficulties;
        if (data.nextCallCount) document.getElementById('wr-next-call-count').value = data.nextCallCount;
        
        // Restore next work list
        if (data.nextWorkItems && data.nextWorkItems.length > 0) {
            const container = document.getElementById('wr-next-work-list');
            if (container) {
                container.innerHTML = '';
                data.nextWorkItems.forEach(itemText => {
                    const row = document.createElement('div');
                    row.className = 'wr-work-row flex items-center gap-3 mb-2 animate-fade-in';
                    row.innerHTML = `
                        <span class="text-orange-400 font-bold text-xs select-none">+</span>
                        <input type="text" placeholder="Nhập công việc..." value="${itemText.replace(/"/g, '&quot;')}" 
                            class="flex-1 bg-white/5 border border-white/10 focus:border-orange-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none transition-all" />
                        <button type="button" onclick="removeWorkItem(this)" 
                            class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center text-xs">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    container.appendChild(row);
                });
            }
        }

        if (data.revenue) {
            document.getElementById('wr-revenue').value = data.revenue;
            if (data.revenueRaw) document.getElementById('wr-revenue').dataset.raw = data.revenueRaw;
        }

        if (data.revenueTarget) document.getElementById('wr-revenue-target').value = data.revenueTarget;
        if (data.suggestions) document.getElementById('wr-suggestions').value = data.suggestions;

        console.log('[WeeklyReport] Draft loaded successfully.');
        return true;
    } catch (e) {
        console.error('[WeeklyReport] Error loading draft:', e);
        return false;
    }
}

function clearWeeklyReportDraft() {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ nội dung nháp đã nhập không?')) {
        localStorage.removeItem('ca2_weekly_report_draft');
        
        // Reset to default
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const fmt = (d) => d.toISOString().split('T')[0];
        document.getElementById('wr-from-date').value = fmt(monday);
        document.getElementById('wr-to-date').value = fmt(sunday);

        document.getElementById('wr-call-count').value = '';
        document.getElementById('wr-evaluation').value = '';
        document.getElementById('wr-advantages').value = '';
        document.getElementById('wr-difficulties').value = '';
        document.getElementById('wr-next-call-count').value = '';
        document.getElementById('wr-revenue-target').value = '';
        document.getElementById('wr-suggestions').value = '';

        resetWorkItems('wr-work-list');
        resetWorkItems('wr-next-work-list');

        calculateAndFillWeeklyRevenue();

        if (typeof showToast === 'function') {
            showToast('Đã xóa dữ liệu nháp', 'info');
        }
    }
}

function setupDraftAutoSave() {
    const modal = document.getElementById('modal-weekly-report');
    if (modal) {
        modal.addEventListener('input', () => {
            saveWeeklyReportDraft();
        });
        modal.addEventListener('change', () => {
            saveWeeklyReportDraft();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDraftAutoSave);
} else {
    setupDraftAutoSave();
}

