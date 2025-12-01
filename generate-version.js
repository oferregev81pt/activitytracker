import fs from 'fs';
const version = {
    version: Date.now().toString()
};
fs.writeFileSync('public/version.json', JSON.stringify(version));
console.log('Version file generated:', version);
