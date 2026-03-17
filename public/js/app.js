let currentRecipients = [];
let allSenders = []; 
let supabaseClient = null;
let currentSession = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    
    // Rich Text Editor Paste handling
    const editor = document.getElementById('input-template');
    if (editor) {
        editor.addEventListener('paste', function(e) {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.includes('image')) {
                    e.preventDefault(); // Prevent double paste
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const img = `<img src="${event.target.result}" style="max-width: 100%; border-radius: 12px; margin: 10px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">`;
                        document.execCommand('insertHTML', false, img);
                    };
                    reader.readAsDataURL(blob);
                }
            }
        });
    }
});

/** ---------------- AUTH LOGIC ---------------- */

async function initAuth() {
    try {
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        
        // Use window.supabase to refer to the library
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseKey);
        
        // Check current session
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentSession = session;

        if (session) {
            showApp(session.user);
        } else {
            showAuth();
        }

        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange((_event, session) => {
            currentSession = session;
            if (session) showApp(session.user);
            else showAuth();
        });
    } catch (err) {
        console.error('Auth Init Error:', err);
    }
}

function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
}

function showApp(user) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    
    // Update Profile UI
    document.getElementById('user-display-email').innerText = user.email;
    document.getElementById('user-display-name').innerText = user.user_metadata.full_name || 'Người dùng';
    document.getElementById('user-avatar').innerText = (user.user_metadata.full_name || user.email).charAt(0).toUpperCase();

    // Initial Data Load
    loadStats();
    loadCampaigns();
}

let authMode = 'login'; // 'login' or 'register'

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchBtn = document.getElementById('auth-switch-btn');
    const switchText = document.getElementById('auth-switch-text');
    const regFields = document.getElementById('register-fields');

    if (authMode === 'register') {
        subtitle.innerText = 'Bắt đầu hành trình Automation của bạn';
        submitBtn.innerText = 'Đăng ký tài khoản';
        switchText.innerText = 'Đã có tài khoản?';
        switchBtn.innerText = 'Đăng nhập';
        regFields.classList.remove('hidden');
    } else {
        subtitle.innerText = 'Đăng nhập để tiếp tục quản lý chiến dịch';
        submitBtn.innerText = 'Đăng nhập ngay';
        switchText.innerText = 'Chưa có tài khoản?';
        switchBtn.innerText = 'Tham gia ngay';
        regFields.classList.add('hidden');
    }
}

async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit-btn');

    errorEl.classList.add('hidden');
    submitBtn.innerText = 'Đang xử lý...';
    submitBtn.disabled = true;

    try {
        let result;
        if (authMode === 'login') {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        } else {
            result = await supabaseClient.auth.signUp({ 
                email, 
                password,
                options: { 
                    data: { full_name: name },
                    emailRedirectTo: window.location.origin 
                }
            });
        }

        if (result.error) {
            errorEl.innerText = result.error.message;
            errorEl.classList.remove('hidden');
        } else if (authMode === 'register') {
            // Show a nice success state instead of an alert
            const authCard = document.querySelector('.auth-card');
            authCard.innerHTML = `
                <div class="text-center space-y-6 py-8 animate-in fade-in zoom-in duration-500">
                    <div class="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span class="text-4xl">📧</span>
                    </div>
                    <h2 class="text-2xl font-black text-white">Kiểm tra Email!</h2>
                    <p class="text-gray-400">Chúng tôi đã gửi link xác nhận đến <b>${email}</b>. Vui lòng kiểm tra hộp thư (và cả mục Spam).</p>
                    <div class="pt-6">
                        <button onclick="window.location.reload()" class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl transition-all">
                            Quay lại đăng nhập
                        </button>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        errorEl.innerText = 'An unexpected error occurred.';
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.innerText = authMode === 'login' ? 'Đăng nhập ngay' : 'Đăng ký tài khoản';
        submitBtn.disabled = false;
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

/**
 * Helper for authenticated API calls
 */
async function authedFetch(url, options = {}) {
    if (!currentSession) return null;
    
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    
    return fetch(url, { ...options, headers });
}

/** ---------------- END AUTH LOGIC ---------------- */

function showPage(page) {
    document.getElementById('page-title').innerText = 
        page === 'dashboard' ? 'Bảng điều khiển' : 
        page === 'campaigns' ? 'Chiến dịch email' : 
        page === 'senders' ? 'Cấu hình tài khoản gửi mail' : 
        page === 'crm' ? 'Quản lý khách hàng (CRM)' : 'Cài đặt hệ thống';
    
    // Switch views
    ['view-dashboard', 'view-campaigns', 'view-senders', 'view-settings', 'view-crm', 'view-reports'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    if (page === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('hidden');
        loadStats();
        loadCampaigns('campaign-list');
    } else if (page === 'campaigns') {
        document.getElementById('view-campaigns').classList.remove('hidden');
        loadCampaigns('campaign-list-all');
    } else if (page === 'senders') {
        document.getElementById('view-senders').classList.remove('hidden');
        loadSenders();
    } else if (page === 'crm') {
        document.getElementById('view-crm').classList.remove('hidden');
        loadCRM();
        loadCRMStats();
    } else if (page === 'settings') {
        document.getElementById('view-settings').classList.remove('hidden');
    } else if (page === 'reports') {
        document.getElementById('view-reports').classList.remove('hidden');
        loadEmailLogs();
    }

    // Update sidebar active state
    ['nav-dashboard', 'nav-campaigns', 'nav-senders', 'nav-crm', 'nav-reports'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === `nav-${page}`) {
            el.classList.add('sidebar-item-active');
            el.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
            el.classList.add('bg-white/10', 'text-white');
        } else {
            el.classList.remove('sidebar-item-active', 'bg-white/10', 'text-white');
            el.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
        }
    });
}

function openCreateModal() {
    document.getElementById('modal-create').classList.remove('hidden');
    loadTemplates();
    loadSendersForModal();
}

function closeCreateModal() {
    document.getElementById('modal-create').classList.add('hidden');
}

// Sender Management
async function loadSenders() {
    const response = await authedFetch('/api/senders');
    if (!response || !response.ok) return;
    
    allSenders = await response.json();
    const list = document.getElementById('sender-list');
    if (!list) return;
    list.innerHTML = '';
    allSenders.forEach(s => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-white/2 transition-colors duration-200';
        row.innerHTML = `
            <td class="px-8 py-4 font-bold text-white">${s.senderName}</td>
            <td class="px-8 py-4 text-gray-400">${s.senderEmail}</td>
            <td class="px-8 py-4 text-gray-400 font-mono text-xs">${s.smtpHost}</td>
            <td class="px-8 py-4 text-right flex items-center justify-end gap-2">
                <button onclick="openEditSenderModal('${s.id}')" class="text-xs font-bold text-orange-400 hover:text-orange-500 bg-orange-500/10 px-3 py-1 rounded-lg">Sửa</button>
                <button onclick="deleteSender('${s.id}')" class="text-xs font-bold text-red-400 hover:text-red-500 bg-red-500/10 px-3 py-1 rounded-lg">Xóa</button>
            </td>
        `;
        list.appendChild(row);
    });
}

async function connectGoogleAccount() {
    try {
        const response = await authedFetch('/api/auth/google/url');
        if (!response || !response.ok) {
            alert('Lỗi: Không thể lấy đường dẫn kết nối Google.');
            return;
        }
        const { url } = await response.json();
        
        // Open popup
        const popup = window.open(url, 'GoogleAuth', 'width=600,height=700');
        
        // Setup listener for success message from popup
        const authMessageListener = (event) => {
            if (event.data === 'google_auth_success') {
                window.removeEventListener('message', authMessageListener);
                alert('🎉 Đã kết nối tài khoản Gmail thành công!');
                loadSenders(); // reload the sender list
            }
        };
        window.addEventListener('message', authMessageListener);
        
        // Fallback checker if popup closed but didn't trigger message (optional)
        const checkPopup = setInterval(() => {
            if (!popup || popup.closed || popup.closed === undefined) {
                clearInterval(checkPopup);
                window.removeEventListener('message', authMessageListener);
                loadSenders(); // Try reloading anyway just in case it succeeded
            }
        }, 1000);

    } catch (err) {
        alert('Lỗi khi kết nối Google: ' + err.message);
    }
}

async function loadSendersForModal() {
    const response = await authedFetch('/api/senders');
    if (!response || !response.ok) return;
    
    allSenders = await response.json();
    const select = document.getElementById('select-sender');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn tài khoản gửi mail --</option>';
    allSenders.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.senderName} (${s.senderEmail})`;
        select.appendChild(opt);
    });
}

function openEditSenderModal(id) {
    const sender = allSenders.find(s => s.id === id);
    if (!sender) return;

    document.getElementById('edit-sender-id').value = sender.id;
    document.getElementById('edit-sender-name').value = sender.senderName;
    document.getElementById('edit-sender-email').value = sender.senderEmail;
    document.getElementById('edit-smtp-host').value = sender.smtpHost;
    document.getElementById('edit-smtp-port').value = sender.smtpPort;
    document.getElementById('edit-smtp-user').value = sender.smtpUser;
    document.getElementById('edit-smtp-pass').value = ''; // Don't show password

    document.getElementById('modal-edit-sender').classList.remove('hidden');
}

function closeEditSenderModal() {
    document.getElementById('modal-edit-sender').classList.add('hidden');
}

async function updateSenderAccount() {
    const id = document.getElementById('edit-sender-id').value;
    const data = {
        senderName: document.getElementById('edit-sender-name').value,
        senderEmail: document.getElementById('edit-sender-email').value,
        smtpHost: document.getElementById('edit-smtp-host').value,
        smtpPort: document.getElementById('edit-smtp-port').value,
        smtpUser: document.getElementById('edit-smtp-user').value
    };

    const pass = document.getElementById('edit-smtp-pass').value;
    if (pass) data.smtpPassword = pass;

    try {
        const response = await authedFetch(`/api/senders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response && response.ok) {
            alert('Cập nhật tài khoản thành công!');
            closeEditSenderModal();
            loadSenders();
        } else {
            const err = response ? await response.json() : { error: 'Lỗi không xác định' };
            alert('Lỗi: ' + (err.error || 'Không thể cập nhật tài khoản.'));
        }
    } catch (error) {
        alert('Lỗi kết nối khi cập nhật tài khoản.');
    }
}

async function deleteSender(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản gửi này?')) return;

    try {
        const response = await authedFetch(`/api/senders/${id}`, {
            method: 'DELETE'
        });

        if (response && response.ok) {
            alert('Đã xóa tài khoản thành công!');
            loadSenders();
        } else {
            const err = response ? await response.json() : { error: 'Lỗi không xác định' };
            alert('Lỗi: ' + (err.error || 'Không thể xóa tài khoản.'));
        }
    } catch (error) {
        alert('Lỗi kết nối khi xóa tài khoản.');
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const statusEl = document.getElementById('upload-status');
    statusEl.innerText = '⏳ Đang phân tích dữ liệu Automation...';

    try {
        const response = await authedFetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        currentRecipients = result.data;
        
        // Auto-import to CRM for persistence
        await authedFetch('/api/customers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: currentRecipients })
        });

        statusEl.innerText = `✅ Đã nạp ${currentRecipients.length} khách hàng & Cập nhật CRM thành công.`;
        updatePreview();
    } catch (error) {
        statusEl.innerText = '❌ Lỗi khi tải file.';
    }
}

async function handleGSheets() {
    const url = document.getElementById('gsheets-link').value;
    if (!url) {
        alert('Vui lòng dán link Google Sheet.');
        return;
    }

    const statusEl = document.getElementById('upload-status');
    statusEl.innerText = '⏳ Đang đồng bộ Google Cloud...';

    try {
        const response = await authedFetch('/api/gsheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        currentRecipients = result.data;

        // Auto-import to CRM for persistence
        await authedFetch('/api/customers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: currentRecipients })
        });

        statusEl.innerText = `✅ Đồng bộ thành công ${currentRecipients.length} dữ liệu & Cập nhật CRM.`;
        updatePreview();
    } catch (error) {
        statusEl.innerText = `❌ ${error.message}`;
    }
}

function updatePreviewTable() {
    const tbody = document.getElementById('preview-table-body');
    
    if (currentRecipients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-600 font-medium italic">Chờ nạp dữ liệu...</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    const previewData = currentRecipients.slice(0, 5);
    previewData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 hover:bg-white/2';
        tr.innerHTML = `
            <td class="px-4 py-3 text-white font-mono text-[11px]">${row.MST || '-'}</td>
            <td class="px-4 py-3 text-gray-400 font-medium">${row.TenCongTy || '-'}</td>
            <td class="px-4 py-3 text-orange-gradient font-bold">${row.Email || '-'}</td>
            <td class="px-4 py-3 text-orange-500 font-bold text-right">${row.NgayHetHanChuKySo || '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    if (currentRecipients.length > 5) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" class="px-4 py-2 text-center text-gray-600 text-[10px] font-bold uppercase tracking-widest">... và ${currentRecipients.length - 5} khách hàng khác</td>`;
        tbody.appendChild(tr);
    }
}

async function loadCampaigns(targetId = 'campaign-list') {
    const response = await authedFetch('/api/campaigns');
    if (!response || !response.ok) return;
    const campaigns = await response.json();
    const list = document.getElementById(targetId);
    if (!list) return;
    list.innerHTML = '';

    campaigns.reverse().forEach(c => {
        const total = c.recipients ? c.recipients.length : 0;
        const progress = total > 0 ? Math.round((c.sentCount / total) * 100) : 0;
        const row = document.createElement('tr');
        row.className = 'hover:bg-white/2 transition-all duration-200';
        row.innerHTML = `
            <td class="px-8 py-5">
                <p class="font-bold text-white">${c.name}</p>
                <p class="text-[10px] text-gray-500 font-mono mt-1">ID: ${c.id.slice(0,8)}</p>
            </td>
            <td class="px-8 py-5">
                <span class="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg ${getStatusColor(c.status)}">
                    ${c.status}
                </span>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                    <div class="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-orange-gradient h-full transition-all duration-1000" style="width: ${progress}%"></div>
                    </div>
                    <span class="text-xs font-bold text-gray-400 font-mono">${progress}%</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-2 font-bold uppercase tracking-widest">${c.sentCount}/${total} EMAILS</p>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <button onclick="window.location.href='/api/reports/${c.id}'" class="text-white hover:text-white font-extrabold text-[9px] uppercase tracking-widest bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl transition-all">Báo cáo</button>
                    <div class="flex items-center bg-white/5 rounded-xl p-1 gap-1 border border-white/5">
                        <span class="text-[8px] font-black text-gray-500 uppercase px-1">Xuất:</span>
                        <button onclick="exportCampaignData('${c.id}', 'json')" class="text-orange-500 hover:text-orange-400 font-black text-[9px] uppercase px-2 py-1 rounded-lg hover:bg-white/5 transition-all">JSON</button>
                        <button onclick="exportCampaignData('${c.id}', 'excel')" class="text-green-500 hover:text-green-400 font-black text-[9px] uppercase px-2 py-1 rounded-lg hover:bg-white/5 transition-all">Excel</button>
                    </div>
                    <button onclick="deleteCampaign('${c.id}')" class="text-red-500 hover:text-red-400 font-extrabold text-[9px] uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 px-3 py-2 rounded-xl transition-all">Xóa</button>
                </div>
            </td>
        `;
        list.appendChild(row);
    });
}

async function deleteCampaign(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa chiến dịch này không? Hành động này không thể hoàn tác.')) return;
    
    try {
        const response = await authedFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        if (!response) return;
        const result = await response.json();
        if (response.ok) {
            loadCampaigns();
            loadStats();
        } else {
            alert(result.error || 'Lỗi khi xóa chiến dịch.');
        }
    } catch (error) {
        alert('Lỗi kết nối máy chủ.');
    }
}

function getStatusBadgeClass(status) {
    if (!status) return 'bg-white/10 text-gray-400';
    if (status.includes('Hoàn thành')) return 'bg-orange-500/20 text-orange-500';
    switch(status) {
        case 'Chờ gửi': 
        case 'Đang gửi': return 'bg-purple-500/20 text-purple-400 animate-pulse';
        case 'Thất bại':
        case 'Lỗi': return 'bg-red-500/20 text-red-500';
        default: return 'bg-white/10 text-gray-400';
    }
}

async function loadStats() {
    try {
        const response = await authedFetch('/api/stats');
        if (!response || !response.ok) return;
        const stats = await response.json();
        
        document.getElementById('stat-total').innerText = stats.totalSent.toLocaleString();
        const successRate = stats.totalSent > 0 ? Math.round((stats.totalSuccess / stats.totalSent) * 100) : 0;
        const errorRate = stats.totalSent > 0 ? Math.round((stats.totalError / stats.totalSent) * 100) : 0;
        
        document.getElementById('stat-success').innerText = `${successRate}%`;
        document.getElementById('stat-error').innerText = `${errorRate}%`;

        const bar = document.getElementById('success-progress-bar');
        if (bar) bar.style.width = `${successRate}%`;

        // Load CRM summary for dashboard
        const crmResp = await authedFetch('/api/crm/stats');
        if (crmResp && crmResp.ok) {
            const crmStats = await crmResp.json();
            document.getElementById('dash-crm-expired').innerText = crmStats.expired;
            document.getElementById('dash-crm-30').innerText = crmStats.within30;
            document.getElementById('dash-crm-60').innerText = crmStats.within60;
            document.getElementById('dash-crm-total').innerText = crmStats.total;
        }
    } catch (err) {
        console.error('Lỗi khi tải thống kê:', err);
    }
}

async function loadTemplates() {
    try {
        const response = await authedFetch('/api/templates');
        if (!response || !response.ok) return;
        const templates = await response.json();
        const select = document.getElementById('select-template');
        
        // Keep only first option
        select.innerHTML = '<option value="">-- Chọn mẫu đã lưu --</option>';
        
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.dataset.content = t.content;
            opt.textContent = t.name;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Lỗi khi tải danh sách mẫu:', error);
    }
}

async function saveTemplate() {
    const editor = document.getElementById('input-template');
    const content = editor.innerHTML;
    if (!content || content.trim() === '' || content === '<br>') {
        alert('Vui lòng nhập nội dung mẫu trước khi lưu.');
        return;
    }

    const name = prompt('Đặt tên cho mẫu email này:', `Mẫu ${new Date().toLocaleDateString('vi-VN')}`);
    if (!name) return;

    try {
        const response = await authedFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content })
        });
        if (response && response.ok) {
            alert('Đã lưu mẫu thành công!');
            loadTemplates();
        } else {
            const err = response ? await response.json() : { error: 'No session' };
            alert('Lỗi: ' + (err.error || 'Không thể lưu mẫu.'));
        }
    } catch (error) {
        alert('Lỗi khi lưu mẫu.');
    }
}

function applyTemplate() {
    const select = document.getElementById('select-template');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.content) {
        document.getElementById('input-template').innerHTML = selectedOption.dataset.content;
    }
}

// Rich Text Editor Functions
function formatDoc(cmd, value = null) {
    document.execCommand(cmd, false, value);
    document.getElementById('input-template').focus();
}

function addCustomLink() {
    const url = prompt("Nhập địa chỉ liên kết (URL):", "https://");
    if (url) formatDoc('createLink', url);
}

function insertVariable(variable) {
    formatDoc('insertText', variable);
}

function handleEditorImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = `<img src="${e.target.result}" style="max-width: 100%; border-radius: 12px; margin: 10px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">`;
        formatDoc('insertHTML', img);
    };
    reader.readAsDataURL(file);
}

// Refresh every 10 seconds (aligned with worker)
setInterval(() => {
    const activePage = document.querySelector('a.sidebar-item-active')?.id;
    if (activePage === 'nav-dashboard') loadCampaigns();
    if (activePage === 'nav-reports') loadEmailLogs();
    loadStats();
}, 10000);

async function loadEmailLogs() {
    try {
        const response = await authedFetch('/api/email-logs');
        if (!response || !response.ok) return;
        const logs = await response.json();
        const listEl = document.getElementById('email-logs-list');
        listEl.innerHTML = '';

        logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/5 transition-all text-xs';
            let statusClass = 'text-gray-400';
            if (log.status === 'sent') statusClass = 'text-green-500 font-bold';
            if (log.status === 'failed') statusClass = 'text-red-500 font-bold';

            tr.innerHTML = `
                <td class="px-6 py-4 text-gray-400">${new Date(log.created_at).toLocaleString('vi-VN')}</td>
                <td class="px-6 py-4 font-bold text-white">${log.email}</td>
                <td class="px-6 py-4 text-gray-400">${log.campaign_id}</td>
                <td class="px-6 py-4 ${statusClass}">${log.status === 'sent' ? '✅ Thành công' : (log.status === 'failed' ? '❌ Thất bại' : '⏳ Đang chờ')}</td>
                <td class="px-6 py-4 text-[10px] text-red-400 italic max-w-[200px] truncate" title="${log.error_message || ''}">${log.error_message || ''}</td>
            `;
            listEl.appendChild(tr);
        });
    } catch (err) {
        console.error('Lỗi tải nhật ký:', err);
    }
}

async function exportEmailLogs() {
    try {
        const response = await authedFetch('/api/email-logs');
        if (!response || !response.ok) return;
        const logs = await response.json();
        
        if (logs.length === 0) {
            alert('Không có dữ liệu nhật ký để xuất.');
            return;
        }

        const dataToExport = logs.map(l => ({
            'Thời gian': new Date(l.created_at).toLocaleString('vi-VN'),
            'Email': l.email,
            'Chiến dịch ID': l.campaign_id,
            'Trạng thái': l.status === 'sent' ? 'Thành công' : (l.status === 'failed' ? 'Thất bại' : 'Đang xử lý'),
            'Lỗi': l.error_message || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Nhật ký gửi mail");
        XLSX.writeFile(workbook, `Bao_cao_gui_mail_${new Date().getTime()}.xlsx`);
    } catch (error) {
        alert('Lỗi khi xuất báo cáo: ' + error.message);
    }
}

async function saveCampaign() {
    const name = document.getElementById('input-name').value;
    const subject = document.getElementById('input-subject').value;
    const senderAccountId = document.getElementById('select-sender').value;
    const attachCert = document.getElementById('toggle-attach-cert')?.checked || false;
    const editor = document.getElementById('input-template');
    let template = editor.innerHTML; 

    // Wrap in default dark theme if it doesn't look like it's already wrapped
    if (!template.includes('id="ca2-email-wrapper"')) {
        template = `
            <div id="ca2-email-wrapper" style="background-color: #050510; color: #ffffff; padding: 40px; font-family: 'Plus Jakarta Sans', Arial, sans-serif; line-height: 1.6; border-radius: 16px;">
                ${template}
            </div>
        `;
    }

    if (!name || !subject || !senderAccountId || !template || currentRecipients.length === 0) {
        alert('Vui lòng hoàn tất thiết lập chiến dịch trước khi kích hoạt.');
        return;
    }

    try {
        const response = await authedFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, senderAccountId, template, recipients: currentRecipients, attachCert })
        });

        if (response && response.ok) {
            const campaign = await response.json();
            await authedFetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
            
            closeCreateModal();
            loadCampaigns();
            loadStats();
        } else {
            const err = response ? await response.json() : { error: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' };
            alert('Lỗi: ' + (err.error || 'Không thể khởi tạo automation.'));
        }
    } catch (error) {
        alert('Lỗi khi khởi tạo automation: ' + error.message);
    }
}

/** ---------------- CRM LOGIC ---------------- */

let currentCRMFilter = 'all';

async function loadCRM(filter = null) {
    if (filter) currentCRMFilter = filter;
    const statusFilter = document.getElementById('crm-filter-status').value;
    
    try {
        let url = `/api/customers?filter=${currentCRMFilter}`;
        const response = await authedFetch(url);
        if (!response || !response.ok) return;

        let customers = await response.json();
        
        // Front-end status filtering
        if (statusFilter !== 'all') {
            customers = customers.filter(c => c.status === statusFilter);
        }

        const listEl = document.getElementById('crm-list');
        listEl.innerHTML = '';

        if (customers.length === 0) {
            listEl.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500 italic">Không tìm thấy khách hàng nào khớp với bộ lọc.</td></tr>`;
            return;
        }

        const now = new Date();

        customers.forEach(c => {
            const expDate = new Date(c.expirationDate);
            const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            
            let rowColorClass = '';
            let statusBadge = '';

            if (diffDays < 0) {
                rowColorClass = 'bg-red-500/5';
                statusBadge = '<span class="px-2 py-1 bg-red-500/20 text-red-500 rounded text-[9px] font-bold">Hết hạn</span>';
            } else if (diffDays <= 30) {
                rowColorClass = 'bg-red-500/5 border-l-4 border-red-500';
                statusBadge = '<span class="px-2 py-1 bg-red-500/20 text-red-500 rounded text-[9px] font-bold">Hạn < 30 ngày</span>';
            } else if (diffDays <= 60) {
                rowColorClass = 'bg-orange-500/5 border-l-4 border-orange-500';
                statusBadge = '<span class="px-2 py-1 bg-orange-500/20 text-orange-500 rounded text-[9px] font-bold">Hạn < 60 ngày</span>';
            } else if (diffDays <= 90) {
                rowColorClass = 'bg-yellow-500/5 border-l-4 border-yellow-500';
                statusBadge = '<span class="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded text-[9px] font-bold">Hạn < 90 ngày</span>';
            }

            const pdfBadge = c.pdf_url 
                ? '<span class="ml-2 text-[10px] text-green-500 font-black cursor-help" title="Đã có file PDF">📄 PDF</span>' 
                : '<span class="ml-2 text-[10px] text-gray-600 font-medium">🈚 No PDF</span>';

            const tr = document.createElement('tr');
            tr.className = `${rowColorClass} hover:bg-white/5 transition-all`;
            tr.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div>
                            <p class="text-sm font-bold text-white">${c.companyName || 'N/A'}</p>
                            <p class="text-[10px] text-gray-500 font-medium">MST: ${c.taxCode || 'N/A'}</p>
                        </div>
                        ${pdfBadge}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm font-bold text-white">${c.expirationDate || 'N/A'}</p>
                    ${statusBadge}
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 bg-white/5 text-gray-300 rounded-full text-[10px] font-bold border border-white/10 italic">${c.status || 'Chưa liên hệ'}</span>
                </td>
                <td class="px-6 py-4">
                    <p class="text-[11px] text-gray-400 max-w-[200px] truncate" title="${c.notes || ''}">${c.notes || '---'}</p>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openCRMUpdateModal('${c.id}')" class="text-xs font-bold text-orange-gradient hover:underline">Cập nhật</button>
                </td>
            `;
            listEl.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading CRM:', err);
    }
}

async function loadCRMStats() {
    try {
        const response = await authedFetch('/api/crm/stats');
        if (!response || !response.ok) return;

        const stats = await response.json();
        document.getElementById('crm-stat-expired').innerText = stats.expired;
        document.getElementById('crm-stat-30').innerText = stats.within30;
        document.getElementById('crm-stat-60').innerText = stats.within60;
        document.getElementById('crm-stat-total').innerText = stats.total;
    } catch (err) {
        console.error('Error loading CRM stats:', err);
    }
}

function filterCRM(period) {
    currentCRMFilter = period;
    loadCRM();
}

let activeCRMId = null;
let activeCRMTaxCode = null;

async function openCRMUpdateModal(id) {
    activeCRMId = id;
    document.getElementById('crm-update-id').value = id;
    
    // Fetch customer details to show current PDF status
    try {
        const response = await authedFetch(`/api/customers/${id}`);
        if (response && response.ok) {
            const customer = await response.json();
            activeCRMTaxCode = customer.taxCode;
            document.getElementById('crm-update-taxcode').value = customer.taxCode;
            document.getElementById('crm-update-status').value = customer.status || 'Chưa liên hệ';
            document.getElementById('crm-update-notes').value = customer.notes || '';
            
            // PDF UI
            const pdfStatus = document.getElementById('crm-pdf-status');
            const pdfView = document.getElementById('crm-pdf-view');
            if (customer.pdf_url) {
                pdfStatus.innerText = 'Đã có file';
                pdfStatus.className = 'text-[10px] font-bold text-green-500 px-2 py-0.5 bg-green-500/10 rounded';
                pdfView.href = customer.pdf_url;
                pdfView.classList.remove('hidden');
            } else {
                pdfStatus.innerText = 'Chưa có file';
                pdfStatus.className = 'text-[10px] font-bold text-gray-500 px-2 py-0.5 bg-white/5 rounded';
                pdfView.classList.add('hidden');
            }
        }
    } catch (e) { console.error(e); }

    document.getElementById('modal-crm-update').classList.remove('hidden');
}

async function uploadCustomerPDF() {
    const fileInput = document.getElementById('crm-pdf-file');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('taxCode', activeCRMTaxCode);

    try {
        const pdfStatus = document.getElementById('crm-pdf-status');
        pdfStatus.innerText = '⏳ Đang tải...';
        
        const response = await fetch('/api/customers/upload-pdf', {
            method: 'POST',
            body: formData
            // Note: authedFetch handles token if needed, but FormData needs manual fetch here or utility update
        });

        if (response.ok) {
            alert('Tải lên PDF thành công!');
            openCRMUpdateModal(activeCRMId); // Refresh modal
        } else {
            alert('Lỗi khi tải lên PDF.');
        }
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

function closeCRMUpdateModal() {
    document.getElementById('modal-crm-update').classList.add('hidden');
    activeCRMId = null;
    activeCRMTaxCode = null;
}

async function saveCRMUpdate() {
    const status = document.getElementById('crm-update-status').value;
    const notes = document.getElementById('crm-update-notes').value;

    try {
        const response = await authedFetch(`/api/customers/${activeCRMId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, notes })
        });

        if (response && response.ok) {
            closeCRMUpdateModal();
            loadCRM();
            loadCRMStats();
        } else {
            alert('Không thể cập nhật thông tin khách hàng.');
        }
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function createCampaignFromCRM() {
    try {
        // Fetch current filtered customers
        const response = await authedFetch(`/api/customers?filter=${currentCRMFilter}`);
        if (!response || !response.ok) return;

        let customers = await response.json();
        const statusFilter = document.getElementById('crm-filter-status').value;
        if (statusFilter !== 'all') {
            customers = customers.filter(c => c.status === statusFilter);
        }

        if (customers.length === 0) {
            alert('Không có khách hàng nào trong bộ lọc hiện tại để tạo chiến dịch.');
            return;
        }

        // Map to recipients format
        currentRecipients = customers.map(c => ({
            MST: c.taxCode,
            TenCongTy: c.companyName,
            Email: c.email,
            NgayHetHanChuKySo: c.expirationDate
        }));

        // Open create campaign modal
        openCreateModal();
        
        // Populate fields with a suggested name
        let filterName = "Tất cả";
        if (currentCRMFilter === 'expired') filterName = "Đã hết hạn";
        else if (currentCRMFilter === '30') filterName = "Hết hạn < 30 ngày";
        
        document.getElementById('input-name').value = `Chiến dịch Gia hạn - ${filterName} (${new Date().toLocaleDateString()})`;
        
        updatePreviewTable();
        alert(`Đã chuẩn bị danh sách gửi cho ${currentRecipients.length} khách hàng!`);
    } catch (err) {
        alert('Lỗi khi tạo danh sách gửi: ' + err.message);
    }
}

/** ---------------- EXPORT LOGIC ---------------- */

async function exportCampaignData(campaignId, format) {
    try {
        const response = await authedFetch(`/api/campaigns`);
        if (!response || !response.ok) return;
        const campaigns = await response.json();
        const campaign = campaigns.find(c => c.id === campaignId);
        
        if (!campaign || !campaign.recipients || campaign.recipients.length === 0) {
            alert('Không có dữ liệu người nhận để xuất.');
            return;
        }

        const dataToExport = campaign.recipients.map(r => ({
            'MST': r.MST || '',
            'Tên công ty': r.TenCongTy || '',
            'Địa chỉ': r.DiaChi || '',
            'Email': r.Email || '',
            'Serial': r.Serial || '',
            'Ngày hết hạn': r.NgayHetHanChuKySo || '',
            'Trạng thái': r.status || ''
        }));

        const fileName = `Export_${campaign.name.replace(/\s+/g, '_')}_${new Date().getTime()}`;

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else if (format === 'excel') {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách gửi");
            
            // Adjust column widths
            const wscols = [
                {wch: 15}, // MST
                {wch: 40}, // TenCongTy
                {wch: 50}, // DiaChi
                {wch: 30}, // Email
                {wch: 25}, // Serial
                {wch: 15}, // NgayHetHan
                {wch: 20}  // status
            ];
            worksheet['!cols'] = wscols;

            XLSX.writeFile(workbook, `${fileName}.xlsx`);
        }
    } catch (error) {
        console.error('Export Error:', error);
        alert('Lỗi khi xuất dữ liệu: ' + error.message);
    }
}
