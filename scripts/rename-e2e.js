// scripts/rename-e2e.js
// renames .js files to .cjs in dist-e2e , because they are CommonJS tests and need the .cjs extension,
// because Node.js treats .js as ESM by default in package.json "type": "module" projects
import fs from 'fs';
import path from 'path';

function renameDir(dir) {
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            renameDir(fullPath);
        } else if (file.endsWith('.js')) {
            const newPath = path.join(dir, file.replace(/\.js$/, '.cjs'));
            fs.renameSync(fullPath, newPath);
        }
    }
}

renameDir('./dist-e2e');
console.log('Renamed .js → .cjs for CommonJS tests');
