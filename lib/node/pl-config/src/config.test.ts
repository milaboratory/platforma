import { test } from 'vitest';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import { generateLocalPlConfigs, PlConfigGeneratorOptions } from './config';
import yaml from 'yaml';

test('should return the right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = path.resolve(path.join(__dirname, '..', '.test'));
  const opts: PlConfigGeneratorOptions = {
    logger,
    workingDir,
    licenseMode: { type: 'plain', value: 'abc' },
    logLevel: 'info',
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

  // TODO rework
  // expect(yaml.parse(got.plConfigContent)).toStrictEqual(yaml.parse(testConfig.toString()));
});
