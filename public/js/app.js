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
    
    if (totalEl) totalEl.innerText = currentCRMData.length;
    if (activeEl) activeEl.innerText = currentCRMData.filter(c => c.status === 'active').length;
    if (expiringEl) expiringEl.innerText = currentCRMData.filter(c => c.status === 'expiring_soon').length;
    if (expiredEl) expiredEl.innerText = currentCRMData.filter(c => c.status === 'expired').length;

    tableBody.innerHTML = filtered.map(c => {
        const daysLeft = calculateRemainingDays(c.expired_date);
        const statusClass = c.status === 'expired' ? 'text-purple-500' : (daysLeft <= 30 ? 'text-red-500' : (daysLeft <= 60 ? 'text-orange-500' : 'text-green-500'));
        const barClass = c.status === 'expired' ? 'bg-purple-600' : (daysLeft <= 30 ? 'bg-red-500' : (daysLeft <= 60 ? 'bg-orange-500' : 'bg-green-500'));

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
                            ${c.status === 'expired' ? 'Hết hạn' : (daysLeft + ' ngày')}
                        </span>
                        <div class="w-16 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                            <div class="h-full ${barClass}" 
                                 style="width: ${c.status === 'active' ? '100%' : (c.status === 'expired' ? '0%' : '30%')}"></div>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
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
            <tr class="hover:bg-white/2">
                <td class="px-8 py-5 font-bold text-white">${c.name}</td>
                <td class="px-8 py-5">
                    <span class="px-2 py-1 rounded text-[10px] font-black uppercase ${c.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}">
                        ${c.status}
                    </span>
                </td>
                <td class="px-8 py-5 font-black text-white">${c.sent_count}/${c.total_recipients}</td>
                <td class="px-8 py-5 text-right font-black">
                     <button onclick="startCampaign('${c.id}')" class="text-green-500 hover:text-green-400">▶ CHẠY</button>
                </td>
            </tr>
        `).join('');
        if (list) list.innerHTML = html;
        if (listAll) listAll.innerHTML = html;
    } catch (e) {}
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

// --- Utils & Modals ---
function openCreateModal() { document.getElementById('modal-create').classList.remove('hidden'); }
function closeCreateModal() { document.getElementById('modal-create').classList.add('hidden'); }
function closeCA2CRMModal() { document.getElementById('modal-ca2-crm').classList.add('hidden'); }
function downloadLocalTool() { window.open('https://drive.google.com/file/d/13BSmd3pcckibLL93-DX_YZ-mrbyGfsvI/view?usp=drive_link', '_blank'); }

// Campaign File Upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        currentRecipientsData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        document.getElementById('upload-status').innerText = `Đã tải ${currentRecipientsData.length} dòng.`;
    };
    reader.readAsArrayBuffer(file);
}

async function saveCampaign() {
    const name = document.getElementById('input-name').value;
    const subject = document.getElementById('input-subject').value;
    const senderId = document.getElementById('select-sender').value;
    const content = document.getElementById('input-template').innerHTML;

    try {
        const res = await authedFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, senderId, content, recipients: currentRecipientsData })
        });
        if (res.ok) {
            alert('Tạo chiến dịch thành công!');
            closeCreateModal();
            showPage('campaigns');
        }
    } catch (e) { alert('Lỗi hệ thống'); }
}

function handleLogout() {
    localStorage.removeItem('sb-token');
    window.location.reload();
}
