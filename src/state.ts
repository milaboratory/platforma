import fs from 'fs';
import path from 'path';
import * as pkg from './package';

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
  public readonly dirPath: string;

  constructor() {
    this.dirPath = path.resolve(pkg.state());
    this.filePath = path.resolve(pkg.state('state.json'));

    if (!fs.existsSync(this.dirPath)) {
      fs.mkdirSync(this.dirPath, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      this.state = JSON.parse(pkg.readFileSync(this.filePath).toString());
    }
  }

  public static getInstance(): State {
    if (!State.instance) {
      State.instance = new State();
    }

    return State.instance;
  }

  private writeState() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state));
  }

  get isActive(): boolean {
    return this.state.isActive;
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
