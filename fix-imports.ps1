# Fix the Home.tsx import line
$file = "d:\tauri\tauri-planning-app\src\Home.tsx"
$lines = Get-Content $file

# Replace line 10 (index 9) with proper imports
$lines[9] = "import { buildTimelineModel, TimelineConfig, FreeBlock, BusyBlock, isWeekTimeline, isDayTimeline } from './shared/timeline/timelineDomain';"

# Build new content with import line inserted at position 11 (after line 10)
$newContent = @()
$newContent += $lines[0..9]
$newContent += "import { openTaskTab } from './entities/tab/tab.store';"
$newContent += $lines[10..($lines.Length-1)]

# Write back
$newContent | Set-Content $file -Encoding UTF8

Write-Host "Fixed imports in Home.tsx"
