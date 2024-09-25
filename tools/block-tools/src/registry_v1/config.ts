import YAML from 'yaml';
import { tryLoadFile } from '../util';
import {
  PlPackageJsonConfigFile,
  PlPackageYamlConfigFile,
  PlRegFullPackageConfigData,
  PlRegPackageConfigDataShard
} from './config_schema';
import * as os from 'node:os';
import { BlockRegistry } from './registry';
import { storageByUrl } from '../lib/storage';
import type { FullBlockPackageName } from './v1_repo_schema';
import type { MiLogger } from '@milaboratories/ts-helpers';

function mergeConfigs(
  c1: PlRegPackageConfigDataShard,
  c2: PlRegPackageConfigDataShard | undefined
): PlRegPackageConfigDataShard {
  if (c2 === undefined) return c1;
  return {
    ...c1,
    ...c2,
    registries: { ...c1.registries, ...c2.registries },
    files: { ...c1.files, ...c2.files }
  };
}

async function tryLoadJsonConfigFromFile(
  file: string
): Promise<PlRegPackageConfigDataShard | undefined> {
  return tryLoadFile(file, (buf) => PlRegPackageConfigDataShard.parse(JSON.parse(buf.toString())));
}

async function tryLoadYamlConfigFromFile(
  file: string
): Promise<PlRegPackageConfigDataShard | undefined> {
  return tryLoadFile(file, (buf) => PlRegPackageConfigDataShard.parse(YAML.parse(buf.toString())));
}

async function loadConfigShard(): Promise<PlRegPackageConfigDataShard> {
  let conf = PlRegPackageConfigDataShard.parse({});

  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile('./.pl.reg.json'));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile('./.pl.reg.yaml'));
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile(`${os.homedir()}/.pl.reg.json`));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile(`${os.homedir()}/.pl.reg.yaml`));
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile(PlPackageJsonConfigFile));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile(PlPackageYamlConfigFile));

  return conf;
}

const conf: PlRegPackageConfigDataShard | undefined = undefined;
let confPromise: Promise<PlRegPackageConfigDataShard> | undefined = undefined;

async function getConfigShard() {
  if (conf !== undefined) return conf;
  if (confPromise !== undefined) return await confPromise;
  confPromise = loadConfigShard();
  return await confPromise;
}

export class PlRegPackageConfig {
  constructor(public readonly conf: PlRegFullPackageConfigData) {}

  createRegistry(logger?: MiLogger): BlockRegistry {
    let address = this.conf.registry;
    if (!address.startsWith('file:') && !address.startsWith('s3:')) {
      const regByAlias = this.conf.registries[address];
      if (!regByAlias) throw new Error(`Registry with alias "${address}" not found`);
      address = regByAlias;
    }
    return new BlockRegistry(storageByUrl(address), logger);
  }

  get fullPackageName(): FullBlockPackageName {
    return {
      organization: this.conf.organization,
      package: this.conf.package,
      version: this.conf.version
    };
  }
}

export async function getConfig(finalShard: PlRegPackageConfigDataShard) {
  const confShard = await loadConfigShard();
  return new PlRegPackageConfig(
    PlRegFullPackageConfigData.parse(mergeConfigs(confShard, finalShard))
  );
}
