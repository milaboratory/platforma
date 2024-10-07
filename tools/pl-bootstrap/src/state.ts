import os from 'os';
import fs from 'fs';
import path from 'path';
import * as pkg from './package';
import * as util from './util';

export type runMode = 'docker' | 'process';

export type dockerRunInfo = {
  plImage?: string;
  composePath?: string;

  primaryPath?: string;
  workPath?: string;
  libraryPath?: string;
};

export type processRunInfo = {
  pid?: number;
  storagePath?: string;
};

export type lastRun = {
  docker?: dockerRunInfo;
  process?: processRunInfo;

  mode: runMode;
  cmd: string;
  args: readonly string[];
  workdir?: string;
  envs?: NodeJS.Dict<string>;
};

export function reset() {
  fs.rmSync(State.getInstance().filePath);
}

type state = {
  lastRun: lastRun | undefined;
  isActive: boolean;
};

class State {
  private static instance: State;

  private state: state = {
    lastRun: undefined,
    isActive: false
  };

  public readonly filePath: string;
  private readonly dirPath: string;

  constructor(stateDir?: string) {
    stateDir = stateDir ?? path.resolve(os.homedir(), '.config', 'pl-bootstrap');

    const stateFile = path.join(stateDir, 'state.json');

    this.dirPath = stateDir;
    this.filePath = stateFile;

    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    if (fs.existsSync(stateFile)) {
      this.state = JSON.parse(pkg.readFileSync(stateFile).toString());
    }
  }

  public static getInstance(): State {
    if (!State.instance) {
      State.instance = new State();
    }

    return State.instance;
  }

  public path(...p: string[]): string {
    return path.join(this.dirPath, ...p);
  }

  public data(...p: string[]): string {
    return this.path('data', ...p);
  }

  public binaries(...p: string[]): string {
    return this.path('binaries', ...p);
  }

  private writeState() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state));
  }

  get isActive(): boolean {
    if (this.state.isActive) {
      return this.state.isActive;
    }

    if (!this.state.lastRun?.process?.pid) {
      return false;
    }

    return this.isValidPID;
  }

  get isValidPID(): boolean {
    if (!this.state.lastRun?.process?.pid) {
      return false;
    }

    const processName = util.getProcessName(this.state.lastRun.process.pid);
    return (
      processName === 'platforma' ||
      processName.endsWith('/platforma') ||
      processName.endsWith('\\platforma')
    );
  }

  set isActive(value: boolean) {
    this.state.isActive = value;
    this.writeState();
  }

  get lastRun(): lastRun | undefined {
    return this.state.lastRun;
  }

  set lastRun(info: lastRun) {
    this.state.lastRun = info;
    this.writeState();
  }
}

export default State.getInstance();
