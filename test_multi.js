const { createTransporter } = require('./services/emailService');

(async () => {
    console.log("=== BẮT ĐẦU TEST MULTI-USER SMTP ===");
    
    const sender1 = {
        user_id: "user_001",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpUser: "account_1@gmail.com",
        smtpPassword: "dummy_password_1",
        senderName: "Company 1"
    };

    const sender2 = {
        user_id: "user_002",
        smtpHost: "smtp.mail.yahoo.com",
        smtpPort: 465,
        smtpUser: "account_2@yahoo.com",
        smtpPassword: "dummy_password_2",
        senderName: "Company 2"
    };

    try {
        console.log("\n--- Khởi tạo User 1 ---");
        await createTransporter(sender1, false);
    } catch (e) {
        console.log("KếT QUẢ MONG ĐỢI: ", e.message);
    }

    try {
        console.log("\n--- Khởi tạo User 2 ---");
        await createTransporter(sender2, false);
    } catch (e) {
        console.log("KếT QUẢ MONG ĐỢI: ", e.message);
    }

    process.exit(0);
})();
