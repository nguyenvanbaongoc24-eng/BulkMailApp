const axios = require('axios');

async function testLogin() {
    try {
        console.log('--- Testing Login API ---');
        const res = await axios.post('http://localhost:3000/api/login', {
            email: 'ngocnguyennacencomm@gmail.com',
            password: 'wrong-password'
        });
        console.log('Response:', res.data);
    } catch (e) {
        console.log('Error:', e.response ? e.response.data : e.message);
    }
}

testLogin();
