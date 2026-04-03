let globalSEONews = [];
let isSEONewsLoaded = false;
let isSEOPostsLoaded = false;
let g_seoPosts = {};

// Hook into app.js showPage using a more robust method
(function() {
    const checkPage = (pageId) => {
        console.log('[SEO] Tab switched to:', pageId);
        if (pageId === 'seo-news' && !isSEONewsLoaded) {
            loadSEONews();
        }
        if (pageId === 'seo-posts' && !isSEOPostsLoaded) {
            loadSEOPosts();
        }
    };

    const originalShowPage = window.showPage;
    window.showPage = function(pageId) {
        if (typeof originalShowPage === 'function') originalShowPage(pageId);
        checkPage(pageId);
    };

    // If already on the page (initial load)
    const currentView = document.querySelector('[id^="view-"]:not(.hidden)');
    if (currentView) {
        const id = currentView.id.replace('view-', '');
        checkPage(id);
    }
})();

async function loadSEONews() {
    isSEONewsLoaded = true;
    const grid = document.getElementById('seo-news-grid');
    grid.innerHTML = '<div class="col-span-full text-center text-orange-400 font-bold p-10"><i class="fas fa-spinner fa-spin mr-2"></i> Đang tải bản tin Thuế cập nhật nhất...</div>';
    try {
        const res = await authedFetch('/api/seo/news');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        globalSEONews = data;
        renderSEONews(globalSEONews);
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full p-10 text-red-500 font-bold bg-red-500/10 rounded-2xl border border-red-500/20">Lỗi tải tin tức: ${e.message}</div>`;
    }
}

function renderSEONews(data) {
    const grid = document.getElementById('seo-news-grid');
    if (!data || data.length === 0) {
        grid.innerHTML = '<div class="col-span-full p-10 text-center text-gray-500 italic font-bold">Không tìm thấy tin tức nào. Thử tải lại trang hoặc đổi bộ lọc.</div>';
        return;
    }
    
    let html = '';
    data.forEach((news, idx) => {
        const d = new Date(news.publish_date).toLocaleString('vi-VN');
        const delay = (idx % 10) * 50;
        
        let colorClass = 'bg-orange-600 shadow-orange-900/50';
        if (news.source === 'Luật Việt Nam') colorClass = 'bg-blue-600 shadow-blue-900/50';
        else if (news.source === 'WebKetoan') colorClass = 'bg-green-600 shadow-green-900/50';
        else if (news.source === 'Tổng cục Thuế' || news.source === 'Bộ Tài Chính') colorClass = 'bg-red-600 shadow-red-900/50';
        
        html += `
            <div class="bg-gradient-to-br from-white/5 to-transparent border border-white/10 p-6 rounded-[24px] hover:bg-white/10 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-white/5 group animate-in fade-in slide-in-from-bottom-4 duration-500" style="animation-delay: ${delay}ms; animation-fill-mode: both;">
                <div class="flex justify-between items-start mb-4">
                    <div class="text-[10px] text-white ${colorClass} px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-lg">${news.source}</div>
                    <div class="text-[10px] text-gray-500 font-bold">${d}</div>
                </div>
                <h3 class="text-lg font-black text-white mb-3 line-clamp-2 group-hover:text-blue-400 transition-colors leading-tight">${news.title}</h3>
                <p class="text-sm text-gray-400 line-clamp-3 mb-6 font-medium leading-relaxed">${news.summary}</p>
                <a href="${news.url}" target="_blank" class="inline-flex items-center text-orange-500 font-black text-sm hover:underline group-hover:translate-x-1 transition-transform">
                    Đọc chi tiết <i class="fas fa-arrow-right ml-2 text-[10px]"></i>
                </a>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function filterSEONews(category) {
    document.querySelectorAll('#seo-news-filters button').forEach(btn => {
        if (btn.innerText.toLowerCase() === category.toLowerCase() || (category === 'all' && btn.innerText === 'Tất cả')) {
            btn.classList.replace('bg-white/5', 'bg-orange-500/20');
            btn.classList.replace('text-gray-400', 'text-orange-400');
            btn.classList.add('border-orange-500/30');
            btn.classList.remove('border-transparent', 'hover:text-white');
        } else {
            btn.classList.replace('bg-orange-500/20', 'bg-white/5');
            btn.classList.replace('text-orange-400', 'text-gray-400');
            btn.classList.remove('border-orange-500/30');
            btn.classList.add('border-transparent', 'hover:text-white');
        }
    });

    const keyword = document.getElementById('seo-news-search').value.toLowerCase();
    
    let filtered = globalSEONews;
    if (category !== 'all') {
        filtered = filtered.filter(n => (n.title + ' ' + n.summary + ' ' + (n.content || '')).toLowerCase().includes(category.toLowerCase()));
    }
    if (keyword) {
        filtered = filtered.filter(n => (n.title + ' ' + n.summary + ' ' + (n.source || '')).toLowerCase().includes(keyword));
    }
    
    renderSEONews(filtered);
}

function searchSEONews(keyword) {
    let activeCat = 'all';
    document.querySelectorAll('#seo-news-filters button').forEach(btn => {
        if (btn.classList.contains('text-orange-400')) {
            activeCat = btn.innerText === 'Tất cả' ? 'all' : btn.innerText.toLowerCase();
        }
    });
    
    filterSEONews(activeCat);
}

async function generateSEOArticle() {
    const keyword = document.getElementById('seo-keyword').value.trim();
    const tone = document.getElementById('seo-tone').value;
    const length = document.getElementById('seo-length').value;
    
    if (!keyword) {
        alert('Vui lòng nhập từ khóa');
        return;
    }
    
    const btn = document.getElementById('btn-generate-article');
    const loading = document.getElementById('seo-article-loading');
    
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    loading.classList.remove('hidden');
    
    try {
        const res = await authedFetch('/api/seo/generate-article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, tone, length })
        });
        const data = await res.json();
        
        if (data.error) {
           const msg = typeof data.error === 'string' ? data.error : (data.error.error?.message || JSON.stringify(data.error));
           throw new Error(msg);
        }
        
        isSEOPostsLoaded = false; // force reload next time user clicks tab
        
        // Show result directly
        document.getElementById('seo-modal-title').innerText = "Kết quả bài viết: " + data.title;
        document.getElementById('seo-modal-content').value = data.content;
        document.getElementById('modal-seo-edit').classList.remove('hidden');
        
    } catch (e) {
        alert('Lỗi tạo bài bằng AI: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        loading.classList.add('hidden');
    }
}

function copySEOContent() {
    const el = document.getElementById('seo-modal-content');
    el.select();
    document.execCommand('copy');
    
    // Smooth button feedback
    const btn = event.target.closest('button');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Đã Copy!';
    btn.classList.replace('bg-orange-gradient', 'bg-green-600');
    
    setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.classList.replace('bg-green-600', 'bg-orange-gradient');
    }, 2000);
}

function closeSEOModal() {
    document.getElementById('modal-seo-edit').classList.add('hidden');
}

async function generateImageFromArticleContent() {
    const title = document.getElementById('seo-modal-title').innerText.replace('Kết quả bài viết: ', '').trim();
    const content = document.getElementById('seo-modal-content').value;
    
    // Close current modal
    closeSEOModal();
    
    // Switch to Image Gen Tab
    if (window.showPage) {
        window.showPage('seo-image');
    }
    
    // Generate an optimized English prompt based on the title
    // Simplified translation/format for better AI results
    const prompt = `A professional, high-quality editorial illustration for a blog post about: "${title}". Cinematic lighting, photorealistic, business office style, 8k resolution, clean composition.`;
    
    const promptInput = document.getElementById('seo-image-prompt');
    if (promptInput) {
        promptInput.value = prompt;
        // Scroll to the top of the view
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Short delay to let the tab switch animation finish
        setTimeout(() => {
            // Find and click the generate button
            const genBtn = document.querySelector('button[onclick="generateSEOImage()"]');
            if (genBtn) {
                genBtn.click();
            }
        }, 800);
    }
}


async function generateSEOImage() {
    const prompt = document.getElementById('seo-image-prompt').value.trim();
    if (!prompt) {
        alert('Vui lòng nhập mô tả để AI vẽ ảnh');
        return;
    }
    
    const btn = document.getElementById('btn-generate-image');
    const loading = document.getElementById('seo-image-loading');
    const preview = document.getElementById('seo-image-preview');
    const imgEl = document.getElementById('seo-image-result');
    const placeholder = document.getElementById('seo-image-placeholder');
    const useLogo = document.getElementById('seo-image-logo').checked;
    const logoIdx = document.getElementById('selected-logo-idx').value;
    const logoUrl = `/logo-ca2-${logoIdx}.png`;
    
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    placeholder.classList.add('hidden');
    preview.classList.add('hidden');
    preview.classList.remove('flex');
    loading.classList.remove('hidden');
    // Update loading text to be more descriptive
    const loadingText = loading.querySelector('p');
    if (loadingText) loadingText.innerText = 'Đang tinh chỉnh mô tả & Vẽ ảnh... (Có thể mất 10-15s)';
    
    try {
        // Basic client-side sanitization: strip Markdown headers and bullet points
        const cleanPrompt = prompt
            .replace(/[#*_~`>]/g, '') // Remove Markdown special characters
            .replace(/\n+/g, ' ')    // Replace newlines with spaces for a single-line prompt
            .trim();

        const res = await authedFetch('/api/seo/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: cleanPrompt })
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        // Create a new image to cache and bind load event
        const tempImg = new Image();
        
        // Add timeout fallback - if image doesn't load in 45s, show error
        const imgTimeout = setTimeout(() => {
            tempImg.src = ''; // Cancel loading
            alert('Ảnh tải quá lâu (timeout). Pollinations.ai có thể đang quá tải. Vui lòng thử lại sau ít phút.');
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            loading.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }, 45000);
        
        tempImg.onload = async () => {
            clearTimeout(imgTimeout);
            if (useLogo) {
                try {
                    const watermarkedBase64 = await applyLogoToImage(tempImg, logoUrl);
                    imgEl.src = watermarkedBase64;
                } catch (err) {
                    console.error('Lỗi chèn logo:', err);
                    imgEl.src = tempImg.src; // fallback to original
                }
            } else {
                imgEl.src = tempImg.src;
            }
            loading.classList.add('hidden');
            preview.classList.remove('hidden');
            preview.classList.add('flex');
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            isSEOPostsLoaded = false; // force reload next time
        };
        tempImg.onerror = () => {
            clearTimeout(imgTimeout);
            console.error('[AI Image] Image failed to load from URL:', data.image_url);
            // Update loading text to show retry status
            const loadingText = loading.querySelector('p');
            if (loadingText) loadingText.innerText = 'Ảnh không tải được, đang thử lại lần cuối...';
            
            // Auto-retry once with a different seed
            const retryUrl = data.image_url.replace(/seed=\d+/, `seed=${Math.floor(Math.random() * 999999)}`);
            const retryImg = new Image();
            const retryTimeout = setTimeout(() => {
                retryImg.src = '';
                alert('Không thể tải ảnh từ Pollinations.ai sau nhiều lần thử. Vui lòng thử một prompt khác hoặc thử lại sau.');
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                loading.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }, 30000);
            
            retryImg.onload = async () => {
                clearTimeout(retryTimeout);
                if (useLogo) {
                    try {
                        const watermarkedBase64 = await applyLogoToImage(retryImg, logoUrl);
                        imgEl.src = watermarkedBase64;
                    } catch (err) {
                        imgEl.src = retryImg.src;
                    }
                } else {
                    imgEl.src = retryImg.src;
                }
                loading.classList.add('hidden');
                preview.classList.remove('hidden');
                preview.classList.add('flex');
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                isSEOPostsLoaded = false;
            };
            retryImg.onerror = () => {
                clearTimeout(retryTimeout);
                alert('Không thể tải ảnh từ Pollinations.ai. Nguyên nhân có thể do prompt chứa từ nhạy cảm hoặc API đang quá tải.\n\nGợi ý:\n• Thử prompt bằng tiếng Anh\n• Dùng mô tả đơn giản hơn\n• Đợi vài phút rồi thử lại');
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                loading.classList.add('hidden');
                placeholder.classList.remove('hidden');
            };
            retryImg.crossOrigin = "anonymous";
            retryImg.src = retryUrl;
        };
        tempImg.crossOrigin = "anonymous"; // Crucial for canvas
        tempImg.src = data.image_url;
        
    } catch (e) {
        alert('Lỗi gọi API vẽ ảnh: ' + e.message);
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        loading.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

async function downloadSEOImage() {
    const url = document.getElementById('seo-image-result').src;
    if (!url) return;
    
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `SEO_AI_Image_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
       // fallback if fetch fails (cors)
       const a = document.createElement('a');
       a.href = url;
       a.target = '_blank';
       a.download = `SEO_AI_Image_${Date.now()}.jpg`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
    }
}

async function loadSEOPosts() {
    isSEOPostsLoaded = true;
    const postList = document.getElementById('seo-my-posts-list');
    const imgGrid = document.getElementById('seo-my-images-grid');
    g_seoPosts = {}; // Reset cache
    
    if (postList) postList.innerHTML = '<div class="p-10 text-center text-orange-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i> Đang tải dữ liệu Cloud...</div>';
    if (imgGrid) imgGrid.innerHTML = '<div class="col-span-full p-10 text-center text-blue-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i> Đang tải hình ảnh...</div>';
    
    try {
        const res = await authedFetch('/api/seo/posts');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        // Render Posts
        if (data.posts.length === 0) {
            postList.innerHTML = '<div class="p-10 text-center text-gray-500 italic font-bold">Chưa có bài viết nào được tạo. Nhấn <a href="#" onclick="showPage(\'seo-article\')" class="text-orange-500 hover:underline">Tạo Bài Viết SEO</a> ngay!</div>';
        } else {
            let html = '';
            data.posts.forEach(p => {
                g_seoPosts[p.id] = p; // cache
                const d = new Date(p.created_at).toLocaleString('vi-VN');
                html += `
                    <div class="px-10 py-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/5 transition-colors group">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="bg-green-500/20 text-green-400 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-green-500/20">${p.status}</span>
                                <span class="text-[10px] text-gray-500 font-bold uppercase">${d}</span>
                            </div>
                            <h4 class="text-white font-black text-lg mb-1 group-hover:text-orange-400 transition-colors">${p.title}</h4>
                            <p class="text-gray-400 text-sm font-medium">Keywords: <span class="text-gray-300 font-bold">${p.keyword}</span></p>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <button onclick="viewSEOContent('${p.id}')" class="px-5 py-2.5 bg-white/10 hover:bg-orange-gradient text-white rounded-xl font-bold text-sm transition-all hover:shadow-lg hover:-translate-y-0.5">
                                <i class="fas fa-eye mr-1"></i> Xem / Copy
                            </button>
                            <button onclick="deleteSEOPost('${p.id}')" class="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-red-500 text-gray-400 hover:text-white rounded-xl transition-all">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            postList.innerHTML = html;
        }
        
        // Render Images
        if (imgGrid) {
            if (data.images.length === 0) {
                imgGrid.innerHTML = '<div class="col-span-full p-10 text-center text-gray-500 italic font-bold">Chưa có hình ảnh nào.</div>';
            } else {
                let html = '';
                data.images.forEach((img, idx) => {
                    const delay = idx * 50;
                    html += `
                        <div class="rounded-3xl border border-white/5 flex flex-col bg-white/5 group relative hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-900/20 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4" style="animation-delay: ${delay}ms; animation-fill-mode: both;">
                            <img src="${img.image_url}" class="w-full h-48 object-cover rounded-t-3xl" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-5 rounded-3xl">
                                <p class="text-[10px] text-white/80 line-clamp-3 mb-4 font-medium leading-relaxed">${img.prompt}</p>
                                <a href="${img.image_url}" download target="_blank" class="w-full text-center py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition-colors">
                                    <i class="fas fa-download mr-1"></i> Full HD
                                </a>
                            </div>
                        </div>
                    `;
                });
                imgGrid.innerHTML = html;
            }
        }
        
    } catch (e) {
        if (postList) postList.innerHTML = `<div class="p-10 text-red-500 font-bold bg-red-500/10 m-6 rounded-2xl">Lỗi tải dữ liệu: ${e.message}</div>`;
        if (imgGrid) imgGrid.innerHTML = '';
    }
}

function viewSEOContent(id) {
    const p = g_seoPosts[id];
    if (!p) return;
    document.getElementById('seo-modal-title').innerText = p.title;
    document.getElementById('seo-modal-content').value = p.content;
    document.getElementById('modal-seo-edit').classList.remove('hidden');
}

async function deleteSEOPost(id) {
    if (!confirm('Bạn có chắc muốn xóa bài viết này vĩnh viễn khỏi Cloud?')) return;
    try {
        const res = await authedFetch(`/api/seo/posts/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        loadSEOPosts(); // Reload
    } catch (e) {
        alert('Lỗi xóa: ' + e.message);
    }
}

async function lookupCompany() {
    const mst = document.getElementById('lookup-mst').value.trim();
    if (!mst) {
        alert('Vui lòng nhập Mã số thuế hoặc Tên công ty');
        return;
    }
    
    const loading = document.getElementById('lookup-loading');
    const result = document.getElementById('lookup-result');
    
    loading.classList.remove('hidden');
    result.classList.add('hidden');
    
    try {
        // Fallback or shortcut: Just redirect to Masothue.com securely
        window.open(`https://masothue.com/Search/?q=${encodeURIComponent(mst)}`, '_blank');
        
        loading.classList.add('hidden');
        result.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-check-circle text-green-500 text-3xl mb-2"></i>
                <p class="text-white font-bold">Đã mở trang tra cứu thành công!</p>
                <p class="text-xs text-gray-400 mt-1">Hệ thống đã tự động mở sang tab mới để đảm bảo tính an toàn do Cloudflare bảo vệ truy cập.</p>
            </div>
        `;
        result.classList.remove('hidden');
        
    } catch (e) {
        alert('Lỗi tra cứu: ' + e.message);
        loading.classList.add('hidden');
    }
}


function selectLogo(idx) {
    document.getElementById('selected-logo-idx').value = idx;
    const btn1 = document.getElementById('logo-btn-1');
    const btn2 = document.getElementById('logo-btn-2');
    if (idx === 1) {
        btn1.classList.add('logo-selector-active', 'bg-blue-600/20', 'border-blue-500/50', 'text-white');
        btn1.classList.remove('bg-white/5', 'text-gray-400');
        btn2.classList.remove('logo-selector-active', 'bg-blue-600/20', 'border-blue-500/50', 'text-white');
        btn2.classList.add('bg-white/5', 'text-gray-400');
    } else {
        btn2.classList.add('logo-selector-active', 'bg-blue-600/20', 'border-blue-500/50', 'text-white');
        btn2.classList.remove('bg-white/5', 'text-gray-400');
        btn1.classList.remove('logo-selector-active', 'bg-blue-600/20', 'border-blue-500/50', 'text-white');
        btn1.classList.add('bg-white/5', 'text-gray-400');
    }
}

async function applyLogoToImage(mainImg, logoUrl) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.onload = () => {
            canvas.width = mainImg.naturalWidth;
            canvas.height = mainImg.naturalHeight;
            ctx.drawImage(mainImg, 0, 0);
            const logoW = canvas.width * 0.25;
            const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
            const padding = 20;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(logo, canvas.width - logoW - padding, canvas.height - logoH - padding, logoW, logoH);
            ctx.globalAlpha = 1.0;
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        logo.onerror = reject;
        logo.src = logoUrl;
    });
}