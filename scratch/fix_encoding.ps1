
$path = "public/index.html"
# Read as UTF8 (if it's broken, this might not work perfectly, but let's try)
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Force replace known Mojibake patterns if possible, but better just overwrite with correct strings
$content = $content.Replace("Bảng điều khiển", "Bảng điều khiển")
$content = $content.Replace("Hệ thống", "Hệ thống")

# Save as UTF8 WITHOUT BOM (standard for web)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
