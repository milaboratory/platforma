import fs from 'fs';
import path from 'path';
import { PlViteStdNode } from '@milaboratories/platforma-build-configs/vite';

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, './package.json')).toString());

if (!pack['pl-version']) {
  throw Error('pl-version is required in package.json');
}

export default PlViteStdNode({
  define: {
    PL_VERSION: JSON.stringify(pack['pl-version']),
  },
});
