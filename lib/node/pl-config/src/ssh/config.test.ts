import { test } from 'vitest';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import type { SshPlConfigGeneratorOptions } from './config';
import { generateSshPlConfigs } from './config';
import fs from 'fs/promises';
import upath from 'upath';
import yaml from 'yaml';
import type { PlAuthDriverJwt, PlConfig, PlS3StorageSettings } from '../common/types';

test('should return right configs', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = upath.join('/', 'home', 'pl-doctor', 'platforma_backend');

  const opts: SshPlConfigGeneratorOptions = {
    logger,
    workingDir,
    useGlobalAccess: false,
    licenseMode: { type: 'plain', value: 'abc' },
    portsMode: {
      type: 'customWithMinio',
      ports: {
        grpc: 42097,
        monitoring: 37659,
        debug: 39841,

        minio: 9000,
        minioConsole: 9001,

        grpcLocal: 11111,
        minioLocal: 22222,
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
    upath.join(workingDir, 'storages', 'work'),
    upath.join(workingDir, 'storages', 'main'),
    upath.join(workingDir, 'packages'),
  ]);
  expect(got.plConfig).toMatchObject({
    configPath: upath.join(workingDir, 'config.yaml'),
  });
  expect(got.minioConfig).toMatchObject({
    envs: {
      MINIO_ROOT_USER: 'minio-user',
      // MINIO_ROOT_PASSWORD: 'abc', // random generated, couldn't check here.
      MINIO_ADDRESS: '127.0.0.1:9000',
      MINIO_CONSOLE_ADDRESS: '127.0.0.1:9001',
    },
    storageDir: upath.join(workingDir, 'storages', 'main'),
  });

  expect(got.plAddress).toStrictEqual('http://127.0.0.1:11111');
  expect(got.plUser).toStrictEqual('default-user');
  // expect(got.plPassword).toStrictEqual('abc') // random generated.

  const testConfig = await fs.readFile(upath.join(__dirname, 'config_test.yaml'));
  const expectedConfig = yaml.parse(testConfig.toString());

  const configPath = upath.join(workingDir, 'config.yaml');
  const usersPath = upath.join(workingDir, 'users.htpasswd');
  expect(got.filesToCreate).keys(configPath, usersPath);
  expect(yaml.parse(got.filesToCreate[configPath])).toStrictEqual(expectedConfig);
  expect(got.filesToCreate[usersPath].startsWith('default-user:')).toBeTruthy();
});
