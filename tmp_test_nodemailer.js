const nodemailer = require('nodemailer');

async function test() {
    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const options = {
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>'
    };
    const compiled = await compiler.sendMail(options);
    console.log("Is Buffer:", Buffer.isBuffer(compiled.message));
    const text = compiled.message.toString('utf8');
    console.log("MIME TEXT:");
    console.log(text);
    
    const rawMessage = compiled.message.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    console.log("\nBase64URL length:", rawMessage.length);
}
test().catch(console.error);
