require('dotenv').config();
const { testEmailFlow } = require('./services/emailService');

(async () => {
    try {
        const targetEmail = process.env.SMTP_USER || "test@example.com";
        console.log("---- BẮT ĐẦU CHẠY SCRIPT E2E TEST ----");
        const result = await testEmailFlow(targetEmail);
        console.log("---- KẾT QUẢ SCRIPT ----");
        console.log(JSON.stringify(result, null, 2));
        
        setTimeout(() => {
            console.log("Finished successfully");
            process.exit(0);
        }, 3000);
    } catch (err) {
        console.error("Lỗi E2E Script: ", err.message);
        setTimeout(() => process.exit(1), 1000);
    }
})();
