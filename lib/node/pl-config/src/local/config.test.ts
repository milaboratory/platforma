import { test } from 'vitest';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import upath from 'upath';
import type { LocalPlConfigGeneratorOptions } from './config';
import { generateLocalPlConfigs } from './config';
import yaml from 'yaml';
import type { PlAuthDriverJwt, PlConfig } from '../common/types';

test('should return right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = upath.resolve(upath.join(__dirname, '..', '..', '.test'));
  const opts: LocalPlConfigGeneratorOptions = {
    logger,
    workingDir,
    licenseMode: { type: 'plain', value: 'abc' },
    portsMode: {
      type: 'custom',
      ports: {
        grpc: 11234,
        monitoring: 11235,
        debug: 11236,
      },
    },
    plConfigPostprocessing: (config: PlConfig) => {
      (config.core.auth[0] as PlAuthDriverJwt).key = 'jwtkey';
      return config;
    },
  };

  const got = await generateLocalPlConfigs(opts);

  expect(got.plAddress).toStrictEqual('127.0.0.1:11234');
  expect(got.localStorageProjections.find((s) => s.storageId === 'root')).toStrictEqual({
    storageId: 'root',
    localPath: '',
  });

  const testConfig = await fs.readFile(upath.join(__dirname, 'config_test.yaml'));
  const expected = yaml.parse(testConfig.toString());

  // the simplest way to pass absolute paths in storages
  // (TODO: no absolute paths in database though?)
  expected.controllers.runner.storageRoot = upath.resolve(workingDir, expected.controllers.runner.storageRoot);
  expected.controllers.data.storages[1].rootPath = upath.resolve(workingDir, expected.controllers.data.storages[1].rootPath);
  expected.controllers.data.storages[2].rootPath = upath.resolve(workingDir, expected.controllers.data.storages[2].rootPath);
  expected.core.auth[1].path = upath.resolve(workingDir, expected.core.auth[1].path);
  expected.controllers.packageLoader.packagesRoot = upath.resolve(workingDir, expected.controllers.packageLoader.packagesRoot);

  expect(yaml.parse(got.plConfigContent)).toStrictEqual(expected);
});
