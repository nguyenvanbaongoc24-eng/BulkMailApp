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
    // Step 1: Refine prompt with Groq AI (fast, < 2 seconds)
    let refinedPrompt = rawPrompt;
    try {
        if (process.env.GROQ_API_KEY) {
            console.log('[AI IMAGE] Refining prompt with Groq...');
            const refinementPrompt = `You are a professional AI image prompt engineer. 
Transform the user's raw input into a SHORT (max 15 words), highly descriptive, visual English prompt for an AI image generator.
Rules:
1. Output ONLY the refined English prompt. No explanations, no quotes.
2. Translate from Vietnamese to English if needed.
3. Focus on professional, clean, modern editorial illustration style.
4. Keep it VERY SHORT - max 15 words.

User input: "${rawPrompt.substring(0, 300)}"`;

            const response = await axios.post(GROQ_API_URL, {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: refinementPrompt }],
                temperature: 0.6,
                max_tokens: 60
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            refinedPrompt = response.data.choices[0].message.content.trim();
            refinedPrompt = refinedPrompt.replace(/^(Refined prompt:|Prompt:|Here is|"|')/gi, '').replace(/("|')$/g, '').trim();
            console.log('[AI IMAGE] Groq refined prompt:', refinedPrompt);
        }
    } catch (e) {
        console.warn('[AI IMAGE] Groq refinement failed, using raw. Error:', e.message);
    }

    // Step 2: Sanitize prompt
    let safePrompt = refinedPrompt
        .replace(/[#*_~`>]/g, '')  // Remove Markdown
        .replace(/\n+/g, ' ')
        .replace(/tax audit investigation/gi, 'professional tax consulting')
        .replace(/fraud/gi, 'financial compliance')
        .replace(/evasion/gi, 'strategy')
        .replace(/crime|prison|jail|arrest/gi, 'legal documentation')
        .replace(/police|investigator/gi, 'financial auditor')
        .replace(/nsfw|nude|blood|violence/gi, 'professional business');
    
    // Keep prompt SHORT - critical for Pollinations performance
    safePrompt = safePrompt.substring(0, 150).trim();
    if (!safePrompt) safePrompt = 'professional business office illustration';
    
    console.log('[AI IMAGE] Final prompt:', safePrompt, '(length:', safePrompt.length, ')');

    const seed = Math.floor(Math.random() * 1000000);

    // Step 3: Server-side generation using paid API Key (if configured)
    if (process.env.POLLINATIONS_API_KEY) {
        console.log('[AI IMAGE] Paid POLLINATIONS_API_KEY detected. Generating server-side...');
        try {
            // Using the paid key makes generation extremely fast (< 1s)
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=768&height=768&seed=${seed}&nologo=true&key=${process.env.POLLINATIONS_API_KEY}`;
            const response = await axios.get(pollinationsUrl, {
                responseType: 'arraybuffer',
                timeout: 15000 // 15 seconds is more than enough for paid key
            });

            const buf = response.data;
            // Verify buffer
            let isValid = false;
            if (buf && buf.length > 100) {
                if (buf[0] === 0xFF && buf[1] === 0xD8) isValid = true; // JPEG
                else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) isValid = true; // PNG
                const head = Buffer.from(buf).toString('utf8', 0, 50);
                if (head.includes('<!DOCTYPE') || head.includes('<html')) isValid = false;
            }

            if (isValid) {
                console.log('[AI IMAGE] Successfully generated image server-side. Uploading to Supabase...');
                const bucketName = 'seo-images';
                const fileName = `${userId}/${Date.now()}_paid_image.jpg`;

                // Ensure bucket exists
                await supabaseAdmin.storage.createBucket(bucketName, { public: true });

                const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
                    .from(bucketName)
                    .upload(fileName, buf, { contentType: 'image/jpeg', upsert: true });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);
                    console.log('[AI IMAGE] Successfully uploaded and obtained public URL:', publicUrl);
                    return publicUrl;
                } else {
                    console.warn('[AI IMAGE] Supabase upload failed, falling back to direct browser URL. Error:', uploadError.message);
                }
            } else {
                console.warn('[AI IMAGE] Received corrupt or HTML response from Pollinations, falling back to direct URL.');
            }
        } catch (err) {
            console.error('[AI IMAGE] Server-side paid generation failed. Falling back to direct URL. Error:', err.message);
        }
    }

    // Step 4: Fallback to direct client-side URL (without leaking the secret API key)
    const directUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=768&height=768&seed=${seed}&nologo=true`;
    console.log('[AI IMAGE] Returning direct Pollinations URL for browser-side loading');
    return directUrl;
}

async function crawlTaxNews(supabaseAdmin) {
    console.log('[NEWS_CRAWL_START] Cào tin tức Thuế đa nguồn với bộ lọc điểm chất lượng...');
    
    const sources = [
        // Highest priority
        { name: 'Luật Việt Nam', url: 'https://luatvietnam.vn/rss/news-652.rss', isRSS: true, baseUrl: 'https://luatvietnam.vn' },
        { name: 'WebKetoan', url: 'https://www.webketoan.vn/nghiep-vu-ke-toan-va-thue', titleSelector: '.category-post h2 a', descSelector: '.category-post .post-content', baseUrl: 'https://www.webketoan.vn' },
        { name: 'Tổng cục Thuế', url: 'https://gdt.gov.vn/wps/portal/home/news/list?1dmy&current=true&urile=wcm:path:/gdt+content/sa_gdt/sa_news/sa_news_tax', titleSelector: '.news-content a', descSelector: '.news-content .summary', baseUrl: 'https://gdt.gov.vn' },
        { name: 'Bộ Tài Chính', url: 'https://mof.gov.vn/webcenter/portal/btc/r/t/tin-tuc', titleSelector: 'h3 a, .title a', descSelector: 'p.summary', baseUrl: 'https://mof.gov.vn' },
        // Secondary sources
        { name: 'VnExpress', url: 'https://timkiem.vnexpress.net/?q=thuế', titleSelector: '.title-news a', descSelector: '.description', baseUrl: '' },
        { name: 'Vietnamnet', url: 'https://vietnamnet.vn/thue-tag37841.html', titleSelector: 'h3 a', descSelector: '.sapo', baseUrl: 'https://vietnamnet.vn' }
    ];

    let totalUpserted = 0;
    const allowedKeywords = ['thuế', 'kế toán', 'hóa đơn', 'nghĩa vụ', 'kê khai', 'thông tư', 'nghị định', 'tổng cục thuế', 'bộ tài chính'];

    for (const source of sources) {
        try {
            console.log(`[NEWS_CRAWL_START] Source: ${source.name} -> ${source.url}`);
            const response = await axios.get(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data, { xmlMode: source.isRSS });
            const rawItems = [];
            
            if (source.isRSS) {
                $('item').each((i, el) => {
                    if (i < 8) {
                        rawItems.push({
                            title: $(el).find('title').text().trim(),
                            summary: $(el).find('description').text().replace(/<[^>]*>/g, '').trim(),
                            url: $(el).find('link').text().trim(),
                            publish_date: $(el).find('pubDate').text() || new Date().toISOString()
                        });
                    }
                });
            } else {
                $(source.titleSelector).each((i, el) => {
                    if (i < 8) {
                        const title = $(el).text().trim();
                        const link = $(el).attr('href');
                        const summary = $(el).closest('div, li, article').find(source.descSelector).first().text().replace(/<[^>]*>/g, '').trim();
                        
                        if (title && link) {
                            rawItems.push({
                                title,
                                summary: summary || title,
                                url: link.startsWith('http') ? link : (source.baseUrl + link),
                                publish_date: new Date().toISOString()
                            });
                        }
                    }
                });
            }

            console.log(`[NEWS_CRAWL] Found ${rawItems.length} items from ${source.name}`);

            for (const item of rawItems) {
                try {
                    const textLower = (item.title + ' ' + item.summary).toLowerCase();
                    
                    // Quality Scoring
                    let score = 0;
                    if (textLower.includes('thuế')) score += 5;
                    if (textLower.includes('kế toán')) score += 3;
                    if (textLower.includes('hóa đơn')) score += 3;
                    if (textLower.includes('thông tư')) score += 2;
                    if (textLower.includes('nghị định')) score += 2;

                    if (score < 5) {
                        console.log(`[NEWS_FILTER_REJECTED] Score ${score}/5 -> ${item.title.substring(0, 40)}...`);
                        continue;
                    }

                    console.log(`[NEWS_FILTER_ACCEPTED] Score ${score}/5 -> ${item.title.substring(0, 40)}...`);

                    const fullItem = {
                        title: item.title,
                        url: item.url,
                        summary: item.summary,
                        source: source.name,
                        publish_date: item.publish_date || new Date().toISOString()
                    };

                    const { error } = await supabaseAdmin.from('tax_news').upsert(fullItem, { onConflict: 'url' });
                    if (!error) totalUpserted++;
                } catch (itemErr) {
                    console.error(`[NEWS_CRAWL_ITEM_ERROR] ${item.url}:`, itemErr.message);
                }
            }
        } catch (e) {
            console.error(`[NEWS_CRAWL_SOURCE_ERROR] ${source.name}:`, e.message);
        }
    }
    
    console.log(`[NEWS_CRAWL_SUCCESS] Quá trình hoàn tất. Tổng bài viết hợp lệ lưu DB: ${totalUpserted}`);
}

module.exports = {
    generateSEOArticle,
    generateImageUrl,
    crawlTaxNews
};
