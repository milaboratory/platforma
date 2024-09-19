const pjs = require('../package.json');
const fs = require('node:fs');

fs.writeFileSync('src/version.ts', `export const PlatformaSDKVersion = '${pjs.version}';\n`);
