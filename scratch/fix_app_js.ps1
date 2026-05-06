
$path = "public/js/app.js"
$content = Get-Content $path -Raw
# Using regex to find the titleMap block regardless of line number shifts
$pattern = 'const titleMap = \{[\s\S]*?\};'
$replacement = @"
const titleMap = {
        'dashboard': 'Bảng điều khiển',
        'ca2-crm': 'CA2 CRM',
        'campaigns': 'Chiến dịch Email',
        'senders': 'Tài khoản Gmail',
        'reports': 'Báo cáo chi tiết',
        'seo-news': 'Tin Tức Thuế (AI)',
        'seo-article': 'Tạo Bài Viết SEO',
        'seo-image': 'Tạo Ảnh AI',
        'seo-posts': 'Kho Lưu Trữ SEO',
        'lookup-tools': 'Cổng Tra Cứu Nghiệp Vụ',
        'settings': 'Cài đặt hệ thống',
        'quotations': 'Hợp đồng & Báo giá',
        'documents': 'Kho Tài liệu Sales',
        'settings-pricing': 'Cập nhật Bảng giá'
    };
"@

$content = $content -replace [regex]::Escape($pattern), $replacement
# Wait, [regex]::Escape will escape the whole pattern including the Mojibake.
# Better to use a simpler match if line numbers are stable.

$lines = Get-Content $path
$lines[66] = "            c.status === 'Đang gửi' || c.status === 'Đang hàng đợi' || c.status === 'Đang xử lý'"
$lines[854..869] = @(
    "    const titleMap = {",
    "        'dashboard': 'Bảng điều khiển',",
    "        'ca2-crm': 'CA2 CRM',",
    "        'campaigns': 'Chiến dịch Email',",
    "        'senders': 'Tài khoản Gmail',",
    "        'reports': 'Báo cáo chi tiết',",
    "        'seo-news': 'Tin Tức Thuế (AI)',",
    "        'seo-article': 'Tạo Bài Viết SEO',",
    "        'seo-image': 'Tạo Ảnh AI',",
    "        'seo-posts': 'Kho Lưu Trữ SEO',",
    "        'lookup-tools': 'Cổng Tra Cứu Nghiệp Vụ',",
    "        'settings': 'Cài đặt hệ thống',",
    "        'quotations': 'Hợp đồng & Báo giá',",
    "        'documents': 'Kho Tài liệu Sales',",
    "        'settings-pricing': 'Cập nhật Bảng giá'",
    "    };"
)

$lines | Set-Content $path -Encoding UTF8
