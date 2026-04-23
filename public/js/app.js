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
let currentQuotations = [];
let currentMarketingDocs = [];
let currentTemplates = [];
let selectedUploadFile = null;
let currentCRMTab = 'active'; // 'active' or 'expired'
let currentCRMSort = { field: 'created_at', order: 'desc' }; // Default sorting

// --- INACTIVITY AUTO-LOGOUT (10 min) ---
// Exception: Skip logout if email campaigns are actively running in background
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_WARNING_MS = 60 * 1000; // Show warning 60 seconds before logout
let _lastActivity = Date.now();
let _sessionWarningShown = false;
let _sessionCountdownInterval = null;
let _isBackgroundMailRunning = false;

function resetActivityTimer() {
    _lastActivity = Date.now();
    // If warning modal is showing, dismiss it
    if (_sessionWarningShown) {
        _sessionWarningShown = false;
        const modal = document.getElementById('modal-session-timeout');
        if (modal) modal.classList.add('hidden');
        if (_sessionCountdownInterval) {
            clearInterval(_sessionCountdownInterval);
            _sessionCountdownInterval = null;
        }
    }
}

// Track user activity
['mousemove', 'mousedown', 'keypress', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'].forEach(evt => {
    document.addEventListener(evt, resetActivityTimer, { passive: true });
});

// Check for active campaigns to set _isBackgroundMailRunning
async function checkBackgroundMailStatus() {
    try {
        const token = localStorage.getItem('sb-token');
        if (!token) return false;
        const res = await fetch('/api/campaigns', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return false;
        const campaigns = await res.json();
        const running = campaigns.some(c => 
            c.status === 'Đang gửi' || c.status === 'Đang hàng đợi' || c.status === 'Đang xử lý'
        );
        _isBackgroundMailRunning = running;
        // Update indicator
        const indicator = document.getElementById('bg-mail-indicator');
        if (indicator) {
            indicator.style.display = running ? 'flex' : 'none';
        }
        return running;
    } catch {
        return false;
    }
}

// Session timeout checker (runs every 30s)
setInterval(async () => {
    // Don't check if not logged in
    if (!localStorage.getItem('sb-token')) return;
    
    const elapsed = Date.now() - _lastActivity;
    
    // Check if campaigns are actively running
    if (elapsed > (SESSION_TIMEOUT_MS - SESSION_WARNING_MS - 5000)) {
        // Only check background mail when we're close to timeout
        await checkBackgroundMailStatus();
    }
    
    // If background mail is running, reset timer and skip
    if (_isBackgroundMailRunning) {
        _lastActivity = Date.now(); // extend session
        return;
    }
    
    // Show warning 60s before timeout
    if (elapsed >= (SESSION_TIMEOUT_MS - SESSION_WARNING_MS) && !_sessionWarningShown) {
        _sessionWarningShown = true;
        showSessionTimeoutWarning();
    }
    
    // Auto logout
    if (elapsed >= SESSION_TIMEOUT_MS) {
        performSessionTimeout();
    }
}, 30000);

function showSessionTimeoutWarning() {
    let modal = document.getElementById('modal-session-timeout');
    if (!modal) return; // Modal not in DOM yet
    
    modal.classList.remove('hidden');
    
    let remaining = Math.ceil((SESSION_TIMEOUT_MS - (Date.now() - _lastActivity)) / 1000);
    const countdownEl = document.getElementById('session-timeout-countdown');
    const barEl = document.getElementById('session-timeout-bar');
    
    if (_sessionCountdownInterval) clearInterval(_sessionCountdownInterval);
    _sessionCountdownInterval = setInterval(() => {
        remaining = Math.ceil((SESSION_TIMEOUT_MS - (Date.now() - _lastActivity)) / 1000);
        if (remaining <= 0) {
            clearInterval(_sessionCountdownInterval);
            performSessionTimeout();
            return;
        }
        if (countdownEl) countdownEl.textContent = remaining;
        if (barEl) barEl.style.width = (remaining / 60 * 100) + '%';
    }, 1000);
}

function dismissSessionWarning() {
    resetActivityTimer();
    const modal = document.getElementById('modal-session-timeout');
    if (modal) modal.classList.add('hidden');
}

function performSessionTimeout() {
    if (_sessionCountdownInterval) clearInterval(_sessionCountdownInterval);
    localStorage.removeItem('sb-token');
    currentUser = null;
    // Show login screen
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');
    const timeoutModal = document.getElementById('modal-session-timeout');
    if (timeoutModal) timeoutModal.classList.add('hidden');
    if (authScreen) authScreen.classList.toggle('hidden', false);
    if (appContainer) appContainer.classList.toggle('hidden', true);
    alert('Phiên làm việc đã hết hạn do không hoạt động trong 10 phút. Vui lòng đăng nhập lại.');
}

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

    // Initialize premium date picker (Single/Modal)
    const startInput = document.getElementById('ca2-crm-start');
    if (startInput && window.flatpickr) {
        flatpickr(startInput, {
            dateFormat: "Y-m-d",
            locale: "vn",
            appendTo: document.body,
            theme: "dark",
            disableMobile: true,
            position: "auto above"
        });
    }

    // Initialize premium date range picker (Dashboard Filter)
    const rangeInput = document.getElementById('crm-date-range-picker');
    if (rangeInput && window.flatpickr) {
        flatpickr(rangeInput, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "vn",
            appendTo: document.body,
            theme: "dark",
            disableMobile: true,
            onChange: function(selectedDates, dateStr, instance) {
                // selectedDates is an array: [startDate, endDate]
                const startLabel = document.getElementById('crm-date-start-label');
                const endLabel = document.getElementById('crm-date-end-label');
                const fromInput = document.getElementById('crm-filter-from-date');
                const toInput = document.getElementById('crm-filter-to-date');

                if (selectedDates.length > 0) {
                    const startObj = selectedDates[0];
                    startLabel.innerText = flatpickr.formatDate(startObj, "d/m/Y");
                    startLabel.classList.remove('opacity-70');
                    startLabel.classList.add('text-orange-400');
                    fromInput.value = flatpickr.formatDate(startObj, "Y-m-d");

                    if (selectedDates.length === 2) {
                        const endObj = selectedDates[1];
                        endLabel.innerText = flatpickr.formatDate(endObj, "d/m/Y");
                        endLabel.classList.remove('opacity-70');
                        endLabel.classList.add('text-orange-400');
                        toInput.value = flatpickr.formatDate(endObj, "Y-m-d");
                        
                        // Auto trigger filter when range is fully selected
                        renderCA2CRM();
                    } else {
                        endLabel.innerText = "Đến ngày";
                        endLabel.classList.add('opacity-70');
                        endLabel.classList.remove('text-orange-400');
                        toInput.value = "";
                    }
                } else {
                    startLabel.innerText = "Từ ngày";
                    endLabel.innerText = "Đến ngày";
                    startLabel.classList.add('opacity-70');
                    endLabel.classList.add('opacity-70');
                    startLabel.classList.remove('text-orange-400');
                    endLabel.classList.remove('text-orange-400');
                    fromInput.value = "";
                    toInput.value = "";
                    renderCA2CRM(); // Reset filter
                }
            }
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

// Override global toggleTheme to use our new logic
window.toggleTheme = function() {
    const isLight = document.body.classList.contains('light-mode');
    applyTheme(isLight ? 'dark' : 'light');
};

// --- Authentication Logic ---
async function checkAuth() {
    const token = localStorage.getItem('sb-token');
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');

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
            
            // Show Settings for everyone as requested by user
            const settingsWrapper = document.getElementById('nav-settings-wrapper');
            if (settingsWrapper) {
                settingsWrapper.classList.remove('hidden');
            }

            showAuthScreen(false);
            
            // Apply saved theme from DB
            if (currentUser.settings && currentUser.settings.theme) {
                applyTheme(currentUser.settings.theme, false); // false to avoid redundant API call
            }

            // Load dashboard stats as initial page
            showPage('dashboard');
        } else {
            localStorage.removeItem('sb-token');
            showAuthScreen(true);
        }
    } catch (e) {
        console.error('Auth check error:', e);
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
        'lookup-tools': 'Cổng Tra Cứu Nghiệp Vụ',
        'settings': 'Cài đặt hệ thống',
        'quotations': 'Hợp đồng & Báo giá',
        'documents': 'Kho Tài liệu Sales'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[pageId] || 'Trang chủ';
    
    // Page specific loading
    if (pageId === 'ca2-crm') loadCA2CRMData();
    if (pageId === 'dashboard') { loadDashboardStats(); loadRecentCampaigns(); }
    if (pageId === 'quotations') {
        console.log('[FORCE-LOG] Entering Quotations view. Manager status:', !!window.quoteManagerInstance);
        if (!window.quoteManagerInstance) {
            try {
                window.quoteManagerInstance = new QuoteManager();
                console.log('[FORCE-LOG] New QuoteManager instance created.');
            } catch (err) {
                console.error('[FORCE-LOG] CRITICAL: Failed to create QuoteManager:', err);
            }
        } else {
            window.quoteManagerInstance.loadList();
        }
    }
    if (pageId === 'documents') loadDocuments();
    if (pageId === 'senders') loadSenders();
    if (pageId === 'reports') loadEmailLogs();
    if (pageId === 'campaigns') loadRecentCampaigns();
    if (pageId === 'seo-news') loadTaxNews();
    if (pageId === 'seo-posts') loadMySavedPosts();
    if (pageId === 'settings') loadSettingsPage();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    // Toggle width for desktop and translation for mobile
    sidebar.classList.toggle('w-64');
    sidebar.classList.toggle('w-0');
    sidebar.classList.toggle('border-r'); // Toggle border visibility
    
    // RESCUE: Toggle pointer-events and visibility
    if (sidebar.classList.contains('w-0')) {
        sidebar.classList.add('collapsed-rescue');
    } else {
        sidebar.classList.remove('collapsed-rescue');
    }
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

function switchCRMTab(tab) {
    currentCRMTab = tab;
    renderCA2CRM();
}

function handleCRMSort(field) {
    if (currentCRMSort.field === field) {
        currentCRMSort.order = currentCRMSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentCRMSort.field = field;
        currentCRMSort.order = 'asc';
    }
    renderCA2CRM();
}

function renderCA2CRM() {
    const tableBody = document.getElementById('ca2-crm-table-body');
    if (!tableBody) return;
    
    const filterType = document.getElementById('crm-filter-service').value;
    const filterYear = document.getElementById('crm-filter-year')?.value || 'all';
    const filterFrom = document.getElementById('crm-filter-from-date')?.value || '';
    const filterTo = document.getElementById('crm-filter-to-date')?.value || '';
    const filterMonth = document.getElementById('crm-filter-month')?.value || 'all';
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('ca2-crm-sort-order')?.value || 'newest';

    let filtered = [...currentCRMData];

    // Service Type Filter
    if (filterType !== 'all') {
        filtered = filtered.filter(c => {
            const svc = (c.service_type || '').toUpperCase();
            if (filterType === 'CKS') return svc.includes('CKS') || svc.includes('CHỮ KÝ SỐ');
            if (filterType === 'HDDT') return svc.includes('HDDT') || svc.includes('HÓA ĐƠN ĐIỆN TỬ');
            if (filterType === 'EBH') return svc.includes('EBH') || svc.includes('BẢO HIỂM');
            if (filterType === 'HOA_DON') return svc.includes('HOA DON') || svc.includes('HÓA ĐƠN');
            return svc === filterType.toUpperCase();
        });
    }

    // Date Range Filter (New)
    if (filterFrom) {
        const fromDate = new Date(filterFrom);
        fromDate.setHours(0, 0, 0, 0);
        filtered = filtered.filter(c => c.start_date && new Date(c.start_date) >= fromDate);
    }
    if (filterTo) {
        const toDate = new Date(filterTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(c => c.start_date && new Date(c.start_date) <= toDate);
    }

    // Chronological Filters (based on start_date as requested)
    if (filterYear !== 'all') {
        filtered = filtered.filter(c => c.start_date && new Date(c.start_date).getFullYear() === parseInt(filterYear));
    }

    if (filterMonth !== 'all') {
        filtered = filtered.filter(c => c.start_date && (new Date(c.start_date).getMonth() + 1) === parseInt(filterMonth));
    }

    if (search) {
        filtered = filtered.filter(c => 
            (c.mst && c.mst.toLowerCase().includes(search)) || 
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    filtered.sort((a, b) => {
        let valA, valB;
        const field = currentCRMSort.field;

        if (field === 'created_at') {
            valA = new Date(a.created_at || 0);
            valB = new Date(b.created_at || 0);
        } else if (field === 'service_type') {
            valA = String(a.service_type || '').toLowerCase();
            valB = String(b.service_type || '').toLowerCase();
        } else if (field === 'company_name') {
            valA = String(a.company_name || '').toLowerCase();
            valB = String(b.company_name || '').toLowerCase();
        } else if (field === 'start_date') {
            valA = new Date(a.start_date || 0);
            valB = new Date(b.start_date || 0);
        } else if (field === 'expired_date') {
            valA = new Date(a.expired_date || 0);
            valB = new Date(b.expired_date || 0);
        } else {
            // Fallback to select box logic if still using it
            if (sortBy === 'soonest') return new Date(a.expired_date) - new Date(b.expired_date);
            if (sortBy === 'latest') return new Date(b.expired_date) - new Date(a.expired_date);
            return new Date(b.created_at) - new Date(a.created_at);
        }

        if (currentCRMSort.order === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });

    // Update Header Icons
    const fields = ['company_name', 'service_type', 'start_date', 'expired_date'];
    fields.forEach(f => {
        const icon = document.getElementById(`sort-icon-${f}`);
        if (!icon) return;
        if (currentCRMSort.field === f) {
            icon.className = `fas fa-sort-${currentCRMSort.order === 'asc' ? 'up' : 'down'} ml-1 text-orange-500`;
        } else {
            icon.className = `fas fa-sort ml-1 text-gray-600 opacity-30`;
        }
    });

    // Count for tabs (independent of current tab)
    let activeTotal = 0;
    let expiredTotal = 0;
    currentCRMData.forEach(c => {
        const days = calculateRemainingDays(c.expired_date);
        if (days < 0) expiredTotal++;
        else activeTotal++;
    });

    // Apply tab filter
    if (currentCRMTab === 'active') {
        filtered = filtered.filter(c => calculateRemainingDays(c.expired_date) >= 0);
    } else {
        filtered = filtered.filter(c => calculateRemainingDays(c.expired_date) < 0);
    }

    // Stats (Filtered view for dashboard counters)
    const totalEl = document.getElementById('ca2-crm-total');
    const activeEl = document.getElementById('ca2-crm-active');
    const expiringEl = document.getElementById('ca2-crm-expiring');
    const expiredEl = document.getElementById('ca2-crm-expired');
    
    // Update Tab UI
    const tabActive = document.getElementById('tab-crm-active');
    const tabExpired = document.getElementById('tab-crm-expired');
    const countActive = document.getElementById('count-crm-active-tab');
    const countExpired = document.getElementById('count-crm-expired-tab');

    if (tabActive && tabExpired) {
        if (currentCRMTab === 'active') {
            tabActive.className = "px-8 py-3 rounded-xl font-black text-xs transition-all flex items-center gap-2 bg-green-500 text-white shadow-lg shadow-green-900/20";
            tabExpired.className = "px-8 py-3 rounded-xl font-black text-xs text-gray-500 hover:text-white transition-all flex items-center gap-2";
        } else {
            tabActive.className = "px-8 py-3 rounded-xl font-black text-xs text-gray-500 hover:text-white transition-all flex items-center gap-2";
            tabExpired.className = "px-8 py-3 rounded-xl font-black text-xs transition-all flex items-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-900/20";
        }
    }
    if (countActive) countActive.innerText = activeTotal;
    if (countExpired) countExpired.innerText = expiredTotal;
    
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
        const pStatus = String(c.payment_status || '').toLowerCase().trim();
        const isPaid = pStatus === 'paid' || pStatus.includes('đã thanh toán');

        return `
            <tr class="hover:bg-white/2 transition-colors group">
                <td class="px-8 py-5">
                    <div class="font-bold text-white">${c.company_name || 'N/A'}</div>
                    <div class="text-[10px] text-gray-500 font-black tracking-widest mt-0.5">${c.mst || '---'}</div>
                    <div class="text-[10px] text-gray-400 font-medium">${c.email || ''} ${c.phone ? '• ' + c.phone : ''}</div>
                </td>
                <td class="px-8 py-5 text-center">
                    ${(() => {
                        const svc = (c.service_type || '').toUpperCase();
                        let badgeClass = 'badge-other';
                        let label = svc || 'KHÁC';
                        
                        if (svc.includes('CKS') || svc.includes('CHỮ KÝ SỐ')) {
                            badgeClass = 'badge-cks';
                            label = 'CHỮ KÝ SỐ';
                        } else if (svc.includes('HDDT') || svc.includes('HÓA ĐƠN ĐIỆN TỬ')) {
                            badgeClass = 'badge-hddt';
                            label = 'H.ĐƠN ĐIỆN TỬ';
                        } else if (svc.includes('EBH') || svc.includes('BẢO HIỂM')) {
                            badgeClass = 'badge-ebh';
                            label = 'BẢO HIỂM';
                        } else if (svc.includes('HOA DON') || svc.includes('HÓA ĐƠN')) {
                            badgeClass = 'badge-invoice';
                            label = 'HÓA ĐƠN';
                        }

                        return `<span class="badge-service ${badgeClass}">${label}</span>`;
                    })()}
                </td>
                <td class="px-8 py-5 font-bold text-gray-400 text-sm whitespace-nowrap">${formatDate(c.start_date)}</td>
                <td class="px-8 py-5 font-black text-white text-sm">
                    ${(() => {
                        if (c.duration && c.duration !== '-') return c.duration;
                        if (!c.start_date || !c.expired_date) return '-';
                        const start = new Date(c.start_date);
                        const end = new Date(c.expired_date);
                        const diffYears = Math.round((end - start) / (1000 * 60 * 60 * 24 * 365.25));
                        return diffYears > 0 ? `${diffYears} năm` : '-';
                    })()}
                </td>
                <td class="px-6 py-4 font-bold text-gray-400 text-sm whitespace-nowrap">${formatDate(c.expired_date)}</td>
                <td class="px-6 py-4">
                    <div class="flex flex-col items-start text-sm">
                        <span class="font-black ${statusClass}">
                            ${isExpired ? 'Hết hạn' : (daysLeft + ' ngày')}
                        </span>
                        ${!isExpired ? '' : `
                        <div class="w-16 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                            <div class="h-full ${barClass}" 
                                 style="width: ${isExpired ? '0%' : (daysLeft > 60 ? '100%' : (daysLeft / 60 * 100) + '%')}"></div>
                        </div>`}
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <select onchange="updatePaymentStatus('${c.id}', this.value)" 
                            class="text-[10px] font-black py-1.5 px-3 rounded-xl cursor-pointer uppercase tracking-widest transition-all outline-none border-2 shadow-lg ${isPaid ? 'bg-green-500/10 text-green-400 border-green-500 shadow-green-500/10 focus:text-green-400 focus:border-green-500' : 'bg-orange-500/10 text-orange-400 border-orange-500 shadow-orange-500/10 focus:text-orange-400 focus:border-orange-500'}">
                        <option value="unpaid" ${!isPaid ? 'selected' : ''} class="font-black text-orange-400" style="background: #0f172a; color: #fb923c;">Chưa thanh toán</option>
                        <option value="paid" ${isPaid ? 'selected' : ''} class="font-black text-green-400" style="background: #0f172a; color: #4ade80;">Đã thanh toán</option>
                    </select>
                </td>
                <td class="px-8 py-5 text-right relative z-40">
                    <div class="flex justify-end gap-1.5 relative z-50">
                        <button onclick="editCRM('${c.id}')" class="btn-action-premium text-gray-400 hover:text-white" title="Sửa"><i class="fas fa-edit text-xs"></i></button>
                        <button onclick="deleteCRM('${c.id}')" class="btn-action-premium text-red-500 hover:text-red-400" title="Xóa"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('') || `<tr><td colspan="8" class="px-8 py-10 text-center text-gray-500 italic">Không có dữ liệu khách hàng</td></tr>`;

    // Initialize/Refresh premium UI for dynamic table elements
    if (typeof refreshCustomSelects === 'function') {
        refreshCustomSelects();
    }
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
// --- ENHANCED CRM PRICING ENGINE ---
const CRM_PRICE_LIST = {
    "CKS – Cấp mới": {
        "Công ty": { "12 tháng": 1793880, "24 tháng": 2691360, "36 tháng": 3054240 },
        "Cá nhân / Hộ KD": { "12 tháng": 1069200, "24 tháng": 1501200, "36 tháng": 1944000 }
    },
    "CKS – Gia hạn": {
        "Công ty": { "12 tháng": 1253880, "24 tháng": 2151360, "36 tháng": 2854440 },
        "Cá nhân / Hộ KD": { "12 tháng": 529200, "24 tháng": 961200, "36 tháng": 1404000 }
    },
    "CKS - Gia hạn dùng thử": {
        "Công ty": { "12 tháng": 1253880, "24 tháng": 2151360, "36 tháng": 2854440 },
        "Cá nhân / Hộ KD": { "12 tháng": 529200, "24 tháng": 961200, "36 tháng": 1404000 }
    },
    "CA2 Remote Signing": {
        "Cá nhân / Hộ KD": { "1 tháng": 34344, "3 tháng": 63720, "6 tháng": 108000, "1 năm": 196344, "2 năm": 373140, "3 năm": 530280 },
        "Công ty": { "1 năm": 1226880, "2 năm": 2160000, "3 năm": 2847960 }
    },
    "Hóa đơn điện tử": {
        "Tất cả": { "300 tờ": 800000, "500 tờ": 925000, "1000 tờ": 1175000, "2000 tờ": 1600000, "5000 tờ": 2750000, "10000 tờ": 4000000 }
    },
    "Hóa đơn điện tử – Gia hạn": {
        "Tất cả": { "300 tờ": 300000, "500 tờ": 425000, "1000 tờ": 675000, "2000 tờ": 1100000, "5000 tờ": 2250000, "10000 tờ": 3500000 }
    },
    "Phần mềm bảo hiểm EBH": {
        "Tất cả": { "1 năm": 500000, "2 năm": 880000, "3 năm": 1100000 }
    },
    "CA2 Sign Platform": {
        "Tất cả": { "SP-Lite (10 HĐ)": 0, "SP-100 (100 HĐ)": 250000, "SP-300 (300 HĐ)": 690000, "SP-500 (500 HĐ)": 1110000, "SP-1000 (1000 HĐ)": 2100000, "SP-2000 (2000 HĐ)": 4000000, "SP-5000 (5000 HĐ)": 9500000, "SP-MAX": 0 }
    }
};

function getCRMPrice(service, type, pkg) {
    if (!service) return 0;
    
    // Normalize service name (handling various dashes and extra spaces)
    let s = service.replace(/[\u2010-\u2015-]/g, '-').replace(/\s+/g, ' ').trim();
    
    // Try to find a matching key in CRM_PRICE_LIST by normalizing its keys too
    let foundKey = Object.keys(CRM_PRICE_LIST).find(k => {
        let normK = k.replace(/[\u2010-\u2015-]/g, '-').replace(/\s+/g, ' ').trim();
        return normK === s || normK.toLowerCase() === s.toLowerCase();
    });

    if (!foundKey) {
        let lowerS = s.toLowerCase();
        if (lowerS === 'cks' || lowerS === 'chữ ký số') foundKey = "CKS – Cấp mới";
        else if (lowerS === 'hddt' || lowerS === 'hóa đơn điện tử') foundKey = "Hóa đơn điện tử";
        else if (lowerS === 'ebh' || lowerS === 'bảo hiểm' || lowerS === 'bhxh' || lowerS === 'phần mềm bảo hiểm ebh') foundKey = "Phần mềm bảo hiểm EBH";
        else if (lowerS.includes('remote signing') || lowerS === 'rs') foundKey = "CA2 Remote Signing";
        else if (lowerS.includes('sign platform') || lowerS === 'sp') foundKey = "CA2 Sign Platform";
    }

    if (!foundKey) return 0;
    
    let targetType = type;
    if (CRM_PRICE_LIST[foundKey]["Tất cả"]) targetType = "Tất cả";
    else if (!CRM_PRICE_LIST[foundKey][type]) targetType = Object.keys(CRM_PRICE_LIST[foundKey])[0];
    
    let targetPkg = pkg || '';
    if (!targetPkg) return 0;
    
    let availablePkgs = Object.keys(CRM_PRICE_LIST[foundKey][targetType] || {});
    if (!availablePkgs.includes(targetPkg)) {
        let norm = targetPkg.toLowerCase();
        if (norm.includes('1 năm') && availablePkgs.includes('12 tháng')) targetPkg = '12 tháng';
        else if (norm.includes('2 năm') && availablePkgs.includes('24 tháng')) targetPkg = '24 tháng';
        else if (norm.includes('3 năm') && availablePkgs.includes('36 tháng')) targetPkg = '36 tháng';
        else if (norm.includes('12 tháng') && availablePkgs.includes('1 năm')) targetPkg = '1 năm';
        else if (norm.includes('24 tháng') && availablePkgs.includes('2 năm')) targetPkg = '2 năm';
        else if (norm.includes('36 tháng') && availablePkgs.includes('3 năm')) targetPkg = '3 năm';
    }

    return CRM_PRICE_LIST[foundKey][targetType][targetPkg] || 0;
}

function updateCRMPackages() {
    const service = document.getElementById('ca2-crm-service').value;
    const type = document.getElementById('ca2-crm-customer-type').value;
    const pkgSelect = document.getElementById('ca2-crm-package');
    if (!CRM_PRICE_LIST[service]) return;

    let targetType = type;
    if (CRM_PRICE_LIST[service]["Tất cả"]) targetType = "Tất cả";
    else if (!CRM_PRICE_LIST[service][type]) {
        // Fallback for Remote Signing which has specific split
        targetType = Object.keys(CRM_PRICE_LIST[service])[0];
    }

    const packages = CRM_PRICE_LIST[service][targetType];
    pkgSelect.innerHTML = Object.keys(packages).map(p => `<option value="${p}">${p}</option>`).join('');
    
    // Auto sync duration field if it's a "year" package
    syncDurationFromPackage();
    calculatePrice();
}

function syncDurationFromPackage() {
    const pkg = document.getElementById('ca2-crm-package').value;
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!pkg || !durationSelect) return;

    let targetVal = '';
    const normPkg = pkg.toLowerCase();
    
    if (normPkg.includes('12 tháng') || normPkg.includes('1 năm')) targetVal = '1 năm';
    else if (normPkg.includes('24 tháng') || normPkg.includes('2 năm')) targetVal = '2 năm';
    else if (normPkg.includes('36 tháng') || normPkg.includes('3 năm')) targetVal = '3 năm';
    else if (normPkg.includes('48 tháng') || normPkg.includes('4 năm')) targetVal = '4 năm';
    else if (normPkg.includes('60 tháng') || normPkg.includes('5 năm')) targetVal = '5 năm';
    else if (normPkg.includes('06 tháng') || normPkg.includes('6 tháng')) targetVal = '6 tháng';
    
    if (targetVal) {
        durationSelect.value = targetVal;
    }
}

function calculatePrice() {
    const service = document.getElementById('ca2-crm-service').value;
    const type = document.getElementById('ca2-crm-customer-type').value;
    const pkg = document.getElementById('ca2-crm-package').value;
    const amountInput = document.getElementById('ca2-crm-amount');

    const price = getCRMPrice(service, type, pkg);
    amountInput.value = new Intl.NumberFormat('vi-VN').format(price);
    
    // Sync Duration based on Package (Smart Sync)
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (durationSelect && pkg) {
        let targetVal = '';
        const normPkg = pkg.toLowerCase();
        
        if (normPkg.includes('12 tháng') || normPkg.includes('1 năm')) targetVal = '1 năm';
        else if (normPkg.includes('24 tháng') || normPkg.includes('2 năm')) targetVal = '2 năm';
        else if (normPkg.includes('36 tháng') || normPkg.includes('3 năm')) targetVal = '3 năm';
        else if (normPkg.includes('48 tháng') || normPkg.includes('4 năm')) targetVal = '4 năm';
        else if (normPkg.includes('60 tháng') || normPkg.includes('5 năm')) targetVal = '5 năm';
        else if (normPkg.includes('06 tháng') || normPkg.includes('6 tháng')) targetVal = '6 tháng';
        
        if (targetVal) {
            durationSelect.value = targetVal;
        } else if (service === 'Hóa đơn điện tử') {
            durationSelect.value = pkg;
        }
    }

    // Simplified: Focus only on registration type for bonus logic
    let regType = 'cap_moi';
    if (service.includes('Gia hạn dùng thử')) regType = 'gia_han_thu';
    else if (service.includes('Gia hạn')) regType = 'gia_han';
    
    // Update labels/options for duration based on type
    updateCKSDurationByType(regType, durationSelect.value);
}

async function saveCA2CRM() {
    const id = document.getElementById('ca2-crm-id').value;
    const serviceType = document.getElementById('ca2-crm-service').value;
    const body = {
        mst: document.getElementById('ca2-crm-mst').value,
        company_name: document.getElementById('ca2-crm-name').value,
        email: document.getElementById('ca2-crm-email').value,
        phone: document.getElementById('ca2-crm-phone').value,
        service_type: serviceType,
        customer_type: document.getElementById('ca2-crm-customer-type').value,
        package_name: document.getElementById('ca2-crm-package').value,
        // Remove amount to prevent schema error
        start_date: document.getElementById('ca2-crm-start').value,
        duration: document.getElementById('ca2-crm-duration').value,
        compensate_months: parseInt(document.getElementById('ca2-crm-compensate').value) || 0
    };

    // Include CKS type if service contains 'CKS' (flexible match)
    if (serviceType.toUpperCase().includes('CKS')) {
        body.cks_type = document.getElementById('ca2-crm-cks-type').value || '';
    }

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

// Mission 2: Update payment status directly from table dropdown
async function updatePaymentStatus(id, status) {
    try {
        const res = await authedFetch(`/api/ca2-crm/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_status: status })
        });
        if (res.ok) {
            // Update local data to avoid full reload
            const item = currentCRMData.find(c => c.id === id);
            if (item) item.payment_status = status;
            renderCA2CRM();
        } else {
            alert('Lỗi cập nhật trạng thái thanh toán');
        }
    } catch (e) { alert('Lỗi kết nối'); }
}

function updateCRMDurationOptions(defaultVal = '') {
    const serviceSelect = document.getElementById('ca2-crm-service');
    const durationSelect = document.getElementById('ca2-crm-duration');
    const cksSection = document.getElementById('cks-type-section');
    if (!serviceSelect || !durationSelect) return;
    
    const serviceVal = serviceSelect.value;
    durationSelect.innerHTML = '';
    
    // Show/hide CKS type section
    if (cksSection) {
        cksSection.style.display = serviceVal === 'CKS' ? 'block' : 'none';
    }
    
    if (serviceVal === 'HDDT') {
        ['300 số', '500 số', '1000 số', '2000 số', '5000 số', '10000 số'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        if (!defaultVal || !defaultVal.includes('số')) defaultVal = '500 số';
    } else if (serviceVal === 'CKS') {
        // Duration depends on CKS type
        const cksType = document.getElementById('ca2-crm-cks-type')?.value || 'cap_moi';
        updateCKSDurationByType(cksType, defaultVal);
        return; // updateCKSDurationByType handles setting value
    } else {
        ['1 năm', '2 năm', '3 năm', '4 năm', '5 năm'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v.replace('năm', 'Năm')}</option>`;
        });
        if (!defaultVal || defaultVal.includes('số')) defaultVal = '1 năm';
    }
    durationSelect.value = defaultVal;
}

function updateCKSDurationByType(cksType, defaultVal = '') {
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!durationSelect) return;
    durationSelect.innerHTML = '';
    
    let options = [];
    if (cksType === 'gia_han_thu') {
        options = [
            { val: '1 năm', text: '1 Năm (+6 tháng)' },
            { val: '2 năm', text: '2 Năm (+9 tháng)' },
            { val: '3 năm', text: '3 Năm (+12 tháng)' }
        ];
    } else {
        options = [
            { val: '1 năm', text: '1 Năm (+3 tháng)' },
            { val: '2 năm', text: '2 Năm (+6 tháng)' },
            { val: '3 năm', text: '3 Năm (+9 tháng)' }
        ];
    }
    
    options.forEach(opt => {
        durationSelect.innerHTML += `<option value="${opt.val}">${opt.text}</option>`;
    });
    
    if (!defaultVal || defaultVal.includes('tháng') || defaultVal.includes('số')) {
        defaultVal = '1 năm';
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
    document.getElementById('ca2-crm-service').value = 'CKS – Cấp mới';
    document.getElementById('ca2-crm-customer-type').value = 'Công ty';
    document.getElementById('ca2-crm-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('ca2-crm-cks-type').value = 'cap_moi';
    document.getElementById('ca2-crm-compensate').value = 0;
    
    // Reset CKS type buttons
    document.querySelectorAll('.cks-type-btn').forEach(btn => {
        btn.classList.remove('border-green-500', 'bg-green-500/10', 'border-blue-500', 'bg-blue-500/10', 'border-orange-500', 'bg-orange-500/10', 'ring-2', 'ring-green-500/30', 'ring-blue-500/30', 'ring-orange-500/30');
        btn.classList.add('border-white/10', 'bg-white/5');
    });
    const defaultBtn = document.getElementById('cks-btn-cap-moi');
    if (defaultBtn) {
        defaultBtn.classList.remove('border-white/10', 'bg-white/5');
        defaultBtn.classList.add('border-green-500', 'bg-green-500/10', 'ring-2', 'ring-green-500/30');
    }
    
    // Hide CKS info
    const infoBox = document.getElementById('cks-type-info');
    if (infoBox) infoBox.classList.add('hidden');
    
    updateCRMPackages();
    
    document.getElementById('modal-ca2-crm').classList.remove('hidden');
}

function editCRM(id) {
    console.log('[DEBUG] Edit CRM clicked for ID:', id);
    const c = currentCRMData.find(x => x.id === id);
    if (!c) {
        console.error('[ERROR] CRM record not found in state:', id);
        return;
    }
    console.log('[DEBUG] CRM record data:', c);

    document.getElementById('ca2-crm-modal-title').innerText = 'Cập nhật khách hàng';
    document.getElementById('ca2-crm-id').value = c.id;
    document.getElementById('ca2-crm-mst').value = c.mst;
    document.getElementById('ca2-crm-name').value = c.company_name;
    document.getElementById('ca2-crm-email').value = c.email || '';
    document.getElementById('ca2-crm-phone').value = c.phone || '';
    const normalizedServiceType = c.service_type || 'CKS – Cấp mới';
    document.getElementById('ca2-crm-service').value = normalizedServiceType;
    document.getElementById('ca2-crm-customer-type').value = c.customer_type || 'Công ty';
    document.getElementById('ca2-crm-start').value = c.start_date || '';
    document.getElementById('ca2-crm-compensate').value = c.compensate_months || 0;
    
    // Initialize packages list first
    updateCRMPackages();
    
    // RESTORE SAVED PACKAGE AND DURATION
    if (c.package_name) {
        document.getElementById('ca2-crm-package').value = c.package_name;
    }
    if (c.duration) {
        document.getElementById('ca2-crm-duration').value = c.duration;
    }
    
    // Set amount (Recalculate with restored package)
    const price = getCRMPrice(c.service_type, c.customer_type, c.package_name || document.getElementById('ca2-crm-package').value);
    document.getElementById('ca2-crm-amount').value = new Intl.NumberFormat('vi-VN').format(price);
    
    // Removed obsolete selectCKSType call, CKS types are now handled by ca2-crm-service directly.
    
    // SYNC PREMIUM UI
    if (typeof refreshCustomSelects === 'function') {
        refreshCustomSelects();
    }
    
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
        'Dịch vụ': c.service_type || '',
        'Ngày cấp': formatDate(c.start_date),
        'Thời hạn/Số lượng': c.package_name || c.duration || '',
        'Thành tiền': getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration) > 0 ? new Intl.NumberFormat('vi-VN').format(getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration)) : '0',
        'Ngày hết hạn': formatDate(c.expired_date),
        'Tình trạng thanh toán': c.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán',
        'Ghi chú': c.status_note || ''
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "CA2_CRM_Data");
    XLSX.writeFile(wb, "CA2_CRM_Data.xlsx");
}

async function exportMonthlyReport() {
    const filterYear = document.getElementById('crm-filter-year')?.value || 'all';
    const filterQuarter = document.getElementById('crm-filter-quarter')?.value || 'all';
    const filterMonth = document.getElementById('crm-filter-month')?.value || 'all';

    let filteredData = [...currentCRMData];
    if (filterYear !== 'all') {
        filteredData = filteredData.filter(c => c.start_date && new Date(c.start_date).getFullYear() === parseInt(filterYear));
    }
    if (filterMonth !== 'all') {
        filteredData = filteredData.filter(c => c.start_date && (new Date(c.start_date).getMonth() + 1) === parseInt(filterMonth));
    }
    if (filterQuarter !== 'all') {
        const q = parseInt(filterQuarter);
        filteredData = filteredData.filter(c => {
            if (!c.start_date) return false;
            const month = new Date(c.start_date).getMonth() + 1;
            if (q === 1) return month >= 1 && month <= 3;
            if (q === 2) return month >= 4 && month <= 6;
            if (q === 3) return month >= 7 && month <= 9;
            if (q === 4) return month >= 10 && month <= 12;
            return true;
        });
    }

    if (filteredData.length === 0) {
        alert('Không có dữ liệu phù hợp với bộ lọc hiện tại để xuất.');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DSKH CA2');

    // Add main title
    worksheet.mergeCells('A1:N1');
    const title = worksheet.getCell('A1');
    title.value = `DANH SÁCH KHÁCH HÀNG ${filterYear !== 'all' ? filterYear : new Date().getFullYear()}`;
    title.font = { name: 'Times New Roman', size: 16, bold: true };
    title.alignment = { horizontal: 'center' };

    // Column Widths
    worksheet.columns = [
        { header: 'STT', width: 5 },
        { header: 'Ngày', width: 15 },
        { header: 'Tên DN', width: 45 },
        { header: 'MST', width: 15 },
        { header: 'Cục Thuế', width: 15 },
        { header: 'Điện thoại DN', width: 15 },
        { header: 'Email đăng ký', width: 30 },
        { header: 'DỊCH VỤ', width: 15 },
        { header: 'Thời hạn/Số lượng', width: 20 },
        { header: 'Thành tiền', width: 15 },
        { header: 'ĐT người làm', width: 15 },
        { header: 'Tỷ lệ', width: 10 },
        { header: 'CK KH', width: 10 },
        { header: 'Tình trạng thanh toán', width: 20 }
    ];

    // Format Header Row
    const hr = worksheet.getRow(2);
    hr.values = [
        'STT', 'Ngày', 'Tên DN', 'MST', 'Cục Thuế', 'Điện thoại DN', 'Email đăng ký',
        'DỊCH VỤ', 'Thời hạn/Số lượng', 'Thành tiền', 'ĐT người làm', 'Tỷ lệ', 'CK KH', 'Tình trạng thanh toán'
    ];
    hr.eachCell((cell) => {
        cell.font = { name: 'Times New Roman', size: 11, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Add Data Rows
    filteredData.forEach((c, index) => {
        const row = worksheet.addRow([
            index + 1,
            formatDate(c.start_date),
            c.company_name,
            c.mst,
            c.tax_region || '',
            c.phone || '',
            c.email || '',
            c.service_type || '',
            c.package_name || c.duration || '',
            getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration) > 0 ? new Intl.NumberFormat('vi-VN').format(getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration)) : '0',
            currentUser?.full_name || 'Ngọc',
            '', // Tỷ lệ
            '', // CK KH
            c.payment_status === 'paid' ? 'Đã TT' : 'Chưa TT'
        ]);
        row.eachCell((cell) => {
            cell.font = { name: 'Times New Roman', size: 11 };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Bao_Cao_CRM_DSKH.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
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
            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
            
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
                        if ((uk.includes('HẾT HẠN') || uk.includes('HẠN GCN') || uk.includes('EXPIRATION') || uk.includes('HẠN')) && !uk.includes('THỜI HẠN')) {
                            obj['NgayHetHanChuKySo'] = val;
                        }
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
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.maxWidth = '600px';
        img.style.width = 'auto';
        img.setAttribute('width', '600');
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px auto';
        img.style.borderRadius = '8px';
        img.style.cursor = 'pointer';
        img.className = 'email-editor-img';
        img.title = 'Click để chỉnh kích thước';
        
        // Click to select and show resize toolbar
        img.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            showImageResizeToolbar(this);
        });
        
        const editor = document.getElementById('input-template');
        editor.focus();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.setStartAfter(img);
            range.setEndAfter(img);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            editor.appendChild(img);
        }
    };
    reader.readAsDataURL(file);
    // Reset file input to allow re-upload of same file
    event.target.value = '';
}

// --- Image Resize Toolbar ---
function showImageResizeToolbar(imgEl) {
    // Remove any existing toolbar
    removeImageResizeToolbar();
    
    // Mark selected image
    document.querySelectorAll('.email-editor-img').forEach(i => i.style.outline = '');
    imgEl.style.outline = '3px solid #f97316';
    imgEl.style.outlineOffset = '2px';
    window._selectedEditorImage = imgEl;
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'img-resize-toolbar';
    toolbar.style.cssText = 'position:fixed;z-index:9999;display:flex;gap:6px;padding:8px 12px;background:rgba(10,10,30,0.95);border:1px solid rgba(249,115,22,0.4);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);backdrop-filter:blur(12px);align-items:center;';
    
    const sizes = [
        { label: '📐 Nhỏ', w: '300px', desc: '300px' },
        { label: '📏 Vừa', w: '450px', desc: '450px' },
        { label: '🖥️ Lớn', w: '600px', desc: '600px' },
        { label: '🔳 Full', w: '100%', desc: '100%' },
    ];
    
    // Title
    const title = document.createElement('span');
    title.textContent = 'Kích thước:';
    title.style.cssText = 'font-size:10px;font-weight:900;color:#f97316;text-transform:uppercase;letter-spacing:0.1em;margin-right:4px;white-space:nowrap;';
    toolbar.appendChild(title);
    
    sizes.forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s.label;
        btn.title = s.desc;
        btn.style.cssText = 'padding:5px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;transition:all 0.15s;';
        btn.onmouseenter = () => { btn.style.background = 'rgba(249,115,22,0.3)'; btn.style.borderColor = 'rgba(249,115,22,0.5)'; };
        btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.05)'; btn.style.borderColor = 'rgba(255,255,255,0.1)'; };
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (s.w === '100%') {
                imgEl.style.maxWidth = '100%';
                imgEl.style.width = '100%';
                imgEl.setAttribute('width', '100%');
            } else {
                imgEl.style.maxWidth = s.w;
                imgEl.style.width = 'auto';
                imgEl.setAttribute('width', s.w.replace('px', ''));
            }
            removeImageResizeToolbar();
        };
        toolbar.appendChild(btn);
    });
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.title = 'Xóa ảnh';
    delBtn.style.cssText = 'padding:5px 8px;border-radius:10px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#ef4444;font-size:12px;cursor:pointer;transition:all 0.15s;margin-left:4px;';
    delBtn.onmouseenter = () => { delBtn.style.background = 'rgba(239,68,68,0.3)'; };
    delBtn.onmouseleave = () => { delBtn.style.background = 'rgba(239,68,68,0.1)'; };
    delBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        imgEl.remove();
        removeImageResizeToolbar();
    };
    toolbar.appendChild(delBtn);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.title = 'Đóng';
    closeBtn.style.cssText = 'padding:4px 8px;border-radius:8px;border:none;background:transparent;color:#666;font-size:14px;cursor:pointer;font-weight:900;transition:all 0.15s;';
    closeBtn.onmouseenter = () => { closeBtn.style.color = '#fff'; };
    closeBtn.onmouseleave = () => { closeBtn.style.color = '#666'; };
    closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeImageResizeToolbar();
    };
    toolbar.appendChild(closeBtn);
    
    document.body.appendChild(toolbar);
    
    // Position toolbar above the image
    const rect = imgEl.getBoundingClientRect();
    const tbRect = toolbar.getBoundingClientRect();
    let top = rect.top - tbRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    let left = rect.left + (rect.width / 2) - (tbRect.width / 2);
    if (left < 8) left = 8;
    if (left + tbRect.width > window.innerWidth - 8) left = window.innerWidth - tbRect.width - 8;
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
}

function removeImageResizeToolbar() {
    const tb = document.getElementById('img-resize-toolbar');
    if (tb) tb.remove();
    if (window._selectedEditorImage) {
        window._selectedEditorImage.style.outline = '';
        window._selectedEditorImage.style.outlineOffset = '';
        window._selectedEditorImage = null;
    }
}

// Close resize toolbar when clicking elsewhere
document.addEventListener('click', function(e) {
    if (e.target.closest('#img-resize-toolbar')) return;
    if (e.target.classList && e.target.classList.contains('email-editor-img')) return;
    removeImageResizeToolbar();
});

// Also handle images pasted or from saved templates - make them clickable
document.addEventListener('DOMContentLoaded', function() {
    const editor = document.getElementById('input-template');
    if (editor) {
        // Observe for new images added to editor (from paste, template load, etc.)
        const observer = new MutationObserver(() => {
            editor.querySelectorAll('img:not(.email-editor-img)').forEach(img => {
                img.className = 'email-editor-img';
                img.style.maxWidth = img.style.maxWidth || '600px';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.cursor = 'pointer';
                img.title = 'Click để chỉnh kích thước';
                img.addEventListener('click', function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    showImageResizeToolbar(this);
                });
            });
        });
        observer.observe(editor, { childList: true, subtree: true });
    }
});

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
        
        const contentType = res.headers.get("content-type");
        if (res.ok) {
            alert('Tạo chiến dịch thành công!');
            closeCreateModal();
            showPage('campaigns');
        } else if (contentType && contentType.indexOf("application/json") !== -1) {
            const err = await res.json();
            alert(`Lỗi: ${err.error || 'N/A'}\nChi tiết: ${err.message || 'Không rõ'}\nGợi ý: ${err.suggestion || 'Liên hệ kỹ thuật'}`);
        } else {
            const html = await res.text();
            alert('Lỗi hệ thống khi tạo chiến dịch (HTML): ' + html.substring(0, 200));
        }
    } catch (e) { alert('Lỗi kết nối server: ' + e.message); }
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
        
        const contentType = res.headers.get("content-type");
        if (res.ok) {
            alert('Đã lưu mẫu thành công!');
            loadTemplates();
        } else if (contentType && contentType.indexOf("application/json") !== -1) {
            const err = await res.json();
            alert(`Lỗi khi lưu mẫu: ${err.error || 'N/A'}\nChi tiết: ${err.message || 'Không rõ'}\nGợi ý: ${err.suggestion || 'Liên hệ kỹ thuật'}`);
        } else {
            const html = await res.text();
            alert('Lỗi hệ thống (HTML): ' + html.substring(0, 200));
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

// --- Settings Module Support Functions ---

function switchSettingsTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('[id^="settings-tab-"]').forEach(el => el.classList.add('hidden'));
    // Show target tab
    const target = document.getElementById(`settings-tab-${tabId}`);
    if (target) target.classList.remove('hidden');

    // Update buttons
    document.querySelectorAll('[id^="tab-settings-"]').forEach(btn => {
        btn.classList.remove('bg-orange-gradient', 'text-white');
        btn.classList.add('text-gray-500');
    });
    const activeBtn = document.getElementById(`tab-settings-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-orange-gradient', 'text-white');
        activeBtn.classList.remove('text-gray-500');
    }
}

async function loadSettingsPage() {
    if (!currentUser) return;

    // Populate Account Info
    const avatar = document.getElementById('settings-user-avatar');
    const name = document.getElementById('settings-user-name');
    const email = document.getElementById('settings-user-email');
    const id = document.getElementById('settings-user-id');
    const roleBadge = document.getElementById('settings-user-role-badge');
    const lastLogin = document.getElementById('settings-last-login');

    if (avatar) avatar.innerText = (currentUser.name || 'U').charAt(0).toUpperCase();
    if (name) name.innerText = currentUser.name || 'User Name';
    if (email) email.innerText = currentUser.email;
    if (id) id.innerText = currentUser.id;
    if (lastLogin) lastLogin.innerText = new Date(currentUser.last_sign_in_at).toLocaleString('vi-VN');
    
    if (roleBadge) {
        roleBadge.innerText = `Vai trò: ${currentUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}`;
        roleBadge.className = `inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 ${
            currentUser.role === 'admin' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
        }`;
    }

    // Populate System Config
    const storageInput = document.getElementById('settings-storage-path');
    if (storageInput && currentUser.settings) {
        storageInput.value = currentUser.settings.default_storage_path || 'C:/Downloads/CA2_Automation';
    }

    // Handle Admin Section
    const adminSection = document.getElementById('admin-user-section');
    const staffMsg = document.getElementById('staff-restricted-msg');
    
    if (currentUser.role === 'admin') {
        if (adminSection) adminSection.classList.remove('hidden');
        if (staffMsg) staffMsg.classList.add('hidden');
        refreshUserList();
    } else {
        if (adminSection) adminSection.classList.add('hidden');
        if (staffMsg) staffMsg.classList.remove('hidden');
    }

    // Theme selector UI state
    const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    updateThemeSelectorUI(currentTheme);
}

function updateThemeSelectorUI(theme) {
    const darkBtn = document.getElementById('theme-btn-dark');
    const lightBtn = document.getElementById('theme-btn-light');
    
    if (theme === 'dark') {
        darkBtn?.classList.add('bg-orange-gradient', 'text-white');
        lightBtn?.classList.remove('bg-white/10', 'text-white');
        lightBtn?.classList.add('text-gray-500');
    } else {
        lightBtn?.classList.add('bg-orange-gradient', 'text-white');
        darkBtn?.classList.remove('bg-white/10', 'text-white');
        darkBtn?.classList.add('text-gray-500');
    }
}

async function applyTheme(theme, saveToDB = true) {
    const icon = document.getElementById('theme-icon');
    
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    } else {
        document.body.classList.remove('light-mode');
        if (icon) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
    
    localStorage.setItem('ca2-theme', theme);
    updateThemeSelectorUI(theme);

    if (saveToDB) {
        try {
            await authedFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme })
            });
        } catch (e) { console.error('Failed to save theme to DB:', e); }
    }
}

async function saveSystemSettings() {
    const path = document.getElementById('settings-storage-path').value;
    try {
        const res = await authedFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ default_storage_path: path })
        });
        if (res.ok) {
            alert('Đã lưu cấu hình hệ thống thành công!');
            // Update local state
            if (currentUser.settings) currentUser.settings.default_storage_path = path;
        } else {
            alert('Lỗi khi lưu cấu hình.');
        }
    } catch (e) {
        alert('Lỗi kết nối: ' + e.message);
    }
}

async function refreshUserList() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    
    list.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-gray-500">Đang tải danh sách...</td></tr>';
    
    try {
        const res = await authedFetch('/api/admin/users');
        if (!res.ok) throw new Error('Không thể tải danh sách người dùng');
        
        const users = await res.json();
        list.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-white/5 hover:bg-white/2 transition-all';
            
            const isMe = u.id === currentUser.id;
            
            tr.innerHTML = `
                <td class="px-8 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black">${(u.email || 'U').charAt(0).toUpperCase()}</div>
                        <div class="overflow-hidden">
                            <p class="text-sm font-bold text-white truncate">${u.email}</p>
                            <p class="text-[9px] text-gray-500 font-mono truncate">${u.id}</p>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5 text-center">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        u.role === 'admin' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                    }">
                        ${u.role}
                    </span>
                </td>
                <td class="px-8 py-5">
                    <p class="text-xs font-medium text-gray-400">${new Date(u.created_at).toLocaleDateString('vi-VN')}</p>
                </td>
                <td class="px-8 py-5 text-right">
                    ${isMe ? '<span class="text-[9px] text-gray-600 font-black italic">Đang sử dụng</span>' : `
                        <div class="flex justify-end gap-2">
                            <button onclick="changeUserRole('${u.id}', '${u.role === 'admin' ? 'staff' : 'admin'}')" class="text-[9px] font-black uppercase text-blue-400 hover:text-white border border-blue-400/30 hover:bg-blue-400 px-3 py-1.5 rounded-lg transition-all">
                                Đổi thành ${u.role === 'admin' ? 'Staff' : 'Admin'}
                            </button>
                            <button onclick="deleteUser('${u.id}')" class="text-[9px] font-black uppercase text-red-500 hover:text-white border border-red-500/30 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-all">
                                Xóa
                            </button>
                        </div>
                    `}
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (e) {
        list.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-red-500">${e.message}</td></tr>`;
    }
}

async function changeUserRole(id, newRole) {
    if (!confirm(`Xác nhận thay đổi vai trò người dùng thành ${newRole.toUpperCase()}?`)) return;
    
    try {
        const res = await authedFetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        
        if (res.ok) {
            alert('Cập nhật vai trò thành công!');
            refreshUserList();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + err.error);
        }
    } catch (e) {
        alert('Lỗi kết nối: ' + e.message);
    }
}

async function deleteUser(id) {
    if (!confirm('Xác nhận xóa tài khoản người dùng này?')) return;
    
    try {
        const res = await authedFetch(`/api/admin/users/${id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            alert('Đã xóa quyền truy cập người dùng thành công!');
            refreshUserList();
        } else {
            alert('Lỗi khi xóa.');
        }
    } catch (e) {
        alert('Lỗi kết nối: ' + e.message);
    }
}

// Global Exports
window.switchSettingsTab = switchSettingsTab;
window.applyTheme = applyTheme;
window.saveSystemSettings = saveSystemSettings;
window.refreshUserList = refreshUserList;
window.changeUserRole = changeUserRole;
window.deleteUser = deleteUser;
// --- QUOTATION LOGIC REMOVED (Moved to quote-components.js) ---

// --- DOCUMENT LOGIC ---
async function loadDocuments() {
    try {
        const res = await authedFetch('/api/storage/files');
        const data = await res.json();
        currentMarketingDocs = data.marketing || [];
        currentTemplates = data.templates || [];
        renderDocuments();
    } catch (e) { console.error('Load Docs Error:', e); }
}

function renderDocuments() {
    const marketingList = document.getElementById('marketing-docs-list');
    const templateList = document.getElementById('template-docs-list');
    
    if (marketingList) {
        document.getElementById('marketing-count').innerText = `${currentMarketingDocs.length} files`;
        marketingList.innerHTML = currentMarketingDocs.map(f => `
            <div class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-blue-500/30 transition-all group">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <i class="fas ${getFileIcon(f.name)}"></i>
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-sm font-bold text-white truncate max-w-[200px]">${f.name}</p>
                        <p class="text-[10px] text-gray-500 font-medium uppercase tracking-widest">${(f.metadata?.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <a href="${f.url}" target="_blank" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"><i class="fas fa-download text-xs"></i></a>
                    <button onclick="deleteDoc('marketing-docs', '${f.name}')" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </div>
        `).join('') || '<p class="text-center py-10 text-gray-600 text-xs italic">Chưa có tài liệu nào.</p>';
    }

    if (templateList) {
        document.getElementById('template-count').innerText = `${currentTemplates.length} files`;
        templateList.innerHTML = currentTemplates.map(f => `
            <div class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-orange-500/30 transition-all group">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                        <i class="fas fa-file-code"></i>
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-sm font-bold text-white truncate max-w-[200px]">${f.name}</p>
                        <p class="text-[10px] text-gray-500 font-medium uppercase tracking-widest">TEMPLATE</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <a href="${f.url}" target="_blank" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"><i class="fas fa-eye text-xs"></i></a>
                    <button onclick="deleteDoc('quotation-templates', '${f.name}')" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </div>
        `).join('') || '<p class="text-center py-10 text-gray-600 text-xs italic">Chưa có mẫu báo giá nào.</p>';
    }
}

function getFileIcon(name) {
    if (name.endsWith('.pdf')) return 'fa-file-pdf';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'fa-file-word';
    if (name.endsWith('.xlsx')) return 'fa-file-excel';
    if (name.endsWith('.pptx')) return 'fa-file-powerpoint';
    if (name.match(/\.(jpg|jpeg|png|gif)$/i)) return 'fa-file-image';
    return 'fa-file';
}

function openUploadDocModal() {
    document.getElementById('modal-upload-doc').classList.remove('hidden');
    document.getElementById('doc-file-name').innerText = 'Chọn file hoặc kéo thả vào đây';
    selectedUploadFile = null;
    
    // Setup Drag and Drop
    const dropZone = document.getElementById('doc-drop-zone');
    if (dropZone && !dropZone._dragSetup) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('border-blue-500', 'bg-blue-500/10');
                dropZone.classList.remove('border-white/10');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('border-blue-500', 'bg-blue-500/10');
                dropZone.classList.add('border-white/10');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file) {
                selectedUploadFile = file;
                document.getElementById('doc-file-name').innerText = file.name;
                console.log('[UPLOAD] File dropped:', file.name);
            }
        }, false);
        
        dropZone._dragSetup = true;
    }
}

function handleDocFileChange(e) {
    const file = e.target.files[0];
    if (file) {
        selectedUploadFile = file;
        document.getElementById('doc-file-name').innerText = file.name;
    }
}

async function uploadDocument() {
    if (!selectedUploadFile) {
        alert('Vui lòng chọn file');
        return;
    }
    const bucket = document.getElementById('upload-doc-bucket').value;
    const formData = new FormData();
    formData.append('file', selectedUploadFile);
    formData.append('bucket', bucket);

    const btn = document.getElementById('upload-doc-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ĐANG TẢI LÊN...';
    btn.disabled = true;

    try {
        const token = localStorage.getItem('sb-token');
        const res = await fetch('/api/storage/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.ok) {
            closeModal('modal-upload-doc');
            loadDocuments();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.error || 'Upload thất bại'));
        }
    } catch (e) {
        console.error('Upload Error:', e);
    } finally {
        btn.innerHTML = 'BẮT ĐẦU TẢI LÊN';
        btn.disabled = false;
    }
}

async function deleteDoc(bucket, name) {
    if (!confirm(`Xóa file "${name}"?`)) return;
    try {
        const res = await authedFetch(`/api/storage/files?bucket=${bucket}&name=${name}`, { method: 'DELETE' });
        if (res.ok) loadDocuments();
    } catch (e) { console.error('Delete Doc Error:', e); }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}
