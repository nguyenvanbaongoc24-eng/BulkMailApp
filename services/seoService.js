const axios = require('axios');
const cheerio = require('cheerio');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateSEOArticle(keyword, tone, length) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY không được định cấu hình trong .env');
    }

    const lengthMap = {
        'short': 'ngắn gọn (khoảng 300 - 500 từ)',
        'medium': 'vừa phải (khoảng 600 - 900 từ)',
        'long': 'chi tiết và dài (hơn 1000 từ)'
    };

    const prompt = `Bạn là một chuyên gia SEO và Content Marketing xuất sắc. Hãy viết một bài viết chuẩn SEO về từ khóa "${keyword}".
Yêu cầu:
- Tông giọng: ${tone}.
- Độ dài: ${lengthMap[length] || lengthMap['medium']}.
- Cấu trúc bài viết rõ ràng, có Tiêu đề (H1), Meta Description, H2, H3, Kết luận.
- SỬ DỤNG NHIỀU ICON/EMOJI để bài viết sinh động, thu hút người đọc (Dùng icon ở đầu mỗi mục, hoặc trong văn cảnh).
- Phải có 1 đoạn caption ngắn để đăng bài lên Facebook ở cuối cùng (tách biệt bởi header Facebook Caption).
- Viết bằng font chữ Montserrat nếu có thể (Output vẫn là Markdown).
- Viết thân thiện, chuẩn SEO, cấu trúc bằng ngôn ngữ Markdown.`;

    const response = await axios.post(GROQ_API_URL, {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data.choices[0].message.content;
}

async function generateImageUrl(rawPrompt, supabaseAdmin, userId) {
    if (!process.env.HUGGINGFACE_API_KEY) {
        throw new Error('HUGGINGFACE_API_KEY không được định cấu hình trong .env');
    }

    let refinedPrompt = rawPrompt;
    try {
        if (process.env.GROQ_API_KEY) {
            console.log('[AI IMAGE] Refining prompt with Groq...');
            const refinementPrompt = `You are a professional AI image prompt engineer. 
Transform the user's raw input into a SHORT, highly descriptive, visual English prompt for an AI image generator.
Rules:
1. Output ONLY the refined English prompt. No explanations.
2. Translate from Vietnamese to English if needed.
3. Focus on a high-quality, professional, photorealistic, or editorial illustration style.
4. If the input is about accounting/tax, make the image professional, modern, and trustworthy.

User input: "${rawPrompt}"`;

            const response = await axios.post(GROQ_API_URL, {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: refinementPrompt }],
                temperature: 0.6,
                max_tokens: 150
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            refinedPrompt = response.data.choices[0].message.content.trim();
            refinedPrompt = refinedPrompt.replace(/^(Refined prompt:|Prompt:|"|')/gi, '').replace(/("|')$/g, '').trim();
        }
    } catch (e) {
        console.warn('[AI IMAGE] Groq refinement failed, using raw. Error:', e.message);
    }

    // SANITIZER: Replace risky words with safe alternatives
    let safePrompt = refinedPrompt.toLowerCase()
        .replace(/tax audit investigation/gi, 'professional tax consulting illustration')
        .replace(/fraud/gi, 'financial compliance')
        .replace(/evasion/gi, 'strategy')
        .replace(/crime|prison|jail|arrest/gi, 'legal documentation')
        .replace(/police|investigator/gi, 'financial auditor')
        .replace(/nsfw|nude|blood|violence/gi, 'professional business');
        
    safePrompt += ", professional, highly detailed, photorealistic, 8k resolution, cinematic lighting";
    
    console.log('[AI IMAGE] Safe Prompt:', safePrompt);

    const models = [
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
        'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5'
    ];

    let imageBuffer = null;

    for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
        const modelUrl = models[modelIdx];
        console.log(`[AI IMAGE] Tying model: ${modelUrl}`);
        
        let success = false;
        // Retry logic: up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`[IMAGE_GENERATION_START] Requesting HuggingFace API (Attempt ${attempt}/3)...`);
            try {
                const hfRes = await axios.post(modelUrl, { inputs: safePrompt }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000 // 60s timeout
                });

                imageBuffer = hfRes.data;
                success = true;
                break; // Break retry loop on success
            } catch (err) {
                console.error(`[IMAGE_GENERATION_RETRY] Attempt ${attempt} failed on model ${modelIdx}. Error:`, err.message);
                
                // Handle 503 Model Loading
                if (err.response && err.response.status === 503) {
                    console.log('[AI IMAGE] Model is loading... Waiting 20 seconds before retry.');
                    await new Promise(resolve => setTimeout(resolve, 20000));
                } else if (err.response && err.response.data) {
                    try {
                        const errBody = JSON.parse(err.response.data.toString());
                        console.error('[AI IMAGE] HF API Error:', errBody);
                        if (errBody.error && errBody.error.toLowerCase().includes('nsfw')) {
                            console.error('[IMAGE_GENERATION_FAILED] Unsafe content detected by HF.');
                        }
                    } catch (e) {} // Not JSON
                    // Wait 5s for normal retries
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        if (success) {
            console.log(`[AI IMAGE] Successfully generated image from model ${modelUrl}`);
            break; // Break model loop on success
        }
    }

    if (!imageBuffer) {
        throw new Error('All models failed after multiple retries.');
    }

    // Upload to Supabase Storage
    console.log('[AI IMAGE] Uploading to Supabase Storage (seo-images)...');
    const bucketName = 'seo-images';
    const fileName = `${userId}/${Date.now()}_hf_image.jpg`;

    // Try to create bucket just in case (ignore error if it exists)
    await supabaseAdmin.storage.createBucket(bucketName, { public: true });

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
        // Fallback: If bucket creation failed (due to constraints) and upload failed, use base64
        console.warn('[AI IMAGE] Upload to Supabase failed, falling back to base64 Data URI. Error:', uploadError.message);
        const base64Str = Buffer.from(imageBuffer, 'binary').toString('base64');
        return `data:image/jpeg;base64,${base64Str}`;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrl;
}

async function crawlTaxNews(supabaseAdmin) {
    console.log('[NEWS_CRAWL_START] Cào tin tức Thuế đa nguồn với bộ lọc điểm chất lượng...');
    
    // Trusted Sources Priority
    const sources = [
        // Highest priority
        { name: 'Luật Việt Nam', url: 'https://luatvietnam.vn/thue-phi-le-phi.html', titleSelector: 'h3.title-news a, h3 a', descSelector: '.sapo, .desc', baseUrl: 'https://luatvietnam.vn' },
        { name: 'WebKetoan', url: 'https://webketoan.com/categories/thue.3/', titleSelector: '.structItem-title a', descSelector: '.structItem-minor', baseUrl: 'https://webketoan.com' },
        { name: 'Tổng cục Thuế', url: 'https://gdt.gov.vn/wps/portal/home/tin-tuc', titleSelector: '.tin-tuc-title a, .news-title a', descSelector: '.tin-tuc-summary, .summary', baseUrl: 'https://gdt.gov.vn' },
        { name: 'Bộ Tài Chính', url: 'https://mof.gov.vn/webcenter/portal/btc/r/t/tin-tuc', titleSelector: 'h3 a, .title a', descSelector: 'p.summary', baseUrl: 'https://mof.gov.vn' },
        // Secondary sources
        { name: 'VnExpress', url: 'https://vnexpress.net/tag/thue-129668', titleSelector: '.title-news a', descSelector: '.description a', baseUrl: '' },
        { name: 'CafeF', url: 'https://cafef.vn/tim-kiem/thu%E1%BA%BF.chn', titleSelector: 'h3 a', descSelector: '.sapo', baseUrl: 'https://cafef.vn' },
        { name: 'Vietnamnet', url: 'https://vietnamnet.vn/thue-tag37841.html', titleSelector: 'h3 a', descSelector: '.sapo', baseUrl: 'https://vietnamnet.vn' }
    ];

    let totalUpserted = 0;
    const allowedKeywords = ['thuế', 'kế toán', 'hóa đơn điện tử', 'nghĩa vụ thuế', 'kê khai thuế', 'quy định thuế', 'thông tư thuế', 'luật thuế', 'tổng cục thuế', 'bộ tài chính'];

    for (const source of sources) {
        try {
            console.log(`[SEO CRAWLER] Đang quét nguồn: ${source.name}...`);
            const response = await axios.get(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const newsItems = [];
            
            $(source.titleSelector).each((i, el) => {
                if (i >= 5) return; // Limit to 5 top articles per source to avoid excessive fetching
                
                let link = $(el).attr('href');
                if (link && !link.startsWith('http')) {
                    if (link.startsWith('/')) link = source.baseUrl + link;
                    else link = source.baseUrl + '/' + link;
                }
                
                const title = $(el).text().trim();
                let summary = $(el).parent().parent().find(source.descSelector).first().text().trim();
                if (!summary) summary = title;
                
                if (title && link && title.length > 15) {
                    newsItems.push({ title, url: link, summary, source: source.name });
                }
            });

            let upserted = 0;
            for (const item of newsItems) {
                try {
                    // Fetch full article to clean and evaluate
                    const articleRes = await axios.get(item.url, { timeout: 8000 });
                    const $article = cheerio.load(articleRes.data);
                    
                    // Content Cleaning
                    $article('nav, header, footer, .ads, .sidebar, aside, script, style, iframe, noscript, .banner, .menu').remove();
                    const mainContent = $article('body').text().replace(/\s+/g, ' ').trim();
                    
                    const textLower = (item.title + " " + item.summary + " " + mainContent).toLowerCase();
                    
                    // Check keyword rules
                    let distinctCount = 0;
                    for (const kw of allowedKeywords) {
                        if (textLower.includes(kw)) distinctCount++;
                    }

                    if (distinctCount < 2) {
                        console.log(`[NEWS_FILTER_REJECTED] Missed distinct keywords (<2) -> ${item.title.substring(0, 40)}...`);
                        continue;
                    }

                    // Strict Quality Scoring
                    let score = 0;
                    if (textLower.includes('thuế')) score += 2;
                    if (textLower.includes('kế toán')) score += 2;
                    if (textLower.includes('hóa đơn điện tử')) score += 2;
                    if (textLower.includes('thông tư')) score += 1;
                    if (textLower.includes('nghị định')) score += 1;

                    if (score < 4) {
                        console.log(`[NEWS_FILTER_REJECTED] Score ${score}/4 -> ${item.title.substring(0, 40)}...`);
                        continue;
                    }

                    console.log(`[NEWS_FILTER_ACCEPTED] Score ${score}/4 -> ${item.title.substring(0, 40)}...`);

                    const fullItem = {
                        title: item.title,
                        url: item.url,
                        summary: item.summary,
                        content: mainContent.substring(0, 2000), // Save first 2000 chars to avoid bloated DB
                        source: item.source,
                        publish_date: new Date().toISOString()
                    };

                    const { error } = await supabaseAdmin.from('tax_news').upsert(fullItem, { onConflict: 'url' });
                    if (!error) upserted++;
                } catch (articleErr) {
                    console.error(`[SEO CRAWLER] Cannot fetch full content for ${item.url}:`, articleErr.message);
                }
            }
            totalUpserted += upserted;
        } catch (e) {
            console.error(`[SEO CRAWLER] Lỗi tải ${source.name}:`, e.message);
        }
    }
    
    console.log(`[NEWS_CRAWL_SUCCESS] Quá trình hoàn tất. Tổng bài viết hợp lệ lưu DB: ${totalUpserted}`);
}

module.exports = {
    generateSEOArticle,
    generateImageUrl,
    crawlTaxNews
};
