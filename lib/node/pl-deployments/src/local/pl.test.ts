import { test } from 'vitest';
import type { LocalPlOptions } from './pl';
import { localPlatformaInit } from './pl';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import * as fs from 'fs/promises';
import upath from 'upath';
import { processStop } from './process';
import * as yaml from 'yaml';
import * as os from 'os';

test(
  'should start and stop platforma of the current version with hardcoded config',
  { timeout: 25000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const config = await readTestConfig();

    const dir = await prepareDirForTestConfig();

    const pl = await localPlatformaInit(logger, {
      workingDir: dir,
      config,
      closeOld: false,
    });

    await sleep(5000);

    console.log(`Platforma: %o`, pl.debugInfo());

    expect(await pl.isAlive()).toBeTruthy();
    expect(pl.pid).not.toBeUndefined();

    pl.stop();
    await pl.waitStopped();
  },
);

test(
  'should close old platforma when starting a new one if the option is set',
  { timeout: 25000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();

    const config = await readTestConfig();
    const dir = await prepareDirForTestConfig();
    const options: LocalPlOptions = {
      workingDir: dir,
      config,
    };

    const oldPl = await localPlatformaInit(logger, options);
    await sleep(5000);
    console.log(`OldPlatforma: %o`, oldPl.debugInfo());

    expect(await oldPl.isAlive()).toBeTruthy();
    const newPl = await localPlatformaInit(logger, options);
    expect(await oldPl.isAlive()).toBeFalsy();
    await sleep(5000);

    console.log(`NewPlatforma: %o`, newPl.debugInfo());

    expect(await newPl.isAlive()).toBeTruthy();
    expect(newPl.pid).not.toBeUndefined();
    newPl.stop();
    await newPl.waitStopped();
  },
);

test(
  'should restart platforma if restart option was provided',
  { timeout: 25000 },
  async ({ expect }) => {
    const logger = new ConsoleLoggerAdapter();
    const config = await readTestConfig();
    const dir = await prepareDirForTestConfig();

    const pl = await localPlatformaInit(logger, {
      workingDir: dir,
      config,
      closeOld: false,
      onCloseAndErrorNoStop: async (pl) => await pl.start(),
    });
    await sleep(1000);

    expect(await pl.isAlive()).toBeTruthy();
    processStop(pl.pid!);
    await sleep(3000);
    console.log(`Platforma after first stop: %o`, pl.debugInfo());

    expect(await pl.isAlive()).toBeTruthy();
    processStop(pl.pid!);
    await sleep(3000);
    console.log(`Platforma after second stop: %o`, pl.debugInfo());

    expect(await pl.isAlive()).toBeTruthy();
    expect(pl.debugInfo().nRuns).toEqual(3);

    pl.stop();
    await pl.waitStopped();
  },
);

async function readTestConfig() {
  const testConfig = upath.join(__dirname, 'config.test.yaml');
  const config = (await fs.readFile(testConfig)).toString();

  const parsed = yaml.parse(config);
  parsed.license.value = process.env.MI_LICENSE;
  if ((parsed.license.value ?? '') == '') {
    parsed.license.file = process.env.MI_LICENSE_FILE;
    if ((parsed.license.file ?? '') == '') {
      parsed.license.file = upath.join(os.homedir(), '.pl.license');
    }
  }

  return yaml.stringify(parsed);
}

async function prepareDirForTestConfig() {
  const dir = upath.join(__dirname, '..', '..', '.test');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir);

  await fs.mkdir(upath.join(dir, 'storages', 'work'), { recursive: true });
  await fs.mkdir(upath.join(dir, 'storages', 'main'), { recursive: true });
  await fs.mkdir(upath.join(dir, 'packages'), { recursive: true });

  return dir;
}
