const supabase = require('./services/supabaseClient');

async function diagnostic() {
    try {
        console.log("--- BẮT ĐẦU CHẨN ĐOÁN CHIẾN DỊCH ---");
        const { data, error } = await supabase
            .from('campaigns')
            .select('id, createdAt, status, successCount, errorCount, recipients')
            .order('createdAt', { ascending: false })
            .limit(1);

        if (error) {
            console.error("Lỗi Supabase:", error);
            return;
        }

        if (!data || data.length === 0) {
            console.log("Không tìm thấy chiến dịch nào.");
            return;
        }

        const c = data[0];
        console.log(`Chiến dịch ID: ${c.id}`);
        console.log(`Thời gian: ${c.createdAt}`);
        console.log(`Trạng thái: ${c.status}`);
        console.log(`Thành công: ${c.successCount}`);
        console.log(`Lỗi: ${c.errorCount}`);
        console.log(`Tổng số người nhận: ${c.recipients.length}`);

        console.log("\n--- TRẠNG THÁI CHI TIẾT NGƯỜI NHẬN (5 người đầu) ---");
        c.recipients.slice(0, 5).forEach((r, i) => {
            console.log(`[${i}] MST: ${r.MST}, Email: ${r.Email}, Status: ${r.status}`);
        });

        console.log("\n--- CHI TIẾT TRẠNG THÁI TẤT CẢ NGƯỜI NHẬN ---");
        c.recipients.forEach((r, i) => {
            console.log(`[${i}] MST: ${r.MST}, Email: ${r.Email}, Lỗi: ${r.status}`);
        });

        console.log(`\nTổng kết: ${c.successCount} thành công, ${c.errorCount} lỗi trên tổng số ${c.recipients.length}`);

    } catch (err) {
        console.error("Lỗi thực thi diag:", err);
    } finally {
        console.log("\n--- KẾT THÚC CHẨN ĐOÁN ---");
    }
}

diagnostic();
