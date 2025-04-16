import { test, expect } from 'vitest';
import { localPlatformaInit } from './pl';
import { ConsoleLoggerAdapter, sleep } from '@milaboratories/ts-helpers';
import * as fs from 'fs/promises';
import upath from 'upath';
import { ProcessOptions, processStop } from './process';
import * as yaml from 'yaml';
import * as os from 'os';
import { mergeDefaultOps } from './pl';
import type { LocalPlOptions, LocalPlOptionsFull } from './pl';
import { plProcessOps } from './pl';
import { describe, it, beforeEach, afterEach } from 'vitest';

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
  { timeout: 35000 },
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

const mergeDefaultOpsCases: {
  name: string;
  input: {
    ops: LocalPlOptions;
    numCpu: number;
  };
  expected: LocalPlOptionsFull;
}[] = [
  {
    name: 'should set default values when minimal input is provided',
    input: {
      ops: { 
        workingDir: '/test', 
        config: 'config',
        plBinary: { type: 'Download', version: '1.29.2' },
      },
      numCpu: 4,
    },
    expected: {
      workingDir: '/test',
      config: 'config',
      plBinary: { type: 'Download', version: '1.29.2' },
      spawnOptions: {
        env: {
          GOMAXPROCS: '4',
        },
      },
      closeOld: true,
    },
  },
  {
    name: 'should override outermost options when provided',
    input: {
      ops: { 
        workingDir: '/test', 
        config: 'config',
        // we provided plBinary and closeOld, they should appear in the result
        plBinary: { type: 'Local', path: '/custom/binary' },
        closeOld: false,
      },
      numCpu: 2,      
    },
    expected: {
      workingDir: '/test',
      config: 'config',
      spawnOptions: {
        env: {
          GOMAXPROCS: '2',
        },
      },
      plBinary: { type: 'Local', path: '/custom/binary' },
      closeOld: false,
    },
  },
  {
    name: 'should merge env variables when provided',
    input: {
      ops: { 
        workingDir: '/test', 
        config: 'config',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {
          env: {
            NODE_ENV: 'test',
            DEBUG: 'true',
          },
        },
      },
      numCpu: 3,
    },
    expected: {
      workingDir: '/test',
      config: 'config',
      plBinary: { type: 'Download', version: '1.29.2' },
      spawnOptions: {
        env: {
          GOMAXPROCS: '3',
          NODE_ENV: 'test',
          DEBUG: 'true',
        },
      },
      closeOld: true,
    },
  },
  {
    name: 'should override other spawnOptions properties',
    input: {
      ops: {
        workingDir: '/test',
        config: 'config',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {
          stdio: 'inherit',
          detached: true,
        },
      },
      numCpu: 2,
    },
    expected: {
      workingDir: '/test',
      config: 'config',
      plBinary: { type: 'Download', version: '1.29.2' },
      spawnOptions: {
        env: {
          GOMAXPROCS: '2',
        },
        stdio: 'inherit',
        detached: true,
      },
      closeOld: true,
    },
  },
  {
    name: 'should handle complex case with multiple overrides',
    input: {
      ops: { 
        workingDir: '/test', 
        config: 'config',
        plBinary: { type: 'Local', path: '/custom/binary' },
        closeOld: false,
        spawnOptions: {
          env: {
            NODE_ENV: 'production',
            LOG_LEVEL: 'debug',
          },
          cwd: '/custom/dir',
          windowsHide: false,
        },
      },
      numCpu: 6,
    },
    expected: {
      workingDir: '/test',
      config: 'config',
      plBinary: { type: 'Local', path: '/custom/binary' },
      closeOld: false,
      spawnOptions: {
        env: {
          GOMAXPROCS: '6',
          NODE_ENV: 'production',
          LOG_LEVEL: 'debug',
        },
        cwd: '/custom/dir',
        windowsHide: false,
      },
    },
  },
];

test.each(mergeDefaultOpsCases)('mergeDefaultOps: $name', ({ name, input, expected }) => {
  const result = mergeDefaultOps(input.ops, input.numCpu);

  expect(result).toEqual(expected);
});

const plProcessOpsCases: {
  name: string;
  input: {
    binaryPath: string;
    configPath: string;
    ops: LocalPlOptionsFull;
    workDir: string;
  };
  expected: ProcessOptions;
}[] = [
  {
    name: 'should set basic options with minimal input',
    input: {
      binaryPath: '/path/to/binary',
      configPath: '/path/to/config.yaml',
      ops: {
        workingDir: '/work/dir',
        config: 'config-content',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {},
        closeOld: true,
      },
      workDir: '/work/dir',
    },
    expected: {
      cmd: '/path/to/binary',
      args: ['--config', '/path/to/config.yaml'],
      opts: {
        env: {},
        cwd: '/work/dir',
        stdio: ['pipe', 'ignore', 'inherit'],
        windowsHide: true,
      },
    },
  },
  {
    name: 'should merge environment variables when provided',
    input: {
      binaryPath: '/path/to/binary',
      configPath: '/config.yaml',
      ops: {
        workingDir: '/work',
        config: 'content',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {
          env: {
            DEBUG: 'true',
            LOG_LEVEL: 'info',
          },
        },
        closeOld: true,
      },
      workDir: '/work',
    },
    expected: {
      cmd: '/path/to/binary',
      args: ['--config', '/config.yaml'],
      opts: {
        env: { 
          DEBUG: 'true',
          LOG_LEVEL: 'info',
        },
        cwd: '/work',
        stdio: ['pipe', 'ignore', 'inherit'],
        windowsHide: true,
      },
    },
  },
  {
    name: 'should override spawn options when provided',
    input: {
      binaryPath: '/binary',
      configPath: '/config.yaml',
      ops: {
        workingDir: '/work',
        config: 'content',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {
          stdio: 'inherit',
          detached: true,
          shell: true,
        },
        closeOld: true,
      },
      workDir: '/work',
    },
    expected: {
      cmd: '/binary',
      args: ['--config', '/config.yaml'],
      opts: {
        env: {},
        cwd: '/work',
        stdio: 'inherit',
        detached: true,
        shell: true,
        windowsHide: true,
      },
    },
  },
  {
    name: 'should handle complex case with multiple options',
    input: {
      binaryPath: '/bin/platforma',
      configPath: '/etc/platforma/config.yaml',
      ops: {
        workingDir: '/var/platforma',
        config: 'yaml content',
        plBinary: { type: 'Download', version: '1.29.2' },
        spawnOptions: {
          env: {
            PL_DEBUG: 'true',
            PL_MODE: 'development',
            GOMAXPROCS: '4',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          windowsHide: false,
          uid: 1000,
          gid: 1000,
        },
        closeOld: true,
      },
      workDir: '/var/platforma/runtime',
    },
    expected: {
      cmd: '/bin/platforma',
      args: ['--config', '/etc/platforma/config.yaml'],
      opts: {
        env: {
          PL_DEBUG: 'true',
          PL_MODE: 'development',
          GOMAXPROCS: '4',
        },
        cwd: '/var/platforma/runtime',
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: false,
        uid: 1000,
        gid: 1000,
      },
    },
  },
];

test.each(plProcessOpsCases)('plProcessOps: $name', ({ name, input, expected }) => {
  const result = plProcessOps(
    input.binaryPath,
    input.configPath,
    input.ops,
    input.workDir,
    {},
  );

  expect(result).toEqual(expected);
});
