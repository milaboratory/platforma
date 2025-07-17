const pjs = require('../package.json');
const fs = require('node:fs');

fs.mkdirSync('src/generated', { recursive: true });
fs.writeFileSync('src/generated/version.ts', `export const PlatformaSDKVersion = '${pjs.version}';\n`);
