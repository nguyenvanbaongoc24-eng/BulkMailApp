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
let _mojibakeObserver = null;

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
            c.status === '\u0110ang g\u1EEDi' || c.status === '\u0110ang h\u00E0ng \u0111\u1EE3i' || c.status === '\u0110ang x\u1EED l\u00FD'
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
    alert('PhiÃƒÆ’Ã‚Âªn lÃƒÆ’Ã‚Â m viÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡c Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â£ hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n do khÃƒÆ’Ã‚Â´ng hoÃƒÂ¡Ã‚ÂºÃ‚Â¡t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng trong 10 phÃƒÆ’Ã‚Âºt. Vui lÃƒÆ’Ã‚Â²ng Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p lÃƒÂ¡Ã‚ÂºÃ‚Â¡i.');
}

function getMojibakeScore(value) {
    return ((value || '').match(/(?:ÃƒÆ’.|Ãƒâ€š.|Ãƒâ€ž.|Ãƒâ€ .|ÃƒÂ¡Ã‚Âº|ÃƒÂ¡Ã‚Â»|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|ÃƒÂ¯Ã‚Â¿Ã‚Â½|ÃƒÂ°Ã…Â¸|ÃƒÂ¢Ã…â€œ|ÃƒÂ¢Ã…Â¡)/g) || []).length;
}

function looksMojibake(value) {
    return typeof value === 'string' && getMojibakeScore(value) > 0;
}

function decodeMojibake(value) {
    if (!looksMojibake(value)) return value;

    let current = value;
    for (let i = 0; i < 2; i += 1) {
        let decoded = current;

        try {
            decoded = decodeURIComponent(escape(current));
        } catch (_) {
            try {
                const bytes = Uint8Array.from(current, ch => ch.charCodeAt(0) & 0xff);
                decoded = new TextDecoder('utf-8').decode(bytes);
            } catch (_) {
                decoded = current;
            }
        }

        if (!decoded || getMojibakeScore(decoded) >= getMojibakeScore(current)) break;
        current = decoded;
    }

    return current;
}

function repairVietnameseText(value) {
    if (typeof value !== 'string') return value;
    return decodeMojibake(value).replace(/\uFFFD/g, '');
}

function repairElementText(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
        const fixedText = repairVietnameseText(root.textContent);
        if (fixedText !== root.textContent) root.textContent = fixedText;
        return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE) return;

    ['placeholder', 'title', 'aria-label'].forEach(attr => {
        const original = root.getAttribute(attr);
        if (!original) return;

        const fixed = repairVietnameseText(original);
        if (fixed !== original) root.setAttribute(attr, fixed);
    });

    if (root.tagName === 'OPTION') {
        const fixedValue = repairVietnameseText(root.value);
        if (fixedValue !== root.value) {
            root.value = fixedValue;
            root.setAttribute('value', fixedValue);
        }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const fixedText = repairVietnameseText(textNode.textContent);
        if (fixedText !== textNode.textContent) textNode.textContent = fixedText;
    }

    root.querySelectorAll('option').forEach(option => {
        const fixedValue = repairVietnameseText(option.value);
        if (fixedValue !== option.value) {
            option.value = fixedValue;
            option.setAttribute('value', fixedValue);
        }
    });
}

function installMojibakeRepairObserver() {
    if (_mojibakeObserver || !document.body) return;

    repairElementText(document.body);

    _mojibakeObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'characterData' && mutation.target) {
                repairElementText(mutation.target);
                return;
            }

            mutation.addedNodes.forEach(node => repairElementText(node));
        });
    });

    _mojibakeObserver.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
    });
}

function sanitizeCRMRecord(record = {}) {
    return {
        ...record,
        company_name: repairVietnameseText(record.company_name || ''),
        customer_type: repairVietnameseText(record.customer_type || ''),
        service_type: repairVietnameseText(record.service_type || ''),
        package_name: repairVietnameseText(record.package_name || ''),
        duration: repairVietnameseText(record.duration || '')
    };
}

function setSelectValueSmart(id, value, fallback = '') {
    const select = document.getElementById(id);
    if (!select) return;

    const candidates = [value, fallback]
        .map(item => repairVietnameseText(item || '').trim())
        .filter(Boolean);

    for (const candidate of candidates) {
        const exact = [...select.options].find(opt => opt.value === candidate);
        if (exact) {
            select.value = exact.value;
            return;
        }

        const normalizedCandidate = normalizeText(candidate);
        const fuzzy = [...select.options].find(opt => {
            const optionValue = normalizeText(repairVietnameseText(opt.value));
            const optionLabel = normalizeText(repairVietnameseText(opt.textContent));
            return optionValue === normalizedCandidate || optionLabel === normalizedCandidate;
        });

        if (fuzzy) {
            select.value = fuzzy.value;
            return;
        }
    }

    if (select.options.length > 0) {
        select.value = fallback && [...select.options].some(opt => opt.value === fallback)
            ? fallback
            : select.options[0].value;
    }
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
    installMojibakeRepairObserver();
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
                if (nameInput && !nameInput.value) nameInput.value = existing.company_name;
                setSelectValueSmart('ca2-crm-customer-type', existing.customer_type, 'C\u00f4ng ty');
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

    // Initialize PremiumDatePicker (Single mode ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CRM Modal)
    const startInput = document.getElementById('ca2-crm-start');
    if (startInput && window.PremiumDatePicker) {
        PremiumDatePicker.attach(startInput, {
            mode: 'single',
            dateFormat: 'Y-m-d',
            label: 'CHÃƒÂ¡Ã‚Â»Ã…â€™N NGÃƒÆ’Ã¢â€šÂ¬Y',
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
    
    title.innerText = isRegister ? 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½ tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n mÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºi' : 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ tiÃƒÂ¡Ã‚ÂºÃ‚Â¿p tÃƒÂ¡Ã‚Â»Ã‚Â¥c quÃƒÂ¡Ã‚ÂºÃ‚Â£n lÃƒÆ’Ã‚Â½ chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch';
    const btnText = submitBtn.querySelector('.btn-text');
    if (btnText) btnText.innerText = isRegister ? 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½ ngay' : 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p ngay';
    else submitBtn.innerText = isRegister ? 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½ ngay' : 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p ngay';
    
    switchTxt.innerText = isRegister ? 'Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ cÃƒÆ’Ã‚Â³ tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n?' : 'ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n?';
    switchBtn.innerText = isRegister ? 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p' : 'Tham gia ngay';
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
            throw new Error(rawText || 'PhÃƒÂ¡Ã‚ÂºÃ‚Â£n hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“i tÃƒÂ¡Ã‚Â»Ã‚Â« server khÃƒÆ’Ã‚Â´ng hÃƒÂ¡Ã‚Â»Ã‚Â£p lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡.');
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
            errorDiv.innerText = data.error || 'LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i xÃƒÆ’Ã‚Â¡c thÃƒÂ¡Ã‚Â»Ã‚Â±c';
            errorDiv.classList.remove('hidden', 'text-green-500', 'bg-green-500/10', 'border-green-500/20');
            errorDiv.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
        }
    } catch (e) {
        errorDiv.innerText = 'LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server';
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
    const originalBtnText = btnText ? btnText.innerText : (submitBtn?.innerText || 'Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p ngay');

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
        showAuthMessage('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p email.');
        emailInput?.focus();
        return;
    }

    if (!password) {
        showAuthMessage('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p mÃƒÂ¡Ã‚ÂºÃ‚Â­t khÃƒÂ¡Ã‚ÂºÃ‚Â©u.');
        passwordInput?.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        if (btnText) btnText.innerText = 'Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â...';
        else submitBtn.innerText = 'Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â...';
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
            throw new Error(rawText || 'PhÃƒÂ¡Ã‚ÂºÃ‚Â£n hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“i tÃƒÂ¡Ã‚Â»Ã‚Â« server khÃƒÆ’Ã‚Â´ng hÃƒÂ¡Ã‚Â»Ã‚Â£p lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡.');
        }

        if (data.message) {
            showAuthMessage(data.message, 'success');
            return;
        }

        if (!res.ok) {
            showAuthMessage(data.error || 'KhÃƒÆ’Ã‚Â´ng thÃƒÂ¡Ã‚Â»Ã†â€™ Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p.');
            return;
        }

        if (!data.token) {
            showAuthMessage('Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p thÃƒÂ¡Ã‚ÂºÃ‚Â¥t bÃƒÂ¡Ã‚ÂºÃ‚Â¡i: server khÃƒÆ’Ã‚Â´ng trÃƒÂ¡Ã‚ÂºÃ‚Â£ vÃƒÂ¡Ã‚Â»Ã‚Â phiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p.');
            return;
        }

        localStorage.setItem('sb-token', data.token);
        saveCurrentSession(data.token, data.user);
        await checkAuth();
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            showAuthMessage('Server phÃƒÂ¡Ã‚ÂºÃ‚Â£n hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“i quÃƒÆ’Ã‚Â¡ chÃƒÂ¡Ã‚ÂºÃ‚Â­m. Vui lÃƒÆ’Ã‚Â²ng thÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÂ¡Ã‚ÂºÃ‚Â¡i.');
        } else {
            showAuthMessage(e.message || 'LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server.');
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
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng: KhÃƒÆ’Ã‚Â´ng tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y khung chÃƒÂ¡Ã‚Â»Ã‚Ân tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n.');
            return;
        }

        // Check if any session exists
        const token = localStorage.getItem('sb-token');
        if (!token && !currentUser) {
            alert('KhÃƒÆ’Ã‚Â´ng tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y phiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p.');
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

        // Filter out the current user ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â they're shown in the header section
        const otherSessions = savedSessions.filter(s => !(currentUser && String(s.user.id) === String(currentUser.id)));

        if (otherSessions.length === 0) {
            list.innerHTML = `
                <div class="p-6 border-2 border-dashed border-white/5 rounded-2xl text-center space-y-2">
                    <div class="text-2xl">ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â­</div>
                    <p class="text-gray-500 font-bold italic text-xs">KhÃƒÆ’Ã‚Â´ng cÃƒÆ’Ã‚Â³ tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n nÃƒÆ’Ã‚Â o khÃƒÆ’Ã‚Â¡c Ãƒâ€žÃ¢â‚¬ËœÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£c lÃƒâ€ Ã‚Â°u.</p>
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
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khÃƒÂ¡Ã‚Â»Ã…Â¸i tÃƒÂ¡Ã‚ÂºÃ‚Â¡o danh sÃƒÆ’Ã‚Â¡ch tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n: ' + err.message);
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
            alert('KhÃƒÆ’Ã‚Â´ng tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u phiÃƒÆ’Ã‚Âªn cho tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n nÃƒÆ’Ã‚Â y.');
            return;
        }

        const modalCont = document.querySelector('#modal-account-switcher .modal-premium');
        if (modalCont) {
            modalCont.innerHTML = `
                <div class="p-20 text-center space-y-6 animate-pulse">
                    <div class="w-20 h-20 bg-blue-600 rounded-[30px] mx-auto flex items-center justify-center text-white text-3xl animate-spin shadow-2xl shadow-blue-600/30">
                        <i class="fas fa-sync-alt"></i>
                    </div>
                    <h3 class="text-xl font-black text-white">Ãƒâ€žÃ‚Âang chuyÃƒÂ¡Ã‚Â»Ã†â€™n tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n...</h3>
                    <p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest">HÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng Ãƒâ€žÃ¢â‚¬Ëœang tÃƒÂ¡Ã‚ÂºÃ‚Â£i lÃƒÂ¡Ã‚ÂºÃ‚Â¡i phiÃƒÆ’Ã‚Âªn lÃƒÆ’Ã‚Â m viÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡c</p>
                </div>
            `;
        }

        localStorage.setItem('sb-token', target.token);
        setTimeout(() => {
            window.location.href = window.location.origin;
        }, 600);
    } catch (e) {
        console.error('Switch Account Error:', e);
        alert('CÃƒÆ’Ã‚Â³ lÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i xÃƒÂ¡Ã‚ÂºÃ‚Â£y ra khi chuyÃƒÂ¡Ã‚Â»Ã†â€™n tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n.');
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
        'dashboard': 'B\u1EA3ng \u0111i\u1EC1u khi\u1EC3n',
        'ca2-crm': 'CA2 CRM',
        'campaigns': 'Chi\u1EBFn d\u1ECBch Email',
        'senders': 'T\u00E0i kho\u1EA3n Gmail',
        'reports': 'B\u00E1o c\u00E1o chi ti\u1EBFt',
        'seo-news': 'Tin T\u1EE9c Thu\u1EBF (AI)',
        'seo-article': 'T\u1EA1o B\u00E0i Vi\u1EBFt SEO',
        'seo-image': 'T\u1EA1o \u1EA2nh AI',
        'seo-posts': 'Kho L\u01B0u Tr\u1EEF SEO',
        'lookup-tools': 'C\u1ED5ng Tra C\u1EE9u Nghi\u1EC7p V\u1EE5',
        'settings': 'C\u00E0i \u0111\u1EB7t h\u1EC7 th\u1ED1ng',
        'quotations': 'H\u1EE3p \u0111\u1ED3ng & B\u00E1o gi\u00E1',
        'documents': 'Kho T\u00E0i li\u1EC7u Sales',
        'settings-pricing': 'C\u1EADp nh\u1EADt B\u1EA3ng gi\u00E1'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[pageId] || 'Trang ch\u1EE7';
    
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

    repairElementText(document.getElementById('main-content'));
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
    
    // TÃƒÂ¡Ã‚Â»Ã‚Â± Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½ khi phiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n (401 Unauthorized)
    if (res.status === 401) {
        console.warn('[AUTH] PhiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n (401).');
        localStorage.removeItem('sb-token');
        alert('PhiÃƒÆ’Ã‚Âªn lÃƒÆ’Ã‚Â m viÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡c cÃƒÂ¡Ã‚Â»Ã‚Â§a bÃƒÂ¡Ã‚ÂºÃ‚Â¡n Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â£ hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n. Vui lÃƒÆ’Ã‚Â²ng Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p lÃƒÂ¡Ã‚ÂºÃ‚Â¡i Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ tiÃƒÂ¡Ã‚ÂºÃ‚Â¿p tÃƒÂ¡Ã‚Â»Ã‚Â¥c!');
        window.location.reload(); // TÃƒÂ¡Ã‚ÂºÃ‚Â£i lÃƒÂ¡Ã‚ÂºÃ‚Â¡i trang sÃƒÂ¡Ã‚ÂºÃ‚Â½ tÃƒÂ¡Ã‚Â»Ã‚Â± Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng hiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n mÃƒÆ’Ã‚Â n hÃƒÆ’Ã‚Â¬nh Login
        return new Promise(() => {}); // ChÃƒÂ¡Ã‚ÂºÃ‚Â·n tiÃƒÂ¡Ã‚ÂºÃ‚Â¿n trÃƒÆ’Ã‚Â¬nh tiÃƒÂ¡Ã‚ÂºÃ‚Â¿p theo Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ trÃƒÆ’Ã‚Â¡nh lÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i logic
    }
    
    return res;
}

// --- CA2 CRM LOGIC ---
async function loadCA2CRMData() {
    try {
        const res = await authedFetch('/api/ca2-crm');
        const { data } = await res.json();
        currentCRMData = (data || []).map(sanitizeCRMRecord);
        window.currentCRMData = currentCRMData;
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
    return repairVietnameseText(value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Ãƒâ€žÃ¢â‚¬Ëœ/g, 'd')
        .replace(/Ãƒâ€žÃ‚Â/g, 'D')
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

    if (!pkgName || normalizedPkg.includes('chua co goi')) return '1 nÃƒâ€žÃ†â€™m';
    
    // Priority: dataset from pricing data
    if (pkgOptionOrName?.dataset?.durationLabel) {
        console.log('[CRM-Sync] Found dataset label:', pkgOptionOrName.dataset.durationLabel);
        return pkgOptionOrName.dataset.durationLabel;
    }

    // Regex support for: nam, year, thang, month, so, count
    const yearMatch = normalizedPkg.match(/(\d+)\s*(nam|year)/);
    if (yearMatch) return `${yearMatch[1]} nÃƒâ€žÃ†â€™m`;

    const monthMatch = normalizedPkg.match(/(\d+)\s*(thang|month)/);
    if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months % 12 === 0 && months <= 60) return `${months / 12} nÃƒâ€žÃ†â€™m`;
        return `${months} thÃƒÆ’Ã‚Â¡ng`;
    }

    const countMatch = normalizedPkg.match(/(\d+)\s*(so|count|to)/);
    if (countMatch) return `${countMatch[1]} sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ`;

    if (normalizedService.includes('hoa don')) return '500 sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ';
    
    return '1 nÃƒâ€žÃ†â€™m';
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
                durationLabel = `${months / 12} nÃƒâ€žÃ†â€™m`;
            } else {
                durationLabel = `${months} thÃƒÆ’Ã‚Â¡ng`;
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
        
        // If label is "1 nÃƒâ€žÃ†â€™m", match "1 nÃƒâ€žÃ†â€™m (+3 thÃƒÆ’Ã‚Â¡ng)" or similar
        // We check if the option text STARTS with the label (e.g. "1 nÃƒâ€žÃ†â€™m" matches "1 nÃƒâ€žÃ†â€™m (+3 thÃƒÆ’Ã‚Â¡ng)")
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
            endLabel.innerText = 'Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚ÂºÃ‚Â¿n ngÃƒÆ’Ã‚Â y';
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
            startLabel.innerText = 'TÃƒÂ¡Ã‚Â»Ã‚Â« ngÃƒÆ’Ã‚Â y';
            endLabel.innerText = 'Ãƒâ€ž ÃƒÂ¡Ã‚ÂºÃ‚Â¿n ngÃƒÆ’Ã‚Â y';
            fromInput.value = '';
            toInput.value = '';
            rangeInput.value = '';
            clearBtn?.classList.add('hidden');
            renderCA2CRM();
        }
    };

    const instance = PremiumDatePicker.attach(rangeInput, {
        mode: 'range',
        label: 'THÃƒÂ¡Ã‚Â»Ã…â€œI GIAN LÃƒÂ¡Ã‚Â»Ã…â€™C',
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
    
    // PhÃƒÂ¡Ã‚ÂºÃ‚Â§n 3: Logic ÃƒÆ’Ã‚Âp dÃƒÂ¡Ã‚Â»Ã‚Â¥ng
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
    const serviceType = repairVietnameseText(document.getElementById('ca2-crm-service').value);
    const body = {
        mst: document.getElementById('ca2-crm-mst').value.trim(),
        company_name: repairVietnameseText(document.getElementById('ca2-crm-name').value.trim()),
        email: document.getElementById('ca2-crm-email').value.trim(),
        phone: document.getElementById('ca2-crm-phone').value.trim(),
        service_type: serviceType,
        customer_type: repairVietnameseText(document.getElementById('ca2-crm-customer-type').value),
        package_name: repairVietnameseText(document.getElementById('ca2-crm-package').value),
        // Remove amount to prevent schema error
        start_date: document.getElementById('ca2-crm-start').value,
        duration: repairVietnameseText(document.getElementById('ca2-crm-duration').value),
        compensate_months: parseInt(document.getElementById('ca2-crm-compensate').value) || 0
    };

    // Include CKS type if service contains 'CKS' or 'ChÃ¡Â»Â¯ kÃƒÂ½ sÃ¡Â»â€˜' (flexible match)
    if (serviceType.toUpperCase().includes('CKS') || serviceType.toUpperCase().includes('CHU KY SO')) {
        body.cks_type = document.getElementById('ca2-crm-cks-type').value || '';
    }

    if (!body.mst || !body.company_name) {
        alert('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p MÃƒÆ’Ã‚Â£ sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ thuÃƒÂ¡Ã‚ÂºÃ‚Â¿ vÃƒÆ’Ã‚Â  TÃƒÆ’Ã‚Âªn cÃƒÆ’Ã‚Â´ng ty');
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
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (err.error || 'Unknown error'));
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server'); }
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
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i cÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t trÃƒÂ¡Ã‚ÂºÃ‚Â¡ng thÃƒÆ’Ã‚Â¡i thanh toÃƒÆ’Ã‚Â¡n');
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi'); }
}

function updateCRMDurationOptions(defaultVal = '') {
    const serviceSelect = document.getElementById('ca2-crm-service');
    const durationSelect = document.getElementById('ca2-crm-duration');
    const cksSection = document.getElementById('cks-type-section');
    if (!serviceSelect || !durationSelect) return;
    
    const serviceVal = repairVietnameseText(serviceSelect.value);
    const normalizedService = normalizeText(serviceVal);
    durationSelect.innerHTML = '';
    
    // Show/hide CKS type section
    if (cksSection) {
        cksSection.style.display = (normalizedService.includes('cks') || normalizedService.includes('chu ky so')) ? 'block' : 'none';
    }
    
    if (normalizedService.includes('hddt') || normalizedService.includes('hoa don')) {
        ['300 s\u1ed1', '500 s\u1ed1', '1000 s\u1ed1', '2000 s\u1ed1', '5000 s\u1ed1', '10000 s\u1ed1'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        if (!defaultVal || !normalizeText(defaultVal).includes('so')) defaultVal = '500 s\u1ed1';
    } else if (normalizedService.includes('cks') || normalizedService.includes('chu ky so')) {
        const cksType = document.getElementById('ca2-crm-cks-type')?.value || 'cap_moi';
        updateCKSDurationByType(cksType, defaultVal);
        return; 
    } else if (normalizedService.includes('ebh') || normalizedService.includes('bao hiem')) {
        const variant = normalizedService.includes('dung thu') ? 'gia_han_thu' : (normalizedService.includes('gia han') ? 'gia_han' : 'cap_moi');
        updateGenericDurationOptions(variant, defaultVal);
        return;
    } else {
        ['1 n\u0103m', '2 n\u0103m', '3 n\u0103m', '4 n\u0103m', '5 n\u0103m'].forEach(v => {
            durationSelect.innerHTML += `<option value="${v}">${v.replace('n\u0103m', 'N\u0103m')}</option>`;
        });
        if (!defaultVal || normalizeText(defaultVal).includes('so')) defaultVal = '1 n\u0103m';
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
        { val: '1 n\u0103m', text: `1 N\u0103m (+${bonus} th\u00e1ng)` },
        { val: '2 n\u0103m', text: `2 N\u0103m (+${bonus * 2} th\u00e1ng)` },
        { val: '3 n\u0103m', text: `3 N\u0103m (+${bonus * 3} th\u00e1ng)` }
    ];
    
    options.forEach(opt => {
        durationSelect.innerHTML += `<option value="${opt.val}">${opt.text}</option>`;
    });
    
    durationSelect.value = defaultVal || '1 n\u0103m';
    updateCRMBonusMonths();
}

function updateCKSDurationByType(cksType, defaultVal = '') {
    const durationSelect = document.getElementById('ca2-crm-duration');
    if (!durationSelect) return;
    durationSelect.innerHTML = '';
    
    let options = [];
    if (cksType === 'gia_han_thu') {
        options = [
            { val: '1 n\u0103m', text: '1 N\u0103m (+6 th\u00e1ng)' },
            { val: '2 n\u0103m', text: '2 N\u0103m (+9 th\u00e1ng)' },
            { val: '3 n\u0103m', text: '3 N\u0103m (+12 th\u00e1ng)' }
        ];
    } else {
        options = [
            { val: '1 n\u0103m', text: '1 N\u0103m (+3 th\u00e1ng)' },
            { val: '2 n\u0103m', text: '2 N\u0103m (+6 th\u00e1ng)' },
            { val: '3 n\u0103m', text: '3 N\u0103m (+9 th\u00e1ng)' }
        ];
    }
    
    options.forEach(opt => {
        durationSelect.innerHTML += `<option value="${opt.val}">${opt.text}</option>`;
    });
    
    if (!defaultVal || normalizeText(defaultVal).includes('thang') || normalizeText(defaultVal).includes('so')) {
        defaultVal = '1 n\u0103m';
    }
    durationSelect.value = defaultVal;
    updateCRMBonusMonths();
}

function updateCRMBonusMonths() {
    const serviceVal = repairVietnameseText(document.getElementById('ca2-crm-service').value);
    const durationVal = repairVietnameseText(document.getElementById('ca2-crm-duration').value);
    const compensateInput = document.getElementById('ca2-crm-compensate');
    if (!compensateInput) return;

    let bonus = 0;
    const years = parseInt(durationVal, 10) || 0;
    const normalizedService = normalizeText(serviceVal);

    if (normalizedService.includes('cks') || normalizedService.includes('ebh') || normalizedService.includes('bao hiem')) {
        const isTrial = normalizedService.includes('dung thu');
        bonus = years * (isTrial ? 6 : 3);
        
        if (normalizedService.includes('cks') && isTrial) {
             if (years === 2) bonus = 9;
             if (years === 3) bonus = 12;
        }
    }

    compensateInput.value = bonus;
    calculatePrice();
}

function openAddCRMModal() {
    console.log('[DEBUG] openAddCRMModal started');
    try {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
            else console.warn(`[DEBUG] Element not found: ${id}`);
        };
        const setText = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
            else console.warn(`[DEBUG] Element not found: ${id}`);
        };

        setText('ca2-crm-modal-title', 'Th\u00eam kh\u00e1ch h\u00e0ng CA2 CRM');
        setVal('ca2-crm-id', '');
        setVal('ca2-crm-mst', '');
        setVal('ca2-crm-name', '');
        setVal('ca2-crm-email', '');
        setVal('ca2-crm-phone', '');
        setSelectValueSmart('ca2-crm-service', 'CKS \u2013 C\u1ea5p m\u1edbi');
        setSelectValueSmart('ca2-crm-customer-type', 'C\u00f4ng ty');
        setVal('ca2-crm-start', new Date().toISOString().split('T')[0]);
        setVal('ca2-crm-cks-type', 'cap_moi');
        setVal('ca2-crm-compensate', 0);
        
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
        
        console.log('[DEBUG] Calling updateCRMPackages');
        updateCRMPackages();
        
        const modal = document.getElementById('modal-ca2-crm');
        if (modal) {
            modal.classList.remove('hidden');
            console.log('[DEBUG] Modal unhidden');
        } else {
            console.error('[DEBUG] CRITICAL: Modal modal-ca2-crm not found');
        }

        // Refresh custom selects to sync UI
        if (typeof refreshCustomSelects === 'function') {
            refreshCustomSelects();
        }

        repairElementText(document.getElementById('modal-ca2-crm'));
    } catch (err) {
        console.error('[DEBUG] Error in openAddCRMModal:', err);
    }
}

function editCRM(id) {
    if (!id) {
        console.error('[ERROR] No ID provided to editCRM');
        return;
    }
    
    try {
        if (!currentCRMData || currentCRMData.length === 0) {
            console.error('[ERROR] currentCRMData is empty, cannot find record');
            return;
        }

        const found = currentCRMData.find(x => String(x.id) === String(id));
        if (!found) {
            console.error('[ERROR] CRM record not found in state for ID:', id);
            return;
        }
        
        const c = sanitizeCRMRecord(found);
        
        // --- MANDATORY LOGGING AS REQUESTED ---
        console.log(`[DEBUG] Edit CRM clicked - Service: ${c.service_type}, PackageID: ${c.id}, PackageName: ${c.package_name}`);

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
            else console.warn(`[DEBUG] Element not found: ${id}`);
        };
        const setText = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
            else console.warn(`[DEBUG] Element not found: ${id}`);
        };

        setText('ca2-crm-modal-title', 'CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t khÃƒÂ¡ch hÃƒÂ ng');
        setVal('ca2-crm-id', c.id);
        setVal('ca2-crm-mst', c.mst);
        setVal('ca2-crm-name', c.company_name);
        setVal('ca2-crm-email', c.email);
        setVal('ca2-crm-phone', c.phone);
        
        const normalizedServiceType = c.service_type || 'CKS Ã¢â‚¬â€œ CÃ¡ÂºÂ¥p mÃ¡Â»â€ºi';
        setSelectValueSmart('ca2-crm-service', normalizedServiceType, 'CKS Ã¢â‚¬â€œ CÃ¡ÂºÂ¥p mÃ¡Â»â€ºi');
        setSelectValueSmart('ca2-crm-customer-type', c.customer_type, 'CÃƒÂ´ng ty');
        setVal('ca2-crm-start', c.start_date || '');
        setVal('ca2-crm-compensate', c.compensate_months || 0);
        setVal('ca2-crm-cks-type', c.cks_type || 'cap_moi');
        
        // Initialize packages list first
        console.log('[DEBUG] Updating packages list...');
        updateCRMPackages();
        
        // RESTORE SAVED PACKAGE AND DURATION
        if (c.package_name) setSelectValueSmart('ca2-crm-package', c.package_name);
        if (c.duration) setSelectValueSmart('ca2-crm-duration', c.duration);
        
        // Set amount (Recalculate with restored package)
        try {
            const price = getCRMPrice(c.service_type, c.customer_type, c.package_name || document.getElementById('ca2-crm-package')?.value || '');
            setVal('ca2-crm-amount', new Intl.NumberFormat('vi-VN').format(price));
        } catch (priceErr) {
            console.warn('[DEBUG] Error calculating price during edit:', priceErr);
        }
        
        // SYNC PREMIUM UI
        if (typeof refreshCustomSelects === 'function') {
            console.log('[DEBUG] Refreshing custom selects...');
            refreshCustomSelects();
        }

        repairElementText(document.getElementById('modal-ca2-crm'));

        const modal = document.getElementById('modal-ca2-crm');
        if (modal) {
            // UNIFIED OPEN LOGIC - Open for all types
            modal.classList.remove('hidden');
            modal.style.display = 'flex'; // Force flex display
            modal.style.pointerEvents = 'auto';
            modal.style.zIndex = '9999';
            console.log('[DEBUG] Edit modal opened successfully for type:', c.service_type);
        } else {
            console.error('[DEBUG] CRITICAL: Modal modal-ca2-crm not found');
        }
    } catch (err) {
        console.error('[DEBUG] CRITICAL ERROR in editCRM:', err);
        // Fallback: try to open modal even if some field population failed
        const modal = document.getElementById('modal-ca2-crm');
        if (modal) modal.classList.remove('hidden');
    }
}

async function deleteCRM(id) {
    if (!confirm('B\u1ea1n c\u00f3 ch\u1eafc ch\u1eafn mu\u1ed1n x\u00f3a kh\u00e1ch h\u00e0ng n\u00e0y?')) return;
    try {
        const res = await authedFetch(`/api/ca2-crm/${id}`, { method: 'DELETE' });
        if (res.ok) loadCA2CRMData();
        else alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi xÃƒÆ’Ã‚Â³a khÃƒÆ’Ã‚Â¡ch hÃƒÆ’Ã‚Â ng');
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi'); }
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
        alert('KhÃƒÆ’Ã‚Â´ng tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y khÃƒÆ’Ã‚Â¡ch hÃƒÆ’Ã‚Â ng nÃƒÆ’Ã‚Â o cÃƒÆ’Ã‚Â³ email hÃƒÂ¡Ã‚Â»Ã‚Â£p lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡.');
        return;
    }

    if (!confirm(`TÃƒÂ¡Ã‚ÂºÃ‚Â¡o chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch gÃƒÂ¡Ã‚Â»Ã‚Â­i mail cho ${recipients.length} khÃƒÆ’Ã‚Â¡ch hÃƒÆ’Ã‚Â ng?`)) return;

    try {
        const sendersRes = await authedFetch('/api/senders');
        const senders = await sendersRes.json();
        
        if (!senders || senders.length === 0) {
            alert('Vui lÃƒÆ’Ã‚Â²ng kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n Gmail trÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc khi gÃƒÂ¡Ã‚Â»Ã‚Â­i mail.');
            showPage('senders');
            return;
        }
        
        const senderId = senders[0].id;
        
        const campaignData = {
            name: `CRM Bulk - ${formatDate(new Date())}`,
            subject: "ThÃƒÆ’Ã‚Â´ng bÃƒÆ’Ã‚Â¡o vÃƒÂ¡Ã‚Â»Ã‚Â dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch vÃƒÂ¡Ã‚Â»Ã‚Â¥ CA2",
            template: "KÃƒÆ’Ã‚Â­nh gÃƒÂ¡Ã‚Â»Ã‚Â­i #TÃƒÆ’Ã‚ÂªnCÃƒÆ’Ã‚Â´ngTy, dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch vÃƒÂ¡Ã‚Â»Ã‚Â¥ cÃƒÂ¡Ã‚Â»Ã‚Â§a quÃƒÆ’Ã‚Â½ khÃƒÆ’Ã‚Â¡ch (MST: #MST) sÃƒÂ¡Ã‚ÂºÃ‚Â¯p hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n vÃƒÆ’Ã‚Â o ngÃƒÆ’Ã‚Â y #NgÃƒÆ’Ã‚Â yHÃƒÂ¡Ã‚ÂºÃ‚Â¿tHÃƒÂ¡Ã‚ÂºÃ‚Â¡n.",
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
            alert('TÃƒÂ¡Ã‚ÂºÃ‚Â¡o chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            showPage('campaigns');
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng'); }
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
                alert('File khÃƒÆ’Ã‚Â´ng cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u');
                return;
            }

            // Directly send to server since we already have the mode
            const res = await authedFetch('/api/ca2-crm/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: json, mode: pendingImportMode })
            });

            if (res.ok) {
                alert('NhÃƒÂ¡Ã‚ÂºÃ‚Â­p dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
                closeCRMImportModal();
                loadCA2CRMData();
            } else {
                const err = await res.json();
                alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (err.error || 'Server error'));
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½ file'); }
}

function downloadCRMTemplate() {
    // Columns from the user's screenshot
    const headers = [
        "NgÃƒÆ’Ã‚Â y", "TÃƒÆ’Ã‚Âªn DN", "MST", "Chi cÃƒÂ¡Ã‚Â»Ã‚Â¥c ThuÃƒÂ¡Ã‚ÂºÃ‚Â¿", "Ãƒâ€žÃ¢â‚¬ËœiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n thoÃƒÂ¡Ã‚ÂºÃ‚Â¡i D", 
        "Email Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½", "DÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch vÃƒÂ¡Ã‚Â»Ã‚Â¥", "ThÃƒÂ¡Ã‚Â»Ã‚Âi hÃƒÂ¡Ã‚ÂºÃ‚Â¡n", "NgÃƒÆ’Ã‚Â y hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n"
    ];
    
    // Sample data
    const sampleData = [
        ["01/01/2024", "CÃƒÆ’Ã¢â‚¬ÂNG TY TNHH VÃƒÆ’Ã‚Â DÃƒÂ¡Ã‚Â»Ã‚Â¤ A", "0101010101", "CÃƒÂ¡Ã‚ÂºÃ‚Â§u GiÃƒÂ¡Ã‚ÂºÃ‚Â¥y", "0900000000", "vi-du@email.com", "CKS", "1 nÃƒâ€žÃ†â€™m", "01/01/2025"],
        ["15/02/2024", "CÃƒÆ’Ã¢â‚¬ÂNG TY CP MINH HÃƒÂ¡Ã‚Â»Ã…â€™A B", "0202020202", "Hai BÃƒÆ’Ã‚Â  TrÃƒâ€ Ã‚Â°ng", "0911111111", "minh-hoa@email.com", "HDDT", "2 nÃƒâ€žÃ†â€™m", "15/02/2026"]
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
        const hasActive = campaigns.some(c => c.status === 'Ãƒâ€žÃ‚Âang gÃƒÂ¡Ã‚Â»Ã‚Â­i' || c.status === 'Ãƒâ€žÃ‚Âang hÃƒÆ’Ã‚Â ng Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â£i' || c.status === 'Ãƒâ€žÃ‚Âang xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½');
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
            const isDone = c.status === 'Ho\u00e0n th\u00e0nh';
            const isRunning = c.status === 'Ãƒâ€žÃ‚Âang gÃƒÂ¡Ã‚Â»Ã‚Â­i' || c.status === 'Ãƒâ€žÃ‚Âang hÃƒÆ’Ã‚Â ng Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â£i';
            const badgeType = isDone ? 'badge-done' : (isRunning ? 'badge-running' : 'badge-pending');
            const statusLabel = isRunning ? 'Ãƒâ€žÃ‚Âang gÃƒÂ¡Ã‚Â»Ã‚Â­i...' : c.status;

            return `
                <div class="group relative overflow-hidden bg-white/2 hover:bg-white/5 border border-white/5 rounded-2xl p-4 transition-all duration-300 cursor-pointer flex items-center gap-4" onclick="showPage('campaigns')">
                    <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500/10 text-emerald-500' : (isRunning ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500')}">
                        <i class="fas ${isDone ? 'fa-check-circle' : (isRunning ? 'fa-paper-plane animate-pulse' : 'fa-envelope-open-text')} text-xl"></i>
                    </div>

                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-black text-white truncate group-hover:text-orange-400 transition-colors">${c.name}</h4>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">${new Date(c.created_at).toLocaleDateString('vi-VN')} &bull; ${c.sent_count}/${c.total_recipients} Email</p>
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
                            <button onclick="event.stopPropagation(); startCampaign('${c.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white transition-all" title="BÃƒÂ¡Ã‚ÂºÃ‚Â¯t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u gÃƒÂ¡Ã‚Â»Ã‚Â­i">
                                <i class="fas fa-play text-xs"></i>
                            </button>
                        ` : ''}
                        <button onclick="event.stopPropagation(); deleteCampaign('${c.id}')" class="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all" title="XÃƒÆ’Ã‚Â³a">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        };

        const html = campaigns.map(renderItem).join('');
        const emptyHtml = `
            <div class="empty-state">
                <div class="empty-icon">ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â§</div>
                <div class="empty-title">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch nÃƒÆ’Ã‚Â o</div>
                <div class="empty-desc">TÃƒÂ¡Ã‚ÂºÃ‚Â¡o chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u tiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ bÃƒÂ¡Ã‚ÂºÃ‚Â¯t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u gÃƒÂ¡Ã‚Â»Ã‚Â­i email</div>
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
            alert('ChiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â£ bÃƒÂ¡Ã‚ÂºÃ‚Â¯t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u gÃƒÂ¡Ã‚Â»Ã‚Â­i!');
            loadRecentCampaigns(); 
        } else {
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (data.error || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'));
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server');
    }
}

async function deleteCampaign(id) {
    if (!confirm('BÃƒÂ¡Ã‚ÂºÃ‚Â¡n cÃƒÆ’Ã‚Â³ chÃƒÂ¡Ã‚ÂºÃ‚Â¯c chÃƒÂ¡Ã‚ÂºÃ‚Â¯n muÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœn xÃƒÆ’Ã‚Â³a chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch nÃƒÆ’Ã‚Â y? HÃƒÆ’Ã‚Â nh Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng nÃƒÆ’Ã‚Â y khÃƒÆ’Ã‚Â´ng thÃƒÂ¡Ã‚Â»Ã†â€™ hoÃƒÆ’Ã‚Â n tÃƒÆ’Ã‚Â¡c.')) return;
    try {
        const res = await authedFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadRecentCampaigns();
            loadDashboardStats();
        } else {
            const err = await res.json();
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi xÃƒÆ’Ã‚Â³a: ' + (err.error || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'));
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server');
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
        
        if (countEl) countEl.innerText = `TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng: ${senders.length} tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n`;
        
        list.innerHTML = senders.map(s => {
            const isGmailAPI = s.smtpHost === 'oauth2.google' || s.smtpHost === 'oauth2.googleapis.com';
            
            return `
                <div class="list-item">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isGmailAPI ? 'bg-white' : 'bg-orange-gradient/20 text-orange-500'}">
                            ${isGmailAPI ? '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_Logo.svg" class="w-5 h-5">' : 'ÃƒÂ¢Ã…Â¡Ã¢â€žÂ¢ÃƒÂ¯Ã‚Â¸Ã‚Â'}
                        </div>
                        <div>
                            <div class="list-item-title">${s.senderName}</div>
                            <div class="list-item-meta">${s.senderEmail}</div>
                        </div>
                    </div>
                    <div class="flex justify-center">
                        <span class="badge-premium badge-done">
                            <span class="badge-dot"></span>
                            Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi
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
                <div class="empty-icon">ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Ëœ</div>
                <div class="empty-title">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n nÃƒÆ’Ã‚Â o</div>
                <div class="empty-desc">KÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi Gmail hoÃƒÂ¡Ã‚ÂºÃ‚Â·c SMTP Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ bÃƒÂ¡Ã‚ÂºÃ‚Â¯t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u gÃƒÂ¡Ã‚Â»Ã‚Â­i mail</div>
            </div>
        `;
        
        const select = document.getElementById('select-sender');
        if (select) {
            select.innerHTML = '<option value="">-- ChÃƒÂ¡Ã‚Â»Ã‚Ân tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n gÃƒÂ¡Ã‚Â»Ã‚Â­i --</option>' + 
                senders.map(s => `<option value="${s.id}">${s.senderName} (${s.senderEmail})</option>`).join('');
        }
    } catch (e) { console.error('Load Senders Error:', e); }
}

async function connectGoogleAccount() {
    try {
        const res = await authedFetch('/api/auth/google/url');
        const data = await res.json();
        if (data.url) {
            // MÃƒÂ¡Ã‚Â»Ã…Â¸ cÃƒÂ¡Ã‚Â»Ã‚Â­a sÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ popup Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi Gmail OAuth
            window.open(data.url, 'GoogleAuth', 'width=600,height=700');
        } else {
            alert('KhÃƒÆ’Ã‚Â´ng lÃƒÂ¡Ã‚ÂºÃ‚Â¥y Ãƒâ€žÃ¢â‚¬ËœÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£c URL kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi Google. Vui lÃƒÆ’Ã‚Â²ng thÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÂ¡Ã‚ÂºÃ‚Â¡i.');
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server khi lÃƒÂ¡Ã‚ÂºÃ‚Â¥y URL Google OAuth.');
        console.error(e);
    }
}

// LÃƒÂ¡Ã‚ÂºÃ‚Â¯ng nghe message tÃƒÂ¡Ã‚Â»Ã‚Â« popup OAuth
window.addEventListener('message', (event) => {
    if (event.data === 'google_auth_success') {
        alert('KÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi Gmail thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng! Ãƒâ€žÃ‚Âang tÃƒÂ¡Ã‚ÂºÃ‚Â£i lÃƒÂ¡Ã‚ÂºÃ‚Â¡i danh sÃƒÆ’Ã‚Â¡ch tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n...');
        loadSenders();
    }
});

function openAddSenderModal() {
    document.getElementById('sender-modal-title').innerHTML = 'ThÃƒÆ’Ã‚Âªm <span class="text-orange-gradient">tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n SMTP</span>';
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

        document.getElementById('sender-modal-title').innerHTML = 'ChÃƒÂ¡Ã‚Â»Ã¢â‚¬Â°nh sÃƒÂ¡Ã‚Â»Ã‚Â­a <span class="text-orange-gradient">tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n SMTP</span>';
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
        return alert('Vui lÃƒÆ’Ã‚Â²ng Ãƒâ€žÃ¢â‚¬ËœiÃƒÂ¡Ã‚Â»Ã‚Ân Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§y Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â§ cÃƒÆ’Ã‚Â¡c thÃƒÆ’Ã‚Â´ng tin bÃƒÂ¡Ã‚ÂºÃ‚Â¯t buÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢c');
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
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (err.error || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'));
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server'); }
}

async function deleteSender(id) {
    if (!confirm('BÃƒÂ¡Ã‚ÂºÃ‚Â¡n cÃƒÆ’Ã‚Â³ chÃƒÂ¡Ã‚ÂºÃ‚Â¯c chÃƒÂ¡Ã‚ÂºÃ‚Â¯n muÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœn xÃƒÆ’Ã‚Â³a tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n nÃƒÆ’Ã‚Â y?')) return;
    try {
        const res = await authedFetch(`/api/senders/${id}`, { method: 'DELETE' });
        if (res.ok) loadSenders();
        else alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi xÃƒÆ’Ã‚Â³a tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n');
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng'); }
}

// --- UTILITIES AND OLD CRM LOGIC ---
function exportCA2CRMToExcel() {
    if (!currentCRMData || currentCRMData.length === 0) {
        alert('KhÃƒÆ’Ã‚Â´ng cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ xuÃƒÂ¡Ã‚ÂºÃ‚Â¥t');
        return;
    }
    const wsData = currentCRMData.map(c => ({
        'MST': c.mst,
        'TÃƒÆ’Ã‚Âªn cÃƒÆ’Ã‚Â´ng ty': c.company_name,
        'Email': c.email,
        'SÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ Ãƒâ€žÃ¢â‚¬ËœiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n thoÃƒÂ¡Ã‚ÂºÃ‚Â¡i': c.phone,
        'DÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch vÃƒÂ¡Ã‚Â»Ã‚Â¥': c.service_type || '',
        'NgÃƒÆ’Ã‚Â y cÃƒÂ¡Ã‚ÂºÃ‚Â¥p': formatDate(c.start_date),
        'ThÃƒÂ¡Ã‚Â»Ã‚Âi hÃƒÂ¡Ã‚ÂºÃ‚Â¡n/SÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ lÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£ng': c.package_name || c.duration || '',
        'ThÃƒÆ’Ã‚Â nh tiÃƒÂ¡Ã‚Â»Ã‚Ân': getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration) > 0 ? new Intl.NumberFormat('vi-VN').format(getCRMPrice(c.service_type, c.customer_type, c.package_name || c.duration)) : '0',
        'NgÃƒÆ’Ã‚Â y hÃƒÂ¡Ã‚ÂºÃ‚Â¿t hÃƒÂ¡Ã‚ÂºÃ‚Â¡n': formatDate(c.expired_date),
        'TÃƒÆ’Ã‚Â¬nh trÃƒÂ¡Ã‚ÂºÃ‚Â¡ng thanh toÃƒÆ’Ã‚Â¡n': c.payment_status === 'paid' ? 'Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ thanh toÃƒÆ’Ã‚Â¡n' : 'ChÃƒâ€ Ã‚Â°a thanh toÃƒÆ’Ã‚Â¡n',
        'Ghi chÃƒÆ’Ã‚Âº': c.status_note || ''
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
        alert('KhÃƒÆ’Ã‚Â´ng cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u phÃƒÆ’Ã‚Â¹ hÃƒÂ¡Ã‚Â»Ã‚Â£p vÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºi bÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ lÃƒÂ¡Ã‚Â»Ã‚Âc hiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n tÃƒÂ¡Ã‚ÂºÃ‚Â¡i Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ xuÃƒÂ¡Ã‚ÂºÃ‚Â¥t.');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DSKH CA2');

    // Add main title
    worksheet.mergeCells('A1:N1');
    const title = worksheet.getCell('A1');
    title.value = `DANH SÃƒÆ’Ã‚ÂCH KHÃƒÆ’Ã‚ÂCH HÃƒÆ’Ã¢â€šÂ¬NG ${filterYear !== 'all' ? filterYear : new Date().getFullYear()}`;
    title.font = { name: 'Times New Roman', size: 16, bold: true };
    title.alignment = { horizontal: 'center' };

    // Column Widths
    worksheet.columns = [
        { header: 'STT', width: 5 },
        { header: 'NgÃƒÆ’Ã‚Â y', width: 15 },
        { header: 'TÃƒÆ’Ã‚Âªn DN', width: 45 },
        { header: 'MST', width: 15 },
        { header: 'CÃƒÂ¡Ã‚Â»Ã‚Â¥c ThuÃƒÂ¡Ã‚ÂºÃ‚Â¿', width: 15 },
        { header: 'Ãƒâ€žÃ‚ÂiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n thoÃƒÂ¡Ã‚ÂºÃ‚Â¡i DN', width: 15 },
        { header: 'Email Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½', width: 30 },
        { header: 'DÃƒÂ¡Ã‚Â»Ã…Â CH VÃƒÂ¡Ã‚Â»Ã‚Â¤', width: 15 },
        { header: 'ThÃƒÂ¡Ã‚Â»Ã‚Âi hÃƒÂ¡Ã‚ÂºÃ‚Â¡n/SÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ lÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£ng', width: 20 },
        { header: 'ThÃƒÆ’Ã‚Â nh tiÃƒÂ¡Ã‚Â»Ã‚Ân', width: 15 },
        { header: 'Ãƒâ€žÃ‚ÂT ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi lÃƒÆ’Ã‚Â m', width: 15 },
        { header: 'TÃƒÂ¡Ã‚Â»Ã‚Â· lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡', width: 10 },
        { header: 'CK KH', width: 10 },
        { header: 'TÃƒÆ’Ã‚Â¬nh trÃƒÂ¡Ã‚ÂºÃ‚Â¡ng thanh toÃƒÆ’Ã‚Â¡n', width: 20 }
    ];

    // Format Header Row
    const hr = worksheet.getRow(2);
    hr.values = [
        'STT', 'NgÃƒÆ’Ã‚Â y', 'TÃƒÆ’Ã‚Âªn DN', 'MST', 'CÃƒÂ¡Ã‚Â»Ã‚Â¥c ThuÃƒÂ¡Ã‚ÂºÃ‚Â¿', 'Ãƒâ€žÃ‚ÂiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n thoÃƒÂ¡Ã‚ÂºÃ‚Â¡i DN', 'Email Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng kÃƒÆ’Ã‚Â½',
        'DÃƒÂ¡Ã‚Â»Ã…Â CH VÃƒÂ¡Ã‚Â»Ã‚Â¤', 'ThÃƒÂ¡Ã‚Â»Ã‚Âi hÃƒÂ¡Ã‚ÂºÃ‚Â¡n/SÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ lÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£ng', 'ThÃƒÆ’Ã‚Â nh tiÃƒÂ¡Ã‚Â»Ã‚Ân', 'Ãƒâ€žÃ‚ÂT ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi lÃƒÆ’Ã‚Â m', 'TÃƒÂ¡Ã‚Â»Ã‚Â· lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡', 'CK KH', 'TÃƒÆ’Ã‚Â¬nh trÃƒÂ¡Ã‚ÂºÃ‚Â¡ng thanh toÃƒÆ’Ã‚Â¡n'
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
            currentUser?.full_name || 'NgÃƒÂ¡Ã‚Â»Ã‚Âc',
            '', // TÃƒÂ¡Ã‚Â»Ã‚Â· lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡
            '', // CK KH
            c.payment_status === 'paid' ? 'Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ TT' : 'ChÃƒâ€ Ã‚Â°a TT'
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
                statusEl.innerText = 'File rÃƒÂ¡Ã‚Â»Ã¢â‚¬â€ng!';
                statusEl.className = 'text-sm font-bold text-red-500 text-center';
                return;
            }

            // Strict Smart Header Detection
            let headerRowIndex = -1;
            const headerKeywords = [
                'MST', 'TAX', 'MÃƒÆ’Ã†â€™ SÃƒÂ¡Ã‚Â»Ã‚Â THUÃƒÂ¡Ã‚ÂºÃ‚Â¾', 'CÃƒÆ’Ã¢â‚¬ÂNG TY', 'TÃƒÆ’Ã…Â N', 'NAME', 'EMAIL', 'Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚Â»Ã…Â A CHÃƒÂ¡Ã‚Â»Ã‹â€ ', 'ADDRESS', 
                'HÃƒÂ¡Ã‚ÂºÃ‚Â¾T HÃƒÂ¡Ã‚ÂºÃ‚Â N', 'EXPIRATION', 'SERIAL', 'HÃƒÂ¡Ã‚ÂºÃ‚Â N', 'DÃƒÂ¡Ã‚Â»Ã…Â CH VÃƒÂ¡Ã‚Â»Ã‚Â¤', 'GÃƒÆ’Ã¢â‚¬Å“I', 'THÃƒÂ¡Ã‚Â»Ã…â€œI GIAN', 'NGÃƒÆ’Ã¢â€šÂ¬Y CÃƒÂ¡Ã‚ÂºÃ‚Â¤P'
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
                            const addressKeywords = ['phÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âng', 'quÃƒÂ¡Ã‚ÂºÃ‚Â­n', 'huyÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n', 'tÃƒÂ¡Ã‚Â»Ã¢â‚¬Â°nh', 'thÃƒÆ’Ã‚Â nh phÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ', 'Ãƒâ€žÃ¢â‚¬ËœÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âng', 'ngÃƒÆ’Ã‚Âµ', 'sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ', 'khu phÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ', 'xÃƒÆ’Ã‚Â£', 'thÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ trÃƒÂ¡Ã‚ÂºÃ‚Â¥n', 'phÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ', 'ward', 'district', 'city', 'street'];
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
                        if (uk.includes('MST') || uk.includes('TAX') || uk.includes('MÃƒÆ’Ã†â€™ SÃƒÂ¡Ã‚Â»Ã‚Â THUÃƒÂ¡Ã‚ÂºÃ‚Â¾')) obj['MST'] = val;
                        if (uk.includes('CÃƒÆ’Ã¢â‚¬ÂNG TY') || uk.includes('TÃƒÆ’Ã…Â N') || uk.includes('NAME')) {
                            if (!isDate(val)) obj['TenCongTy'] = val;
                        }
                        if (uk.includes('EMAIL')) obj['Email'] = val;
                        if ((uk.includes('HÃƒÂ¡Ã‚ÂºÃ‚Â¾T HÃƒÂ¡Ã‚ÂºÃ‚Â N') || uk.includes('HÃƒÂ¡Ã‚ÂºÃ‚Â N GCN') || uk.includes('EXPIRATION') || uk.includes('HÃƒÂ¡Ã‚ÂºÃ‚Â N')) && !uk.includes('THÃƒÂ¡Ã‚Â»Ã…â€œI HÃƒÂ¡Ã‚ÂºÃ‚Â N')) {
                            obj['NgayHetHanChuKySo'] = val;
                        }
                        if (uk.includes('Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚Â»Ã…Â A CHÃƒÂ¡Ã‚Â»Ã‹â€ ') || uk.includes('ADDRESS')) obj['DiaChi'] = val;
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
                    statusEl.innerText = `ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ nÃƒÂ¡Ã‚ÂºÃ‚Â¡p thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng ${totalRows} dÃƒÆ’Ã‚Â²ng (DÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u chuÃƒÂ¡Ã‚ÂºÃ‚Â©n).`;
                    statusEl.className = 'text-sm font-bold text-emerald-400 text-center';
                } else if (rowsWithEmail > 0) {
                    statusEl.innerText = `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ nÃƒÂ¡Ã‚ÂºÃ‚Â¡p ${totalRows} dÃƒÆ’Ã‚Â²ng, nhÃƒâ€ Ã‚Â°ng chÃƒÂ¡Ã‚Â»Ã¢â‚¬Â° ${rowsWithEmail} dÃƒÆ’Ã‚Â²ng cÃƒÆ’Ã‚Â³ Email hÃƒÂ¡Ã‚Â»Ã‚Â£p lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡.`;
                    statusEl.className = 'text-sm font-bold text-orange-400 text-center';
                } else {
                    statusEl.innerText = `ÃƒÂ¢Ã‚ÂÃ…â€™ Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ nÃƒÂ¡Ã‚ÂºÃ‚Â¡p ${totalRows} dÃƒÆ’Ã‚Â²ng, nhÃƒâ€ Ã‚Â°ng KHÃƒÆ’Ã¢â‚¬ÂNG tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y Email nÃƒÆ’Ã‚Â o!`;
                    statusEl.className = 'text-sm font-bold text-red-400 text-center';
                }
            } else {
                statusEl.innerText = 'KhÃƒÆ’Ã‚Â´ng tÃƒÆ’Ã‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y dÃƒÆ’Ã‚Â²ng dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u nÃƒÆ’Ã‚Â o!';
                statusEl.className = 'text-sm font-bold text-orange-400 text-center';
            }
            renderPreviewTable();
        } catch (err) {
            console.error(err);
            statusEl.innerText = 'LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½ file!';
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
    const url = prompt('NhÃƒÂ¡Ã‚ÂºÃ‚Â­p URL liÃƒÆ’Ã‚Âªn kÃƒÂ¡Ã‚ÂºÃ‚Â¿t:', 'https://');
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
        img.title = 'Click Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ chÃƒÂ¡Ã‚Â»Ã¢â‚¬Â°nh kÃƒÆ’Ã‚Â­ch thÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc';
        
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
        { label: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â NhÃƒÂ¡Ã‚Â»Ã‚Â', w: '300px', desc: '300px' },
        { label: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â VÃƒÂ¡Ã‚Â»Ã‚Â«a', w: '450px', desc: '450px' },
        { label: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬â€œÃ‚Â¥ÃƒÂ¯Ã‚Â¸Ã‚Â LÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºn', w: '600px', desc: '600px' },
        { label: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â³ Full', w: '100%', desc: '100%' },
    ];
    
    // Title
    const title = document.createElement('span');
    title.textContent = 'KÃƒÆ’Ã‚Â­ch thÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc:';
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
    delBtn.textContent = 'ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã¢â‚¬ËœÃƒÂ¯Ã‚Â¸Ã‚Â';
    delBtn.title = 'XÃƒÆ’Ã‚Â³a ÃƒÂ¡Ã‚ÂºÃ‚Â£nh';
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
    closeBtn.textContent = 'ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¢';
    closeBtn.title = 'Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â³ng';
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
                img.title = 'Click Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ chÃƒÂ¡Ã‚Â»Ã¢â‚¬Â°nh kÃƒÆ’Ã‚Â­ch thÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc';
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

    if (!name) return alert('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p tÃƒÆ’Ã‚Âªn chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch');
    if (!subject) return alert('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p tiÃƒÆ’Ã‚Âªu Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â email');
    if (!senderId) return alert('Vui lÃƒÆ’Ã‚Â²ng chÃƒÂ¡Ã‚Â»Ã‚Ân tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n gÃƒÂ¡Ã‚Â»Ã‚Â­i');
    if (!currentRecipientsData || currentRecipientsData.length === 0) return alert('Vui lÃƒÆ’Ã‚Â²ng tÃƒÂ¡Ã‚ÂºÃ‚Â£i file dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u');

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
            alert('TÃƒÂ¡Ã‚ÂºÃ‚Â¡o chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            closeCreateModal();
            showPage('campaigns');
        } else if (contentType && contentType.indexOf("application/json") !== -1) {
            const err = await res.json();
            alert(`LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ${err.error || 'N/A'}\nChi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t: ${err.message || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'}\nGÃƒÂ¡Ã‚Â»Ã‚Â£i ÃƒÆ’Ã‚Â½: ${err.suggestion || 'LiÃƒÆ’Ã‚Âªn hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ kÃƒÂ¡Ã‚Â»Ã‚Â¹ thuÃƒÂ¡Ã‚ÂºÃ‚Â­t'}`);
        } else {
            const html = await res.text();
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng khi tÃƒÂ¡Ã‚ÂºÃ‚Â¡o chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch (HTML): ' + html.substring(0, 200));
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server: ' + e.message); }
}

// --- Template Save/Load ---
async function saveTemplate() {
    const name = prompt('Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚ÂºÃ‚Â·t tÃƒÆ’Ã‚Âªn cho mÃƒÂ¡Ã‚ÂºÃ‚Â«u email:', 'MÃƒÂ¡Ã‚ÂºÃ‚Â«u mÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºi');
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
            alert('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ lÃƒâ€ Ã‚Â°u mÃƒÂ¡Ã‚ÂºÃ‚Â«u thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            loadTemplates();
        } else if (contentType && contentType.indexOf("application/json") !== -1) {
            const err = await res.json();
            alert(`LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi lÃƒâ€ Ã‚Â°u mÃƒÂ¡Ã‚ÂºÃ‚Â«u: ${err.error || 'N/A'}\nChi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t: ${err.message || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'}\nGÃƒÂ¡Ã‚Â»Ã‚Â£i ÃƒÆ’Ã‚Â½: ${err.suggestion || 'LiÃƒÆ’Ã‚Âªn hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ kÃƒÂ¡Ã‚Â»Ã‚Â¹ thuÃƒÂ¡Ã‚ÂºÃ‚Â­t'}`);
        } else {
            const html = await res.text();
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng (HTML): ' + html.substring(0, 200));
        }
    } catch (e) { 
        console.error('[TEMPLATE_SAVE_ERROR]', e); 
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server khi lÃƒâ€ Ã‚Â°u mÃƒÂ¡Ã‚ÂºÃ‚Â«u: ' + e.message);
    }
}

async function loadTemplates() {
    try {
        const res = await authedFetch('/api/templates');
        const data = await res.json();
        const select = document.getElementById('select-template');
        if (select && Array.isArray(data)) {
            select.innerHTML = '<option value="">-- MÃƒÂ¡Ã‚ÂºÃ‚Â«u Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â£ lÃƒâ€ Ã‚Â°u --</option>' +
                data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
    } catch (e) {}
}

async function deleteTemplate() {
    const select = document.getElementById('select-template');
    const id = select.value;
    if (!id) return alert('Vui lÃƒÆ’Ã‚Â²ng chÃƒÂ¡Ã‚Â»Ã‚Ân mÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t mÃƒÂ¡Ã‚ÂºÃ‚Â«u Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ xÃƒÆ’Ã‚Â³a');
    
    if (!confirm('BÃƒÂ¡Ã‚ÂºÃ‚Â¡n cÃƒÆ’Ã‚Â³ chÃƒÂ¡Ã‚ÂºÃ‚Â¯c chÃƒÂ¡Ã‚ÂºÃ‚Â¯n muÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœn xÃƒÆ’Ã‚Â³a mÃƒÂ¡Ã‚ÂºÃ‚Â«u email nÃƒÆ’Ã‚Â y?')) return;
    
    try {
        const res = await authedFetch(`/api/templates/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ xÃƒÆ’Ã‚Â³a mÃƒÂ¡Ã‚ÂºÃ‚Â«u thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            document.getElementById('input-template').innerHTML = '';
            loadTemplates();
        } else {
            const err = await res.json();
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (err.error || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ'));
        }
    } catch (e) { alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi server'); }
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
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi tÃƒÂ¡Ã‚ÂºÃ‚Â£i mÃƒÂ¡Ã‚ÂºÃ‚Â«u: ' + e.message);
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
                    <div class="empty-icon">ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‹â€ </div>
                    <div class="empty-title">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u bÃƒÆ’Ã‚Â¡o cÃƒÆ’Ã‚Â¡o</div>
                    <div class="empty-desc">GÃƒÂ¡Ã‚Â»Ã‚Â­i chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u tiÃƒÆ’Ã‚Âªn Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ xem bÃƒÆ’Ã‚Â¡o cÃƒÆ’Ã‚Â¡o chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t</div>
                </div>
            `;
            return;
        }

        list.innerHTML = logs.map(log => {
            const isSuccess = log.status === 'success' || log.status === 'ThÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng';
            const badgeType = isSuccess ? 'badge-done' : 'badge-pending';
            const statusLabel = isSuccess ? 'ThÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng' : 'ThÃƒÂ¡Ã‚ÂºÃ‚Â¥t bÃƒÂ¡Ã‚ÂºÃ‚Â¡i';
            const date = new Date(log.created_at).toLocaleString('vi-VN');

            return `
                <div class="list-item">
                    <div class="flex-1">
                        <div class="list-item-title">${log.recipient_email || log.email || 'N/A'}</div>
                        <div class="list-item-meta">${date}</div>
                    </div>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-500 font-bold uppercase mb-1">ChiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch</div>
                        <div class="text-xs font-bold text-white truncate max-w-[150px]">${log.campaign_name || log.campaigns?.name || 'N/A'}</div>
                    </div>
                    <div class="flex justify-center">
                        <span class="badge-premium ${badgeType}">
                            <span class="badge-dot"></span>
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="flex-1 text-right ml-4">
                        ${!isSuccess ? `<div class="text-[9px] text-red-500 font-medium italic line-clamp-1" title="${log.error_message || ''}">${log.error_message || 'LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khÃƒÆ’Ã‚Â´ng xÃƒÆ’Ã‚Â¡c Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹nh'}</div>` : '<div class="text-[9px] text-green-500/50">OK</div>'}
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
                <div class="empty-icon text-5xl mb-4">\u{1F4CB}</div>
                <div class="empty-title text-xl font-bold text-white mb-2">Kh\u00f4ng t\u00ecm th\u1ea5y d\u1eef li\u1ec7u</div>
                <div class="empty-desc text-gray-500 text-sm mb-6">Th\u1eed thay \u0111\u1ed5i b\u1ed9 l\u1ecdc ho\u1eb7c t\u00ecm ki\u1ebfm l\u1ea1i.</div>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(c => {
        const daysLeft = calculateRemainingDays(c.expired_date);
        const isExpired = daysLeft < 0;
        const statusLabel = isExpired ? 'Ã„ÂÃƒÂ£ hÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n' : `CÃƒÂ²n ${daysLeft} ngÃƒÂ y`;

        // Ensure all types use the same editCRM handler
        return `
            <div class="crm-row p-5 rounded-2xl border ${isExpired ? 'border-red-500/30' : 'border-white/10 hover:border-orange-500/30'} flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all cursor-pointer mb-3 relative group" 
                 onclick="editCRM('${c.id}')" 
                 style="background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border-radius: 16px; pointer-events: auto !important; z-index: 10;">
                ${isExpired ? '<div class="absolute inset-0 bg-red-500/5 rounded-2xl" style="pointer-events: none;"></div>' : ''}
                <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-all rounded-2xl" style="pointer-events: none;"></div>
                <div class="flex-1 relative" style="z-index: 2; pointer-events: none;">
                    <div class="text-base font-black text-white mb-1 drop-shadow-md">${c.company_name || 'N/A'}</div>
                    <div class="text-xs font-bold text-gray-400 flex items-center gap-2">
                        <span class="text-orange-400"><i class="fas fa-hashtag"></i> ${c.mst || '---'}</span>
                        <span class="text-white/20">&bull;</span>
                        <span class="text-blue-400"><i class="fas fa-layer-group"></i> ${c.service_type || 'DÃ¡Â»â€¹ch vÃ¡Â»Â¥'}</span>
                    </div>
                </div>
                <div class="text-center relative bg-black/30 px-5 py-2.5 rounded-xl border border-white/5" style="z-index: 2; pointer-events: none;">
                    <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">NgÃƒÂ y hÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n</div>
                    <div class="text-sm font-black ${isExpired ? 'text-red-400' : 'text-white'}">${formatDate(c.expired_date)}</div>
                </div>
                <div class="flex justify-center relative min-w-[130px]" style="z-index: 2; pointer-events: none;">
                    <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${isExpired ? 'bg-red-500/10 text-red-500 border-red-500/20' : (daysLeft <= 60 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20')} shadow-lg flex items-center gap-1.5">
                        ${isExpired ? '<i class="fas fa-exclamation-circle fa-beat-fade"></i>' : '<i class="fas fa-check-circle"></i>'} ${statusLabel}
                    </span>
                </div>
                <div class="flex justify-end gap-2 relative" style="z-index: 20;">
                    <button class="crm-edit-btn w-11 h-11 rounded-xl bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-400 border border-blue-500/20 transition-all flex items-center justify-center shadow-lg active:scale-95 opacity-70 group-hover:opacity-100" 
                            onclick="event.stopPropagation(); editCRM('${c.id}')" 
                            style="pointer-events: auto !important; position: relative; z-index: 25;"
                            title="SÃ¡Â»Â­a khÃƒÂ¡ch hÃƒÂ ng">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="crm-delete-btn w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500 hover:text-white text-gray-400 border border-white/10 transition-all flex items-center justify-center shadow-lg active:scale-95" 
                            onclick="event.stopPropagation(); deleteCRM('${c.id}')" 
                            style="pointer-events: auto !important; position: relative; z-index: 25;"
                            title="XÃƒÂ³a khÃƒÂ¡ch hÃƒÂ ng">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (typeof refreshCustomSelects === 'function') refreshCustomSelects();
}


// Filter CRM by service from chips
window.filterCRMByService = function(service) {
    const select = document.getElementById('crm-filter-service');
    if (select) {
        // Map UI chip values to internal filter values
        let filterVal = service;
        if (service === 'CA') filterVal = 'CKS';
        if (service === 'BHXH') filterVal = 'EBH';
        
        select.value = filterVal;
        renderCA2CRM();
        
        // Update chip active states
        document.querySelectorAll('.chip').forEach(chip => {
            const chipText = chip.textContent.trim().toLowerCase();
            const isAll = service === 'all' && chipText.includes('t\u1ea5t c\u1ea3');
            const isCKS = service === 'CA' && (chipText.includes('ch\u1eef k\u00fd s\u1ed1') || chipText.includes('cks'));
            const isBHXH = service === 'BHXH' && (chipText.includes('bhxh') || chipText.includes('b\u1ea3o hi\u1ec3m'));
            const isHDDT = service === 'HDDT' && (chipText.includes('h\u00f3a \u0111\u01a1n') || chipText.includes('hddt'));
            
            if (isAll || isCKS || isBHXH || isHDDT) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }
};

// ===== EVENT DELEGATION FOR CRM LIST =====
// Removed setupCRMListClickHandlers in favor of direct onclick handlers for reliability



function formatRelativeTime(dateValue) {
    if (!dateValue) return 'ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ thÃƒÂ¡Ã‚Â»Ã‚Âi gian';
    const diffMs = Date.now() - new Date(dateValue).getTime();
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
    if (diffMinutes < 60) return `${diffMinutes} phÃƒÆ’Ã‚Âºt trÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giÃƒÂ¡Ã‚Â»Ã‚Â trÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} ngÃƒÆ’Ã‚Â y trÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc`;
}

function getToneClass(tone) {
    if (tone === 'success') return 'ios-tone-success';
    if (tone === 'warning') return 'ios-tone-warning';
    if (tone === 'danger') return 'ios-tone-danger';
    return 'ios-tone-neutral';
}

function getCampaignStatusMeta(status) {
    const normalized = normalizeText(status);
    if (normalized.includes('hoan thanh')) return { tone: 'success', label: 'HoÃƒÆ’Ã‚Â n thÃƒÆ’Ã‚Â nh' };
    if (normalized.includes('dang gui') || normalized.includes('dang hang doi') || normalized.includes('dang xu ly')) return { tone: 'warning', label: 'Ãƒâ€žÃ‚Âang chÃƒÂ¡Ã‚ÂºÃ‚Â¡y' };
    if (normalized.includes('loi') || normalized.includes('that bai')) return { tone: 'danger', label: 'CÃƒÆ’Ã‚Â³ lÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i' };
    return { tone: 'neutral', label: status || 'ChÃƒÂ¡Ã‚Â»Ã‚Â xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½' };
}

function getLogStatusMeta(status) {
    const normalized = normalizeText(status);
    if (normalized.includes('success') || normalized.includes('thanh cong') || normalized === 'sent') return { tone: 'success', label: 'ThÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng' };
    if (normalized.includes('pending') || normalized.includes('retry') || normalized.includes('queue')) return { tone: 'warning', label: 'Ãƒâ€žÃ‚Âang chÃƒÂ¡Ã‚Â»Ã‚Â' };
    if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('that bai')) return { tone: 'danger', label: 'ThÃƒÂ¡Ã‚ÂºÃ‚Â¥t bÃƒÂ¡Ã‚ÂºÃ‚Â¡i' };
    return { tone: 'neutral', label: status || 'KhÃƒÆ’Ã‚Â´ng rÃƒÆ’Ã‚Âµ' };
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
                        <h4 class="ios-campaign-title">${campaign.name || 'ChiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch chÃƒâ€ Ã‚Â°a Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â·t tÃƒÆ’Ã‚Âªn'}</h4>
                        <p class="ios-campaign-meta">${formatDate(campaign.created_at)} &bull; ${formatRelativeTime(campaign.created_at)}</p>
                    </div>
                    <span class="ios-status-pill ${getToneClass(statusMeta.tone)}">${statusMeta.label}</span>
                </div>
                <div class="ios-campaign-stats">
                    <div><span>NgÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi nhÃƒÂ¡Ã‚ÂºÃ‚Â­n</span><strong>${total}</strong></div>
                    <div><span>Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ gÃƒÂ¡Ã‚Â»Ã‚Â­i</span><strong>${sent}</strong></div>
                    <div><span>LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i</span><strong>${failed}</strong></div>
                </div>
                <div class="ios-progress-wrap">
                    <div class="ios-progress-bar">
                        <div class="ios-progress-fill ${getToneClass(statusMeta.tone)}" style="width:${successPct}%"></div>
                    </div>
                    <span class="ios-progress-label">${successPct}% hoÃƒÆ’Ã‚Â n tÃƒÂ¡Ã‚ÂºÃ‚Â¥t</span>
                </div>
            </div>
            <div class="ios-campaign-actions">
                ${!isDone && !isRunning ? `<button onclick="event.stopPropagation(); startCampaign('${campaign.id}')" class="ios-icon-btn ios-icon-btn-primary" title="BÃƒÂ¡Ã‚ÂºÃ‚Â¯t Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u gÃƒÂ¡Ã‚Â»Ã‚Â­i"><i class="fas fa-play"></i></button>` : ''}
                <button onclick="event.stopPropagation(); deleteCampaign('${campaign.id}')" class="ios-icon-btn ios-icon-btn-danger" title="XÃƒÆ’Ã‚Â³a chiÃƒÂ¡Ã‚ÂºÃ‚Â¿n dÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ch"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;
}


// --- Final stability overrides ---
function mapCRMServiceToPricing(val) {
    const normalized = normalizeText(val);
    const transaction = getCRMTransactionForService(val);

    if (normalized.includes('cks') || normalized.includes('chu ky so') || normalized.includes('chu ky')) return { group: 'CKS', transaction };
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

        // Standardize service names for EBH/BHXH and CKS
        CRM_PRICE_LIST.forEach(p => {
            if (p.service_name === 'B\u1ea3o hi\u1ec3m x\u00e3 h\u1ed9i') p.service_name = 'EBH';
            if (p.service_name === 'H\u00f3a \u0111\u01a1n \u0111i\u1ec7n t\u1eed') p.service_name = 'eINVOICE';
            if (p.service_name === 'Ch\u1eef k\u00fd s\u1ed1' || p.service_name === 'Ch\u1eef k\u00fd s\u1ed1 CA2') p.service_name = 'CKS';
        });

        refreshPricingUI();
    } catch (err) {
        console.error('[CRM] Error loading prices:', err);
    }
}

function updateCRMPackages() {
    const serviceVal = repairVietnameseText(document.getElementById('ca2-crm-service').value);
    const customerType = repairVietnameseText(document.getElementById('ca2-crm-customer-type').value);
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
        pkgSelect.innerHTML = '<option value="">Ch\u01b0a c\u00f3 g\u00f3i</option>';
        document.getElementById('ca2-crm-amount').value = '0';
        repairElementText(pkgSelect);
        return;
    }

    itemsToDisplay.forEach(p => {
        const opt = document.createElement('option');
        const durationLabel = inferDurationFromPackage(serviceVal, `${p.duration_months || ''} thang ${p.package_name || ''}`);
        opt.value = repairVietnameseText(p.package_name);
        opt.textContent = `${repairVietnameseText(p.package_name)} - ${new Intl.NumberFormat('vi-VN').format(p.price || 0)}\u0111`;
        opt.dataset.price = String(p.price || 0);
        opt.dataset.durationLabel = durationLabel;
        opt.dataset.durationMonths = String(p.duration_months || '');
        opt.dataset.transactionType = p.transaction_type || '';
        opt.dataset.category = p.category || '';
        pkgSelect.appendChild(opt);
    });

    if (oldVal && [...pkgSelect.options].some(o => o.value === oldVal)) {
        pkgSelect.value = oldVal;
    } else {
        pkgSelect.selectedIndex = 0;
    }
    repairElementText(pkgSelect);

    const cksTypeInput = document.getElementById('ca2-crm-cks-type');
    if (cksTypeInput) {
        const normalizedService = normalizeText(serviceVal);
        if (!normalizedService.includes('cks') && !normalizedService.includes('chu ky so')) {
            cksTypeInput.value = 'cap_moi';
        } else if (!cksTypeInput.value) {
            if (desiredTransaction === 'gia han' && normalizedService.includes('dung thu')) cksTypeInput.value = 'gia_han_thu';
            else if (desiredTransaction === 'gia han') cksTypeInput.value = 'gia_han';
            else cksTypeInput.value = 'cap_moi';
        }
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



function refreshSettingsStaticText() {
    const view = document.getElementById('view-settings');
    if (!view) return;

    // Title & Subtitle handled by HTML template now
    
    // Ensure tab buttons maintain their labels if they were somehow cleared
    const tabButtons = [
        ['tab-settings-account', 'TÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n'],
        ['tab-settings-interface', 'Giao diÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n'],
        ['tab-settings-system', 'HÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng']
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
        roleBadge.innerText = `Vai trÃƒÆ’Ã‚Â²: ${currentUser.role === 'admin' ? 'QuÃƒÂ¡Ã‚ÂºÃ‚Â£n trÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ viÃƒÆ’Ã‚Âªn' : 'NhÃƒÆ’Ã‚Â¢n viÃƒÆ’Ã‚Âªn'}`;
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

// --- NEW PRICING MANAGEMENT LOGIC (PhÃƒÂ¡Ã‚ÂºÃ‚Â§n 1, 6, 7, 8) ---
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
                    ${item.customer_group || 'CÃƒÆ’Ã‚Â´ng ty'}
                </span>
            </td>
            <td class="px-8 py-4 text-center">
                <span class="px-3 py-1 rounded-lg bg-white/5 text-xs font-bold text-gray-300">${item.duration_months} thÃƒÆ’Ã‚Â¡ng</span>
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
        showToast('GiÃƒÆ’Ã‚Â¡ phÃƒÂ¡Ã‚ÂºÃ‚Â£i lÃƒÆ’Ã‚Â  sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ dÃƒâ€ Ã‚Â°Ãƒâ€ Ã‚Â¡ng!', 'error');
        renderPricingTable();
        return;
    }
    CRM_PRICE_LIST[index].price = price;
    showToast(`Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ cÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t giÃƒÆ’Ã‚Â¡: ${new Intl.NumberFormat('vi-VN').format(price)}Ãƒâ€žÃ¢â‚¬Ëœ`, 'success');
}

function togglePricingStatus(index) {
    CRM_PRICE_LIST[index].is_active = !CRM_PRICE_LIST[index].is_active;
    renderPricingTable();
}

function setPricingGroup(group) {
    document.getElementById('add-pricing-group').value = group;
    // UI Update
    document.getElementById('btn-group-company').classList.toggle('active', group === 'CÃƒÆ’Ã‚Â´ng ty');
    document.getElementById('btn-group-individual').classList.toggle('active', group === 'CÃƒÆ’Ã‚Â¡ nhÃƒÆ’Ã‚Â¢n/HKD');
}

function openAddPricingModal() {
    document.getElementById('modal-add-pricing').classList.remove('hidden');
    setPricingGroup('CÃƒÆ’Ã‚Â´ng ty'); // Default
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
        showToast('Vui lÃƒÆ’Ã‚Â²ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§y Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â§ thÃƒÆ’Ã‚Â´ng tin hÃƒÂ¡Ã‚Â»Ã‚Â£p lÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡!', 'error');
        return;
    }

    // Safety: No duplicate for same service/package/duration/group
    const duplicate = CRM_PRICE_LIST.find(p => p.service_name === service && p.package_name === pkg && p.duration_months === duration && p.customer_group === group);
    if (duplicate) {
        showToast('GÃƒÆ’Ã‚Â³i nÃƒÆ’Ã‚Â y Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â£ tÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“n tÃƒÂ¡Ã‚ÂºÃ‚Â¡i!', 'warning');
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
    showToast('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ thÃƒÆ’Ã‚Âªm gÃƒÆ’Ã‚Â³i mÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºi. NhÃƒÂ¡Ã‚ÂºÃ‚Â¥n "LÃƒâ€ Ã‚Â°u thay Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢i" Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã†â€™ Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ng bÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ database!', 'success');
    closeAddPricingModal();
    renderPricingTable();
}

async function deletePricingItem(idOrIndex) {
    if (!confirm('BÃƒÂ¡Ã‚ÂºÃ‚Â¡n cÃƒÆ’Ã‚Â³ chÃƒÂ¡Ã‚ÂºÃ‚Â¯c muÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœn xÃƒÆ’Ã‚Â³a gÃƒÆ’Ã‚Â³i nÃƒÆ’Ã‚Â y?')) return;
    
    if (typeof idOrIndex === 'string' && idOrIndex.length > 5) {
        try {
            const res = await authedFetch(`/api/crm/prices/${idOrIndex}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            CRM_PRICE_LIST = CRM_PRICE_LIST.filter(p => p.id !== idOrIndex);
        } catch (e) {
            showToast('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi xÃƒÆ’Ã‚Â³a: ' + e.message, 'error');
            return;
        }
    } else {
        CRM_PRICE_LIST.splice(idOrIndex, 1);
    }
    
    renderPricingTable();
    showToast('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ xÃƒÆ’Ã‚Â³a gÃƒÆ’Ã‚Â³i thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng', 'success');
}

async function saveAllPricing() {
    if (currentUser.role !== 'admin') {
        showToast('ChÃƒÂ¡Ã‚Â»Ã¢â‚¬Â° Admin mÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºi cÃƒÆ’Ã‚Â³ quyÃƒÂ¡Ã‚Â»Ã‚Ân cÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t bÃƒÂ¡Ã‚ÂºÃ‚Â£ng giÃƒÆ’Ã‚Â¡!', 'error');
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

        showToast('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ng bÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ toÃƒÆ’Ã‚Â n bÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ bÃƒÂ¡Ã‚ÂºÃ‚Â£ng giÃƒÆ’Ã‚Â¡ hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng!', 'success');
        updateCRMPackages();
    } catch (err) {
        showToast('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi lÃƒâ€ Ã‚Â°u: ' + err.message, 'error');
    }
}

async function resetPricingToDefault() {
    if (!confirm('BÃƒÂ¡Ã‚ÂºÃ‚Â¡n muÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœn reset bÃƒÂ¡Ã‚ÂºÃ‚Â£ng giÃƒÆ’Ã‚Â¡ vÃƒÂ¡Ã‚Â»Ã‚Â mÃƒÂ¡Ã‚ÂºÃ‚Â·c Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹nh (XÃƒÆ’Ã‚Â³a sÃƒÂ¡Ã‚ÂºÃ‚Â¡ch DB vÃƒÆ’Ã‚Â  dÃƒÆ’Ã‚Â¹ng fallback)?')) return;
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
            alert('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ lÃƒâ€ Ã‚Â°u cÃƒÂ¡Ã‚ÂºÃ‚Â¥u hÃƒÆ’Ã‚Â¬nh hÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            // Update local state
            if (currentUser.settings) currentUser.settings.default_storage_path = path;
        } else {
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi lÃƒâ€ Ã‚Â°u cÃƒÂ¡Ã‚ÂºÃ‚Â¥u hÃƒÆ’Ã‚Â¬nh.');
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi: ' + e.message);
    }
}

async function refreshUserList() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    
    list.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-gray-500">Ãƒâ€žÃ‚Âang tÃƒÂ¡Ã‚ÂºÃ‚Â£i danh sÃƒÆ’Ã‚Â¡ch...</td></tr>';
    
    try {
        const res = await authedFetch('/api/admin/users');
        if (!res.ok) throw new Error('KhÃƒÆ’Ã‚Â´ng thÃƒÂ¡Ã‚Â»Ã†â€™ tÃƒÂ¡Ã‚ÂºÃ‚Â£i danh sÃƒÆ’Ã‚Â¡ch ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi dÃƒÆ’Ã‚Â¹ng');
        
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
                    ${isMe ? '<span class="text-[9px] text-gray-600 font-black italic">Ãƒâ€žÃ‚Âang sÃƒÂ¡Ã‚Â»Ã‚Â­ dÃƒÂ¡Ã‚Â»Ã‚Â¥ng</span>' : `
                        <div class="flex justify-end gap-2">
                            <button onclick="changeUserRole('${u.id}', '${u.role === 'admin' ? 'staff' : 'admin'}')" class="text-[9px] font-black uppercase text-blue-400 hover:text-white border border-blue-400/30 hover:bg-blue-400 px-3 py-1.5 rounded-lg transition-all">
                                Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢i thÃƒÆ’Ã‚Â nh ${u.role === 'admin' ? 'Staff' : 'Admin'}
                            </button>
                            <button onclick="deleteUser('${u.id}')" class="text-[9px] font-black uppercase text-red-500 hover:text-white border border-red-500/30 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-all">
                                XÃƒÆ’Ã‚Â³a
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
    if (!confirm(`XÃƒÆ’Ã‚Â¡c nhÃƒÂ¡Ã‚ÂºÃ‚Â­n thay Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢i vai trÃƒÆ’Ã‚Â² ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi dÃƒÆ’Ã‚Â¹ng thÃƒÆ’Ã‚Â nh ${newRole.toUpperCase()}?`)) return;
    
    try {
        const res = await authedFetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        
        if (res.ok) {
            alert('CÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t vai trÃƒÆ’Ã‚Â² thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            refreshUserList();
        } else {
            const err = await res.json();
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + err.error);
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi: ' + e.message);
    }
}

async function deleteUser(id) {
    if (!confirm('XÃƒÆ’Ã‚Â¡c nhÃƒÂ¡Ã‚ÂºÃ‚Â­n xÃƒÆ’Ã‚Â³a tÃƒÆ’Ã‚Â i khoÃƒÂ¡Ã‚ÂºÃ‚Â£n ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi dÃƒÆ’Ã‚Â¹ng nÃƒÆ’Ã‚Â y?')) return;
    
    try {
        const res = await authedFetch(`/api/admin/users/${id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            alert('Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ xÃƒÆ’Ã‚Â³a quyÃƒÂ¡Ã‚Â»Ã‚Ân truy cÃƒÂ¡Ã‚ÂºÃ‚Â­p ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Âi dÃƒÆ’Ã‚Â¹ng thÃƒÆ’Ã‚Â nh cÃƒÆ’Ã‚Â´ng!');
            refreshUserList();
        } else {
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i khi xÃƒÆ’Ã‚Â³a.');
        }
    } catch (e) {
        alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÂ¡Ã‚ÂºÃ‚Â¿t nÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi: ' + e.message);
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
        `).join('') || '<p class="text-center py-10 text-gray-600 text-xs italic">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ tÃƒÆ’Ã‚Â i liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u nÃƒÆ’Ã‚Â o.</p>';
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
        `).join('') || '<p class="text-center py-10 text-gray-600 text-xs italic">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ mÃƒÂ¡Ã‚ÂºÃ‚Â«u bÃƒÆ’Ã‚Â¡o giÃƒÆ’Ã‚Â¡ nÃƒÆ’Ã‚Â o.</p>';
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
    document.getElementById('doc-file-name').innerText = 'ChÃƒÂ¡Ã‚Â»Ã‚Ân file hoÃƒÂ¡Ã‚ÂºÃ‚Â·c kÃƒÆ’Ã‚Â©o thÃƒÂ¡Ã‚ÂºÃ‚Â£ vÃƒÆ’Ã‚Â o Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â¢y';
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
        alert('Vui lÃƒÆ’Ã‚Â²ng chÃƒÂ¡Ã‚Â»Ã‚Ân file');
        return;
    }
    const bucket = document.getElementById('upload-doc-bucket').value;
    const formData = new FormData();
    formData.append('file', selectedUploadFile);
    formData.append('bucket', bucket);

    const btn = document.getElementById('upload-doc-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Ãƒâ€žÃ‚ÂANG TÃƒÂ¡Ã‚ÂºÃ‚Â¢I LÃƒÆ’Ã…Â N...';
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
            alert('LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i: ' + (err.error || 'Upload thÃƒÂ¡Ã‚ÂºÃ‚Â¥t bÃƒÂ¡Ã‚ÂºÃ‚Â¡i'));
        }
    } catch (e) {
        console.error('Upload Error:', e);
    } finally {
        btn.innerHTML = 'BÃƒÂ¡Ã‚ÂºÃ‚Â®T Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚ÂºÃ‚Â¦U TÃƒÂ¡Ã‚ÂºÃ‚Â¢I LÃƒÆ’Ã…Â N';
        btn.disabled = false;
    }
}

async function deleteDoc(bucket, name) {
    if (!confirm(`XÃƒÆ’Ã‚Â³a file "${name}"?`)) return;
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
