const fs = require('fs');
const path = require('path');

function walk(dir, ext = /\.(ts|tsx)$/) {
    let res = [];
    try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) {
                res = res.concat(walk(p, ext));
            } else if (ext.test(p)) {
                res.push(p);
            }
        }
    } catch (e) {
        console.log('Skipping ' + dir);
    }
    return res;
}

const files = [
    ...walk('apps/desktop/src'),
    ...walk('apps/desktop/electron')
];

let updatedCount = 0;
files.forEach(f => {
    let initialContent = fs.readFileSync(f, 'utf8');
    let newContent = initialContent;

    // import { ... } from '../types' -> import { ... } from '@obscura/core'
    newContent = newContent.replace(/from\s+['"](\.\.\/)+types(\/index)?['"]/g, "from '@obscura/core'");

    // import { ... } from './types' -> import { ... } from '@obscura/core' (only when strictly correct, e.g. App.tsx)
    newContent = newContent.replace(/from\s+['"]\.\/types['"]/g, "from '@obscura/core'");

    // Replace type imports across the project that don't match the standard '../types' perfectly
    newContent = newContent.replace(/from\s+['"](.*)src\/types['"]/g, "from '@obscura/core'");

    if (newContent !== initialContent) {
        fs.writeFileSync(f, newContent);
        console.log('Updated ' + f);
        updatedCount++;
    }
});
console.log('Total files updated: ' + updatedCount);
