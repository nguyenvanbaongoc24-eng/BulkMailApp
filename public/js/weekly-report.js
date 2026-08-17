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
function openWeeklyReportModal() {
    const modal = document.getElementById('modal-weekly-report');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Auto-detect current week (Monday → Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (d) => d.toISOString().split('T')[0];
    document.getElementById('wr-from-date').value = fmt(monday);
    document.getElementById('wr-to-date').value = fmt(sunday);

    // Reset form fields
    document.getElementById('wr-call-count').value = '';
    document.getElementById('wr-evaluation').value = '';
    document.getElementById('wr-advantages').value = '';
    document.getElementById('wr-difficulties').value = '';
    document.getElementById('wr-next-call-count').value = '';
    document.getElementById('wr-revenue-target').value = '';
    document.getElementById('wr-suggestions').value = '';

    // Reset dynamic work items — keep 1 placeholder each
    resetWorkItems('wr-work-list');
    resetWorkItems('wr-next-work-list');

    // Calculate revenue
    calculateAndFillWeeklyRevenue();
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
}

function removeWorkItem(btn) {
    const row = btn.closest('.wr-work-row');
    const container = row.parentElement;
    if (container.children.length > 1) {
        row.remove();
    }
}

// ==========================================
// REVENUE CALCULATION
// ==========================================
function calculateAndFillWeeklyRevenue() {
    const fromStr = document.getElementById('wr-from-date').value;
    const toStr = document.getElementById('wr-to-date').value;
    const revenueEl = document.getElementById('wr-revenue');

    if (!fromStr || !toStr || !revenueEl) return;

    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    // Set toDate to end of day
    toDate.setHours(23, 59, 59, 999);

    const allData = window.currentCRMData || [];

    let totalRevenue = 0;
    allData.forEach(c => {
        if (!c.start_date) return;
        const d = new Date(c.start_date);
        if (d >= fromDate && d <= toDate) {
            const price = getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration);
            totalRevenue += price || 0;
        }
    });

    revenueEl.value = new Intl.NumberFormat('vi-VN').format(totalRevenue);
    revenueEl.dataset.raw = totalRevenue;
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
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '-   ', font: 'Times New Roman', size: 26 }),
            new TextRun({ text: 'Doanh thu đạt bao nhiêu : ', font: 'Times New Roman', size: 26, bold: true }),
            new TextRun({ text: data.revenue, font: 'Times New Roman', size: 26, bold: true })
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
