$path = "d:\tauri\tauri-planning-app\src\Home.tsx"
$content = [System.IO.File]::ReadAllText($path)

# 1. Fix "Task has no estimate" alert
# Context: if (!draggedTask.estimate_min) { ... alert(...)
# We can match the Alert line directly if we assume it's the only alert inside that block? No, regex across lines is hard.
# But the alert line itself has distinct structure?
# alert('...Ԥ...');
# Let's match any alert that looks like garbage?
# Or specific context variables.

# Replacement 1: confirmOverwrite
if ($content -match 'const confirmOverwrite = window.confirm\(') {
    Write-Host "Fixing confirmOverwrite..."
    $content = $content -replace 'const confirmOverwrite = window.confirm\(.*?\);', "const confirmOverwrite = window.confirm('该时间段已有任务，是否覆盖？');"
}

# Replacement 2: Success Alert (complex template literal)
# alert(` "${draggedTask.title}" ... ${timeStr}`);
if ($content -match 'alert\(` "\${draggedTask\.title}"') {
    Write-Host "Fixing success alert..."
    # Match from alert(` to );
    $content = $content -replace 'alert\(` "\${draggedTask\.title}" .*? \${timeStr}`\);', 'alert(`任务 "${draggedTask.title}" 已排期至 ${timeStr}`);'
}

# Replacement 3: Error Alert
# alert(`...: ${(error as Error).message}`);
if ($content -match 'alert\(`.*?: \${\(error as Error\)\.message}`\)') {
    Write-Host "Fixing error alert..."
    $content = $content -replace 'alert\(`.*?: \${\(error as Error\)\.message}`\)', 'alert(`排期失败: ${(error as Error).message}`)'
}

# Replacement 4: No estimate alert
# Contains Ԥ (Yu - estimate?)
if ($content -match "alert\('[^']*?Ԥ[^']*?'\)") {
    Write-Host "Fixing no estimate alert..."
    $content = $content -replace "alert\('[^']*?Ԥ[^']*?'\)", "alert('任务未设置预估时间，无法排期')"
}

# Replacement 5: Invalid time format (contains Ч - Xiao/Valid?)
if ($content -match "alert\('[^']*?Ч[^']*?'\)") {
    Write-Host "Fixing invalid time alert..."
    $content = $content -replace "alert\('[^']*?Ч[^']*?'\)", "alert('无效的时间格式')"
}

# Replacement 6: Time slot occupied (contains ռ - Zhan/Occupied?)
if ($content -match "alert\('[^']*?ռ[^']*?'\)") {
    Write-Host "Fixing occupied alert..."
    $content = $content -replace "alert\('[^']*?ռ[^']*?'\)", "alert('该时间段已被占用，请选择其他时间')"
}

[System.IO.File]::WriteAllText($path, $content)
Write-Host "Done."
