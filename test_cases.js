const { testEmailFlow } = require('./services/emailService');

(async () => {
    console.log("=== BẮT ĐẦU CHUỖI TEST 4 CASE MAIL BAO CỨNG ===");
    
    // Yêu cầu lấy 1 email tùy ý để mô phỏng test nội bộ
    const targetEmail = 'dummy_test@example.com';

    console.log("\n-----------------------------------------");
    console.log("CASE 1: CÓ BẬT ATTACH NHƯNG KHÔNG CÓ FILE PDF (Kỳ vọng: THẤT BẠI - Báo lỗi ném ra)");
    try {
        await testEmailFlow(targetEmail, null, 3); // Case 3 trong hàm tương đương bật tính năng nhưng PDF NULL
    } catch (e) {
        console.log("=> KẾT QUẢ MONG ĐỢI: CATCH ERROR THÀNH CÔNG:", e.message);
    }

    console.log("\n-----------------------------------------");
    console.log("CASE 2: KHÔNG BẬT ATTACH (Kỳ vọng: THÀNH CÔNG - Gửi email trơn không file)");
    try {
        await testEmailFlow(targetEmail, null, 1);
    } catch (e) {
        console.log("LỖI NGOÀI LỀ:", e.message);
    }

    console.log("\n-----------------------------------------");
    console.log("CASE 3: BẬT ATTACH + CÓ FILE ĐÍNH KÈM URL (Kỳ vọng: THÀNH CÔNG GẮN ĐƯỢC PDF)");
    try {
        await testEmailFlow(targetEmail, null, 2);
    } catch (e) {
        console.log("LỖI NGOÀI LỀ:", e.message);
    }

    console.log("\n-----------------------------------------");
    console.log("CASE 4 (BONUS): SÓT TAG MẪU TRONG KHI ĐANG BẬT ATTACH (Kỳ vọng: THẤT BẠI CHẶN GỬI SAI)");
    try {
        await testEmailFlow(targetEmail, null, 4);
    } catch (e) {
        console.log("=> KẾT QUẢ MONG ĐỢI: CATCH ERROR SÓT TAG THÀNH CÔNG:", e.message);
    }

    process.exit(0);
})();
