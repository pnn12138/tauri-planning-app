$path = "d:\tauri\tauri-planning-app\src\Home.tsx"
$content = [System.IO.File]::ReadAllText($path)

# Fix Start of File
# Look for the first import statement
$index = $content.IndexOf("import { useEffect")
if ($index -ge 0) {
    Write-Host "Found import at index $index. Trimming..."
    $content = $content.Substring($index)
}
else {
    Write-Host "Start key phrase not found."
}

# Fix Months
# Only replace if the pattern matches the corrupted version (using regex for flexibility)
if ($content -match 'const months = \["[^"]+", "[^"]+"') {
    Write-Host "Fixing months..."
    $content = $content -replace 'const months = \["[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+"\];', 'const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];'
}

# Fix Weekdays
if ($content -match 'const weekdays = \["[^"]+", "[^"]+"') {
    Write-Host "Fixing weekdays..."
    $content = $content -replace 'const weekdays = \["[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+"\];', 'const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];'
}

[System.IO.File]::WriteAllText($path, $content)
Write-Host "Done."
