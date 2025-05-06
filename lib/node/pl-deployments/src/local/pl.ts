import type {
  ProcessOptions } from './process';
import {
  isProcessAlive,
  processStop,
  processWaitStopped,
  processRun,
} from './process';
import type { PlBinarySource } from '../common/pl_binary';
import { newDefaultPlBinarySource, resolveLocalPlBinaryPath } from '../common/pl_binary';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { filePid, readPid, writePid } from './pid';
import type { Trace } from './trace';
import { withTrace } from './trace';
import upath from 'upath';
import fsp from 'node:fs/promises';
import type { Required } from 'utility-types';
import * as os from 'node:os';

export const LocalConfigYaml = 'config-local.yaml';

/**
 * Represents a local running pl-core,
 * and has methods to start, check if it's running, stop and wait for stopping it.
 * Also, a hook on pl-core closed can be provided.
 */
export class LocalPl {
  private instance?: ChildProcess;
  public pid?: number;
  private nRuns: number = 0;
  private lastRunHistory: Trace = {};
  private wasStopped = false;

  constructor(
    private readonly logger: MiLogger,
    private readonly workingDir: string,
    private readonly startOptions: ProcessOptions,
    private readonly initialStartHistory: Trace,
    private readonly onClose?: (pl: LocalPl) => Promise<void>,
    private readonly onError?: (pl: LocalPl) => Promise<void>,
    private readonly onCloseAndError?: (pl: LocalPl) => Promise<void>,
    private readonly onCloseAndErrorNoStop?: (pl: LocalPl) => Promise<void>,
  ) {}

  async start() {
    await withTrace(this.logger, async (trace, t) => {
      this.wasStopped = false;
      const instance = processRun(this.logger, this.startOptions);
      instance.on('error', (e: any) => {
        this.logger.error(
          `error '${e}', while running platforma, started opts: ${JSON.stringify(this.debugInfo())}`,
        );

        // keep in mind there are no awaits here, it will be asynchronous
        if (this.onError !== undefined) void this.onError(this);
        if (this.onCloseAndError !== undefined) void this.onCloseAndError(this);
        if (this.onCloseAndErrorNoStop !== undefined && !this.wasStopped)
          void this.onCloseAndErrorNoStop(this);
      });
      instance.on('close', () => {
        this.logger.warn(`platforma was closed, started opts: ${JSON.stringify(this.debugInfo())}`);

        // keep in mind there are no awaits here, it will be asynchronous
        if (this.onClose !== undefined) void this.onClose(this);
        if (this.onCloseAndError !== undefined) void this.onCloseAndError(this);
        if (this.onCloseAndErrorNoStop !== undefined && !this.wasStopped)
          void this.onCloseAndErrorNoStop(this);
      });

      trace('started', true);

      const pidFile = trace('pidFile', filePid(this.workingDir));
      trace('pid', notEmpty(instance.pid));
      trace('pidWritten', await writePid(pidFile, notEmpty(instance.pid)));

      this.nRuns++;
      this.instance = instance;
      this.pid = instance.pid;
      this.lastRunHistory = t;
    });
  }

  stop() {
    // TODO use this.instance to stop the process
    this.wasStopped = true;
    processStop(notEmpty(this.pid));
  }

  async waitStopped() {
    await processWaitStopped(notEmpty(this.pid), 15000);
  }

  stopped() {
    return this.wasStopped;
  }

  async isAlive(): Promise<boolean> {
    return await isProcessAlive(notEmpty(this.pid));
  }

  debugInfo() {
    return {
      lastRunHistory: this.lastRunHistory,
      nRuns: this.nRuns,
      pid: this.pid,
      workingDir: this.workingDir,
      initialStartHistory: this.initialStartHistory,
      wasStopped: this.wasStopped,
    };
  }
}

/** Options to start a local pl-core. */
export type LocalPlOptions = {
  /** From what directory start a process. */
  readonly workingDir: string;
  /** A string representation of yaml config. */
  readonly config: string;
  /** How to get a binary, download it or get an existing one (default: download latest version) */
  readonly plBinary?: PlBinarySource;
  /** Additional options for a process, environments, stdout, stderr etc. */
  readonly spawnOptions?: SpawnOptions;
  /**
   * If the previous pl-core was started from the same directory,
   * we can check if it's still running and then stop it before starting a new one.
   * (default: true)
   */
  readonly closeOld?: boolean;

  /**
  * If true, don't create new or rewrite existed config.
  * It's useful in cases when changing default built-in backend settings is needed.
  */
  readonly useCustomConfig: boolean;

  readonly onClose?: (pl: LocalPl) => Promise<void>;
  readonly onError?: (pl: LocalPl) => Promise<void>;
  readonly onCloseAndError?: (pl: LocalPl) => Promise<void>;
  readonly onCloseAndErrorNoStop?: (pl: LocalPl) => Promise<void>;
};

export type LocalPlOptionsFull = Required<LocalPlOptions, 'plBinary' | 'spawnOptions' | 'closeOld'>;

/**
 * Starts pl-core, if the option was provided downloads a binary, reads license environments etc.
 */
export async function localPlatformaInit(logger: MiLogger, _ops: LocalPlOptions): Promise<LocalPl> {
  // filling-in default values

  // Backend could consume a lot of CPU power,
  // we want to keep at least a couple for UI and other apps to work.
  const numCpu = Math.max(os.cpus().length - 2, 1);
  const ops = mergeDefaultOps(_ops, numCpu);

  return await withTrace(logger, async (trace, t) => {
    trace('startOptions', { ...ops, config: 'too wordy' });

    const workDir = upath.resolve(ops.workingDir);

    if (ops.closeOld) {
      trace('closeOld', await localPlatformaReadPidAndStop(logger, workDir));
    }

    const configPath = upath.join(workDir, LocalConfigYaml);

    if (!ops.useCustomConfig) {
        logger.info(`writing configuration '${configPath}'...`);
        await fsp.writeFile(configPath, ops.config);
    }

    const plBinPath = upath.join(workDir, 'binaries');
    const baseBinaryPath = await resolveLocalPlBinaryPath(logger, plBinPath, ops.plBinary);
    const binaryPath = trace('binaryPath', upath.join('binaries', baseBinaryPath));

    const processOpts = plProcessOps(binaryPath, configPath, ops, workDir, process.env);
    trace('processOpts', {
      cmd: processOpts.cmd,
      args: processOpts.args,
      cwd: processOpts.opts.cwd,
    });

    const pl = new LocalPl(
      logger,
      ops.workingDir,
      processOpts,
      t,
      ops.onClose,
      ops.onError,
      ops.onCloseAndError,
      ops.onCloseAndErrorNoStop,
    );
    await pl.start();

    return pl;
  });
}

/** Reads a pid of the old pl-core if it was started in the same working directory,
 * and closes it. */
async function localPlatformaReadPidAndStop(
  logger: MiLogger,
  workingDir: string,
): Promise<Record<string, any>> {
  return await withTrace(logger, async (trace, t) => {
    const file = trace('pidFilePath', filePid(workingDir));

    const oldPid = trace('pid', await readPid(file));
    const alive = trace('wasAlive', await isProcessAlive(oldPid));

    if (oldPid !== undefined && alive) {
      trace('stopped', processStop(oldPid));
      trace('waitStopped', await processWaitStopped(oldPid, 10_000));
    }

    return t;
  });
}

/** Gets default options for the whole init process
 * and overrides them with the provided options. */
export function mergeDefaultOps(ops: LocalPlOptions, numCpu: number): LocalPlOptionsFull {
  const result: {
    plBinary: PlBinarySource;
    spawnOptions: SpawnOptions;
    closeOld: boolean;
  } = {
    plBinary: newDefaultPlBinarySource(),
    spawnOptions: {
      env: {
        GOMAXPROCS: String(numCpu),
      },
    },
    closeOld: true,
  };

  if (ops.spawnOptions?.env) {
    result.spawnOptions.env = { ...result.spawnOptions.env, ...ops.spawnOptions.env };
  }

  if (ops.spawnOptions) {
    const withoutEnv = { ...ops.spawnOptions };
    delete withoutEnv['env'];
    result.spawnOptions = { ...result.spawnOptions, ...withoutEnv };
  }

  const withoutSpawnOps = { ...ops };
  delete withoutSpawnOps['spawnOptions'];

  return { ...result, ...withoutSpawnOps };
}

/** Gets default options for a platforma local binary
 * and overrides them with the provided options. */
export function plProcessOps(
  binaryPath: any,
  configPath: string,
  ops: LocalPlOptionsFull,
  workDir: string,
  defaultEnv: Record<string, string | undefined>,
): ProcessOptions {
  const result: ProcessOptions = {
    cmd: binaryPath,
    args: ['--config', configPath],
    opts: {
      env: { ...defaultEnv },
      cwd: workDir,
      stdio: ['pipe', 'ignore', 'inherit'],
      windowsHide: true, // hide a terminal on Windows
    },
  };

  if (ops.spawnOptions?.env) {
    result.opts.env = { ...result.opts.env, ...ops.spawnOptions.env };
  }

  const withoutEnv = { ...ops.spawnOptions };
  delete withoutEnv['env'];
  result.opts = { ...result.opts, ...withoutEnv };

  return result;
}
