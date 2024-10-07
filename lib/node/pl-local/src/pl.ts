import { isProcessAlive, ProcessOptions, processStop, processWaitStopped, processRun } from "./process";
import { getBinaryPath, LocalPlBinary } from "./binary";
import { MiLogger, notEmpty, sleep } from '@milaboratories/ts-helpers';
import { getConfigPath, parseConfig, stringifyConfig, writeConfig } from "./config";
import { ChildProcess, SpawnOptions } from "child_process";
import { filePid, readPid, writePid } from "./pid";
import { Trace, withTrace } from "./trace";
import { getLicenseFromEnv, mergeLicense } from "./license";

/**
 * Represents a local running pl-core,
 * and has methods to start, check if it's running, stop and wait for stopping it.
 * Also, a hook on pl-core closed can be provided.
 */
export class Pl {
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
    private readonly restartMode: LocalPlRestart,
  ) {};

  async start() {
    await withTrace(this.logger, async (trace, t) => {
      const instance = processRun(this.logger, this.startOptions)
      instance.on('error', (e: any) => {
        this.logger.error(`error ${e}, while running platforma, started opts: ${JSON.stringify(this.debugInfo())}`)
        this.restart();
      })
      instance.on('close', () => {
        this.logger.warn(`platforma was closed, started opts: ${JSON.stringify(this.debugInfo())}`)
        this.restart();
      })

      trace('started', true);

      const pidFile = trace('pidFile', filePid(this.workingDir))
      trace('pidWritten', await writePid(pidFile, instance.pid!))

      this.nRuns++;
      this.instance = instance;
      this.pid = instance.pid;
      this.lastRunHistory = t;
    })
  }

  private restart() {
    if (this.restartMode.type == 'hook' && !this.wasStopped)
      this.restartMode.hook(this)
  }
  
  stop() {
    this.wasStopped = true;
    processStop(notEmpty(this.pid));
  }

  async waitStopped() {
    await processWaitStopped(notEmpty(this.pid), 10000);
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
      initialStartHistory: this.initialStartHistory
    }
  }
}

/** Options to start a local pl-core. */
export type LocalPlOptions = {
  /** From what directory start a process. */
  readonly workingDir: string;
  /** A string representation of yaml config. */
  readonly config: string;
  /** Should we read environment variables for license and other secrets? */
  readonly shouldGetLicenseFromEnv: boolean;
  /** How to get a binary, download it or get an existing one. */
  readonly binary: LocalPlBinary;
  /** Additional options for a process, environments, stdout, stderr etc. */
  readonly spawnOptions: SpawnOptions,
  /**
   * If the previous pl-core was started from the same directory,
   * we can check if it's still running and then stop it before starting a new one.
   */
  readonly closeOld: boolean;
  /** What should we do on closing or if the process exit with error */
  readonly restartMode: LocalPlRestart;
};

export type LocalPlRestart = LocalPlRestartSilent | LocalPlRestartHook;

/** Do nothing if the error happened or a process exited. */
export type LocalPlRestartSilent = {
  type: 'silent'
}

/** Run a hook if the error happened or a process exited. */
export type LocalPlRestartHook = {
  type: 'hook',
  hook(pl: Pl): void;
}

/**
 * Starts pl-core, if the option was provided downloads a binary, reads license environments etc.
 */
export async function platformaInit(
  logger: MiLogger,
  opts: LocalPlOptions,
): Promise<Pl> {
  return await withTrace(logger, async (trace, t) => {
    trace('startOptions', { ...opts, config: 'too wordy' });

    if (opts.closeOld) {
      trace('closeOld', await platformaReadPidAndStop(logger, opts.workingDir));
    }

    let config = opts.config;
    if (opts.shouldGetLicenseFromEnv) {
      const parsed = parseConfig(opts.config);
      const license = await getLicenseFromEnv();
      mergeLicense(license, parsed);
      config = stringifyConfig(parsed);
      trace('licenseMerged', true);
    }
    const configPath = trace('configPath', getConfigPath(opts.workingDir));
    trace('configWritten', await writeConfig(logger, configPath, config));

    const binaryPath = trace('binaryPath', await getBinaryPath(logger, opts.binary));

    const processOpts: ProcessOptions = {
      cmd: binaryPath,
      args: ['-config', configPath],
      opts: {
        env: { ...process.env },
        cwd: opts.workingDir,
        stdio: ['ignore', 'ignore', 'inherit'],
        ...opts.spawnOptions,
      }
    };
    trace('processOpts', {
      cmd: processOpts.cmd,
      args: processOpts.args,
      cwd: processOpts.opts.cwd,
    });

    const pl = new Pl(logger, opts.workingDir, processOpts, t, opts.restartMode);
    await pl.start()

    return pl;
  })
}

/** Reads a pid of the old pl-core if it was started in the same working directory,
 * and closes it. */
async function platformaReadPidAndStop(
  logger: MiLogger, workingDir: string
): Promise<Record<string, any>> {
  return await withTrace(logger, async (trace, t) => {
    const file = trace('pidFilePath', filePid(workingDir));

    const oldPid = trace('pid', await readPid(file));
    const alive = trace('wasAlive', await isProcessAlive(oldPid));

    if (oldPid !== undefined && alive) {
      trace('stopped', processStop(oldPid));
      trace('waitStopped', await processWaitStopped(oldPid, 10000));
    }

    return t;
  })
}
