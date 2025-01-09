import { test } from 'vitest';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import type { SshPlConfigGeneratorOptions } from './config';
import { generateSshPlConfigs } from './config';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import type { PlAuthDriverJwt, PlConfig, PlS3StorageSettings } from '../common/types';

test('should return right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = path.join('/', 'home', 'pl-doctor', 'platforma_backend');

  const opts: SshPlConfigGeneratorOptions = {
    logger,
    workingDir,
    licenseMode: { type: 'plain', value: 'abc' },
    portsMode: {
      type: 'customWithMinio',
      ports: {
        grpc: 42097,
        monitoring: 37659,
        debug: 39841,

        minio: 9000,
        minioConsole: 9001,
      },
    },
    plConfigPostprocessing: (config: PlConfig) => {
      (config.core.auth[0] as PlAuthDriverJwt).key = 'jwtkey';
      (config.controllers.data.storages[2] as PlS3StorageSettings).secret = 'thesecret';
      return config;
    },
  };

  const got = await generateSshPlConfigs(opts);

  expect(got.workingDir).toStrictEqual(workingDir);
  expect(got.dirsToCreate).toEqual([
    path.join(workingDir, 'storages', 'work'),
    path.join(workingDir, 'storages', 'main'),
    path.join(workingDir, 'packages'),
  ]);
  expect(got.plConfig).toMatchObject({
    configPath: path.join(workingDir, 'config.yaml'),
  });
  expect(got.minioConfig).toMatchObject({
    envs: {
      MINIO_ROOT_USER: 'minio-user',
      // MINIO_ROOT_PASSWORD: 'abc', // random generated, couldn't check here.
      MINIO_PORT: '9000',
      MINIO_CONSOLE_PORT: '9001',
    },
    storageDir: path.join(workingDir, 'storages', 'main'),
  });

  expect(got.plAddress).toStrictEqual('127.0.0.1:42097');
  expect(got.plUser).toStrictEqual('default-user');
  // expect(got.plPassword).toStrictEqual('abc') // random generated.

  const testConfig = await fs.readFile(path.join(__dirname, 'config_test.yaml'));
  const expectedConfig = yaml.parse(testConfig.toString());

  const configPath = path.join(workingDir, 'config.yaml');
  const usersPath = path.join(workingDir, 'users.htpasswd');
  expect(got.filesToCreate).keys(configPath, usersPath);
  expect(yaml.parse(got.filesToCreate[configPath])).toStrictEqual(expectedConfig);
  expect(got.filesToCreate[usersPath].startsWith('default-user:')).toBeTruthy();
});
