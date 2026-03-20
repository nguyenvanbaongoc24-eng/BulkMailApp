-- SQL V7: RECOVERY LOGIC - KHÔI PHỤC TASK BỊ KẸT
-- Mục tiêu: Tự động chuyển các task bị kẹt ở trạng thái 'processing' quá lâu về 'pending' để worker thử lại.

CREATE OR REPLACE FUNCTION recover_failed_tasks()
RETURNS void AS $$
BEGIN
    -- Những task bị kẹt ở processing quá 10 phút (thời gian tối đa cho 1 batch 10 mail là 50s-1p) 
    -- thì reset về pending để worker khác hoặc run tiếp theo bốc lại.
    UPDATE public.email_logs
    SET status = 'pending',
        last_retry_time = NULL,
        error_message = 'Tự động khôi phục từ trạng thái treo (processing)'
    WHERE status = 'processing'
      AND last_retry_time < now() - interval '10 minutes';
      
    -- Tương tự với các campaign bị kẹt ở "Đang gửi" nhưng không có log nào đang chạy
    -- Tuy nhiên logic campaign completion thường tự chạy ở cuối log cuối cùng.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
