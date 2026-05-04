/**
 * Automation CA2 - Core Application Logic
 * Reconstructed & Enhanced
 */

// --- Safe showToast fallback (overridden by premium-ui.js if loaded) ---
if (typeof window.showToast !== 'function') {
    window.showToast = function(msg, type) { console.log('[TOAST:' + (type||'info') + '] ' + msg); };
}

// --- Global State & Constants ---
let currentUser = null;
let savedSessions = JSON.parse(localStorage.getItem('ca2_saved_sessions') || '[]');
let currentCRMData = [];
let currentRecipientsData = [];
let pendingCRMData = [];
let currentQuotations = [];
let currentMarketingDocs = [];
let currentTemplates = [];
let currentCampaignData = [];
let currentSenderData = [];
let currentEmailLogs = [];
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
    
    // Listen for Enter key on Auth form
    ['auth-email', 'auth-password', 'auth-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typeof handleAuthSubmit === 'function') handleAuthSubmit();
                }
            });
        }
    });

    // CRM MST Auto-fill and Focus Flow
    const mstInput = document.getElementById('ca2-crm-mst');
    if (mstInput) {
        mstInput.addEventListener('blur', function() {
            const mst = this.value.trim();
            if (!mst) return;
            
            // Try to find existing customer with same MST to auto-fill name
            const existing = (window.currentCRMData || []).find(c => c.mst === mst);
            if (existing) {
                const nameInput = document.getElementById('ca2-crm-name');
                const typeSelect = document.getElementById('ca2-crm-customer-type');
                if (nameInput && !nameInput.value) nameInput.value = existing.company_name;
                if (typeSelect) typeSelect.value = existing.customer_type || 'Công ty';
                console.log('[CRM] MST Auto-fill success:', existing.company_name);
            }
        });
        
        mstInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('ca2-crm-name')?.focus();
            }
        });
    }

    const nameInput = document.getElementById('ca2-crm-name');
    if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('ca2-crm-customer-type')?.focus();
            }
        });
    }

    // Initialize PremiumDatePicker (Single mode — CRM Modal)
    const startInput = document.getElementById('ca2-crm-start');
    if (startInput && window.PremiumDatePicker) {
        PremiumDatePicker.attach(startInput, {
            mode: 'single',
            dateFormat: 'Y-m-d',
            label: 'CHỌN NGÀY',
            onSelect: (date) => {
                console.log('[PDP] Start date selected:', PremiumDatePicker.formatDate(date, 'Y-m-d'));
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

            // Init pricing AFTER auth succeeds (safe order)
            try { loadCRMPrices(); } catch(e) { console.warn('[INIT] loadCRMPrices skipped:', e); }
            try { if (window.PricingManager) PricingManager.init(); } catch(e) { console.warn('[INIT] PricingManager skipped:', e); }
            try { if (window.PricingEngine) PricingEngine.init(); } catch(e) {}

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
    const btnText = submitBtn.querySelector('.btn-text');
    if (btnText) btnText.innerText = isRegister ? 'Đăng ký ngay' : 'Đăng nhập ngay';
    else submitBtn.innerText = isRegister ? 'Đăng ký ngay' : 'Đăng nhập ngay';
    
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
        
        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const rawText = await res.text();
            throw new Error(rawText || 'Phản hồi từ server không hợp lệ.');
        }
        
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

window.handleAuthSubmit = async function handleAuthSubmitPatched() {
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const nameInput = document.getElementById('auth-name');
    const registerFields = document.getElementById('register-fields');
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorDiv = document.getElementById('auth-error');
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const name = nameInput?.value || '';
    const isRegister = registerFields ? !registerFields.classList.contains('hidden') : false;
    const btnText = submitBtn?.querySelector('.btn-text');
    const originalBtnText = btnText ? btnText.innerText : (submitBtn?.innerText || 'Đăng nhập ngay');

    const showAuthMessage = (message, type = 'error') => {
        if (!errorDiv) return;
        errorDiv.innerText = message;
        errorDiv.classList.remove(
            'hidden',
            'text-red-500',
            'bg-red-500/10',
            'border-red-500/20',
            'text-green-500',
            'bg-green-500/10',
            'border-green-500/20'
        );
        if (type === 'success') {
            errorDiv.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
        } else {
            errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
        }
    };

    if (errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.innerText = '';
    }

    if (!email) {
        showAuthMessage('Vui lòng nhập email.');
        emailInput?.focus();
        return;
    }

    if (!password) {
        showAuthMessage('Vui lòng nhập mật khẩu.');
        passwordInput?.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        if (btnText) btnText.innerText = 'ĐANG XỬ LÝ...';
        else submitBtn.innerText = 'ĐANG XỬ LÝ...';
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed', 'btn-loading');
    }

    let timeoutId = null;

    try {
        const url = isRegister ? '/api/register' : '/api/login';
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const contentType = res.headers.get('content-type') || '';
        let data = null;

        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const rawText = await res.text();
            throw new Error(rawText || 'Phản hồi từ server không hợp lệ.');
        }

        if (data.message) {
            showAuthMessage(data.message, 'success');
            return;
        }

        if (!res.ok) {
            showAuthMessage(data.error || 'Không thể đăng nhập.');
            return;
        }

        if (!data.token) {
            showAuthMessage('Đăng nhập thất bại: server không trả về phiên đăng nhập.');
            return;
        }

        localStorage.setItem('sb-token', data.token);
        saveCurrentSession(data.token, data.user);
        await checkAuth();
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            showAuthMessage('Server phản hồi quá chậm. Vui lòng thử lại.');
        } else {
            showAuthMessage(e.message || 'Lỗi kết nối server.');
        }
        console.error('[AUTH] Submit failed:', e);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            if (btnText) btnText.innerText = originalBtnText;
            else submitBtn.innerText = originalBtnText;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed', 'btn-loading');
        }
    }
};

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
            const displayName = getDisplayName(currentUser);
            if (avatarEl) avatarEl.innerText = displayName.charAt(0).toUpperCase();
            if (nameEl) nameEl.innerText = displayName;
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

function getDisplayName(user) {
    if (!user) return 'User';
    if (user.name && user.name.trim() !== '') return user.name;
    if (user.email) return user.email.split('@')[0];
    return 'User';
}

function updateUserUI() {
    if (!currentUser) return;
    const nameEl = document.getElementById('user-display-name');
    const emailEl = document.getElementById('user-display-email');
    const avatarEl = document.getElementById('user-avatar');
    
    const displayName = getDisplayName(currentUser);
    
    if (nameEl) nameEl.innerText = displayName;
    if (emailEl) emailEl.innerText = currentUser.email;
    if (avatarEl) avatarEl.innerText = displayName.charAt(0).toUpperCase();
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
        'documents': 'Kho Tài liệu Sales',
        'settings-pricing': 'Cập nhật Bảng giá'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[pageId] || 'Trang chủ';
    
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
        mainContent.scrollLeft = 0;
    }

    // Page specific loading
    if (pageId === 'ca2-crm') {
        loadCRMPrices(); // Sync prices first
        initializeCRMDateRangePicker(); // Initialize the SaaS range picker
        loadCA2CRMData();
    }
    if (pageId === 'dashboard') { loadDashboardStats(); loadRecentCampaigns(); }
    if (pageId === 'quotations') {
        loadCRMPrices(); // Sync prices for quotation select
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
    if (pageId === 'settings-pricing') {
        loadCRMPrices();
        PricingManager.render();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebar.classList.toggle('collapsed');
    
    // For mobile
    if (window.innerWidth < 1024) {
        sidebar.classList.toggle('-translate-x-full');
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

function normalizeText(value) {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function matchesCRMServiceFilter(serviceType, filterType) {
    if (!filterType || filterType === 'all') return true;

    const service = normalizeText(serviceType);
    if (!service) return false;

    if (filterType === 'CKS') return service.includes('cks') || service.includes('chu ky so') || service.includes('chu ky');
    if (filterType === 'HDDT') return service.includes('hddt') || service.includes('hoa don dien tu') || service.includes('einvoice');
    if (filterType === 'EBH') return service.includes('ebh') || service.includes('bao hiem');
    if (filterType === 'HOA_DON') return service.includes('hoa don');

    return service.includes(normalizeText(filterType));
}

function inferDurationFromPackage(serviceVal, pkgOptionOrName) {
    const pkgName = typeof pkgOptionOrName === 'string'
        ? pkgOptionOrName
        : (pkgOptionOrName?.dataset?.durationLabel || pkgOptionOrName?.value || pkgOptionOrName?.textContent || '');
    
    const normalizedPkg = normalizeText(pkgName);
    const normalizedService = normalizeText(serviceVal);

    console.log('[CRM-Sync] Inferring from:', { pkgName, normalizedPkg });

    if (!pkgName || normalizedPkg.includes('chua co goi')) return '1 năm';
    
    // Priority: dataset from pricing data
    if (pkgOptionOrName?.dataset?.durationLabel) {
        console.log('[CRM-Sync] Found dataset label:', pkgOptionOrName.dataset.durationLabel);
        return pkgOptionOrName.dataset.durationLabel;
    }

    // Regex support for: nam, year, thang, month, so, count
    const yearMatch = normalizedPkg.match(/(\d+)\s*(nam|year)/);
    if (yearMatch) return `${yearMatch[1]} năm`;

    const monthMatch = normalizedPkg.match(/(\d+)\s*(thang|month)/);
    if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months % 12 === 0 && months <= 60) return `${months / 12} năm`;
        return `${months} tháng`;
    }

    const countMatch = normalizedPkg.match(/(\d+)\s*(so|count|to)/);
    if (countMatch) return `${countMatch[1]} số`;

    if (normalizedService.includes('hoa don')) return '500 số';
    
    return '1 năm';
}

function syncCRMDurationWithPackage(packageValue = '') {
    const serviceSelect = document.getElementById('ca2-crm-service');
    const pkgSelect = document.getElementById('ca2-crm-package');
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!serviceSelect || !pkgSelect || !durationSelect) return;

    const targetValue = packageValue || pkgSelect.value;
    const option = [...pkgSelect.options].find(opt => opt.value === targetValue) || pkgSelect.selectedOptions?.[0];
    
    console.log('[CRM-Sync] Starting sync for package:', targetValue);
    
    let durationLabel = '';
    
    // PRIORITY 1: Data-driven duration from numeric months
    if (option && option.dataset.durationMonths) {
        const months = parseInt(option.dataset.durationMonths, 10);
        if (months > 0) {
            if (months % 12 === 0) {
                durationLabel = `${months / 12} năm`;
            } else {
                durationLabel = `${months} tháng`;
            }
            console.log('[CRM-Sync] Found numeric months:', months, '-> label:', durationLabel);
        }
    }

    // PRIORITY 2: dataset.durationLabel
    if (!durationLabel && option && option.dataset.durationLabel) {
        durationLabel = option.dataset.durationLabel;
        console.log('[CRM-Sync] Using dataset.durationLabel:', durationLabel);
    }

    // FALLBACK: String inference
    if (!durationLabel) {
        durationLabel = inferDurationFromPackage(serviceSelect.value, option || targetValue);
        console.log('[CRM-Sync] Falling back to inference:', durationLabel);
    }
    
    if (!durationLabel) {
        console.warn('[CRM-Sync] Could not determine duration label');
        return;
    }

    const normalizedDurLabel = normalizeText(durationLabel);
    console.log('[CRM-Sync] Searching for option matching:', normalizedDurLabel);

    // Try to find the best matching option in the duration dropdown
    let existingOpt = [...durationSelect.options].find(opt => {
        const valNorm = normalizeText(opt.value);
        const textNorm = normalizeText(opt.textContent);
        
        // Exact match on value is best
        if (valNorm === normalizedDurLabel) return true;
        
        // If label is "1 năm", match "1 năm (+3 tháng)" or similar
        // We check if the option text STARTS with the label (e.g. "1 năm" matches "1 năm (+3 tháng)")
        if (textNorm.startsWith(normalizedDurLabel)) return true;
        
        return false;
    });

    if (existingOpt) {
        durationSelect.value = existingOpt.value;
        console.log('[CRM-Sync] SUCCESS: Set durationSelect.value to:', existingOpt.value);
    } else {
        console.warn('[CRM-Sync] FAILED: No matching option found for:', durationLabel);
        // Add it as a temporary option so the value is at least set
        const extraOpt = document.createElement('option');
        extraOpt.value = durationLabel;
        extraOpt.textContent = durationLabel;
        durationSelect.appendChild(extraOpt);
        durationSelect.value = durationLabel;
    }
    
    // Trigger bonus update after sync
    updateCRMBonusMonths();
}

function syncCRMPackageWithDuration() {
    const pkgSelect = document.getElementById('ca2-crm-package');
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!pkgSelect || !durationSelect || !durationSelect.value) return;

    const durationVal = durationSelect.value;
    const normalizedDur = normalizeText(durationVal);
    
    const exact = [...pkgSelect.options].find(opt => (opt.dataset.durationLabel || '') === durationVal);
    if (exact) {
        pkgSelect.value = exact.value;
        return;
    }

    let possibleMonthDur = "";
    const yearMatch = normalizedDur.match(/(\d+)\s*nam/);
    if (yearMatch) {
        possibleMonthDur = `${parseInt(yearMatch[1], 10) * 12} thang`;
    }

    const loose = [...pkgSelect.options].find(opt => {
        const txt = normalizeText(opt.textContent);
        return txt.includes(normalizedDur) || (possibleMonthDur && txt.includes(possibleMonthDur));
    });

    if (loose) pkgSelect.value = loose.value;
}

function handleCRMPackageChange() {
    syncCRMDurationWithPackage();
    updateCRMBonusMonths();
    calculatePrice();
}

function handleCRMDurationChange() {
    syncCRMPackageWithDuration();
    updateCRMBonusMonths();
    calculatePrice();
}

function getCRMCustomerSegments(customerType) {
    const normalized = normalizeText(customerType);
    if (normalized.includes('cong ty')) return ['cong ty'];
    return ['ca nhan', 'ho kd', 'cn thuoc tc'];
}

function crmCategoryMatches(category, customerType) {
    const categoryText = normalizeText(category);
    const segments = getCRMCustomerSegments(customerType);
    return segments.some(segment => categoryText.includes(segment));
}

function getCRMTransactionForService(serviceVal) {
    const normalized = normalizeText(serviceVal);
    if (normalized.includes('gia han dung thu')) return 'gia han';
    if (normalized.includes('gia han')) return 'gia han';
    if (normalized.includes('cap moi')) return 'cap moi';
    return 'all';
}

function extractDurationMonthsFromPackage(packageName) {
    const normalized = normalizeText(packageName);
    const yearMatch = normalized.match(/(\d+)\s*nam/);
    if (yearMatch) return parseInt(yearMatch[1], 10) * 12;
    const monthMatch = normalized.match(/(\d+)\s*thang/);
    if (monthMatch) return parseInt(monthMatch[1], 10);
    return 0;
}

function initializeCRMDateRangePicker() {
    const rangeInput = document.getElementById('crm-date-range-picker');
    if (!rangeInput || !window.PremiumDatePicker) return;

    const applyRangeState = (dates = []) => {
        const startLabel = document.getElementById('crm-date-start-label');
        const endLabel = document.getElementById('crm-date-end-label');
        const fromInput = document.getElementById('crm-filter-from-date');
        const toInput = document.getElementById('crm-filter-to-date');
        const clearBtn = document.getElementById('crm-date-clear-btn');

        if (!startLabel || !endLabel || !fromInput || !toInput) return;

        if (dates.length === 1) {
            const fromValue = PremiumDatePicker.formatDate(dates[0], 'Y-m-d');
            startLabel.innerText = PremiumDatePicker.formatDate(dates[0], 'd/m/Y');
            endLabel.innerText = 'Đến ngày';
            fromInput.value = fromValue;
            toInput.value = '';
            rangeInput.value = fromValue;
            clearBtn?.classList.remove('hidden');
        } else if (dates.length === 2) {
            const fromValue = PremiumDatePicker.formatDate(dates[0], 'Y-m-d');
            const toValue = PremiumDatePicker.formatDate(dates[1], 'Y-m-d');
            startLabel.innerText = PremiumDatePicker.formatDate(dates[0], 'd/m/Y');
            endLabel.innerText = PremiumDatePicker.formatDate(dates[1], 'd/m/Y');
            fromInput.value = fromValue;
            toInput.value = toValue;
            rangeInput.value = `${fromValue} - ${toValue}`;
            clearBtn?.classList.remove('hidden');
            renderCA2CRM();
        } else {
            startLabel.innerText = 'Từ ngày';
            endLabel.innerText = 'Đến ngày';
            fromInput.value = '';
            toInput.value = '';
            rangeInput.value = '';
            clearBtn?.classList.add('hidden');
            renderCA2CRM();
        }
    };

    const instance = PremiumDatePicker.attach(rangeInput, {
        mode: 'range',
        label: 'THOI GIAN LOC',
        onChange: applyRangeState,
        onClear: () => applyRangeState([])
    });

    const clearBtn = document.getElementById('crm-date-clear-btn');
    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            instance?.clear();
        };
    }
}

function initializeCRMDateRangePicker() {
    const rangeInput = document.getElementById('crm-date-range-picker');
    if (!rangeInput || !window.PremiumDatePicker) return;

    const applyRangeState = (dates = []) => {
        const startLabel = document.getElementById('crm-date-start-label');
        const endLabel = document.getElementById('crm-date-end-label');
        const fromInput = document.getElementById('crm-filter-from-date');
        const toInput = document.getElementById('crm-filter-to-date');
        const clearBtn = document.getElementById('crm-date-clear-btn');

        if (!startLabel || !endLabel || !fromInput || !toInput) return;

        if (dates.length === 1) {
            const fromValue = PremiumDatePicker.formatDate(dates[0], 'Y-m-d');
            startLabel.innerText = PremiumDatePicker.formatDate(dates[0], 'd/m/Y');
            startLabel.classList.remove('opacity-70');
            startLabel.classList.add('text-white');
            endLabel.innerText = 'Đến ngày';
            endLabel.classList.add('text-orange-400');
            fromInput.value = fromValue;
            toInput.value = '';
            rangeInput.value = fromValue;
            clearBtn?.classList.remove('hidden');
        } else if (dates.length === 2) {
            const fromValue = PremiumDatePicker.formatDate(dates[0], 'Y-m-d');
            const toValue = PremiumDatePicker.formatDate(dates[1], 'Y-m-d');
            startLabel.innerText = PremiumDatePicker.formatDate(dates[0], 'd/m/Y');
            startLabel.classList.remove('opacity-70');
            startLabel.classList.add('text-white');
            endLabel.innerText = PremiumDatePicker.formatDate(dates[1], 'd/m/Y');
            endLabel.classList.remove('text-orange-400');
            endLabel.classList.add('text-white');
            fromInput.value = fromValue;
            toInput.value = toValue;
            rangeInput.value = `${fromValue} - ${toValue}`;
            clearBtn?.classList.remove('hidden');
            renderCA2CRM();
        } else {
            startLabel.innerText = 'Từ ngày';
            endLabel.innerText = 'Đến ngày';
            startLabel.classList.add('opacity-70');
            startLabel.classList.remove('text-white');
            endLabel.classList.add('opacity-70');
            endLabel.classList.remove('text-orange-400', 'text-white');
            fromInput.value = '';
            toInput.value = '';
            rangeInput.value = '';
            clearBtn?.classList.add('hidden');
            renderCA2CRM();
        }
    };

    const instance = PremiumDatePicker.attach(rangeInput, {
        mode: 'range',
        label: 'THỜI GIAN LỌC',
        onChange: applyRangeState,
        onClear: () => applyRangeState([])
    });

    const clearBtn = document.getElementById('crm-date-clear-btn');
    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            instance?.clear();
        };
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
let CRM_PRICE_LIST = []; // Now an array of objects
let pricingCacheTime = 0;



function refreshPricingUI() {
    const crmView = document.getElementById('view-ca2-crm');
    if (crmView && !crmView.classList.contains('hidden')) {
        updateCRMPackages();
    }
    const pricingView = document.getElementById('view-settings-pricing');
    if (pricingView && !pricingView.classList.contains('hidden')) {
        renderPricingTable();
    }
    if (window.quoteManagerInstance) {
        window.quoteManagerInstance.populateServices();
    }
}

function getCRMPrice(service, type, pkg) {
    if (!service) return 0;
    
    // Phần 3: Logic Áp dụng
    const match = CRM_PRICE_LIST.find(p => 
        p.service_name === service && 
        (p.package_name === pkg || (p.package_name.includes(type) && p.package_name.includes(pkg)))
    );
    
    if (match) return match.price;

    // Fallback search
    const results = CRM_PRICE_LIST.filter(p => p.service_name.includes(service));
    if (results.length > 0) {
        const byPkg = results.find(p => p.package_name.includes(pkg) || p.duration_months == pkg.replace(/\D/g, ''));
        if (byPkg) return byPkg.price;
    }

    return 0;
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
        cksSection.style.display = serviceVal.includes('CKS') ? 'block' : 'none';
    }
    
    if (serviceVal.includes('HDDT') || serviceVal.includes('Hóa đơn')) {
        ['300 số', '500 số', '1000 số', '2000 số', '5000 số', '10000 số'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        if (!defaultVal || !defaultVal.includes('số')) defaultVal = '500 số';
    } else if (serviceVal.includes('CKS')) {
        const cksType = document.getElementById('ca2-crm-cks-type')?.value || 'cap_moi';
        updateCKSDurationByType(cksType, defaultVal);
        return; 
    } else if (serviceVal.includes('EBH') || serviceVal.includes('Bảo hiểm')) {
        const variant = serviceVal.includes('Gia hạn dùng thử') ? 'gia_han_thu' : (serviceVal.includes('Gia hạn') ? 'gia_han' : 'cap_moi');
        updateGenericDurationOptions(variant, defaultVal);
        return;
    } else {
        ['1 năm', '2 năm', '3 năm', '4 năm', '5 năm'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v.replace('năm', 'Năm')}</option>`;
        });
        if (!defaultVal || defaultVal.includes('số')) defaultVal = '1 năm';
    }
    durationSelect.value = defaultVal;
    updateCRMBonusMonths();
}

function updateGenericDurationOptions(variant, defaultVal = '') {
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!durationSelect) return;
    durationSelect.innerHTML = '';
    
    let bonus = variant === 'gia_han_thu' ? 6 : 3;
    let options = [
        { val: '1 năm', text: `1 Năm (+${bonus} tháng)` },
        { val: '2 năm', text: `2 Năm (+${bonus * 2} tháng)` },
        { val: '3 năm', text: `3 Năm (+${bonus * 3} tháng)` }
    ];
    
    options.forEach(opt => {
        durationSelect.innerHTML += `<option value="${opt.val}">${opt.text}</option>`;
    });
    
    durationSelect.value = defaultVal || '1 năm';
    updateCRMBonusMonths();
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
    updateCRMBonusMonths();
}

function updateCRMBonusMonths() {
    const serviceVal = document.getElementById('ca2-crm-service').value;
    const durationVal = document.getElementById('ca2-crm-duration').value;
    const compensateInput = document.getElementById('ca2-crm-compensate');
    if (!compensateInput) return;

    let bonus = 0;
    const years = parseInt(durationVal) || 0;

    // Bonus logic based on USER request:
    // Cấp mới 1 năm -> +3 tháng
    // Gia hạn 1 năm -> +3 tháng
    // Gia hạn dùng thử 1 năm -> +6 tháng (CKS) or +6 tháng (EBH)

    if (serviceVal.includes('CKS') || serviceVal.includes('EBH') || serviceVal.includes('Bảo hiểm')) {
        const isTrial = serviceVal.includes('Gia hạn dùng thử');
        bonus = years * (isTrial ? 6 : 3);
        
        // Special case for CKS trial if years > 1 (optional, keeping User's 1-year rule but scaling)
        if (serviceVal.includes('CKS') && isTrial) {
             if (years === 2) bonus = 9;
             if (years === 3) bonus = 12;
        }
    }

    compensateInput.value = bonus;
    calculatePrice();
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
        
        // Polling logic
        const hasActive = campaigns.some(c => c.status === 'Đang gửi' || c.status === 'Đang hàng đợi' || c.status === 'Đang xử lý');
        if (hasActive) {
            loadDashboardStats();
            if (!window.campaignInterval) window.campaignInterval = setInterval(loadRecentCampaigns, 5000);
        } else if (window.campaignInterval) {
            clearInterval(window.campaignInterval);
            window.campaignInterval = null;
            loadDashboardStats();
        }

        const renderItem = c => {
            const successPct = c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
            const isDone = c.status === 'Hoàn thành';
            const isRunning = c.status === 'Đang gửi' || c.status === 'Đang hàng đợi';
            const badgeType = isDone ? 'badge-done' : (isRunning ? 'badge-running' : 'badge-pending');
            const statusLabel = isRunning ? 'Đang gửi...' : c.status;

            return `
                <div class="group relative overflow-hidden bg-white/2 hover:bg-white/5 border border-white/5 rounded-2xl p-4 transition-all duration-300 cursor-pointer flex items-center gap-4" onclick="showPage('campaigns')">
                    <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500/10 text-emerald-500' : (isRunning ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500')}">
                        <i class="fas ${isDone ? 'fa-check-circle' : (isRunning ? 'fa-paper-plane animate-pulse' : 'fa-envelope-open-text')} text-xl"></i>
                    </div>

                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-black text-white truncate group-hover:text-orange-400 transition-colors">${c.name}</h4>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">${new Date(c.created_at).toLocaleDateString('vi-VN')} • ${c.sent_count}/${c.total_recipients} Email</p>
                    </div>

                    <div class="flex flex-col items-end gap-2 shrink-0">
                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${isDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : (isRunning ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20')}">
                            ${statusLabel}
                        </span>
                        
                        <div class="flex items-center gap-2">
                            <div class="w-24 h-1.5 bg-black/40 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-1000 ${isDone ? 'bg-emerald-500' : (isRunning ? 'bg-blue-500' : 'bg-orange-500')}" style="width: ${successPct}%"></div>
                            </div>
                            <span class="text-[10px] font-bold text-gray-400 w-8 text-right">${successPct}%</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 border-l border-white/5 pl-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!isDone && !isRunning ? `
                            <button onclick="event.stopPropagation(); startCampaign('${c.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white transition-all" title="Bắt đầu gửi">
                                <i class="fas fa-play text-xs"></i>
                            </button>
                        ` : ''}
                        <button onclick="event.stopPropagation(); deleteCampaign('${c.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all" title="Xóa">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        };

        const html = campaigns.map(renderItem).join('');
        const emptyHtml = `
            <div class="empty-state">
                <div class="empty-icon">📧</div>
                <div class="empty-title">Chưa có chiến dịch nào</div>
                <div class="empty-desc">Tạo chiến dịch đầu tiên để bắt đầu gửi email</div>
            </div>
        `;

        if (list) list.innerHTML = html || emptyHtml;
        if (listAll) listAll.innerHTML = html || emptyHtml;
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
                <div class="list-item">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isGmailAPI ? 'bg-white' : 'bg-orange-gradient/20 text-orange-500'}">
                            ${isGmailAPI ? '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_Logo.svg" class="w-5 h-5">' : '⚙️'}
                        </div>
                        <div>
                            <div class="list-item-title">${s.senderName}</div>
                            <div class="list-item-meta">${s.senderEmail}</div>
                        </div>
                    </div>
                    <div class="flex justify-center">
                        <span class="badge-premium badge-done">
                            <span class="badge-dot"></span>
                            Đã kết nối
                        </span>
                    </div>
                    <div class="flex justify-center">
                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                            ${isGmailAPI ? 'Gmail API' : 'SMTP Server'}
                        </div>
                    </div>
                    <div class="flex justify-end gap-2">
                        ${!isGmailAPI ? `<button onclick="openEditSenderModal('${s.id}')" class="btn-action-premium text-gray-400 hover:text-white"><i class="fas fa-edit"></i></button>` : ''}
                        <button onclick="deleteSender('${s.id}')" class="btn-delete-ios"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            `;
        }).join('') || `
            <div class="empty-state">
                <div class="empty-icon">🔑</div>
                <div class="empty-title">Chưa có tài khoản nào</div>
                <div class="empty-desc">Kết nối Gmail hoặc SMTP để bắt đầu gửi mail</div>
            </div>
        `;
        
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
    const list = document.getElementById('email-logs-list');
    if (!list) return;

    try {
        const res = await authedFetch('/api/email-logs');
        const logs = await res.json();
        
        if (!logs || logs.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <div class="empty-title">Chưa có dữ liệu báo cáo</div>
                    <div class="empty-desc">Gửi chiến dịch đầu tiên để xem báo cáo chi tiết</div>
                </div>
            `;
            return;
        }

        list.innerHTML = logs.map(log => {
            const isSuccess = log.status === 'success' || log.status === 'Thành công';
            const badgeType = isSuccess ? 'badge-done' : 'badge-pending';
            const statusLabel = isSuccess ? 'Thành công' : 'Thất bại';
            const date = new Date(log.created_at).toLocaleString('vi-VN');

            return `
                <div class="list-item">
                    <div class="flex-1">
                        <div class="list-item-title">${log.recipient_email || log.email || 'N/A'}</div>
                        <div class="list-item-meta">${date}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 font-bold uppercase mb-1">Chiến dịch</div>
                        <div class="text-xs font-bold text-white truncate max-w-[150px]">${log.campaign_name || log.campaigns?.name || 'N/A'}</div>
                    </div>
                    <div class="flex justify-center">
                        <span class="badge-premium ${badgeType}">
                            <span class="badge-dot"></span>
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="flex-1 text-right ml-4">
                        ${!isSuccess ? `<div class="text-[9px] text-red-500 font-medium italic line-clamp-1" title="${log.error_message || ''}">${log.error_message || 'Lỗi không xác định'}</div>` : '<div class="text-[9px] text-green-500/50">OK</div>'}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load Email Logs Error:', e);
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

// --- UI/Logic Overrides: CRM filters, package sync, campaign/sender/report redesign ---
function renderCA2CRM() {
    const listContainer = document.getElementById('ca2-crm-list');
    if (!listContainer) return;

    const filterType = document.getElementById('crm-filter-service').value;
    const filterYear = document.getElementById('crm-filter-year')?.value || 'all';
    const filterMonth = document.getElementById('crm-filter-month')?.value || 'all';
    const sortOrder = document.getElementById('ca2-crm-sort-order')?.value || 'newest';
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';
    const fromDateStr = document.getElementById('crm-filter-from-date')?.value;
    const toDateStr = document.getElementById('crm-filter-to-date')?.value;

    let filtered = [...currentCRMData];

    if (filterType !== 'all') {
        filtered = filtered.filter(c => matchesCRMServiceFilter(c.service_type, filterType));
    }
    if (filterYear !== 'all') {
        filtered = filtered.filter(c => c.expired_date && new Date(c.expired_date).getFullYear().toString() === filterYear);
    }
    if (filterMonth !== 'all') {
        filtered = filtered.filter(c => c.expired_date && (new Date(c.expired_date).getMonth() + 1).toString() === filterMonth);
    }
    if (fromDateStr || toDateStr) {
        const fromD = fromDateStr ? new Date(fromDateStr) : null;
        const toD = toDateStr ? new Date(toDateStr) : null;
        if (fromD) fromD.setHours(0, 0, 0, 0);
        if (toD) toD.setHours(23, 59, 59, 999);
        filtered = filtered.filter(c => {
            if (!c.expired_date) return false;
            const expD = new Date(c.expired_date);
            if (fromD && expD < fromD) return false;
            if (toD && expD > toD) return false;
            return true;
        });
    }
    if (search) {
        filtered = filtered.filter(c =>
            (c.mst && c.mst.toLowerCase().includes(search)) ||
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    let activeTotal = 0;
    let expiredTotal = 0;
    let activeCnt = 0;
    let expiringCnt = 0;
    let expiredCnt = 0;

    currentCRMData.forEach(c => {
        const days = calculateRemainingDays(c.expired_date);
        if (days < 0) {
            expiredTotal++;
            expiredCnt++;
        } else {
            activeTotal++;
            if (days <= 60) expiringCnt++;
            else activeCnt++;
        }
    });

    filtered = filtered.filter(c => currentCRMTab === 'active'
        ? calculateRemainingDays(c.expired_date) >= 0
        : calculateRemainingDays(c.expired_date) < 0
    );

    const totalEl = document.getElementById('ca2-crm-total');
    const activeEl = document.getElementById('ca2-crm-active');
    const expiringEl = document.getElementById('ca2-crm-expiring');
    const expiredEl = document.getElementById('ca2-crm-expired');
    const tabActiveCountEl = document.getElementById('count-crm-active-tab');
    const tabExpiredCountEl = document.getElementById('count-crm-expired-tab');

    if (totalEl) totalEl.innerText = currentCRMData.length;
    if (activeEl) activeEl.innerText = activeCnt;
    if (expiringEl) expiringEl.innerText = expiringCnt;
    if (expiredEl) expiredEl.innerText = expiredCnt;
    if (tabActiveCountEl) tabActiveCountEl.innerText = activeTotal;
    if (tabExpiredCountEl) tabExpiredCountEl.innerText = expiredTotal;

    if (sortOrder === 'newest') {
        filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (sortOrder === 'soonest') {
        filtered.sort((a, b) => new Date(a.expired_date || 0) - new Date(b.expired_date || 0));
    } else if (sortOrder === 'latest') {
        filtered.sort((a, b) => new Date(b.expired_date || 0) - new Date(a.expired_date || 0));
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon text-5xl mb-4">ðŸ“‹</div>
                <div class="empty-title text-xl font-bold text-white mb-2">KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u</div>
                <div class="empty-desc text-gray-500 text-sm mb-6">Thá»­ thay Ä‘á»•i bá»™ lá»c hoáº·c tÃ¬m kiáº¿m láº¡i.</div>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(c => {
        const daysLeft = calculateRemainingDays(c.expired_date);
        const isExpired = daysLeft < 0;
        const statusLabel = isExpired ? 'ÄÃ£ háº¿t háº¡n' : `CÃ²n ${daysLeft} ngÃ y`;

        return `
            <div class="bg-glass p-5 rounded-2xl border ${isExpired ? 'border-red-500/30' : 'border-white/10 hover:border-orange-500/30'} flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:scale-[1.01] cursor-pointer mb-3 relative overflow-hidden group" onclick="editCRM('${c.id}')">
                ${isExpired ? '<div class="absolute inset-0 bg-red-500/5 pointer-events-none"></div>' : ''}
                <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-all pointer-events-none"></div>
                <div class="flex-1 relative z-10">
                    <div class="text-base font-black text-white mb-1 drop-shadow-md">${c.company_name || 'N/A'}</div>
                    <div class="text-xs font-bold text-gray-400 flex items-center gap-2">
                        <span class="text-orange-400"><i class="fas fa-hashtag"></i> ${c.mst || '---'}</span>
                        <span class="text-white/20">â€¢</span>
                        <span class="text-blue-400"><i class="fas fa-layer-group"></i> ${c.service_type || 'Dá»‹ch vá»¥'}</span>
                    </div>
                </div>
                <div class="text-center relative z-10 bg-black/30 px-5 py-2.5 rounded-xl border border-white/5">
                    <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">NgÃ y háº¿t háº¡n</div>
                    <div class="text-sm font-black ${isExpired ? 'text-red-400' : 'text-white'}">${formatDate(c.expired_date)}</div>
                </div>
                <div class="flex justify-center relative z-10 min-w-[130px]">
                    <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${isExpired ? 'bg-red-500/10 text-red-500 border-red-500/20' : (daysLeft <= 60 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20')} shadow-lg flex items-center gap-1.5">
                        ${isExpired ? '<i class="fas fa-exclamation-circle fa-beat-fade"></i>' : '<i class="fas fa-check-circle"></i>'} ${statusLabel}
                    </span>
                </div>
                <div class="flex justify-end gap-2 relative z-10">
                    <button onclick="event.stopPropagation(); deleteCRM('${c.id}')" class="w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500 hover:text-white text-gray-400 border border-white/10 transition-all flex items-center justify-center shadow-lg active:scale-95">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (typeof refreshCustomSelects === 'function') refreshCustomSelects();
}



async function createCampaignFromCA2CRM() {
    const filterType = document.getElementById('crm-filter-service').value;
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';

    let recipients = currentCRMData.filter(c => c.email);
    if (filterType !== 'all') recipients = recipients.filter(c => matchesCRMServiceFilter(c.service_type, filterType));
    if (search) {
        recipients = recipients.filter(c =>
            (c.mst && c.mst.toLowerCase().includes(search)) ||
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    if (recipients.length === 0) {
        alert('KhÃ´ng tÃ¬m tháº¥y khÃ¡ch hÃ ng nÃ o cÃ³ email há»£p lá»‡.');
        return;
    }

    if (!confirm(`Táº¡o chiáº¿n dá»‹ch gá»­i mail cho ${recipients.length} khÃ¡ch hÃ ng?`)) return;

    try {
        const sendersRes = await authedFetch('/api/senders');
        const senders = await sendersRes.json();
        if (!senders || !senders.length) {
            alert('Vui lÃ²ng káº¿t ná»‘i tÃ i khoáº£n Gmail trÆ°á»›c khi gá»­i mail.');
            showPage('senders');
            return;
        }

        const senderId = senders[0].id;
        const campaignData = {
            name: `CRM Bulk - ${formatDate(new Date())}`,
            subject: 'Thông báo dịch vụ CA2',
            senderAccountId: senderId,
            recipients,
            template: document.getElementById('input-template')?.innerHTML || '<p>Kính chào Quý khách,</p>'
        };

        const res = await authedFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(campaignData)
        });

        if (res.ok) {
            alert('ÄÃ£ táº¡o chiáº¿n dá»‹ch tá»« bá»™ lá»c CRM.');
            showPage('campaigns');
        } else {
            const err = await res.json();
            alert('Lá»—i: ' + (err.error || 'KhÃ´ng rÃµ'));
        }
    } catch (e) {
        alert('Lá»—i káº¿t ná»‘i server');
    }
}

function formatRelativeTime(dateValue) {
    if (!dateValue) return 'Chưa có thời gian';
    const diffMs = Date.now() - new Date(dateValue).getTime();
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} ngày trước`;
}

function getToneClass(tone) {
    if (tone === 'success') return 'ios-tone-success';
    if (tone === 'warning') return 'ios-tone-warning';
    if (tone === 'danger') return 'ios-tone-danger';
    return 'ios-tone-neutral';
}

function getCampaignStatusMeta(status) {
    const normalized = normalizeText(status);
    if (normalized.includes('hoan thanh')) return { tone: 'success', label: 'Hoàn thành' };
    if (normalized.includes('dang gui') || normalized.includes('dang hang doi') || normalized.includes('dang xu ly')) return { tone: 'warning', label: 'Đang chạy' };
    if (normalized.includes('loi') || normalized.includes('that bai')) return { tone: 'danger', label: 'Có lỗi' };
    return { tone: 'neutral', label: status || 'Chờ xử lý' };
}

function getLogStatusMeta(status) {
    const normalized = normalizeText(status);
    if (normalized.includes('success') || normalized.includes('thanh cong') || normalized === 'sent') return { tone: 'success', label: 'Thành công' };
    if (normalized.includes('pending') || normalized.includes('retry') || normalized.includes('queue')) return { tone: 'warning', label: 'Đang chờ' };
    if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('that bai')) return { tone: 'danger', label: 'Thất bại' };
    return { tone: 'neutral', label: status || 'Không rõ' };
}

function renderCampaignCard(campaign, compact = false) {
    const total = Math.max(0, campaign.total_recipients || 0);
    const sent = Math.max(0, campaign.sent_count || 0);
    const failed = Math.max(0, campaign.error_count || 0);
    const successPct = total > 0 ? Math.round((sent / total) * 100) : 0;
    const statusMeta = getCampaignStatusMeta(campaign.status);
    const isRunning = statusMeta.tone === 'warning';
    const isDone = statusMeta.tone === 'success';

    return `
        <div class="ios-campaign-card ${compact ? 'ios-campaign-card-compact' : ''}">
            <div class="ios-campaign-main" onclick="showPage('campaigns')">
                <div class="ios-campaign-head">
                    <div>
                        <h4 class="ios-campaign-title">${campaign.name || 'Chiến dịch chưa đặt tên'}</h4>
                        <p class="ios-campaign-meta">${formatDate(campaign.created_at)} • ${formatRelativeTime(campaign.created_at)}</p>
                    </div>
                    <span class="ios-status-pill ${getToneClass(statusMeta.tone)}">${statusMeta.label}</span>
                </div>
                <div class="ios-campaign-stats">
                    <div><span>Người nhận</span><strong>${total}</strong></div>
                    <div><span>Đã gửi</span><strong>${sent}</strong></div>
                    <div><span>Lỗi</span><strong>${failed}</strong></div>
                </div>
                <div class="ios-progress-wrap">
                    <div class="ios-progress-bar">
                        <div class="ios-progress-fill ${getToneClass(statusMeta.tone)}" style="width:${successPct}%"></div>
                    </div>
                    <span class="ios-progress-label">${successPct}% hoàn tất</span>
                </div>
            </div>
            <div class="ios-campaign-actions">
                ${!isDone && !isRunning ? `<button onclick="event.stopPropagation(); startCampaign('${campaign.id}')" class="ios-icon-btn ios-icon-btn-primary" title="Bắt đầu gửi"><i class="fas fa-play"></i></button>` : ''}
                <button onclick="event.stopPropagation(); deleteCampaign('${campaign.id}')" class="ios-icon-btn ios-icon-btn-danger" title="Xóa chiến dịch"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;
}

async function loadRecentCampaigns() {
    const list = document.getElementById('campaign-list');
    const listAll = document.getElementById('campaign-list-all');
    if (!list && !listAll) return;

    try {
        const res = await authedFetch('/api/campaigns');
        const campaigns = await res.json();
        currentCampaignData = Array.isArray(campaigns) ? campaigns : [];

        const hasActive = currentCampaignData.some(c => {
            const tone = getCampaignStatusMeta(c.status).tone;
            return tone === 'warning';
        });

        if (hasActive) {
            loadDashboardStats();
            if (!window.campaignInterval) window.campaignInterval = setInterval(loadRecentCampaigns, 5000);
        } else if (window.campaignInterval) {
            clearInterval(window.campaignInterval);
            window.campaignInterval = null;
            loadDashboardStats();
        }

        const emptyHtml = `
            <div class="empty-state">
                <div class="empty-icon">ðŸ“§</div>
                <div class="empty-title">ChÆ°a cÃ³ chiáº¿n dá»‹ch nÃ o</div>
                <div class="empty-desc">Táº¡o chiáº¿n dá»‹ch Ä‘áº§u tiÃªn Ä‘á»ƒ báº¯t Ä‘áº§u gá»­i email</div>
            </div>
        `;

        if (list) list.innerHTML = currentCampaignData.slice(0, 5).map(c => renderCampaignCard(c, true)).join('') || emptyHtml;
        if (listAll) listAll.innerHTML = currentCampaignData.map(c => renderCampaignCard(c, false)).join('') || emptyHtml;
    } catch (e) {
        console.error('Error loading campaigns:', e);
    }
}

function renderSenderCard(sender) {
    const isGmailAPI = sender.smtpHost === 'oauth2.google' || sender.smtpHost === 'oauth2.googleapis.com';
    return `
        <div class="ios-sender-card">
            <div class="ios-sender-main">
                <div class="ios-sender-avatar ${isGmailAPI ? 'ios-sender-avatar-google' : ''}">
                    ${isGmailAPI ? '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_Logo.svg" class="w-6 h-6" alt="Google">' : '<i class="fas fa-envelope-open-text"></i>'}
                </div>
                <div class="ios-sender-copy">
                    <h4>${sender.senderName || 'Tài khoản gửi mail'}</h4>
                    <p>${sender.senderEmail || 'Chưa có email'}</p>
                </div>
            </div>
            <div class="ios-sender-side">
                <span class="ios-status-pill ${getToneClass(isGmailAPI ? 'success' : 'neutral')}">${isGmailAPI ? 'Gmail API' : 'SMTP thủ công'}</span>
                <div class="ios-sender-actions">
                    ${!isGmailAPI ? `<button onclick="openEditSenderModal('${sender.id}')" class="ios-icon-btn" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>` : ''}
                    <button onclick="deleteSender('${sender.id}')" class="ios-icon-btn ios-icon-btn-danger" title="Xóa"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        </div>
    `;
}

async function loadSenders() {
    const list = document.getElementById('sender-list');
    const countEl = document.getElementById('sender-count');
    if (!list) return;

    try {
        const res = await authedFetch('/api/senders');
        const senders = await res.json();
        currentSenderData = Array.isArray(senders) ? senders : [];

        if (countEl) countEl.innerText = `Tổng cộng: ${currentSenderData.length} tài khoản`;
        list.innerHTML = currentSenderData.map(renderSenderCard).join('') || `
            <div class="empty-state">
                <div class="empty-icon">ðŸ”‘</div>
                <div class="empty-title">ChÆ°a cÃ³ tÃ i khoáº£n nÃ o</div>
                <div class="empty-desc">Káº¿t ná»‘i Gmail hoáº·c SMTP Ä‘á»ƒ báº¯t Ä‘áº§u gá»­i mail</div>
            </div>
        `;

        const select = document.getElementById('select-sender');
        if (select) {
            select.innerHTML = '<option value="">-- Chá»n tÃ i khoáº£n gá»­i --</option>' +
                currentSenderData.map(s => `<option value="${s.id}">${s.senderName} (${s.senderEmail})</option>`).join('');
        }
    } catch (e) {
        console.error('Load Senders Error:', e);
    }
}

function renderEmailLogCard(log) {
    const meta = getLogStatusMeta(log.status);
    return `
        <div class="ios-log-card">
            <div class="ios-log-main">
                <div class="ios-log-top">
                    <div>
                        <h4>${log.recipient_email || log.email || 'N/A'}</h4>
                        <p>${log.campaign_name || log.campaigns?.name || 'Không rõ chiến dịch'}</p>
                    </div>
                    <span class="ios-status-pill ${getToneClass(meta.tone)}">${meta.label}</span>
                </div>
                <div class="ios-log-meta">
                    <span><i class="far fa-clock"></i> ${new Date(log.created_at).toLocaleString('vi-VN')}</span>
                    ${log.mst ? `<span><i class="fas fa-hashtag"></i> ${log.mst}</span>` : ''}
                </div>
                <div class="ios-log-note ${meta.tone === 'danger' ? 'ios-log-note-danger' : ''}">
                    ${log.error_message || 'Gửi thành công, không có lỗi phát sinh.'}
                </div>
            </div>
        </div>
    `;
}

async function loadEmailLogs() {
    const list = document.getElementById('email-logs-list');
    if (!list) return;

    try {
        const res = await authedFetch('/api/email-logs');
        const logs = await res.json();
        currentEmailLogs = Array.isArray(logs) ? logs : [];

        if (!currentEmailLogs.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">ðŸ“ˆ</div>
                    <div class="empty-title">ChÆ°a cÃ³ dá»¯ liá»‡u bÃ¡o cÃ¡o</div>
                    <div class="empty-desc">Gá»­i chiáº¿n dá»‹ch Ä‘áº§u tiÃªn Ä‘á»ƒ xem bÃ¡o cÃ¡o chi tiáº¿t</div>
                </div>
            `;
            return;
        }

        const successCount = currentEmailLogs.filter(log => getLogStatusMeta(log.status).tone === 'success').length;
        const failedCount = currentEmailLogs.filter(log => getLogStatusMeta(log.status).tone === 'danger').length;
        const waitingCount = currentEmailLogs.length - successCount - failedCount;

        list.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div class="ios-stat-card">
                    <span class="ios-stat-label">Tổng log</span>
                    <strong class="ios-stat-value">${currentEmailLogs.length}</strong>
                </div>
                <div class="ios-stat-card ios-stat-card-success">
                    <span class="ios-stat-label">Gửi thành công</span>
                    <strong class="ios-stat-value">${successCount}</strong>
                </div>
                <div class="ios-stat-card ios-stat-card-danger">
                    <span class="ios-stat-label">Cần xử lý</span>
                    <strong class="ios-stat-value">${failedCount + waitingCount}</strong>
                </div>
            </div>
            <div class="space-y-3">
                ${currentEmailLogs.map(renderEmailLogCard).join('')}
            </div>
        `;
    } catch (e) {
        console.error('Load Email Logs Error:', e);
    }
}

function exportEmailLogs() {
    if (!currentEmailLogs.length) return;
    let csv = '\uFEFFTime,Email,MST,Campaign,Status,Error\n';

    currentEmailLogs.forEach(log => {
        const time = new Date(log.created_at).toLocaleString('vi-VN');
        const email = log.recipient_email || log.email || '';
        const mst = log.mst || '';
        const campaign = log.campaign_name || log.campaigns?.name || '';
        const status = getLogStatusMeta(log.status).label;
        const error = (log.error_message || '').replace(/,/g, ';');
        csv += `"${time}","${email}","${mst}","${campaign}","${status}","${error}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Email_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// --- Final stability overrides ---
function mapCRMServiceToPricing(val) {
    const normalized = normalizeText(val);
    const transaction = getCRMTransactionForService(val);

    if (normalized.includes('cks')) return { group: 'CKS', transaction };
    if (normalized.includes('remote signing')) return { group: 'RS', transaction: 'all' };
    if (normalized.includes('hoa don dien tu')) return { group: 'eINVOICE', transaction: transaction === 'all' ? 'cap moi' : transaction };
    if (normalized.includes('bao hiem') || normalized.includes('ebh')) return { group: 'EBH', transaction: transaction === 'all' ? 'cap moi' : transaction };
    if (normalized.includes('sign platform')) return { group: 'SP', transaction: 'all' };
    return { group: val, transaction: 'all' };
}

async function loadCRMPrices() {
    try {
        if (!PricingManager.pricingData || PricingManager.pricingData.length === 0) {
            await PricingManager.loadActivePricing();
        }

        CRM_PRICE_LIST = (PricingManager.pricingData || []).map(item => ({
            id: item.id,
            service_name: item.product_group,
            package_name: item.package_name,
            price: item.total_price,
            category: item.subject_type || '',
            is_active: item.is_active,
            product_code: item.product_code,
            duration_months: item.duration_months || extractDurationMonthsFromPackage(item.package_name),
            transaction_type: item.transaction_type || ''
        }));

        // Standardize service names for EBH/BHXH
        CRM_PRICE_LIST.forEach(p => {
            if (p.service_name === 'Bảo hiểm xã hội') p.service_name = 'EBH';
            if (p.service_name === 'Hóa đơn điện tử') p.service_name = 'eINVOICE';
        });

        refreshPricingUI();
    } catch (err) {
        console.error('[CRM] Error loading prices:', err);
    }
}

function updateCRMPackages() {
    const serviceVal = document.getElementById('ca2-crm-service').value;
    const customerType = document.getElementById('ca2-crm-customer-type').value;
    const pkgSelect = document.getElementById('ca2-crm-package');
    if (!pkgSelect) return;

    const oldVal = pkgSelect.value;
    const mapping = mapCRMServiceToPricing(serviceVal);
    const desiredTransaction = normalizeText(mapping.transaction);

    let itemsToDisplay = CRM_PRICE_LIST.filter(p => {
        if (!p.is_active && p.is_active !== undefined) return false;
        const sameGroup = p.service_name === mapping.group;
        const subjectOk = crmCategoryMatches(p.category, customerType);
        const itemTransaction = normalizeText(p.transaction_type || '');
        const transactionOk = desiredTransaction === 'all' || !itemTransaction || itemTransaction.includes(desiredTransaction);
        return sameGroup && subjectOk && transactionOk;
    });

    if (!itemsToDisplay.length && desiredTransaction !== 'all') {
        itemsToDisplay = CRM_PRICE_LIST.filter(p =>
            p.service_name === mapping.group && crmCategoryMatches(p.category, customerType)
        );
    }

    itemsToDisplay.sort((a, b) => {
        const monthDiff = (a.duration_months || 0) - (b.duration_months || 0);
        if (monthDiff !== 0) return monthDiff;
        return (a.price || 0) - (b.price || 0);
    });

    pkgSelect.innerHTML = '';
    if (!itemsToDisplay.length) {
        pkgSelect.innerHTML = '<option value="">Chưa có gói</option>';
        document.getElementById('ca2-crm-amount').value = '0';
        return;
    }

    itemsToDisplay.forEach(p => {
        const opt = document.createElement('option');
        const durationLabel = inferDurationFromPackage(serviceVal, `${p.duration_months || ''} thang ${p.package_name || ''}`);
        opt.value = p.package_name;
        opt.textContent = `${p.package_name} - ${new Intl.NumberFormat('vi-VN').format(p.price || 0)}đ`;
        opt.dataset.price = String(p.price || 0);
        opt.dataset.durationLabel = durationLabel;
        opt.dataset.durationMonths = String(p.duration_months || '');
        opt.dataset.transactionType = p.transaction_type || '';
        opt.dataset.category = p.category || '';
        pkgSelect.appendChild(opt);
    });

    if (oldVal && [...pkgSelect.options].some(o => o.value === oldVal)) pkgSelect.value = oldVal;
    else pkgSelect.selectedIndex = 0;

    const cksTypeInput = document.getElementById('ca2-crm-cks-type');
    if (cksTypeInput) {
        if (desiredTransaction === 'gia han' && normalizeText(serviceVal).includes('dung thu')) cksTypeInput.value = 'gia_han_thu';
        else if (desiredTransaction === 'gia han') cksTypeInput.value = 'gia_han';
        else cksTypeInput.value = 'cap_moi';
    }

    updateCRMDurationOptions();
    syncCRMDurationWithPackage(pkgSelect.value);
    updateCRMBonusMonths();
    calculatePrice();
}

function calculatePrice() {
    const pkgSelect = document.getElementById('ca2-crm-package');
    const amountInput = document.getElementById('ca2-crm-amount');
    if (!pkgSelect || !amountInput) return;

    const selectedOption = pkgSelect.selectedOptions?.[0];
    const optionPrice = parseInt(selectedOption?.dataset?.price || '0', 10);
    amountInput.value = new Intl.NumberFormat('vi-VN').format(optionPrice || 0);
    if (selectedOption) {
        syncCRMDurationWithPackage(selectedOption.value);
    }
}

function renderCA2CRM() {
    const listContainer = document.getElementById('ca2-crm-list');
    if (!listContainer) return;

    const filterType = document.getElementById('crm-filter-service').value;
    const filterYear = document.getElementById('crm-filter-year')?.value || 'all';
    const filterMonth = document.getElementById('crm-filter-month')?.value || 'all';
    const sortOrder = document.getElementById('ca2-crm-sort-order')?.value || 'newest';
    const search = document.getElementById('ca2-crm-search')?.value.toLowerCase() || '';
    const fromDateStr = document.getElementById('crm-filter-from-date')?.value;
    const toDateStr = document.getElementById('crm-filter-to-date')?.value;

    let filtered = [...currentCRMData];
    if (filterType !== 'all') filtered = filtered.filter(c => matchesCRMServiceFilter(c.service_type, filterType));
    if (filterYear !== 'all') filtered = filtered.filter(c => c.expired_date && new Date(c.expired_date).getFullYear().toString() === filterYear);
    if (filterMonth !== 'all') filtered = filtered.filter(c => c.expired_date && String(new Date(c.expired_date).getMonth() + 1) === filterMonth);
    if (fromDateStr || toDateStr) {
        const fromD = fromDateStr ? new Date(fromDateStr) : null;
        const toD = toDateStr ? new Date(toDateStr) : null;
        if (fromD) fromD.setHours(0, 0, 0, 0);
        if (toD) toD.setHours(23, 59, 59, 999);
        filtered = filtered.filter(c => {
            if (!c.expired_date) return false;
            const expD = new Date(c.expired_date);
            if (fromD && expD < fromD) return false;
            if (toD && expD > toD) return false;
            return true;
        });
    }
    if (search) {
        filtered = filtered.filter(c =>
            (c.mst && c.mst.toLowerCase().includes(search)) ||
            (c.company_name && c.company_name.toLowerCase().includes(search))
        );
    }

    let activeTotal = 0;
    let expiredTotal = 0;
    let activeCnt = 0;
    let expiringCnt = 0;
    let expiredCnt = 0;

    currentCRMData.forEach(c => {
        const days = calculateRemainingDays(c.expired_date);
        if (days < 0) {
            expiredTotal++;
            expiredCnt++;
        } else {
            activeTotal++;
            if (days <= 60) expiringCnt++;
            else activeCnt++;
        }
    });

    filtered = filtered.filter(c => currentCRMTab === 'active'
        ? calculateRemainingDays(c.expired_date) >= 0
        : calculateRemainingDays(c.expired_date) < 0
    );

    const totalEl = document.getElementById('ca2-crm-total');
    const activeEl = document.getElementById('ca2-crm-active');
    const expiringEl = document.getElementById('ca2-crm-expiring');
    const expiredEl = document.getElementById('ca2-crm-expired');
    const tabActiveCountEl = document.getElementById('count-crm-active-tab');
    const tabExpiredCountEl = document.getElementById('count-crm-expired-tab');
    if (totalEl) totalEl.innerText = currentCRMData.length;
    if (activeEl) activeEl.innerText = activeCnt;
    if (expiringEl) expiringEl.innerText = expiringCnt;
    if (expiredEl) expiredEl.innerText = expiredCnt;
    if (tabActiveCountEl) tabActiveCountEl.innerText = activeTotal;
    if (tabExpiredCountEl) tabExpiredCountEl.innerText = expiredTotal;

    if (sortOrder === 'newest') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sortOrder === 'soonest') filtered.sort((a, b) => new Date(a.expired_date || 0) - new Date(b.expired_date || 0));
    if (sortOrder === 'latest') filtered.sort((a, b) => new Date(b.expired_date || 0) - new Date(a.expired_date || 0));

    if (!filtered.length) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon text-5xl mb-4">📋</div>
                <div class="empty-title text-xl font-bold text-white mb-2">Không tìm thấy dữ liệu</div>
                <div class="empty-desc text-gray-500 text-sm mb-6">Thử thay đổi bộ lọc hoặc tìm kiếm lại.</div>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(c => {
        const daysLeft = calculateRemainingDays(c.expired_date);
        const isExpired = daysLeft < 0;
        const statusLabel = isExpired ? 'Đã hết hạn' : `Còn ${daysLeft} ngày`;
        return `
            <div class="bg-glass p-5 rounded-2xl border ${isExpired ? 'border-red-500/30' : 'border-white/10 hover:border-orange-500/30'} flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:scale-[1.01] cursor-pointer mb-3 relative overflow-hidden group" onclick="editCRM('${c.id}')">
                ${isExpired ? '<div class="absolute inset-0 bg-red-500/5 pointer-events-none"></div>' : ''}
                <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-all pointer-events-none"></div>
                <div class="flex-1 relative z-10">
                    <div class="text-base font-black text-white mb-1 drop-shadow-md">${c.company_name || 'N/A'}</div>
                    <div class="text-xs font-bold text-gray-400 flex items-center gap-2">
                        <span class="text-orange-400"><i class="fas fa-hashtag"></i> ${c.mst || '---'}</span>
                        <span class="text-white/20">•</span>
                        <span class="text-blue-400"><i class="fas fa-layer-group"></i> ${c.service_type || 'Dịch vụ'}</span>
                    </div>
                </div>
                <div class="text-center relative z-10 bg-black/30 px-5 py-2.5 rounded-xl border border-white/5">
                    <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">NGAY HET HAN</div>
                    <div class="text-sm font-black ${isExpired ? 'text-red-400' : 'text-white'}">${formatDate(c.expired_date)}</div>
                </div>
                <div class="flex justify-center relative z-10 min-w-[130px]">
                    <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${isExpired ? 'bg-red-500/10 text-red-500 border-red-500/20' : (daysLeft <= 60 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20')} shadow-lg flex items-center gap-1.5">
                        ${isExpired ? '<i class="fas fa-exclamation-circle fa-beat-fade"></i>' : '<i class="fas fa-check-circle"></i>'} ${statusLabel}
                    </span>
                </div>
                <div class="flex justify-end gap-2 relative z-10">
                    <button onclick="event.stopPropagation(); deleteCRM('${c.id}')" class="w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500 hover:text-white text-gray-400 border border-white/10 transition-all flex items-center justify-center shadow-lg active:scale-95">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (typeof refreshCustomSelects === 'function') refreshCustomSelects();
}

function refreshSettingsStaticText() {
    const view = document.getElementById('view-settings');
    if (!view) return;

    // Title & Subtitle handled by HTML template now
    
    // Ensure tab buttons maintain their labels if they were somehow cleared
    const tabButtons = [
        ['tab-settings-account', 'Tài khoản'],
        ['tab-settings-interface', 'Giao diện'],
        ['tab-settings-system', 'Hệ thống']
    ];
    tabButtons.forEach(([id, label]) => {
        const btn = document.getElementById(id);
        if (btn) {
            const span = btn.querySelector('span');
            if (span) span.textContent = label;
        }
    });
}




if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        refreshSettingsStaticText();
        initializeCRMDateRangePicker();
    });
} else {
    refreshSettingsStaticText();
    initializeCRMDateRangePicker();
}

// --- Settings Module Support Functions ---

function switchSettingsTab(tabId) {
    console.log('[Settings] Switching to tab:', tabId);
    
    // Toggle Panels
    document.querySelectorAll('[id^="settings-tab-"]').forEach(el => {
        const isActive = el.id === `settings-tab-${tabId}`;
        el.classList.toggle('hidden', !isActive);
        if (isActive) {
            el.classList.add('settings-tab-content'); // Ensure animation runs
        }
    });

    // Toggle Tab Buttons
    document.querySelectorAll('.tab-ios[id^="tab-settings-"]').forEach(btn => {
        const isActive = btn.id === `tab-settings-${tabId}`;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}


async function loadSettingsPage() {
    if (!currentUser) return;
    if (typeof refreshSettingsStaticText === 'function') refreshSettingsStaticText();

    // Populate Account Info
    const avatar = document.getElementById('settings-user-avatar');
    const name = document.getElementById('settings-user-name');
    const email = document.getElementById('settings-user-email');
    const id = document.getElementById('settings-user-id');
    const roleBadge = document.getElementById('settings-user-role-badge');
    const lastLogin = document.getElementById('settings-last-login');

    const displayName = getDisplayName(currentUser);

    if (avatar) avatar.innerText = displayName.charAt(0).toUpperCase();
    if (name) name.innerText = displayName;
    if (email) email.innerText = currentUser.email;
    if (id) id.innerText = currentUser.id;
    if (lastLogin) lastLogin.innerText = new Date(currentUser.last_sign_in_at).toLocaleString('vi-VN');
    
    if (roleBadge) {
        roleBadge.innerText = `Vai trò: ${currentUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}`;
        roleBadge.className = `settings-role-badge ${
            currentUser.role === 'admin' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
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

    // Populate Pricing Config (Legacy editor - hidden but keeping for now)
    const pricingEl = document.getElementById('settings-pricing-json');
    if (pricingEl) {
        pricingEl.value = JSON.stringify(CRM_PRICE_LIST, null, 4);
    }
}

// --- NEW PRICING MANAGEMENT LOGIC (Phần 1, 6, 7, 8) ---
function renderPricingTable() {
    const tbody = document.getElementById('pricing-table-body');
    const filter = document.getElementById('pricing-service-filter').value;
    if (!tbody) return;

    tbody.innerHTML = '';
    
    const displayData = filter === 'all' ? CRM_PRICE_LIST : CRM_PRICE_LIST.filter(p => p.service_name === filter);

    displayData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'group hover:bg-white/2 transition-all duration-150';
        tr.innerHTML = `
            <td class="px-8 py-4">
                <div class="text-sm font-black text-white">${item.service_name}</div>
                <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">${item.package_name}</div>
            </td>
            <td class="px-8 py-4 text-center">
                <span class="px-3 py-1 rounded-lg bg-blue-500/10 text-[10px] font-black text-blue-400 uppercase tracking-tighter">
                    ${item.customer_group || 'Công ty'}
                </span>
            </td>
            <td class="px-8 py-4 text-center">
                <span class="px-3 py-1 rounded-lg bg-white/5 text-xs font-bold text-gray-300">${item.duration_months} tháng</span>
            </td>
            <td class="px-8 py-4 text-right">
                <input type="text" value="${new Intl.NumberFormat('vi-VN').format(item.price)}" 
                       onblur="updatePricingPrice(${index}, this.value)" 
                       onkeydown="if(event.key==='Enter') this.blur()"
                       class="bg-transparent border-b border-transparent hover:border-orange-500/30 focus:border-orange-500 text-right text-sm font-black text-orange-400 outline-none w-32 transition-all">
            </td>
            <td class="px-8 py-4 text-xs text-gray-400 max-w-xs truncate">${item.description || '-'}</td>
            <td class="px-8 py-4 text-center">
                <button onclick="togglePricingStatus(${index})" class="w-10 h-6 rounded-full relative transition-all ${item.is_active ? 'bg-emerald-500' : 'bg-gray-700'}">
                    <div class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all ${item.is_active ? 'translate-x-4' : ''}"></div>
                </button>
            </td>
            <td class="px-8 py-4 text-right">
                <button onclick="deletePricingItem('${item.id || index}')" class="text-gray-600 hover:text-red-500 transition-all p-2"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updatePricingPrice(index, val) {
    const raw = val.replace(/\D/g, '');
    const price = parseInt(raw);
    if (isNaN(price) || price <= 0) {
        showToast('Giá phải là số dương!', 'error');
        renderPricingTable();
        return;
    }
    CRM_PRICE_LIST[index].price = price;
    showToast(`Đã cập nhật giá: ${new Intl.NumberFormat('vi-VN').format(price)}đ`, 'success');
}

function togglePricingStatus(index) {
    CRM_PRICE_LIST[index].is_active = !CRM_PRICE_LIST[index].is_active;
    renderPricingTable();
}

function setPricingGroup(group) {
    document.getElementById('add-pricing-group').value = group;
    // UI Update
    document.getElementById('btn-group-company').classList.toggle('active', group === 'Công ty');
    document.getElementById('btn-group-individual').classList.toggle('active', group === 'Cá nhân/HKD');
}

function openAddPricingModal() {
    document.getElementById('modal-add-pricing').classList.remove('hidden');
    setPricingGroup('Công ty'); // Default
}

function closeAddPricingModal() {
    document.getElementById('modal-add-pricing').classList.add('hidden');
}

async function handleAddPricingSubmit() {
    const service = document.getElementById('add-pricing-service').value;
    const group = document.getElementById('add-pricing-group').value; // New field
    const pkg = document.getElementById('add-pricing-package').value;
    const duration = parseInt(document.getElementById('add-pricing-duration').value);
    const price = parseInt(document.getElementById('add-pricing-price').value);
    const desc = document.getElementById('add-pricing-desc').value;

    if (!pkg || isNaN(price) || price <= 0) {
        showToast('Vui lòng nhập đầy đủ thông tin hợp lệ!', 'error');
        return;
    }

    // Safety: No duplicate for same service/package/duration/group
    const duplicate = CRM_PRICE_LIST.find(p => p.service_name === service && p.package_name === pkg && p.duration_months === duration && p.customer_group === group);
    if (duplicate) {
        showToast('Gói này đã tồn tại!', 'warning');
        return;
    }

    const newItem = {
        id: 'new-' + Date.now(),
        service_name: service,
        customer_group: group,
        package_name: pkg,
        duration_months: duration || 0,
        price: price,
        description: desc,
        is_active: true
    };

    CRM_PRICE_LIST.push(newItem);
    showToast('Đã thêm gói mới. Nhấn "Lưu thay đổi" để đồng bộ database!', 'success');
    closeAddPricingModal();
    renderPricingTable();
}

async function deletePricingItem(idOrIndex) {
    if (!confirm('Bạn có chắc muốn xóa gói này?')) return;
    
    if (typeof idOrIndex === 'string' && idOrIndex.length > 5) {
        try {
            const res = await authedFetch(`/api/crm/prices/${idOrIndex}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            CRM_PRICE_LIST = CRM_PRICE_LIST.filter(p => p.id !== idOrIndex);
        } catch (e) {
            showToast('Lỗi khi xóa: ' + e.message, 'error');
            return;
        }
    } else {
        CRM_PRICE_LIST.splice(idOrIndex, 1);
    }
    
    renderPricingTable();
    showToast('Đã xóa gói thành công', 'success');
}

async function saveAllPricing() {
    if (currentUser.role !== 'admin') {
        showToast('Chỉ Admin mới có quyền cập nhật bảng giá!', 'error');
        return;
    }

    try {
        const response = await authedFetch('/api/crm/prices', {
            method: 'POST',
            body: JSON.stringify(CRM_PRICE_LIST)
        });

        if (!response.ok) throw new Error('Failed to save prices');
        
        const result = await response.json();
        CRM_PRICE_LIST = result.data;
        
        // Refresh cache
        localStorage.setItem('crm_pricing_data', JSON.stringify(CRM_PRICE_LIST));
        localStorage.setItem('crm_pricing_time', Date.now().toString());

        showToast('Đã đồng bộ toàn bộ bảng giá hệ thống!', 'success');
        updateCRMPackages();
    } catch (err) {
        showToast('Lỗi khi lưu: ' + err.message, 'error');
    }
}

async function resetPricingToDefault() {
    if (!confirm('Bạn muốn reset bảng giá về mặc định (Xóa sạch DB và dùng fallback)?')) return;
    localStorage.removeItem('crm_pricing_data');
    localStorage.removeItem('crm_pricing_time');
    location.reload();
}


function updateThemeSelectorUI(theme) {
    const darkBtn = document.getElementById('theme-btn-dark');
    const lightBtn = document.getElementById('theme-btn-light');

    darkBtn?.classList.toggle('active', theme === 'dark');
    lightBtn?.classList.toggle('active', theme === 'light');
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
                <td class="px-6 py-1.5">
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
                <td class="px-6 py-1.5">
                    <p class="text-xs font-medium text-gray-400">${new Date(u.created_at).toLocaleDateString('vi-VN')}</p>
                </td>
                <td class="px-6 py-1.5 text-right">
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

function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        // If it's a premium select modal, refresh them
        if (typeof refreshCustomSelects === 'function') refreshCustomSelects();
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}
