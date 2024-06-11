import { BlockPackRegistry } from './registry';
import path from 'node:path';
import { CentralDevSnapshotRegistry, CentralRegistry } from './well_known_registries';

test('testing local dev registry', async () => {
  const registry = new BlockPackRegistry([{
    type: 'folder_with_dev_packages',
    label: 'Local dev',
    path: path.resolve('integration')
  }]);

  expect(await registry.getPackages()).toHaveLength(2);
});

test('testing remote registry', async () => {
  const registry = new BlockPackRegistry([
    CentralRegistry, CentralDevSnapshotRegistry]);

  const packages = await registry.getPackages();
  console.log(packages);
  expect(packages.length).toBeGreaterThanOrEqual(2);
});
