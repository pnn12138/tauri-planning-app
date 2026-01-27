$path = "d:\tauri\tauri-planning-app\src\Home.tsx"
$lines = Get-Content $path

# Helper to look at line and replace
function Replace-Line ($index, $newValue, $label) {
    $current = $lines[$index]
    Write-Host "Replacing line $($index+1) ($label):"
    Write-Host "  Old: $current"
    $lines[$index] = $newValue
    Write-Host "  New: $newValue"
}

# Line 699 (Index 698): No estimate
Replace-Line 698 "          alert('任务未设置预估时间，无法排期');" "No Estimate"

# Line 705 (Index 704): Invalid time regex
Replace-Line 704 "          alert('无效的时间格式');" "Invalid Time"

# Line 712 (Index 711): Occupied
Replace-Line 711 "          alert('该时间段已被占用，请选择其他时间');" "Occupied"

# Line 777 (Index 776): Success
# Careful with backticks for template literal in PowerShell string
Replace-Line 776 "          alert(``任务 ""`$`{draggedTask.title}"" 已排期至 ""`$`{timeStr}``);" "Success"
# Note: In PowerShell double-quoted string:
# `` -> ` (backtick)
# "" -> " (double quote)
# `$ -> $ (literal dollar)
# The target JS code: alert(`任务 "${draggedTask.title}" 已排期至 ${timeStr}`);

$lines | Set-Content $path -Encoding UTF8
Write-Host "Done."
