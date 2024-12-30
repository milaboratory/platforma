import { test } from 'vitest';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import { generateLocalPlConfigs, PlConfigGeneratorOptions } from './config';
import yaml from 'yaml';

test('should return right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = path.resolve(path.join(__dirname, '..', '.test'));
  const opts: PlConfigGeneratorOptions = {
    logger,
    workingDir,
    licenseMode: { type: 'plain', value: 'abc' },
    portsMode: {
      type: 'custom',
      ports: {
        grpc: 11234,
        monitoring: 11235,
        debug: 11236
      }
    }
  };

  const got = await generateLocalPlConfigs(opts);

  expect(got.plAddress).toStrictEqual('127.0.0.1:11234');
  expect(got.localStorageProjections.find((s) => s.storageId === 'root')).toStrictEqual({
    storageId: 'root',
    localPath: ''
  });

  const testConfig = await fs.readFile(path.join(__dirname, 'config.test.yaml'));
  const expected = yaml.parse(testConfig.toString());

  // the simplest way to pass absolute paths in storages
  // (TODO: no absolute paths in database and softwareRoot though?)
  expected.controllers.runner.storageRoot = path.resolve(workingDir, expected.controllers.runner.storageRoot);
  expected.controllers.data.storages[1].rootPath = path.resolve(workingDir, expected.controllers.data.storages[1].rootPath);
  expected.controllers.data.storages[2].rootPath = path.resolve(workingDir, expected.controllers.data.storages[2].rootPath);

  // mock a bit more
  const gotParsed = yaml.parse(got.plConfigContent);
  gotParsed.core.auth[0].key = 'jwtkey';

  expect(gotParsed).toStrictEqual(expected);
});
