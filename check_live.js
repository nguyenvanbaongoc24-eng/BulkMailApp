const axios = require('axios');

async function checkLive() {
    try {
        console.log('--- LIVE DIAGNOSTICS (Render) ---');
        const res = await axios.get('https://automation-ca2.onrender.com/api/diag');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error fetching live diag:', e.message);
    }
}

checkLive();
