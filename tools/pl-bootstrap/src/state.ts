import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import * as pkg from './package';
import * as util from './util';
import type { SpawnOptions } from 'node:child_process';
import type * as types from './templates/types';

export type runInfo = {
  configPath?: string;
  apiPort?: number;
  apiAddr?: string;
  logPath?: string;
  dbPath?: string;
  primary?: types.storageOptions;
  work?: types.fsStorageOptions;
  library?: types.storageOptions;
};

export type instanceCommand = {
  async?: boolean;
  cmd: string;
  args: readonly string[];
  envs?: NodeJS.ProcessEnv;
  workdir?: string;
  runOpts: SpawnOptions;
};

export type commmonInstanceInfo = {
  name: string;
  upCommands: instanceCommand[];
  downCommands: instanceCommand[];
  cleanupCommands: instanceCommand[];
  runInfo?: runInfo;
};

export type dockerInstanceInfo = commmonInstanceInfo & {
  type: 'docker';
};
export type processInstanceInfo = commmonInstanceInfo & {
  type: 'process';
  pid?: number;
};

export type instanceInfo = dockerInstanceInfo | processInstanceInfo;
export type jsonInstanceInfo = Omit<dockerInstanceInfo, 'name' | 'isActive'> | Omit<processInstanceInfo, 'name' | 'isActive'>;

export function reset() {
  fs.rmSync(State.getStateInstance().filePath);
}

type state = {
  currentInstance: string;
};

class State {
  private static instance: State;

  private state: state = {
    currentInstance: '',
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
      this.state = JSON.parse(pkg.readFileSync(stateFile).toString()) as state;
    }
  }

  public static getStateInstance(): State {
    if (!State.instance) {
      State.instance = new State();
    }

    return State.instance;
  }

  public path(...p: string[]): string {
    return path.join(this.dirPath, ...p);
  }

  public instanceDir(name?: string, ...p: string[]): string {
    if (name) {
      return this.path('data', name, ...p);
    }

    return this.path('data');
  }

  public binaries(...p: string[]): string {
    return this.path('binaries', ...p);
  }

  private writeState() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state));
  }

  get instanceList(): string[] {
    if (!fs.existsSync(this.instanceDir())) {
      return [];
    }

    const list = fs.readdirSync(this.instanceDir());

    return list.filter((iName) => this.instanceExists(iName));
  }

  instanceExists(name: string): boolean {
    return fs.existsSync(this.instanceDir(name, 'instance.json'));
  }

  public getInstanceInfo(name: string): instanceInfo {
    const instanceInfoFile = this.instanceDir(name, 'instance.json');
    if (!fs.existsSync(instanceInfoFile)) {
      throw new Error(`platforma backend instance '${name}' does not exist or is corrupted`);
    }

    const jsonInfo = JSON.parse(pkg.readFileSync(instanceInfoFile).toString()) as jsonInstanceInfo;
    return {
      name: name,
      ...jsonInfo,
    };
  }

  public setInstanceInfo(instanceName: string, info: jsonInstanceInfo) {
    if (!fs.existsSync(this.instanceDir(instanceName))) {
      fs.mkdirSync(this.instanceDir(instanceName), { recursive: true });
    }

    const instanceInfoFile = this.instanceDir(instanceName, 'instance.json');
    let oldInfo: object = {};

    if (fs.existsSync(instanceInfoFile)) {
      oldInfo = JSON.parse(pkg.readFileSync(instanceInfoFile).toString()) as object;
    }

    fs.writeFileSync(instanceInfoFile, JSON.stringify({ ...oldInfo, ...info }));
  }

  public isInstanceActive(instance: instanceInfo): boolean {
    const iType = instance.type;
    switch (iType) {
      case 'docker': {
        const i = util.getDockerComposeInfo(`pl-${instance.name}`);
        if (!i) {
          return false;
        }
        return i.Status.trim().startsWith('running');
      }

      case 'process': {
        if (!instance.pid) {
          return false;
        }
        return isValidPID(instance.pid);
      }

      default:
        util.assertNever(iType);
        throw new Error('cli logic error: unknown service type, cannot check its state');
    }
  }

  get isActive(): boolean {
    for (const iName of this.instanceList) {
      const instance = this.getInstanceInfo(iName);
      if (this.isInstanceActive(instance)) {
        return true;
      }
    }

    return false;
  }

  public isValidPID(pid: number): boolean {
    return isValidPID(pid);
  }

  get currentInstance(): instanceInfo | undefined {
    const name = this.state.currentInstance;
    if (name && this.instanceExists(name)) {
      return this.getInstanceInfo(name);
    }

    return undefined;
  }

  get currentInstanceName(): string {
    return this.state.currentInstance;
  }

  set currentInstanceName(name: string) {
    this.state.currentInstance = name;
    this.writeState();
  }

  selectInstance(name: string) {
    if (!this.instanceExists(name)) {
      throw new Error(`instance '${name}' does not exist`);
    }
    this.state.currentInstance = name;
    this.writeState();
  }
}

function isValidPID(pid: number): boolean {
  const processName = util.getProcessName(pid);
  return processName === 'platforma' || processName.endsWith('/platforma') || processName.endsWith('\\platforma');
}

export default State.getStateInstance();
