/**
 * Automation CA2 - Core Application Logic
 * Reconstructed & Enhanced
 */

// --- Global State & Constants ---
let currentUser = null;
let currentCRMData = [];
let currentRecipientsData = [];
let pendingCRMData = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Editor Paste Cleanup - Handle dark/light theme conflicts
    const editor = document.getElementById('input-template');
    if (editor) {
        editor.addEventListener('paste', function(e) {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');

            if (html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                // Remove all color and background styles that clash with dark theme
                const allElements = tempDiv.querySelectorAll('*');
                allElements.forEach(el => {
                    el.style.backgroundColor = '';
                    el.style.color = '';
                    // Also clean up common background/text classes from other frameworks
                    el.className = el.className.replace(/\bbg-\S+/g, '').replace(/\btext-\S+/g, '');
                });
                
                document.execCommand('insertHTML', false, tempDiv.innerHTML);
            } else {
                document.execCommand('insertText', false, text);
            }
        });
    }
});

// --- Authentication Logic ---
async function checkAuth() {
    const token = localStorage.getItem('sb-token');
    if (!token) {
        showAuthScreen(true);
        return;
    }
    
    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            currentUser = await res.json();
            updateUserUI();
            showAuthScreen(false);
            showPage('dashboard');
        } else {
            localStorage.removeItem('sb-token');
            showAuthScreen(true);
        }
    } catch (e) {
        console.error('Auth Check Error:', e);
        showAuthScreen(true);
    }
}

function showAuthScreen(show) {
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');
    if (authScreen) authScreen.classList.toggle('hidden', !show);
    if (appContainer) appContainer.classList.toggle('hidden', show);
}

function toggleAuthMode() {
    const fields = document.getElementById('register-fields');
    const title = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchTxt = document.getElementById('auth-switch-text');
    const switchBtn = document.getElementById('auth-switch-btn');
    
    const isRegister = fields.classList.contains('hidden');
    fields.classList.toggle('hidden', !isRegister);
    
    title.innerText = isRegister ? 'Đăng ký tài khoản mới' : 'Đăng nhập để tiếp tục quản lý chiến dịch';
    submitBtn.innerText = isRegister ? 'Đăng ký ngay' : 'Đăng nhập ngay';
    switchTxt.innerText = isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?';
    switchBtn.innerText = isRegister ? 'Đăng nhập' : 'Tham gia ngay';
}

async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name') ? document.getElementById('auth-name').value : '';
    const isRegister = !document.getElementById('register-fields').classList.contains('hidden');
    const errorDiv = document.getElementById('auth-error');
    
    errorDiv.classList.add('hidden');
    
    try {
        const url = isRegister ? '/api/register' : '/api/login';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });
        
        const data = await res.json();
        
        // Handle custom success messages explicitly
        if (data.message) {
            errorDiv.innerText = data.message;
            errorDiv.classList.remove('hidden', 'text-red-500', 'bg-red-500/10', 'border-red-500/20');
            errorDiv.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
            return;
        }

        if (res.ok && data.token) {
            localStorage.setItem('sb-token', data.token);
            checkAuth();
        } else {
            errorDiv.innerText = data.error || 'Lỗi xác thực';
            errorDiv.classList.remove('hidden', 'text-green-500', 'bg-green-500/10', 'border-green-500/20');
            errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
        }
    } catch (e) {
        errorDiv.innerText = 'Lỗi kết nối server';
        errorDiv.classList.remove('hidden', 'text-green-500', 'bg-green-500/10', 'border-green-500/20');
        errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
    }
}

function handleLogout() {
    localStorage.removeItem('sb-token');
    currentUser = null;
    showAuthScreen(true);
}

function updateUserUI() {
    if (!currentUser) return;
    const nameEl = document.getElementById('user-display-name');
    const emailEl = document.getElementById('user-display-email');
    const avatarEl = document.getElementById('user-avatar');
    
    if (nameEl) nameEl.innerText = currentUser.name || 'User';
    if (emailEl) emailEl.innerText = currentUser.email;
    if (avatarEl) avatarEl.innerText = (currentUser.name || 'U').charAt(0).toUpperCase();
}

// --- Navigation ---
function showPage(pageId) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(`view-${pageId}`);
    if (target) target.classList.remove('hidden');
    
    document.querySelectorAll('aside nav a').forEach(a => a.classList.remove('sidebar-item-active', 'text-orange-gradient'));
    const navItem = document.getElementById(`nav-${pageId}`);
    if (navItem) navItem.classList.add('sidebar-item-active');
    
    const titleMap = {
        'dashboard': 'Bảng điều khiển',
        'crm': 'Quản lý khách hàng',
        'ca2-crm': 'CA2 CRM',
        'campaigns': 'Chiến dịch Email',
        'senders': 'Tài khoản Gmail',
        'reports': 'Báo cáo chi tiết',
        'settings': 'Cài đặt'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[pageId] || 'Trang chủ';
    
    if (pageId === 'ca2-crm') loadCA2CRMData();
    if (pageId === 'dashboard') loadDashboardStats();
    if (pageId === 'senders') loadSenders();
    if (pageId === 'reports') loadEmailLogs();
    if (pageId === 'campaigns') loadRecentCampaigns();
    if (pageId === 'crm') loadCRM();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('-translate-x-full');
}

// --- API Helper ---
async function authedFetch(url, options = {}) {
    const token = localStorage.getItem('sb-token');
    const headers = { 
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    return fetch(url, { ...options, headers });
}

// --- CA2 CRM LOGIC ---
async function loadCA2CRMData() {
    try {
        const res = await authedFetch('/api/ca2-crm');
        const { data } = await res.json();
        currentCRMData = data || [];
        renderCA2CRM();
    } catch (e) { console.error('Load CRM Error:', e); }
}

function renderCA2CRM() {
    const tableBody = document.getElementById('ca2-crm-table-body');
    if (!tableBody) return;
    
    const filterType = document.getElementById('crm-filter-service').value;
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('ca2-crm-sort-order')?.value || 'newest';

    let filtered = [...currentCRMData];
    if (filterType !== 'all') filtered = filtered.filter(c => c.service_type === filterType);
    if (search) {
        filtered = filtered.filter(c => 
            (c.mst && c.mst.toLowerCase().includes(search)) || 
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    filtered.sort((a, b) => {
        if (sortBy === 'soonest') return new Date(a.expired_date) - new Date(b.expired_date);
        if (sortBy === 'latest') return new Date(b.expired_date) - new Date(a.expired_date);
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Stats
    const totalEl = document.getElementById('ca2-crm-total');
    const activeEl = document.getElementById('ca2-crm-active');
    const expiringEl = document.getElementById('ca2-crm-expiring');
    const expiredEl = document.getElementById('ca2-crm-expired');
    
    let activeCnt = 0, expiringCnt = 0, expiredCnt = 0;
    currentCRMData.forEach(c => {
        const days = calculateRemainingDays(c.expired_date);
        if (days < 0) expiredCnt++;
        else if (days <= 60) expiringCnt++;
        else activeCnt++;
    });

    if (totalEl) totalEl.innerText = currentCRMData.length;
    if (activeEl) activeEl.innerText = activeCnt;
    if (expiringEl) expiringEl.innerText = expiringCnt;
    if (expiredEl) expiredEl.innerText = expiredCnt;

    tableBody.innerHTML = filtered.map(c => {
        const daysLeft = calculateRemainingDays(c.expired_date);
        const isExpired = daysLeft < 0;
        const statusClass = isExpired ? 'text-purple-500' : (daysLeft <= 30 ? 'text-red-500' : (daysLeft <= 60 ? 'text-orange-500' : 'text-green-500'));
        const barClass = isExpired ? 'bg-purple-600' : (daysLeft <= 30 ? 'bg-red-500' : (daysLeft <= 60 ? 'bg-orange-500' : 'bg-green-500'));

        return `
            <tr class="hover:bg-white/2 transition-colors group">
                <td class="px-8 py-5">
                    <div class="font-bold text-white">${c.company_name || 'N/A'}</div>
                    <div class="text-[10px] text-gray-500 font-black tracking-widest mt-0.5">${c.mst || '---'}</div>
                    <div class="text-[10px] text-gray-400 italic">${c.email || ''} ${c.phone ? '• ' + c.phone : ''}</div>
                </td>
                <td class="px-8 py-5 text-center">
                    <span class="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${c.service_type === 'CKS' ? 'border-orange-500/20 text-orange-500 bg-orange-500/5' : 'border-blue-500/20 text-blue-400 bg-blue-400/5'}">
                        ${c.service_type || 'CKS'}
                    </span>
                </td>
                <td class="px-8 py-5 font-bold text-gray-400 text-sm whitespace-nowrap">${formatDate(c.start_date)}</td>
                <td class="px-8 py-5 font-black text-white text-sm">${c.duration || '-'}</td>
                <td class="px-6 py-4 font-bold text-gray-400 text-sm whitespace-nowrap">${formatDate(c.expired_date)}</td>
                <td class="px-6 py-4">
                    <div class="flex flex-col items-start">
                        <span class="font-black ${statusClass}">
                            ${isExpired ? 'Hết hạn' : (daysLeft + ' ngày')}
                        </span>
                        <div class="w-16 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                            <div class="h-full ${barClass}" 
                                 style="width: ${isExpired ? '0%' : (daysLeft > 60 ? '100%' : (daysLeft / 60 * 100) + '%')}"></div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <div class="flex justify-end gap-2 transition-all">
                        <button onclick="editCRM('${c.id}')" class="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-all" title="Sửa"><i class="fas fa-edit text-xs"></i></button>
                        <button onclick="deleteCRM('${c.id}')" class="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-all" title="Xóa"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('') || `<tr><td colspan="7" class="px-8 py-10 text-center text-gray-500 italic">Không có dữ liệu khách hàng</td></tr>`;
}

function calculateRemainingDays(dateStr) {
    if (!dateStr) return 0;
    const diffTime = new Date(dateStr) - new Date();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) { return dateStr; }
}

async function saveCA2CRM() {
    const id = document.getElementById('ca2-crm-id').value;
    const body = {
        mst: document.getElementById('ca2-crm-mst').value,
        company_name: document.getElementById('ca2-crm-name').value,
        email: document.getElementById('ca2-crm-email').value,
        phone: document.getElementById('ca2-crm-phone').value,
        service_type: document.getElementById('ca2-crm-service').value,
        start_date: document.getElementById('ca2-crm-start').value,
        duration: document.getElementById('ca2-crm-duration').value
    };

    if (!body.mst || !body.company_name) {
        alert('Vui lòng nhập Mã số thuế và Tên công ty');
        return;
    }

    try {
        const url = id ? `/api/ca2-crm/${id}` : '/api/ca2-crm';
        const method = id ? 'PATCH' : 'POST';
        const res = await authedFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            closeCA2CRMModal();
            loadCA2CRMData();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.error || 'Unknown error'));
        }
    } catch (e) { alert('Lỗi kết nối server'); }
}

function openAddCRMModal() {
    document.getElementById('ca2-crm-modal-title').innerText = 'Thêm khách hàng CA2 CRM';
    document.getElementById('ca2-crm-id').value = '';
    document.getElementById('ca2-crm-mst').value = '';
    document.getElementById('ca2-crm-name').value = '';
    document.getElementById('ca2-crm-email').value = '';
    document.getElementById('ca2-crm-phone').value = '';
    document.getElementById('ca2-crm-service').value = 'CKS';
    document.getElementById('ca2-crm-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('ca2-crm-duration').value = '1 năm';
    
    document.getElementById('modal-ca2-crm').classList.remove('hidden');
}

function editCRM(id) {
    const c = currentCRMData.find(x => x.id === id);
    if (!c) return;

    document.getElementById('ca2-crm-modal-title').innerText = 'Cập nhật khách hàng';
    document.getElementById('ca2-crm-id').value = c.id;
    document.getElementById('ca2-crm-mst').value = c.mst;
    document.getElementById('ca2-crm-name').value = c.company_name;
    document.getElementById('ca2-crm-email').value = c.email || '';
    document.getElementById('ca2-crm-phone').value = c.phone || '';
    document.getElementById('ca2-crm-service').value = c.service_type || 'CKS';
    document.getElementById('ca2-crm-start').value = c.start_date || '';
    document.getElementById('ca2-crm-duration').value = c.duration || '1 năm';
    
    document.getElementById('modal-ca2-crm').classList.remove('hidden');
}

async function deleteCRM(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) return;
    try {
        const res = await authedFetch(`/api/ca2-crm/${id}`, { method: 'DELETE' });
        if (res.ok) loadCA2CRMData();
        else alert('Lỗi khi xóa khách hàng');
    } catch (e) { alert('Lỗi kết nối'); }
}

async function createCampaignFromCA2CRM() {
    const filterType = document.getElementById('crm-filter-service').value;
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';
    
    let recipients = currentCRMData.filter(c => c.email);
    if (filterType !== 'all') recipients = recipients.filter(c => c.service_type === filterType);
    if (search) {
        recipients = recipients.filter(c => 
            (c.mst && c.mst.toLowerCase().includes(search)) || 
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    if (recipients.length === 0) {
        alert('Không tìm thấy khách hàng nào có email hợp lệ.');
        return;
    }

    if (!confirm(`Tạo chiến dịch gửi mail cho ${recipients.length} khách hàng?`)) return;

    try {
        const campaignData = {
            name: `CRM Bulk - ${formatDate(new Date())}`,
            subject: "Thông báo về dịch vụ CA2",
            content: "Kính gửi {{company_name}}, dịch vụ của quý khách (MST: {{mst}}) sắp hết hạn vào ngày {{expired_date}}.",
            recipients: recipients.map(c => ({
                email: c.email,
                company_name: c.company_name,
                mst: c.mst,
                expired_date: formatDate(c.expired_date)
            }))
        };

        const res = await authedFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(campaignData)
        });

        if (res.ok) {
            alert('Tạo chiến dịch thành công!');
            showPage('campaigns');
        }
    } catch (e) { alert('Lỗi hệ thống'); }
}

// --- Import Logic ---
function openCRMImportModal(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        pendingCRMData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        document.getElementById('modal-crm-import').classList.remove('hidden');
    };
    reader.readAsArrayBuffer(file);
}

function closeCRMImportModal() {
    document.getElementById('modal-crm-import').classList.add('hidden');
    document.getElementById('crm-import-file').value = '';
}

async function handleCRMImportAction(mode) {
    if (pendingCRMData.length === 0) return;
    try {
        const res = await authedFetch('/api/ca2-crm/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: pendingCRMData, mode })
        });
        if (res.ok) {
            alert('Nhập dữ liệu thành công!');
            closeCRMImportModal();
            loadCA2CRMData();
        }
    } catch (e) { alert('Lỗi nhập liệu'); }
}

// --- Dashboard & Campaigns ---
async function loadDashboardStats() {
    try {
        const res = await authedFetch('/api/dashboard/stats');
        const stats = await res.json();
        const totalEl = document.getElementById('stat-total');
        if (totalEl) totalEl.innerText = stats.totalSent || 0;
        
        const crmRes = await authedFetch('/api/ca2-crm');
        const { data } = await crmRes.json();
        const dashTotal = document.getElementById('dash-crm-total');
        if (dashTotal) dashTotal.innerText = data.length;
    } catch (e) {}
}

async function loadRecentCampaigns() {
    const list = document.getElementById('campaign-list');
    const listAll = document.getElementById('campaign-list-all');
    if (!list && !listAll) return;
    try {
        const res = await authedFetch('/api/campaigns');
        const campaigns = await res.json();
        const html = campaigns.map(c => `
            <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                <td class="px-8 py-6">
                    <div class="font-bold text-white text-lg">${c.name}</div>
                    <div class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">${new Date(c.created_at).toLocaleDateString()}</div>
                </td>
                <td class="px-8 py-6">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg ${
                        c.status === 'Hoàn thành' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                        c.status === 'Đang gửi' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse' :
                        'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    }">
                        ${c.status}
                    </span>
                </td>
                <td class="px-8 py-6">
                    <div class="flex items-center gap-3">
                        <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden max-w-[100px]">
                            <div class="h-full bg-orange-gradient" style="width: ${(c.sent_count / c.total_recipients * 100) || 0}%"></div>
                        </div>
                        <span class="font-black text-white text-sm">${c.sent_count || 0}/${c.total_recipients || 0}</span>
                    </div>
                </td>
                <td class="px-8 py-6 text-right">
                     ${c.status === 'Hoàn thành' ? 
                        `<span class="text-green-500 font-bold"><i class="fas fa-check-circle mr-1"></i> Xong</span>` :
                        `<button onclick="startCampaign('${c.id}')" class="bg-orange-gradient text-white px-6 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-orange-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 float-right">
                            <i class="fas fa-play"></i> CHẠY
                        </button>`
                     }
                </td>
            </tr>
        `).join('');
        if (list) list.innerHTML = html;
        if (listAll) listAll.innerHTML = html;
    } catch (e) {
        console.error('Error loading campaigns:', e);
    }
}

async function startCampaign(id) {
    try {
        const res = await authedFetch(`/api/campaigns/${id}/send`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('Chiến dịch đã bắt đầu chạy ngầm!');
            loadRecentCampaigns();
            // Optional: Start polling for status updates
            if (!window.campaignInterval) {
                window.campaignInterval = setInterval(loadRecentCampaigns, 5000);
            }
        } else {
            alert('Lỗi: ' + (data.error || 'Không rõ'));
        }
    } catch (e) {
        alert('Lỗi kết nối server');
    }
}

// --- Senders ---
async function loadSenders() {
    const list = document.getElementById('sender-list');
    if (!list) return;
    try {
        const res = await authedFetch('/api/senders');
        const senders = await res.json();
        list.innerHTML = senders.map(s => `
            <tr>
                <td class="px-8 py-5 text-white font-bold">${s.senderName}</td>
                <td class="px-8 py-5 text-gray-400">${s.senderEmail}</td>
                <td class="px-8 py-5 text-gray-500">${s.smtpHost}</td>
                <td class="px-8 py-5 text-right">
                    <button onclick="deleteSender('${s.id}')" class="text-red-500 font-bold">Xóa</button>
                </td>
            </tr>
        `).join('');
        
        const select = document.getElementById('select-sender');
        if (select) {
            select.innerHTML = '<option value="">-- Chọn tài khoản --</option>' + 
                senders.map(s => `<option value="${s.id}">${s.senderName}</option>`).join('');
        }
    } catch (e) {}
}

// --- UTILITIES AND OLD CRM LOGIC ---
function exportCA2CRMToExcel() {
    if (!currentCRMData || currentCRMData.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
    }
    const wsData = currentCRMData.map(c => ({
        'MST': c.mst,
        'Tên công ty': c.company_name,
        'Email': c.email,
        'Số điện thoại': c.phone,
        'Dịch vụ': c.service_type,
        'Ngày cấp': formatDate(c.start_date),
        'Thời hạn': c.duration,
        'Ngày hết hạn': formatDate(c.expired_date),
        'Ghi chú': c.status_note || ''
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "CA2_CRM_Data");
    XLSX.writeFile(wb, "CA2_CRM_Data.xlsx");
}

let oldCRMData = [];
let currentFilterStatus = 'all';

async function loadCRM() {
    try {
        const res = await authedFetch('/api/customers');
        const { data } = await res.json();
        oldCRMData = data || [];
        const statusDropdown = document.getElementById('crm-filter-status');
        if(statusDropdown) currentFilterStatus = statusDropdown.value;
        renderCRM();
    } catch (e) { console.error('Load Old CRM Error:', e); }
}

function filterCRM(status) {
    currentFilterStatus = status;
    const statusDropdown = document.getElementById('crm-filter-status');
    if(statusDropdown && statusDropdown.querySelector(`option[value="${status}"]`)) {
        statusDropdown.value = status;
    } else if (statusDropdown) {
        statusDropdown.value = 'all';
    }
    renderCRM();
}

function renderCRM() {
    const list = document.getElementById('crm-list');
    if (!list) return;

    let filtered = [...oldCRMData];
    if (currentFilterStatus === 'expired') {
        filtered = filtered.filter(c => calculateRemainingDays(c.expired_date) < 0);
    } else if (currentFilterStatus === '30') {
        filtered = filtered.filter(c => {
            const days = calculateRemainingDays(c.expired_date);
            return days >= 0 && days <= 30;
        });
    } else if (currentFilterStatus === '60') {
        filtered = filtered.filter(c => {
            const days = calculateRemainingDays(c.expired_date);
            return days > 30 && days <= 60;
        });
    } else if (currentFilterStatus !== 'all') {
        filtered = filtered.filter(c => c.status_note === currentFilterStatus);
    }

    filtered.sort((a,b) => new Date(a.expired_date) - new Date(b.expired_date));

    let total = oldCRMData.length;
    let expired = 0, thirty = 0, sixty = 0;
    
    oldCRMData.forEach(c => {
        const days = calculateRemainingDays(c.expired_date);
        if (days < 0) expired++;
        else if (days >= 0 && days <= 30) thirty++;
        else if (days > 30 && days <= 60) sixty++;
    });

    const elTotal = document.getElementById('crm-stat-total');
    const elExpired = document.getElementById('crm-stat-expired');
    const el30 = document.getElementById('crm-stat-30');
    const el60 = document.getElementById('crm-stat-60');

    if(elTotal) elTotal.innerText = total;
    if(elExpired) elExpired.innerText = expired;
    if(el30) el30.innerText = thirty;
    if(el60) el60.innerText = sixty;

    list.innerHTML = filtered.map(c => `
        <tr class="hover:bg-white/2 transition-colors">
            <td class="px-6 py-4">
                <div class="font-bold text-white">${c.company_name || 'N/A'}</div>
                <div class="text-xs text-gray-500">${c.mst || ''}</div>
                <div class="text-[10px] text-gray-400 italic">${c.email || ''} ${c.phone ? '• ' + c.phone : ''}</div>
            </td>
            <td class="px-6 py-4 font-bold ${calculateRemainingDays(c.expired_date) < 0 ? 'text-red-500' : 'text-gray-400'}">${formatDate(c.expired_date)}</td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-gray-300">${c.status_note || 'Chưa liên hệ'}</span>
            </td>
            <td class="px-6 py-4 text-xs text-gray-400">${c.notes || '-'}</td>
            <td class="px-6 py-4">
                <div class="flex justify-start gap-2">
                    <button onclick="editCRM('${c.id}')" class="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-all" title="Sửa (CA2 CRM)"><i class="fas fa-edit text-xs"></i></button>
                    <button onclick="deleteCRM('${c.id}')" class="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-all" title="Xóa (CA2 CRM)"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </td>
        </tr>
    `).join('') || `<tr><td colspan="5" class="py-10 text-center text-gray-500 italic">Không có khách hàng</td></tr>`;
}

async function createCampaignFromCRM() {
    let recipients = oldCRMData.filter(c => c.email);
    if (currentFilterStatus === 'expired') {
        recipients = recipients.filter(c => calculateRemainingDays(c.expired_date) < 0);
    } else if (currentFilterStatus === '30') {
        recipients = recipients.filter(c => {
            const days = calculateRemainingDays(c.expired_date);
            return days >= 0 && days <= 30;
        });
    } else if (currentFilterStatus === '60') {
        recipients = recipients.filter(c => {
            const days = calculateRemainingDays(c.expired_date);
            return days > 30 && days <= 60;
        });
    } else if (currentFilterStatus !== 'all') {
        recipients = recipients.filter(c => c.status_note === currentFilterStatus);
    }

    if (recipients.length === 0) return alert('Không có khách hàng hợp lệ!');
    
    document.getElementById('page-title').innerText = 'Tạo chiến dịch (CRM Mở Rộng)';
    ['dashboard','campaigns','senders','reports','ca2-crm','crm'].forEach(id => {
        document.getElementById(`view-${id}`)?.classList.add('hidden');
    });
    
    document.getElementById('modal-create').classList.remove('hidden');
    document.getElementById('camp-name').value = `Chiến dịch gửi Mail (${recipients.length} KH) - ${formatDate(new Date())}`;
    
    const ws = XLSX.utils.json_to_sheet(recipients.map(c => ({
        'MST': c.mst,
        'TenCongTy': c.company_name,
        'Email': c.email,
        'DienThoai': c.phone,
        'ThoiHan': c.expired_date,
        'LoaiDichVu': c.service_type || 'CKS'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {type: "application/octet-stream"});
    const file = new File([blob], "campaign_list.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const dt = new DataTransfer();
    dt.items.add(file);
    const fileInput = document.getElementById('camp-file');
    fileInput.files = dt.files;
    
    if (typeof handleFileUpload === 'function') handleFileUpload({ target: fileInput });
}

// --- Utils & Modals ---
function openCreateModal() { 
    document.getElementById('modal-create').classList.remove('hidden'); 
    loadSenders(); 
    loadTemplates();
}
function closeCreateModal() { document.getElementById('modal-create').classList.add('hidden'); }
function closeCA2CRMModal() { document.getElementById('modal-ca2-crm').classList.add('hidden'); }
function downloadLocalTool() { window.open('https://drive.google.com/file/d/13BSmd3pcckibLL93-DX_YZ-mrbyGfsvI/view?usp=drive_link', '_blank'); }

// Campaign File Upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const statusEl = document.getElementById('upload-status');
    
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            if (!rawRows || rawRows.length === 0) {
                statusEl.innerText = 'File rỗng!';
                statusEl.className = 'text-sm font-bold text-red-500 text-center';
                return;
            }

            // Strict Smart Header Detection
            let headerRowIndex = -1;
            const headerKeywords = ['MST', 'TAX', 'MÃ SỐ THUẾ', 'CÔNG TY', 'TÊN', 'NAME', 'EMAIL', 'ĐỊA CHỈ', 'ADDRESS', 'HẾT HẠN', 'EXPIRATION', 'SERIAL'];
            
            for (let i = 0; i < Math.min(rawRows.length, 3); i++) {
                const row = rawRows[i];
                let matches = 0;
                let isDataRow = false;

                row.forEach(cell => {
                    const val = String(cell).toUpperCase().trim();
                    // If any cell looks like data (Email or MST), this entire row is DATA, not a header
                    if (val.includes('@') || /^\d{10}(\d{3})?$/.test(val)) {
                        isDataRow = true;
                    }
                    if (headerKeywords.includes(val)) {
                        matches++;
                    }
                });

                // A header row must have at least 2 keyword matches and NO data indicators
                if (matches >= 2 && !isDataRow) {
                    headerRowIndex = i;
                    break;
                }
            }

            let dataRows = [];
            let headers = [];

            if (headerRowIndex !== -1) {
                // We found a header row
                headers = rawRows[headerRowIndex].map(h => String(h).trim() || 'NoHeader');
                dataRows = rawRows.slice(headerRowIndex + 1);
            } else {
                // No header row found, first row IS data
                // Use column letters as default headers: A, B, C, ...
                const maxCols = Math.max(...rawRows.map(r => r.length));
                headers = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + i));
                dataRows = rawRows;
            }

            // Map data to objects
            currentRecipientsData = dataRows.filter(row => {
                return row.some(cell => String(cell).trim() !== '');
            }).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    obj[h] = String(row[i] || '').trim();
                });
                
                // Smart Mapping aliases for placeholders
                // If we don't have explicit headers, try to guess
                if (headerRowIndex === -1) {
                    row.forEach((cell, i) => {
                        const val = String(cell).trim();
                        if (val.includes('@')) obj['Email'] = val;
                        else if (/^\d{10}(\d{3})?$/.test(val)) obj['MST'] = val;
                        else if (val.length > 20 && !val.includes(' ')) {} // Potential serial
                        else if (val.length > 15 && val.includes(' ')) obj['TenCongTy'] = val;
                    });
                } else {
                    // Map common headers to internal keys
                    Object.keys(obj).forEach(k => {
                        const uk = k.toUpperCase();
                        if (uk.includes('MST') || uk.includes('TAX')) obj['MST'] = obj[k];
                        if (uk.includes('CÔNG TY') || uk.includes('TÊN') || uk.includes('NAME')) obj['TenCongTy'] = obj[k];
                        if (uk.includes('EMAIL')) obj['Email'] = obj[k];
                        if (uk.includes('HẾT HẠN') || uk.includes('EXPIRATION')) obj['NgayHetHanChuKySo'] = obj[k];
                        if (uk.includes('ĐỊA CHỈ') || uk.includes('ADDRESS')) obj['DiaChi'] = obj[k];
                    });
                }
                return obj;
            });

            // Validate data quality
            const totalRows = currentRecipientsData.length;
            const rowsWithEmail = currentRecipientsData.filter(r => r.Email && r.Email.includes('@')).length;
            const rowsWithMST = currentRecipientsData.filter(r => r.MST).length;

            if (totalRows > 0) {
                if (rowsWithEmail === totalRows) {
                    statusEl.innerText = `✅ Đã nạp thành công ${totalRows} dòng (Dữ liệu chuẩn).`;
                    statusEl.className = 'text-sm font-bold text-emerald-400 text-center';
                } else if (rowsWithEmail > 0) {
                    statusEl.innerText = `⚠️ Đã nạp ${totalRows} dòng, nhưng chỉ ${rowsWithEmail} dòng có Email hợp lệ.`;
                    statusEl.className = 'text-sm font-bold text-orange-400 text-center';
                } else {
                    statusEl.innerText = `❌ Đã nạp ${totalRows} dòng, nhưng KHÔNG tìm thấy Email nào!`;
                    statusEl.className = 'text-sm font-bold text-red-400 text-center';
                }
            } else {
                statusEl.innerText = 'Không tìm thấy dòng dữ liệu nào!';
                statusEl.className = 'text-sm font-bold text-orange-400 text-center';
            }
            renderPreviewTable();
        } catch (err) {
            console.error(err);
            statusEl.innerText = 'Lỗi xử lý file!';
            statusEl.className = 'text-sm font-bold text-red-500 text-center';
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable() {
    const tbody = document.getElementById('preview-table-body');
    if (!tbody || !currentRecipientsData || currentRecipientsData.length === 0) return;

    // Get all column keys from the data
    const keys = Object.keys(currentRecipientsData[0]);

    // Update the table header dynamically
    const thead = tbody.closest('table')?.querySelector('thead tr');
    if (thead) {
        thead.innerHTML = keys.map(k => `<th class="px-4 py-3 font-bold text-gray-400 uppercase text-[10px] tracking-widest">${k}</th>`).join('');
    }

    tbody.innerHTML = currentRecipientsData.map(row => `
        <tr class="hover:bg-white/5">
            ${keys.map(k => `<td class="px-4 py-2 text-gray-300 text-xs font-medium whitespace-nowrap">${row[k] || '-'}</td>`).join('')}
        </tr>
    `).join('');
}

// --- Rich Text Editor Functions ---
function formatDoc(cmd, value = null) {
    document.getElementById('input-template').focus();
    document.execCommand(cmd, false, value);
}

function insertVariable(variable) {
    const editor = document.getElementById('input-template');
    editor.focus();
    
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // Check if selection is inside the editor
        if (editor.contains(range.commonAncestorContainer)) {
            // If text is selected, wrap it with the variable
            if (!sel.isCollapsed) {
                range.deleteContents();
            }
            const node = document.createTextNode(variable);
            range.insertNode(node);
            // Move cursor after inserted text
            range.setStartAfter(node);
            range.setEndAfter(node);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            // If cursor is not in editor, append at end
            editor.innerHTML += variable;
        }
    } else {
        editor.innerHTML += variable;
    }
}

function addCustomLink() {
    const url = prompt('Nhập URL liên kết:', 'https://');
    if (url) {
        formatDoc('createLink', url);
    }
}

function handleEditorImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('input-template').focus();
        document.execCommand('insertImage', false, e.target.result);
    };
    reader.readAsDataURL(file);
}

async function saveCampaign(event) {
    const name = document.getElementById('input-name').value;
    const subject = document.getElementById('input-subject').value;
    const senderId = document.getElementById('select-sender').value;
    const content = document.getElementById('input-template').innerHTML;
    const attachCert = document.getElementById('toggle-attach-cert')?.checked || false;

    if (!name) return alert('Vui lòng nhập tên chiến dịch');
    if (!subject) return alert('Vui lòng nhập tiêu đề email');
    if (!senderId) return alert('Vui lòng chọn tài khoản gửi');
    if (!currentRecipientsData || currentRecipientsData.length === 0) return alert('Vui lòng tải file dữ liệu');

    try {
        const res = await authedFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, subject, 
                senderAccountId: senderId, 
                template: content, 
                recipients: currentRecipientsData,
                attachCert
            })
        });
        if (res.ok) {
            alert('Tạo chiến dịch thành công!');
            closeCreateModal();
            showPage('campaigns');
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.error || 'Không rõ'));
        }
    } catch (e) { alert('Lỗi kết nối server'); }
}

// --- Template Save/Load ---
async function saveTemplate() {
    const name = prompt('Đặt tên cho mẫu email:', 'Mẫu mới');
    if (!name) return;
    const content = document.getElementById('input-template').innerHTML;
    try {
        await authedFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content })
        });
        alert('Đã lưu mẫu!');
        loadTemplates();
    } catch (e) { console.error(e); }
}

async function loadTemplates() {
    try {
        const res = await authedFetch('/api/templates');
        const data = await res.json();
        const select = document.getElementById('select-template');
        if (select && Array.isArray(data)) {
            select.innerHTML = '<option value="">-- Mẫu đã lưu --</option>' +
                data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
    } catch (e) {}
}

async function deleteTemplate() {
    const select = document.getElementById('select-template');
    const id = select.value;
    if (!id) return alert('Vui lòng chọn một mẫu để xóa');
    
    if (!confirm('Bạn có chắc chắn muốn xóa mẫu email này?')) return;
    
    try {
        const res = await authedFetch(`/api/templates/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Đã xóa mẫu thành công!');
            document.getElementById('input-template').innerHTML = '';
            loadTemplates();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.error || 'Không rõ'));
        }
    } catch (e) { alert('Lỗi kết nối server'); }
}

async function applyTemplate() {
    const id = document.getElementById('select-template').value;
    if (!id) return;
    try {
        const res = await authedFetch(`/api/templates/${id}`);
        // Note: GET /api/templates/:id usually returns an object if implemented, 
        // but often the SELECT * from /api/templates already has content.
        // Let's check how templates are stored.
        const data = await res.json();
        if (data && data.content) {
            document.getElementById('input-template').innerHTML = data.content;
        }
    } catch (e) {}
}

// --- Reports & Logs ---
async function loadEmailLogs() {
    const tbody = document.getElementById('email-logs-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500 font-bold animate-pulse italic">Đang tải nhật ký...</td></tr>';
    
    try {
        const res = await authedFetch('/api/email-logs');
        const data = await res.json();
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500 font-bold italic">Chưa có nhật ký gửi mail nào.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(log => {
            const date = new Date(log.created_at).toLocaleString('vi-VN');
            const statusClass = getStatusBadgeClass(log.status);

            return `
                <tr class="hover:bg-white/2 transition-all group">
                    <td class="px-6 py-4 whitespace-nowrap text-gray-400 font-mono text-[10px]">${date}</td>
                    <td class="px-6 py-4">
                        <div class="text-xs font-black text-white">${log.email}</div>
                        <div class="text-[10px] text-gray-500">MST: ${log.customer_id}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-[10px] font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">
                            ${log.campaigns?.name || 'N/A'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${statusClass}">
                            ${log.status}
                        </span>
                    </td>
                    <td class="px-6 py-4 max-w-xs">
                        <div class="text-[10px] text-red-400/70 italic line-clamp-1 group-hover:line-clamp-none transition-all" title="${log.error_message || ''}">
                            ${log.error_message || '-'}
                        </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <a href="/api/reports/${log.campaign_id}?access_token=${localStorage.getItem('sb-token')}" target="_blank" class="text-[10px] font-bold text-orange-500 hover:underline">Chi tiết</a>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-red-500 font-bold">Lỗi tải dữ liệu nhật ký!</td></tr>';
    }
}

function getStatusBadgeClass(status) {
    if (status === 'sent') return 'bg-green-500/10 text-green-500 border border-green-500/20';
    if (status === 'pending') return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
    if (status.includes('failed')) return 'bg-red-500/10 text-red-500 border border-red-500/20';
    return 'bg-gray-500/10 text-gray-500 border border-gray-500/20';
}

function exportEmailLogs() {
    const table = document.getElementById('view-reports').querySelector('table');
    if (!table) return;
    
    const rows = Array.from(table.querySelectorAll('tr'));
    let csv = '\uFEFFTime,Email,MST,Campaign,Status,Error\n';
    
    rows.slice(1).forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length < 5) return;
        
        const time = cols[0].innerText;
        const email = cols[1].querySelector('div').innerText;
        const mst = cols[1].querySelectorAll('div')[1].innerText.replace('MST: ', '');
        const campaign = cols[2].innerText.trim();
        const status = cols[3].innerText.trim();
        const error = cols[4].innerText.trim().replace(/,/g, ';');
        
        csv += `"${time}","${email}","${mst}","${campaign}","${status}","${error}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Email_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function handleLogout() {
    localStorage.removeItem('sb-token');
    window.location.reload();
}

