const fs = require('fs');

const filePath = 'd:\\tauri\\tauri-planning-app\\src\\Home.tsx';

try {
    console.log('Reading file...');
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix Months Array
    // The corrupted string likely looks like: const months = ["1鏈?, "2鏈?, ...];
    // We will target the line by content signature.
    const monthsTarget = 'const months = [';
    const monthsEnd = '];';

    // Find start and end of months array
    const monthsStartIndex = content.indexOf(monthsTarget);
    if (monthsStartIndex !== -1) {
        const monthsEndIndex = content.indexOf(monthsEnd, monthsStartIndex);
        if (monthsEndIndex !== -1) {
            console.log('Found months array range.');
            const before = content.substring(0, monthsStartIndex);
            const after = content.substring(monthsEndIndex + monthsEnd.length);
            const correctMonths = 'const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];';
            content = before + correctMonths + after;
            console.log('Months array replaced.');
        }
    } else {
        console.log('Months array not found by exact string.');
    }

    // Fix Weekdays Array
    const weekdaysTarget = 'const weekdays = [';
    const weekdaysEnd = '];';

    const weekdaysStartIndex = content.indexOf(weekdaysTarget);
    if (weekdaysStartIndex !== -1) {
        const weekdaysEndIndex = content.indexOf(weekdaysEnd, weekdaysStartIndex);
        if (weekdaysEndIndex !== -1) {
            console.log('Found weekdays array range.');
            const before = content.substring(0, weekdaysStartIndex);
            const after = content.substring(weekdaysEndIndex + weekdaysEnd.length);
            const correctWeekdays = 'const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];';
            content = before + correctWeekdays + after;
            console.log('Weekdays array replaced.');
        }
    } else {
        console.log('Weekdays array not found by exact string.');
    }

    console.log('Writing file...');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully wrote Home.tsx with UTF-8 encoding.');

} catch (err) {
    console.error('Error encountered:', err);
}
