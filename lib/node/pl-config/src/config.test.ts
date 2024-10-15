import { test } from 'vitest';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import { generateLocalPlConfigs, PlConfigGeneratorOptions } from './config';
import { getRootDir } from './storages';
import yaml from 'yaml';

test('should return the right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = path.join(__dirname, '.test');
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

  expect(got.plAddress).toEqual('127.0.0.1:11234');
  expect(got.plVersion).not.empty;
  expect(got.ml).toEqual({
    logger: opts.logger,
    localSecret: 'secret', // @TODO: what to do with this?
    blobDownloadPath: path.join(workingDir, 'drivers', 'blobs'),
    frontendDownloadPath: path.join(workingDir, 'drivers', 'frontend'),
    platformLocalStorageNameToPath: {
      root: getRootDir(),
      main: path.resolve(workingDir, 'storages', 'main'),
    },
    localStorageNameToPath: {}
  });

  const testConfig = await fs.readFile(path.join(__dirname, 'config.test.yaml'));
  expect(yaml.parse(got.plConfigContent)).toEqual(yaml.parse(testConfig.toString()));
});
