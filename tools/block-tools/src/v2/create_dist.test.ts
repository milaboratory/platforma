import { randomUUID } from 'crypto';
import { loadPackDescriptionFromSource } from './source_package';
import path from 'path';
import fsp from 'node:fs/promises';
import { createBlockPackDist } from './create_dist';

test('create dist test', async () => {
  const description = await loadPackDescriptionFromSource(
    '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-template'
  );
  console.dir(description, { depth: 5 });
  const uuid = randomUUID();
  const distPath = path.resolve('tmp', uuid);
  const manifest = await createBlockPackDist(description, distPath);
  console.dir(manifest, { depth: 5 });
});
