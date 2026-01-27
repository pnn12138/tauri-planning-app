$path = "d:\tauri\tauri-planning-app\src\Home.tsx"
$content = [System.IO.File]::ReadAllText($path)

# Fix Line 739 (Commented out return)
# Regex matches: whitespace // garbage return !(
if ($content -match '//.*?return !\(') {
    Write-Host "Fixing commented out return statement..."
    $content = $content -replace '//.*?return !\(', "// Check conflict `r`n            return !("
}

# Fix Alerts
# 1. "Task has no estimate"
if ($content -match "alert\('[^']*?Ԥ[^']*?'\)") {
    Write-Host "Fixing 'no estimate' alert..."
    $content = $content -replace "alert\('[^']*?Ԥ[^']*?'\)", "alert('任务未设置预估时间，无法排期')"
}

# 2. "Invalid time format"
if ($content -match "alert\('[^']*?Ч[^']*?'\)") {
    Write-Host "Fixing 'invalid time' alert..."
    $content = $content -replace "alert\('[^']*?Ч[^']*?'\)", "alert('无效的时间格式')"
}

# 3. "Time slot occupied"
if ($content -match "alert\('[^']*?ռ[^']*?'\)") {
    Write-Host "Fixing 'time slot occupied' alert..."
    $content = $content -replace "alert\('[^']*?ռ[^']*?'\)", "alert('该时间段已被占用，请选择其他时间')"
}

# 4. "Confirm overwrite"
if ($content -match "window\.confirm\('[^']*?ڣ[^']*?'\)") {
    Write-Host "Fixing 'confirm overwrite'..."
    $content = $content -replace "window\.confirm\('[^']*?ڣ[^']*?'\)", "window.confirm('该时间段已有任务，是否覆盖？')"
}

# 5. "Success schedule" (using partial match on variable interpolation)
# alert( "${draggedTask.title}" ... ${timeStr});
# regex: alert\( "`\${draggedTask\.title}" .*? \${timeStr}`\)
# Note: The original used backticks ` but view_file showed generic quote? 
# view_file showed: alert( "${draggedTask.title}" ... );
# Wait, let's look at the view_file output again carefully.
# 776:           alert(` "${draggedTask.title}" 17w171717\1700171717 ${timeStr}`);
# It uses backticks (template literal). PowerShell needs escaping for backticks.
if ($content -match 'alert\(` "\${draggedTask\.title}" .*? \${timeStr}`\);') {
    Write-Host "Fixing success alert..."
    $content = $content -replace 'alert\(` "\${draggedTask\.title}" .*? \${timeStr}`\);', 'alert(`任务 "${draggedTask.title}" 已排期至 ${timeStr}`);'
}

# 6. "Failure schedule"
if ($content -match 'alert\(`.*?ʧ.*?: \${.*?}`\)') {
    Write-Host "Fixing failure alert..."
    $content = $content -replace 'alert\(`.*?ʧ.*?: \${\(error as Error\)\.message}`\)', 'alert(`排期失败: ${(error as Error).message}`)'
}

[System.IO.File]::WriteAllText($path, $content)
Write-Host "Done."
