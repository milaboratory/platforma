import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { storageByUrl } from './storage';
import fs from 'node:fs';
import { BlockRegistry } from './registry';

test('basic registry test', async () => {
  const uuid = randomUUID().toString();
  const tmp = path.resolve('tmp');
  const storage = storageByUrl('file://' + path.resolve(tmp, uuid));
  const registry = new BlockRegistry(storage);
  await registry.updateIfNeeded();
  const constructor1 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.1.0' });
  await constructor1.writeMeta({ some: 'value1' });
  await constructor1.finish();
  await registry.updateIfNeeded();
  const constructor2 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.2.0' });
  await constructor2.writeMeta({ some: 'value2' });
  await constructor2.finish();
  await registry.updateIfNeeded();
  expect(await registry.getPackageOverview({ organization: 'org1', package: 'pkg1' })).toEqual(
    [
      { version: '1.2.0', meta: { some: 'value2' } },
      { version: '1.1.0', meta: { some: 'value1' } }
    ]
  );
  expect(await registry.getGlobalOverview()).toEqual([
      {
        organization: 'org1',
        package: 'pkg1',
        allVersions: ['1.1.0', '1.2.0'],
        latestVersion: '1.2.0',
        latestMeta: { some: 'value2' }
      }
    ]
  );
  await fs.promises.rm(tmp, { recursive: true, force: true });
});
