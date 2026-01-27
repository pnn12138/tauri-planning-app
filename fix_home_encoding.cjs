const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('d:\\tauri\\tauri-planning-app\\src\\Home.tsx');
console.log(`Reading file from: ${targetPath}`);

try {
    let content = fs.readFileSync(targetPath, 'utf8');

    // Fix Month Array
    // We use a regex that looks for 'const months =' and ends with '];'
    // We expect it to be on one line or close enough.
    const originalContent = content;

    // Replace months
    content = content.replace(
        /const months = \[[^\]]*\];/g,
        'const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];'
    );

    // Replace weekdays
    content = content.replace(
        /const weekdays = \[[^\]]*\];/g,
        'const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];'
    );

    // Also ensuring the file starts correctly (BOM or garbage check)
    // If it starts with something other than 'import', clean it up.
    // The previous view shows: "1: import ..."
    // But sometimes hidden chars remain.
    // We'll trust the previous fix for line 1 unless it looks wrong.

    if (content !== originalContent) {
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log('Successfully replaced content in Home.tsx');
    } else {
        console.log('No patterns matched. File might already be fixed or regex failed.');
        // Debugging: Print the lines in question to see what they look like to Node
        const lines = content.split('\n');
        // Find line with 'const months'
        const monthLine = lines.find(l => l.includes('const months'));
        console.log('Current months line:', monthLine);
    }

} catch (e) {
    console.error('Error processing file:', e);
}
