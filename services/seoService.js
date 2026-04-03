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
- Phải có 1 đoạn caption ngắn để đăng bài lên Facebook ở cuối cùng (tách biệt bởi header Facebook Caption).
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

async function generateImageUrl(prompt) {
    if (!process.env.HF_API_KEY) {
        // Fallback if no HF key is actually present (though user provided it)
        const encodedPrompt = encodeURIComponent(prompt + ' highly detailed, photorealistic, 4k, trending on artstation');
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=630&nologo=true`;
    }

    // Call HuggingFace Inference API for Stable Diffusion or FLUX
    // (We use a fast and high quality model that is free on Inference API)
    const MODEL_URL = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0';
    
    const enrichedPrompt = prompt + ", highly detailed, photorealistic, 8k resolution, cinematic lighting, masterpiece";
    
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await axios.post(
                MODEL_URL,
                { inputs: enrichedPrompt },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                }
            );
            
            const base64Image = Buffer.from(response.data, 'binary').toString('base64');
            return `data:image/jpeg;base64,${base64Image}`;
        } catch (error) {
            if (error.response && error.response.status === 503) {
                // Model is loading
                console.log('[HuggingFace] Model is loading, retrying in 5 seconds...');
                await new Promise(r => setTimeout(r, 5000));
                retries--;
            } else {
                throw error;
            }
        }
    }
    throw new Error('HuggingFace API timeout: Model might be taking too long to load.');
}

async function crawlTaxNews(supabaseAdmin) {
    console.log('[SEO CRAWLER] Bắt đầu lấy tin tức đa nguồn...');
    const sources = [
        { 
            name: 'VnExpress', 
            url: 'https://vnexpress.net/tag/thue-129668', 
            titleSelector: '.title-news a', 
            descSelector: '.description a',
            baseUrl: ''
        },
        { 
            name: 'LuatVietnam', 
            url: 'https://luatvietnam.vn/thue-phi-le-phi.html', 
            titleSelector: 'h3 a', 
            descSelector: '.sapo, .desc',
            baseUrl: 'https://luatvietnam.vn'
        },
        { 
            name: 'WebKetoan', 
            url: 'https://webketoan.com/categories/thue.3/', 
            titleSelector: '.structItem-title a', 
            descSelector: '.structItem-minor',
            baseUrl: 'https://webketoan.com'
        }
    ];

    let totalUpserted = 0;

    for (const source of sources) {
        try {
            console.log(`[SEO CRAWLER] Đang quét nguồn: ${source.name}...`);
            const response = await axios.get(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 8000
            });
            
            const $ = cheerio.load(response.data);
            const newsItems = [];
            
            // Try to find articles based on title selector
            $(source.titleSelector).each((i, el) => {
                if (i >= 8) return; // Lấy 8 bài mỗi trang
                
                let link = $(el).attr('href');
                if (link && !link.startsWith('http')) {
                    if (link.startsWith('/')) link = source.baseUrl + link;
                    else link = source.baseUrl + '/' + link;
                }
                
                const title = $(el).text().trim();
                let summary = $(el).parent().parent().find(source.descSelector).first().text().trim();
                if (!summary) summary = title; // fallback
                
                if (title && link && title.length > 15) {
                    newsItems.push({
                        title,
                        url: link,
                        summary: summary,
                        source: source.name,
                        publish_date: new Date().toISOString()
                    });
                }
            });

            let upserted = 0;
            for (const item of newsItems) {
                const { error } = await supabaseAdmin.from('tax_news').upsert(item, { onConflict: 'url' });
                if (!error) upserted++;
            }
            console.log(`[SEO CRAWLER] ${source.name}: Cập nhật ${upserted} tin tức`);
            totalUpserted += upserted;
        } catch (e) {
            console.error(`[SEO CRAWLER] Lỗi tải ${source.name}:`, e.message);
        }
    }
    
    console.log(`[SEO CRAWLER] Quá trình hoàn tất. Tổng tin mới: ${totalUpserted}`);
}

module.exports = {
    generateSEOArticle,
    generateImageUrl,
    crawlTaxNews
};
