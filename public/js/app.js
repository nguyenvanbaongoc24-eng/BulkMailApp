/**
 * Automation CA2 - Core Application Logic
 * Reconstructed & Enhanced
 */

// --- Global State & Constants ---
let currentUser = null;
let savedSessions = JSON.parse(localStorage.getItem('ca2_saved_sessions') || '[]');
let currentCRMData = [];
let currentRecipientsData = [];
let pendingCRMData = [];

// --- Session Management ---
function saveCurrentSession(token, user) {
    if (!user || !token) return;
    const existingIndex = savedSessions.findIndex(s => s.user.id === user.id);
    if (existingIndex > -1) {
        savedSessions[existingIndex] = { token, user, timestamp: Date.now() };
    } else {
        savedSessions.push({ token, user, timestamp: Date.now() });
    }
    localStorage.setItem('ca2_saved_sessions', JSON.stringify(savedSessions));
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Initialize premium date picker
    const startInput = document.getElementById('ca2-crm-start');
    if (startInput && window.flatpickr) {
        flatpickr(startInput, {
            dateFormat: "Y-m-d",
            locale: "vn",
            monthSelectorType: "static",
            static: true,
            theme: "dark"
        });
    }

    // Theme initialization
    const savedTheme = localStorage.getItem('ca2-theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }

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

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('ca2-theme', isLight ? 'light' : 'dark');
    
    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (isLight) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
}

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
            saveCurrentSession(token, currentUser); // Sync session
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
            saveCurrentSession(data.token, data.user);
            await checkAuth(); 
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
    // Close modal if open
    closeAccountSwitcher();
    // Clear stored session
    localStorage.removeItem('sb-token');
    currentUser = null;
    showAuthScreen(true);
}

function openAccountSwitcher() {
    console.log('--- Account Switcher Triggered ---');
    try {
        const list = document.getElementById('account-list');
        const modal = document.getElementById('modal-account-switcher');
        if (!list || !modal) {
            console.error('Account Switcher elements missing from DOM');
            alert('Lỗi hệ thống: Không tìm thấy khung chọn tài khoản.');
            return;
        }

        // Check if any session exists
        const token = localStorage.getItem('sb-token');
        if (!token && !currentUser) {
            alert('Không tìm thấy phiên đăng nhập.');
            return;
        }
        
        // Populate current user info in the modal header
        const avatarEl = document.getElementById('switcher-avatar');
        const nameEl = document.getElementById('switcher-user-name');
        const emailEl = document.getElementById('switcher-user-email');
        if (currentUser) {
            const initial = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
            if (avatarEl) avatarEl.innerText = initial;
            if (nameEl) nameEl.innerText = currentUser.name || 'User';
            if (emailEl) emailEl.innerText = currentUser.email || 'N/A';
        }

        list.innerHTML = '';
        
        // Sanitize savedSessions
        if (!Array.isArray(savedSessions)) {
            savedSessions = JSON.parse(localStorage.getItem('ca2_saved_sessions') || '[]');
        }

        // Fallback: if list is empty but we are logged in, add current user
        if (savedSessions.length === 0 && currentUser) {
            saveCurrentSession(localStorage.getItem('sb-token'), currentUser);
        }

        // Filter out the current user — they're shown in the header section
        const otherSessions = savedSessions.filter(s => !(currentUser && String(s.user.id) === String(currentUser.id)));

        if (otherSessions.length === 0) {
            list.innerHTML = `
                <div class="p-6 border-2 border-dashed border-white/5 rounded-2xl text-center space-y-2">
                    <div class="text-2xl">📭</div>
                    <p class="text-gray-500 font-bold italic text-xs">Không có tài khoản nào khác được lưu.</p>
                </div>
            `;
        } else {
            otherSessions.forEach(s => {
                const div = document.createElement('div');
                div.className = 'p-4 rounded-2xl border border-white/5 bg-white/2 hover:bg-white/5 hover:border-blue-500/30 active:scale-[0.98] transition-all cursor-pointer group relative overflow-hidden';
                
                div.onclick = () => {
                    switchAccount(s.user.id);
                };
                
                const initials = (s.user.email || 'U').charAt(0).toUpperCase();
                
                div.innerHTML = `
                    <div class="flex items-center gap-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-blue-900/20 group-hover:scale-110 transition-transform duration-300 shrink-0">
                            ${initials}
                        </div>
                        <div class="overflow-hidden flex-1">
                            <p class="text-sm font-black text-[var(--text-main)] truncate">${s.user.name || s.user.email}</p>
                            <p class="text-[10px] text-[var(--text-muted)] font-bold truncate">${s.user.email}</p>
                        </div>
                        <div class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-600 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                            <i class="fas fa-chevron-right text-xs"></i>
                        </div>
                    </div>
                `;
                list.appendChild(div);
            });
        }

        // Show modal using style.display to avoid hidden/flex class conflict
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        console.log('Account Switcher modal shown');
    } catch (err) {
        console.error('Error in openAccountSwitcher:', err);
        alert('Lỗi khởi tạo danh sách tài khoản: ' + err.message);
    }
}

function closeAccountSwitcher() {
    const el = document.getElementById('modal-account-switcher');
    if (el) {
        el.style.display = 'none';
        el.classList.add('hidden');
    }
}

function switchAccount(userId) {
    try {
        const target = savedSessions.find(s => String(s.user.id) === String(userId));
        if (!target) {
            alert('Không tìm thấy dữ liệu phiên cho tài khoản này.');
            return;
        }

        const modalCont = document.querySelector('#modal-account-switcher .modal-premium');
        if (modalCont) {
            modalCont.innerHTML = `
                <div class="p-20 text-center space-y-6 animate-pulse">
                    <div class="w-20 h-20 bg-blue-600 rounded-[30px] mx-auto flex items-center justify-center text-white text-3xl animate-spin shadow-2xl shadow-blue-600/30">
                        <i class="fas fa-sync-alt"></i>
                    </div>
                    <h3 class="text-xl font-black text-white">Đang chuyển tài khoản...</h3>
                    <p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Hệ thống đang tải lại phiên làm việc</p>
                </div>
            `;
        }

        localStorage.setItem('sb-token', target.token);
        setTimeout(() => {
            window.location.href = window.location.origin;
        }, 600);
    } catch (e) {
        console.error('Switch Account Error:', e);
        alert('Có lỗi xảy ra khi chuyển tài khoản.');
    }
}

// Ensure functions are globally accessible
window.openAccountSwitcher = openAccountSwitcher;
window.closeAccountSwitcher = closeAccountSwitcher;
window.switchAccount = switchAccount;

function addNewAccount() {
    closeAccountSwitcher();
    // Clear stored session before redirecting to login
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
        'ca2-crm': 'CA2 CRM',
        'campaigns': 'Chiến dịch Email',
        'senders': 'Tài khoản Gmail',
        'reports': 'Báo cáo chi tiết',
        'seo-news': 'Tin Tức Thuế (AI)',
        'seo-article': 'Tạo Bài Viết SEO',
        'seo-image': 'Tạo Ảnh AI',
        'seo-posts': 'Kho Lưu Trữ SEO',
        'lookup-tools': 'Cổng Tra Cứu Nghiệm Vụ'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[pageId] || 'Trang chủ';
    
    // Page specific loading
    if (pageId === 'ca2-crm') loadCA2CRMData();
    if (pageId === 'dashboard') { loadDashboardStats(); loadRecentCampaigns(); }
    if (pageId === 'senders') loadSenders();
    if (pageId === 'reports') loadEmailLogs();
    if (pageId === 'campaigns') loadRecentCampaigns();
    if (pageId === 'seo-news') loadTaxNews();
    if (pageId === 'seo-posts') loadMySavedPosts();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    // Toggle width for desktop and translation for mobile
    sidebar.classList.toggle('w-64');
    sidebar.classList.toggle('w-0');
    sidebar.classList.toggle('border-r'); // Toggle border visibility
}

// --- API Helper ---
async function authedFetch(url, options = {}) {
    const token = localStorage.getItem('sb-token');
    const headers = { 
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    const res = await fetch(url, { ...options, headers });
    
    // Tự động xử lý khi phiên đăng nhập hết hạn (401 Unauthorized)
    if (res.status === 401) {
        console.warn('[AUTH] Phiên đăng nhập hết hạn (401).');
        localStorage.removeItem('sb-token');
        alert('Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục!');
        window.location.reload(); // Tải lại trang sẽ tự động hiện màn hình Login
        return new Promise(() => {}); // Chặn tiến trình tiếp theo để tránh lỗi logic
    }
    
    return res;
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
                    <span class="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border 
                        ${c.service_type === 'CKS' ? 'border-orange-500/20 text-orange-500 bg-orange-500/5' : 
                          c.service_type === 'HDDT' ? 'border-blue-500/20 text-blue-400 bg-blue-400/5' :
                          c.service_type === 'EBH' ? 'border-green-500/20 text-green-400 bg-green-500/5' :
                          'border-purple-500/20 text-purple-400 bg-purple-500/5'}">
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

function updateCRMDurationOptions(defaultVal = '') {
    const serviceSelect = document.getElementById('ca2-crm-service');
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!serviceSelect || !durationSelect) return;
    
    const serviceVal = serviceSelect.value;
    durationSelect.innerHTML = '';
    
    if (serviceVal === 'HDDT') {
        ['300 số', '500 số', '1000 số', '2000 số', '5000 số', '10000 số'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        if (!defaultVal || !defaultVal.includes('số')) defaultVal = '500 số';
    } else {
        ['1 năm', '2 năm', '3 năm', '4 năm', '5 năm'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v.replace('năm', 'Năm')}</option>`;
        });
        if (!defaultVal || defaultVal.includes('số')) defaultVal = '1 năm';
    }
    durationSelect.value = defaultVal;
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
    
    updateCRMDurationOptions('1 năm');
    
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
    
    updateCRMDurationOptions(c.duration || '1 năm');
    
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
        const sendersRes = await authedFetch('/api/senders');
        const senders = await sendersRes.json();
        
        if (!senders || senders.length === 0) {
            alert('Vui lòng kết nối tài khoản Gmail trước khi gửi mail.');
            showPage('senders');
            return;
        }
        
        const senderId = senders[0].id;
        
        const campaignData = {
            name: `CRM Bulk - ${formatDate(new Date())}`,
            subject: "Thông báo về dịch vụ CA2",
            template: "Kính gửi #TênCôngTy, dịch vụ của quý khách (MST: #MST) sắp hết hạn vào ngày #NgàyHếtHạn.",
            attachCert: true,
            senderAccountId: senderId,
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
let pendingImportMode = 'append';

function openCRMImportModal() {
    document.getElementById('modal-crm-import').classList.remove('hidden');
}

function closeCRMImportModal() {
    document.getElementById('modal-crm-import').classList.add('hidden');
    document.getElementById('crm-import-file').value = '';
}

async function handleCRMImportAction(mode) {
    pendingImportMode = mode;
    // Trigger file selection AFTER mode is chosen
    document.getElementById('crm-import-file').click();
}

// Fixed: This is triggered after file selection
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            if (json.length === 0) {
                alert('File không có dữ liệu');
                return;
            }

            // Directly send to server since we already have the mode
            const res = await authedFetch('/api/ca2-crm/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: json, mode: pendingImportMode })
            });

            if (res.ok) {
                alert('Nhập dữ liệu thành công!');
                closeCRMImportModal();
                loadCA2CRMData();
            } else {
                const err = await res.json();
                alert('Lỗi: ' + (err.error || 'Server error'));
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (e) { alert('Lỗi xử lý file'); }
}

function downloadCRMTemplate() {
    // Columns from the user's screenshot
    const headers = [
        "Ngày", "Tên DN", "MST", "Chi cục Thuế", "điện thoại D", 
        "Email đăng ký", "Dịch vụ", "Thời hạn", "Ngày hết hạn"
    ];
    
    // Sample data
    const sampleData = [
        ["01/01/2024", "CÔNG TY TNHH VÍ DỤ A", "0101010101", "Cầu Giấy", "0900000000", "vi-du@email.com", "CKS", "1 năm", "01/01/2025"],
        ["15/02/2024", "CÔNG TY CP MINH HỌA B", "0202020202", "Hai Bà Trưng", "0911111111", "minh-hoa@email.com", "HDDT", "2 năm", "15/02/2026"]
    ];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CA2-CRM-Template");

    // Write file and trigger download
    XLSX.writeFile(wb, "CA2_CRM_Template_Mau.xlsx");
}

// --- Dashboard & Campaigns ---
async function loadDashboardStats() {
    try {
        // Fetch Email Stats
        const res = await authedFetch('/api/stats');
        const stats = await res.json();
        
        const totalEl = document.getElementById('stat-total');
        const successEl = document.getElementById('stat-success');
        const errorEl = document.getElementById('stat-error');
        const progressBar = document.getElementById('success-progress-bar');
        
        const total = stats.totalSent || 0;
        const success = stats.totalSuccess || 0;
        const errors = stats.totalError || 0;
        
        if (totalEl) totalEl.innerText = total.toLocaleString();
        
        if (total > 0) {
            const successRate = Math.round((success / total) * 100);
            const errorRate = Math.round((errors / total) * 100);
            
            if (successEl) successEl.innerText = successRate + '%';
            if (errorEl) errorEl.innerText = errorRate + '%';
            if (progressBar) progressBar.style.width = successRate + '%';
        } else {
            if (successEl) successEl.innerText = '0%';
            if (errorEl) errorEl.innerText = '0%';
            if (progressBar) progressBar.style.width = '0%';
        }
        
        // Fetch CRM Stats for Dashboard
        const crmRes = await authedFetch('/api/ca2-crm');
        const { data: crmData } = await crmRes.json();
        
        const dashExpired = document.getElementById('dash-crm-expired');
        const dash30 = document.getElementById('dash-crm-30');
        const dash60 = document.getElementById('dash-crm-60');
        const dashTotal = document.getElementById('dash-crm-total');
        
        let expiredCnt = 0, next30Cnt = 0, next60Cnt = 0;
        crmData.forEach(c => {
            const days = calculateRemainingDays(c.expired_date);
            if (days < 0) expiredCnt++;
            else if (days <= 30) next30Cnt++;
            else if (days <= 60) next60Cnt++;
        });
        
        if (dashExpired) dashExpired.innerText = expiredCnt;
        if (dash30) dash30.innerText = next30Cnt;
        if (dash60) dash60.innerText = next60Cnt;
        if (dashTotal) dashTotal.innerText = crmData.length;

    } catch (e) {
        console.error('Dashboard Stats Error:', e);
    }
}

async function loadRecentCampaigns() {
    const list = document.getElementById('campaign-list');
    const listAll = document.getElementById('campaign-list-all');
    if (!list && !listAll) return;
    try {
        const res = await authedFetch('/api/campaigns');
        const campaigns = await res.json();
        
        // Check if we need to continue polling
        const hasActive = campaigns.some(c => c.status === 'Đang gửi' || c.status === 'Đang hàng đợi' || c.status === 'Đang xử lý');
        if (hasActive) {
            // Trigger dashboard refresh during active campaigns
            loadDashboardStats();
            
            if (!window.campaignInterval) {
                console.log('Active campaigns found, starting poll...');
                window.campaignInterval = setInterval(loadRecentCampaigns, 5000);
            }
        } else if (!hasActive && window.campaignInterval) {
            console.log('No active campaigns, stopping poll.');
            clearInterval(window.campaignInterval);
            window.campaignInterval = null;
            loadDashboardStats(); // Final refresh
        }

        const html = campaigns.map(c => `
            <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                <td class="px-8 py-6">
                    <div class="font-bold text-white text-lg">${c.name}</div>
                    <div class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">${new Date(c.created_at).toLocaleDateString()}</div>
                </td>
                <td class="px-8 py-6">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg ${
                        c.status === 'Hoàn thành' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                        c.status === 'Đang gửi' || c.status === 'Đang hàng đợi' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse' :
                        'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    }">
                        ${c.status === 'Đang hàng đợi' ? 'Đang gửi...' : c.status}
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
                    <div class="flex items-center justify-end gap-2">
                        ${c.status === 'Hoàn thành' ? 
                            `<span class="text-green-500 font-bold"><i class="fas fa-check-circle mr-1"></i> Xong</span>` :
                            `<button onclick="startCampaign('${c.id}')" class="bg-orange-gradient text-white px-6 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-orange-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                                <i class="fas fa-play"></i> CHẠY
                            </button>`
                        }
                        <button onclick="deleteCampaign('${c.id}')" class="w-10 h-10 flex items-center justify-center bg-red-500/5 text-red-400 hover:text-white hover:bg-red-500 transition-all rounded-xl shadow-lg shadow-red-900/0 hover:shadow-red-900/40" title="Xóa chiến dịch">
                            <i class="fas fa-trash-alt text-[10px]"></i>
                        </button>
                    </div>
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
            alert('Chiến dịch đã bắt đầu gửi!');
            loadRecentCampaigns(); 
        } else {
            alert('Lỗi: ' + (data.error || 'Không rõ'));
        }
    } catch (e) {
        alert('Lỗi kết nối server');
    }
}

async function deleteCampaign(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa chiến dịch này? Hành động này không thể hoàn tác.')) return;
    try {
        const res = await authedFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadRecentCampaigns();
            loadDashboardStats();
        } else {
            const err = await res.json();
            alert('Lỗi khi xóa: ' + (err.error || 'Không rõ'));
        }
    } catch (e) {
        alert('Lỗi kết nối server');
    }
}

// --- Senders Management ---
async function loadSenders() {
    const list = document.getElementById('sender-list');
    const countEl = document.getElementById('sender-count');
    if (!list) return;
    
    try {
        const res = await authedFetch('/api/senders');
        const senders = await res.json();
        
        if (countEl) countEl.innerText = `Tổng cộng: ${senders.length} tài khoản`;
        
        list.innerHTML = senders.map(s => {
            const isGmailAPI = s.smtpHost === 'oauth2.google' || s.smtpHost === 'oauth2.googleapis.com';
            
            return `
                <tr class="hover:bg-white/[0.03] transition-all group">
                    <td class="px-10 py-6">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isGmailAPI ? 'bg-white shadow-lg shadow-white/5' : 'bg-orange-gradient/20 text-orange-500'}">
                                ${isGmailAPI ? '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_Logo.svg" class="w-5 h-5">' : '⚙️'}
                            </div>
                            <div>
                                <div class="text-white font-black text-sm">${s.senderName}</div>
                                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">
                                    ${isGmailAPI ? '<span class="text-blue-400">●</span> Gmail API' : '<span class="text-orange-500">○</span> SMTP Server'}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="px-10 py-6">
                        <div class="text-gray-300 text-sm font-medium">${s.senderEmail}</div>
                        <div class="text-[10px] text-gray-500 font-mono mt-1 italic">${s.smtpHost}</div>
                    </td>
                    <td class="px-10 py-6 text-center">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-green-500/10 text-green-500 text-[10px] font-black uppercase tracking-widest border border-green-500/20">
                            <i class="fas fa-check-circle"></i> Đã kết nối
                        </span>
                    </td>
                    <td class="px-10 py-6 text-right">
                        <div class="flex justify-end gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                            ${!isGmailAPI ? 
                                `<button onclick="openEditSenderModal('${s.id}')" class="w-10 h-10 flex items-center justify-center bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Chỉnh sửa"><i class="fas fa-pen text-[10px]"></i></button>` : ''
                            }
                            <button onclick="deleteSender('${s.id}')" class="w-10 h-10 flex items-center justify-center bg-red-500/5 text-red-400 hover:text-white hover:bg-red-500 transition-all rounded-xl shadow-lg shadow-red-900/0 hover:shadow-red-900/40" title="Xóa tài khoản">
                                <i class="fas fa-trash-alt text-[10px]"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="4" class="px-10 py-20 text-center text-gray-600 font-bold italic">Chưa có tài khoản nào. Hãy kết nối Gmail ngay!</td></tr>';
        
        const select = document.getElementById('select-sender');
        if (select) {
            select.innerHTML = '<option value="">-- Chọn tài khoản gửi --</option>' + 
                senders.map(s => `<option value="${s.id}">${s.senderName} (${s.senderEmail})</option>`).join('');
        }
    } catch (e) { console.error('Load Senders Error:', e); }
}

async function connectGoogleAccount() {
    try {
        const res = await authedFetch('/api/auth/google/url');
        const data = await res.json();
        if (data.url) {
            // Mở cửa sổ popup để kết nối Gmail OAuth
            window.open(data.url, 'GoogleAuth', 'width=600,height=700');
        } else {
            alert('Không lấy được URL kết nối Google. Vui lòng thử lại.');
        }
    } catch (e) {
        alert('Lỗi kết nối server khi lấy URL Google OAuth.');
        console.error(e);
    }
}

// Lắng nghe message từ popup OAuth
window.addEventListener('message', (event) => {
    if (event.data === 'google_auth_success') {
        alert('Kết nối Gmail thành công! Đang tải lại danh sách tài khoản...');
        loadSenders();
    }
});

function openAddSenderModal() {
    document.getElementById('sender-modal-title').innerHTML = 'Thêm <span class="text-orange-gradient">tài khoản SMTP</span>';
    document.getElementById('edit-sender-id').value = '';
    document.getElementById('edit-sender-name').value = '';
    document.getElementById('edit-sender-email').value = '';
    document.getElementById('edit-smtp-host').value = 'smtp.gmail.com';
    document.getElementById('edit-smtp-port').value = '587';
    document.getElementById('edit-smtp-user').value = '';
    document.getElementById('edit-smtp-pass').value = '';
    document.getElementById('modal-edit-sender').classList.remove('hidden');
}

async function openEditSenderModal(id) {
    try {
        const res = await authedFetch(`/api/senders`);
        const senders = await res.json();
        const s = senders.find(x => x.id === id);
        if (!s) return;

        document.getElementById('sender-modal-title').innerHTML = 'Chỉnh sửa <span class="text-orange-gradient">tài khoản SMTP</span>';
        document.getElementById('edit-sender-id').value = s.id;
        document.getElementById('edit-sender-name').value = s.senderName;
        document.getElementById('edit-sender-email').value = s.senderEmail;
        document.getElementById('edit-smtp-host').value = s.smtpHost;
        document.getElementById('edit-smtp-port').value = s.smtpPort;
        document.getElementById('edit-smtp-user').value = s.smtpUser;
        document.getElementById('edit-smtp-pass').value = ''; // Don't show password
        
        document.getElementById('modal-edit-sender').classList.remove('hidden');
    } catch (e) { console.error(e); }
}

function closeSenderModal() {
    document.getElementById('modal-edit-sender').classList.add('hidden');
}

async function saveSenderAccount() {
    const id = document.getElementById('edit-sender-id').value;
    const data = {
        senderName: document.getElementById('edit-sender-name').value,
        senderEmail: document.getElementById('edit-sender-email').value,
        smtpHost: document.getElementById('edit-smtp-host').value,
        smtpPort: document.getElementById('edit-smtp-port').value,
        smtpUser: document.getElementById('edit-smtp-user').value,
        smtpPassword: document.getElementById('edit-smtp-pass').value
    };

    if (!data.senderName || !data.senderEmail || !data.smtpHost || !data.smtpPort) {
        return alert('Vui lòng điền đầy đủ các thông tin bắt buộc');
    }

    try {
        const url = id ? `/api/senders/${id}` : '/api/senders';
        const method = id ? 'PATCH' : 'POST';
        
        // If updating and password is empty, don't send it
        if (id && !data.smtpPassword) delete data.smtpPassword;

        const res = await authedFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            closeSenderModal();
            loadSenders();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.error || 'Không rõ'));
        }
    } catch (e) { alert('Lỗi kết nối server'); }
}

async function deleteSender(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) return;
    try {
        const res = await authedFetch(`/api/senders/${id}`, { method: 'DELETE' });
        if (res.ok) loadSenders();
        else alert('Lỗi khi xóa tài khoản');
    } catch (e) { alert('Lỗi hệ thống'); }
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


// --- Utils & Modals ---
function openCreateModal() { 
    document.getElementById('modal-create').classList.remove('hidden'); 
    loadSenders(); 
    loadTemplates();
}
function closeCreateModal() { document.getElementById('modal-create').classList.add('hidden'); }
function closeCA2CRMModal() { document.getElementById('modal-ca2-crm').classList.add('hidden'); }
function downloadLocalTool() { window.open('https://drive.google.com/file/d/1EvO84TlXPcAYFTNAefYqdo3nIPdc9bOk/view?usp=drive_link', '_blank'); }

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
            const headerKeywords = [
                'MST', 'TAX', 'MÃ SỐ THUẾ', 'CÔNG TY', 'TÊN', 'NAME', 'EMAIL', 'ĐỊA CHỈ', 'ADDRESS', 
                'HẾT HẠN', 'EXPIRATION', 'SERIAL', 'HẠN', 'DỊCH VỤ', 'GÓI', 'THỜI GIAN', 'NGÀY CẤP'
            ];
            
            for (let i = 0; i < Math.min(rawRows.length, 5); i++) { // Check up to 5 rows
                const row = rawRows[i];
                let matches = 0;
                let isDataRow = false;

                row.forEach(cell => {
                    if (!cell) return;
                    const val = String(cell).toUpperCase().trim();
                    // If any cell looks like data (Email or MST), this entire row is DATA, not a header
                    if (val.includes('@') || /^\d{10}(\d{3})?$/.test(val.replace(/[^0-0]/g,''))) {
                        isDataRow = true;
                    }
                    if (headerKeywords.some(k => val.includes(k))) {
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
                headers = rawRows[headerRowIndex].map(h => String(h).trim() || 'NoHeader');
                dataRows = rawRows.slice(headerRowIndex + 1);
            } else {
                const maxCols = Math.max(...rawRows.map(r => r.length));
                headers = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + i));
                dataRows = rawRows;
            }

            // Map data to objects
            currentRecipientsData = dataRows.filter(row => {
                return row.some(cell => String(cell || '').trim() !== '');
            }).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    obj[h] = String(row[i] || '').trim();
                });
                
                // Helper to check if string looks like a date/timestamp
                const isDate = (val) => {
                    return /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val) || 
                           /\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(val) ||
                           /^\d{13,14}$/.test(val) || // Timestamp
                           (val.includes(':') && /\d{4}/.test(val)); // Excel type date string
                };

                // Smart Mapping
                if (headerRowIndex === -1) {
                    row.forEach((cell, i) => {
                        const val = String(cell || '').trim();
                        if (!val) return;

                        if (val.includes('@')) {
                            obj['Email'] = val;
                        } else if (/^\d{10}(\d{3})?$/.test(val.replace(/[^0-9]/g,''))) {
                            const digits = val.replace(/[^0-9]/g,'');
                            // Mobile phones in VN usually start with 03, 05, 07, 08, 09 (but some 03 are MSTs e.g. 031xxx)
                            // A better heuristic: if it has spaces like 09xx xxx xxx, it's a phone. Or if MST is already filled.
                            const isMobilePrefix = /^(03|05|07|08|09)\d{8}$/.test(digits);
                            
                            // If it's explicitly formatted like a phone number or MST is already found
                            if ((isMobilePrefix && val.includes(' ')) || obj['MST']) {
                                obj['Phone'] = digits;
                            } else {
                                obj['MST'] = digits;
                            }
                        } else if (isDate(val)) {
                            obj['NgayHetHanChuKySo'] = val;
                        } else if (val.length > 20 && !val.includes(' ')) {
                            obj['Serial'] = val;
                        } else if (val.length > 5 && val.includes(' ') && !isDate(val)) {
                            const lowerVal = val.toLowerCase();
                            const addressKeywords = ['phường', 'quận', 'huyện', 'tỉnh', 'thành phố', 'đường', 'ngõ', 'số', 'khu phố', 'xã', 'thị trấn', 'phố', 'ward', 'district', 'city', 'street'];
                            const isAddress = addressKeywords.some(kw => lowerVal.includes(kw));
                            
                            if (isAddress) {
                                obj['DiaChi'] = val;
                            } else if (!obj['TenCongTy']) {
                                obj['TenCongTy'] = val;
                            }
                        }
                    });
                } else {
                    Object.keys(obj).forEach(k => {
                        const uk = k.toUpperCase().trim();
                        const val = obj[k];
                        if (uk.includes('MST') || uk.includes('TAX') || uk.includes('MÃ SỐ THUẾ')) obj['MST'] = val;
                        if (uk.includes('CÔNG TY') || uk.includes('TÊN') || uk.includes('NAME')) {
                            if (!isDate(val)) obj['TenCongTy'] = val;
                        }
                        if (uk.includes('EMAIL')) obj['Email'] = val;
                        if (uk.includes('HẾT HẠN') || uk.includes('EXPIRATION') || uk.includes('HẠN')) obj['NgayHetHanChuKySo'] = val;
                        if (uk.includes('ĐỊA CHỈ') || uk.includes('ADDRESS')) obj['DiaChi'] = val;
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
        const res = await authedFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content })
        });
        if (res.ok) {
            alert('Đã lưu mẫu thành công!');
            loadTemplates();
        } else {
            const err = await res.json();
            alert('Lỗi khi lưu mẫu: ' + (err.error || 'Không rõ'));
        }
    } catch (e) { 
        console.error('[TEMPLATE_SAVE_ERROR]', e); 
        alert('Lỗi kết nối server khi lưu mẫu: ' + e.message);
    }
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
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to fetch template');
        }
        const data = await res.json();
        if (data && data.content) {
            document.getElementById('input-template').innerHTML = data.content;
        }
    } catch (e) {
        console.error(e);
        alert('Lỗi khi tải mẫu: ' + e.message);
    }
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
        console.error('Load Email Logs Error:', e);
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-500 font-bold">Lỗi tải dữ liệu nhật ký! <br><span class="text-[10px] font-normal opacity-50">${e.message}</span></td></tr>`;
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
