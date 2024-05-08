import YAML from 'yaml';
import { getHomeDir } from '@oclif/core/lib/util/os';
import { tryLoadFile } from './util';
import { storageByUrl } from './lib/storage';
import { BlockRegistry } from './lib/registry';
import { Logger } from './lib/cmd';

export interface PlRegConfigData {
  registries: Record<string, string>;
}

export class PlRegConfig {
  constructor(public readonly conf: PlRegConfigData) {
  }

  createRegistry(reg: string = 'default', logger?: Logger): BlockRegistry {
    let address = reg;
    if (!reg.startsWith('file:') && !reg.startsWith('s3:')) {
      const regByAlias = this.conf.registries[reg];
      if (!regByAlias)
        throw new Error(`Registry with alias "${reg}" not found`);
      address = regByAlias;
    }
    return new BlockRegistry(storageByUrl(address), logger);
  }
}

function mergeConfigs(c1: PlRegConfigData, c2: PlRegConfigData | undefined): PlRegConfigData {
  if (c2 === undefined)
    return c1;
  return {
    ...c1,
    ...c2,
    registries: { ...c1.registries, ...c2.registries }
  };
}

async function tryLoadJsonConfigFromFile(file: string): Promise<PlRegConfigData | undefined> {
  return tryLoadFile(file, (buf) => JSON.parse(buf.toString()) as PlRegConfigData);
}

async function tryLoadYamlConfigFromFile(file: string): Promise<PlRegConfigData | undefined> {
  return tryLoadFile(file, (buf) => YAML.parse(buf.toString()) as PlRegConfigData);
}

async function loadConfig(): Promise<PlRegConfigData> {
  let conf: PlRegConfigData = {
    registries: {}
  };

  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile('./.pl.reg.json'));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile('./.pl.reg.yaml'));
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile(`${getHomeDir()}/.pl.reg.json`));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile(`${getHomeDir()}/.pl.reg.yaml`));

  return conf;
}

let conf: PlRegConfigData | undefined = undefined;
let confPromise: Promise<PlRegConfigData> | undefined = undefined;

async function getConfigData() {
  if (conf !== undefined)
    return conf;
  if (confPromise !== undefined)
    return await confPromise;
  confPromise = loadConfig();
  return await confPromise;
}

export async function getConfig() {
  return new PlRegConfig(await loadConfig());
}
