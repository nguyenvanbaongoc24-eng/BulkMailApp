
$path = "public/js/app.js"
$lines = Get-Content $path
$lines[66] = "            c.status === '\u0110ang g\u1EEDi' || c.status === '\u0110ang h\u00E0ng \u0111\u1EE3i' || c.status === '\u0110ang x\u1EED l\u00FD'"
$lines[854] = "    const titleMap = {"
$lines[855] = "        'dashboard': 'B\u1EA3ng \u0111i\u1EC1u khi\u1EC3n',"
$lines[856] = "        'ca2-crm': 'CA2 CRM',"
$lines[857] = "        'campaigns': 'Chi\u1EBFn d\u1ECBch Email',"
$lines[858] = "        'senders': 'T\u00E0i kho\u1EA3n Gmail',"
$lines[859] = "        'reports': 'B\u00E1o c\u00E1o chi ti\u1EBFt',"
$lines[860] = "        'seo-news': 'Tin T\u1EE9c Thu\u1EBF (AI)',"
$lines[861] = "        'seo-article': 'T\u1EA1o B\u00E0i Vi\u1EBFt SEO',"
$lines[862] = "        'seo-image': 'T\u1EA1o \u1EA2nh AI',"
$lines[863] = "        'seo-posts': 'Kho L\u01B0u Tr\u1EEF SEO',"
$lines[864] = "        'lookup-tools': 'C\u1ED5ng Tra C\u1EE9u Nghi\u1EC7p V\u1EE5',"
$lines[865] = "        'settings': 'C\u00E0i \u0111\u1EB7t h\u1EC7 th\u1ED1ng',"
$lines[866] = "        'quotations': 'H\u1EE3p \u0111\u1ED3ng & B\u00E1o gi\u00E1',"
$lines[867] = "        'documents': 'Kho T\u00E0i li\u1EC7u Sales',"
$lines[868] = "        'settings-pricing': 'C\u1EADp nh\u1EADt B\u1EA3ng gi\u00E1'"
$lines[869] = "    };"

# Save as UTF8 WITHOUT BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($path, $lines, $utf8NoBom)
