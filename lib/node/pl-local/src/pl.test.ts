import { test } from 'vitest';
import { LocalPlOptions, platformaInit } from './pl';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { processStop } from './process';
import yaml from 'yaml';
import os from 'os';

test(
  'should start and stop platforma of the current version with hardcoded config',
  { timeout: 15000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const config = await readTestConfig();

    const dir = await prepareDirForTestConfig();
    const opts: LocalPlOptions = {
      workingDir: dir,
      config,
      binary: {
        type: 'Download',
        version: await getPlVersion(),
        dir: path.join(dir, 'binaries')
      },
      spawnOptions: {
        stdio: ['ignore', createWriteStream(path.join(dir, 'stdout.log')), 'inherit']
      },
      closeOld: false,
    };

    const pl = await platformaInit(logger, opts);

    await sleep(5000);

    console.log(`Platforma: %o`, pl.debugInfo());

    expect(pl.pid).not.toBeUndefined();
    pl.stop();
    await pl.waitStopped();
  }
);

test(
  'should close old platforma when starting a new one if the option is set',
  { timeout: 15000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();

    const config = await readTestConfig();
    const dir = await prepareDirForTestConfig();
    const options: LocalPlOptions = {
      workingDir: dir,
      config,
      binary: {
        type: 'Download',
        version: await getPlVersion(),
        dir: path.join(dir, 'binaries')
      },
      spawnOptions: {},
      closeOld: true,
    };

    const oldPl = await platformaInit(logger, options);
    await sleep(5000);
    console.log(`OldPlatforma: %o`, oldPl.debugInfo());

    const newPl = await platformaInit(logger, options);
    expect(await oldPl.isAlive()).toBeFalsy();
    await sleep(5000);

    console.log(`NewPlatforma: %o`, newPl.debugInfo());

    expect(newPl.pid).not.toBeUndefined();
    newPl.stop();
    await newPl.waitStopped();
  }
);

test(
  'should restart platforma if restart option was provided',
  { timeout: 15000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const config = await readTestConfig();
    const dir = await prepareDirForTestConfig();

    const pl = await platformaInit(logger, {
      workingDir: dir,
      config,
      binary: {
        type: 'Download',
        version: await getPlVersion(),
        dir: path.join(dir, 'binaries')
      },
      spawnOptions: {},
      closeOld: false,
      onCloseAndErrorNoStop: async (pl) => await pl.start()
    });
    await sleep(1000);

    processStop(pl.pid!);
    await sleep(3000);
    console.log(`Platforma after first stop: %o`, pl.debugInfo());

    processStop(pl.pid!);
    await sleep(3000);
    console.log(`Platforma after second stop: %o`, pl.debugInfo());

    expect(await pl.isAlive()).toBeTruthy();
    expect(pl.debugInfo().nRuns).toEqual(3);

    pl.stop();
    await pl.waitStopped();
  }
);

async function readTestConfig() {
  const testConfig = path.join(__dirname, 'config.test.yaml');
  const config = (await fs.readFile(testConfig)).toString();

  const parsed = yaml.parse(config);
  parsed.license.value = process.env.MI_LICENSE;
  if ((parsed.license.value ?? '') == '') {
    parsed.license.file = process.env.MI_LICENSE_FILE;
    if ((parsed.license.file ?? '') == '') {
      parsed.license.file = path.join(os.homedir(), '.pl.license');
    }
  }

  return yaml.stringify(parsed);
}

async function prepareDirForTestConfig() {
  const dir = path.join(__dirname, '.test');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir);

  await fs.mkdir(path.join(dir, 'storages', 'work'), { recursive: true });
  await fs.mkdir(path.join(dir, 'storages', 'main'), { recursive: true });
  await fs.mkdir(path.join(dir, 'packages'), { recursive: true });

  return dir;
}

async function getPlVersion() {
  const packageJson = await fs.readFile(path.join('..', 'pl-config', 'package.json'));
  return JSON.parse(packageJson.toString())['pl-version'];
}
