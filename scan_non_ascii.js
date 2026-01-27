const fs = require('fs');

try {
    const content = fs.readFileSync('src/Home.tsx', 'utf8');
    const lines = content.split('\n');

    let found = false;
    lines.forEach((line, index) => {
        // Match non-ASCII
        if (/[^\x00-\x7F]/.test(line)) {
            console.log(`${index + 1}: ${line.trim()}`);
            found = true;
        }
    });

    if (!found) {
        console.log('No non-ASCII characters found.');
    }
} catch (e) {
    console.error('Error:', e);
}
