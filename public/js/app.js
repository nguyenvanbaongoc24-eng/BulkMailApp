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
        page === 'senders' ? 'Cấu hình tài khoản gửi mail' : 'Cài đặt hệ thống';
    
    // Switch views
    ['view-dashboard', 'view-campaigns', 'view-senders', 'view-settings'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    if (page === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('hidden');
    } else if (page === 'campaigns') {
        document.getElementById('view-campaigns').classList.remove('hidden');
        loadCampaigns('campaign-list-all'); // Target the list in campaigns view if needed
    } else if (page === 'senders') {
        document.getElementById('view-senders').classList.remove('hidden');
        loadSenders();
    } else if (page === 'settings') {
        document.getElementById('view-settings').classList.remove('hidden');
    }

    // Update sidebar active state
    ['nav-dashboard', 'nav-campaigns', 'nav-senders', 'nav-settings'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === `nav-${page}`) {
            el.classList.add('sidebar-item-active');
            el.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
        } else {
            el.classList.remove('sidebar-item-active');
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

async function addSenderAccount() {
    const data = {
        senderName: document.getElementById('sender-name').value,
        senderEmail: document.getElementById('sender-email').value,
        smtpHost: document.getElementById('smtp-host').value,
        smtpPort: document.getElementById('smtp-port').value,
        smtpUser: document.getElementById('smtp-user').value,
        smtpPassword: document.getElementById('smtp-pass').value
    };

    if (!data.senderName || !data.senderEmail || !data.smtpHost || !data.smtpPassword) {
        alert('Vui lòng nhập đầy đủ thông tin SMTP.');
        return;
    }

    try {
        const response = await authedFetch('/api/senders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response && response.ok) {
            alert('Đã thêm tài khoản Automation CA2 thành công!');
            loadSenders();
            // Clear inputs
            ['sender-name', 'sender-email', 'smtp-host', 'smtp-port', 'smtp-user', 'smtp-pass'].forEach(id => {
                document.getElementById(id).value = '';
            });
        } else {
            const err = response ? await response.json() : { error: 'No session' };
            alert('Lỗi: ' + (err.error || 'Không thể thêm tài khoản.'));
        }
    } catch (error) {
        alert('Lỗi khi lưu tài khoản.');
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

    document.getElementById('upload-status').innerText = '⏳ Đang phân tích dữ liệu Automation...';

    try {
        const response = await authedFetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        currentRecipients = result.data;
        document.getElementById('upload-status').innerText = `✅ Đã nạp ${currentRecipients.length} khách hàng.`;
        updatePreview();
    } catch (error) {
        document.getElementById('upload-status').innerText = '❌ Lỗi khi tải file.';
    }
}

async function handleGSheets() {
    const url = document.getElementById('gsheets-link').value;
    if (!url) {
        alert('Vui lòng dán link Google Sheet.');
        return;
    }

    document.getElementById('upload-status').innerText = '⏳ Đang đồng bộ Google Cloud...';

    try {
        const response = await authedFetch('/api/gsheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        currentRecipients = result.data;
        document.getElementById('upload-status').innerText = `✅ Đồng bộ thành công ${currentRecipients.length} dữ liệu.`;
        updatePreview();
    } catch (error) {
        document.getElementById('upload-status').innerText = `❌ ${error.message}`;
    }
}

function updatePreview() {
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

async function saveCampaign() {
    const name = document.getElementById('input-name').value;
    const subject = document.getElementById('input-subject').value;
    const senderAccountId = document.getElementById('select-sender').value;
    const template = document.getElementById('input-template').value;

    if (!name || !subject || !senderAccountId || !template || currentRecipients.length === 0) {
        alert('Vui lòng hoàn tất thiết lập chiến dịch trước khi kích hoạt.');
        return;
    }

    try {
        const response = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, senderAccountId, template, recipients: currentRecipients })
        });
        const campaign = await response.json();
        
        await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
        
        closeCreateModal();
        loadCampaigns();
        loadStats();
    } catch (error) {
        alert('Lỗi khi khởi tạo automation.');
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
                <div class="flex gap-2">
                    <button class="text-white hover:text-white font-extrabold text-xs uppercase tracking-widest bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all">Báo cáo</button>
                    <button onclick="deleteCampaign('${c.id}')" class="text-red-500 hover:text-red-400 font-extrabold text-xs uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-xl transition-all">Xóa</button>
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

function getStatusColor(status) {
    if (status.includes('Hoàn thành')) return 'bg-orange-500/20 text-orange-500';
    switch(status) {
        case 'Đang gửi': return 'bg-purple-500/20 text-purple-400 animate-pulse';
        case 'Thất bại':
        case 'Lỗi': return 'bg-red-500/20 text-red-500';
        default: return 'bg-white/10 text-gray-400';
    }
}

async function loadStats() {
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

// Refresh every 5 seconds if sending
setInterval(() => {
    loadCampaigns();
    loadStats();
}, 5000);

async function saveCampaign() {
    const name = document.getElementById('input-name').value;
    const subject = document.getElementById('input-subject').value;
    const senderAccountId = document.getElementById('select-sender').value;
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
            body: JSON.stringify({ name, subject, senderAccountId, template, recipients: currentRecipients })
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

