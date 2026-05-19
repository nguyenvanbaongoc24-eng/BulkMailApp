const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function testImageGen() {
    console.log('HUGGINGFACE_API_KEY:', process.env.HUGGINGFACE_API_KEY ? 'Present' : 'Missing');
    console.log('DEEPAI_API_KEY:', process.env.DEEPAI_API_KEY ? 'Present' : 'Missing');
    console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Present' : 'Missing');

    const rawPrompt = `A professional, high-quality editorial illustration for a blog post about: "Ấn Độ không có ý định nâng thuế nhập khẩu để hạn chế tiêu thụ vàng, bạc trong nước", office style, 8k resolution, clean composition.`;
    
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
            console.log('[AI IMAGE] Refined Prompt:', refinedPrompt);
        }
    } catch (e) {
        console.warn('[AI IMAGE] Groq refinement failed, using raw. Error:', e.message);
    }

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
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0'
    ];

    for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
        const modelUrl = models[modelIdx];
        console.log(`\n--- Trying Hugging Face Model: ${modelUrl} ---`);
        try {
            const hfRes = await axios.post(modelUrl, { inputs: safePrompt }, {
                headers: {
                    'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 10000
            });
            console.log(`SUCCESS! Buffer size: ${hfRes.data.byteLength}`);
            return;
        } catch (err) {
            console.error(`FAIL! Error: ${err.message}`);
            if (err.response) {
                console.error(`Status: ${err.response.status}`);
                try {
                    const errBody = JSON.parse(err.response.data.toString());
                    console.error('Error Body:', errBody);
                } catch (e) {
                    console.error('Error Body (non-JSON):', err.response.data.toString().substring(0, 200));
                }
            }
        }
    }

    if (process.env.DEEPAI_API_KEY) {
        console.log('\n--- Trying DeepAI Fallback ---');
        try {
            const formData = new URLSearchParams();
            formData.append('text', safePrompt);
            const deepRes = await axios.post('https://api.deepai.org/api/text2img', formData, {
                headers: { 'api-key': process.env.DEEPAI_API_KEY },
                timeout: 10000
            });
            console.log('DeepAI Success:', deepRes.data);
        } catch (err) {
            console.error('DeepAI Fail:', err.message);
        }
    }

    console.log('\n--- Trying Pollinations.ai Fallback ---');
    try {
        const seed = Math.floor(Math.random() * 1000000);
        const pollinationsUrl = `https://pollinations.ai/p/${encodeURIComponent(safePrompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
        console.log('Pollinations URL:', pollinationsUrl);
        const pollRes = await axios.get(pollinationsUrl, { responseType: 'arraybuffer', timeout: 15000 });
        console.log('Pollinations Success! Buffer size:', pollRes.data.byteLength);
    } catch (err) {
        console.error('Pollinations Fail:', err.message);
    }
}

testImageGen();
