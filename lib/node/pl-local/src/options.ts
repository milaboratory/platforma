import { SpawnOptions } from 'child_process';
import { LocalPlBinary } from './binary';

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
  readonly spawnOptions: SpawnOptions;
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
  type: 'silent';
};

/** Run a hook if the error happened or a process exited. */
export type LocalPlRestartHook = {
  type: 'hook';
  hook(pl: any): void;
};
