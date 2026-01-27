const fs = require('fs');
const path = require('path');

const filePath = 'd:\\tauri\\tauri-planning-app\\src\\Home.tsx';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix Months Array
    // The corrupted string likely contains "1鏈?, "2鏈?..." etc.
    // We'll use a regex that matches the structure of the array assignment to be safe.

    // Regex for months: matches 'const months = [' followed by anything until '];'
    // We want to be careful not to match too much, but since it's a specific line structure:
    // const months = ["...", "...", ...];
    const monthsRegex = /const months = \[.*\];/;
    const correctMonths = 'const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];';

    if (monthsRegex.test(content)) {
        console.log('Replacing months array...');
        content = content.replace(monthsRegex, correctMonths);
    } else {
        console.log('Months array pattern not found.');
    }

    // Fix Weekdays Array
    const weekdaysRegex = /const weekdays = \[.*\];/;
    const correctWeekdays = 'const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];';

    if (weekdaysRegex.test(content)) {
        console.log('Replacing weekdays array...');
        content = content.replace(weekdaysRegex, correctWeekdays);
    } else {
        console.log('Weekdays array pattern not found.');
    }

    // Re-verify Line 1 (just in case)
    // Sometimes BOM or other invisible chars persist
    if (content.charCodeAt(0) !== 105 && content.charCodeAt(0) !== 13 && content.charCodeAt(0) !== 10) { // 'i' is 105
        // If the first char isn't 'i' (from import) or newline, it might be garbage.
        // But let's just regex replace the start if it looks like garbage + import
        const startRegex = /^.*?import \{ useEffect/s;
        if (startRegex.test(content)) {
            console.log('Cleaning file start...');
            content = content.replace(startRegex, 'import { useEffect');
        }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully wrote Home.tsx with UTF-8 encoding.');

} catch (err) {
    console.error('Error:', err);
}
