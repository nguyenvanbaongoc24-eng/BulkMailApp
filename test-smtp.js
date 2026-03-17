const net = require('net');

const host = 'smtp.gmail.com';
const port = 587;

console.log(`Đang kiểm tra kết nối tới ${host}:${port}...`);

const socket = net.createConnection(port, host);

socket.setTimeout(10000);

socket.on('connect', () => {
    console.log('✅ Kết nối thành công tới smtp.gmail.com:587');
    socket.destroy();
});

socket.on('timeout', () => {
    console.log('❌ Lỗi: Kết nối bị timeout (Hết hạn 10s)');
    socket.destroy();
});

socket.on('error', (err) => {
    console.log('❌ Lỗi kết nối:', err.message);
});
