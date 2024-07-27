import { randomUUID } from 'crypto';
import { loadPackDescription } from './source_package';
import path from 'path';
import fsp from 'node:fs/promises';
import { buildBlockPackDist } from './build_dist';

test.skip('create dist test', async () => {
  const description = await loadPackDescription(
    '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-template'
  );
  console.dir(description, { depth: 5 });
  const uuid = randomUUID();
  const distPath = path.resolve('tmp', uuid);
  const manifest = await buildBlockPackDist(description, distPath);
  console.dir(manifest, { depth: 5 });
});
