$path = "d:\tauri\tauri-planning-app\src\Home.tsx"
$lines = Get-Content $path

# Helper to look at line and replace
function Replace-Line ($index, $newValue, $label) {
    if ($index -lt $lines.Count) {
        $current = $lines[$index]
        Write-Host "Replacing line $($index+1) ($label):"
        Write-Host "  Old: $current"
        $lines[$index] = $newValue
        Write-Host "  New: $newValue"
    }
    else {
        Write-Host "Error: Index $index out of bounds"
    }
}

# Line 68 (Index 67): Months
# const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
Replace-Line 67 '  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];' "Months"

# Line 69 (Index 68): Weekdays
# const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
Replace-Line 68 '  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];' "Weekdays"

$lines | Set-Content $path -Encoding UTF8
Write-Host "Done."
