import YAML from 'yaml';
import { getHomeDir } from '@oclif/core/lib/util/os';
import { tryLoadFile } from './util';
import { z } from 'zod';
import {
  PlPackageJsonConfigFile,
  PlPackageYamlConfigFile,
  PlRegFullPackageConfigData,
  PlRegPackageConfig,
  PlRegPackageConfigDataShard
} from './config_schema';

export const PlRegAddress = z.string().regex(/^(?:s3:|file:)/);

// Regex taken from here:
//   https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
export const SemVer = z.string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Wrong version format, please use valid semver'
  );

function mergeConfigs(c1: PlRegPackageConfigDataShard, c2: PlRegPackageConfigDataShard | undefined): PlRegPackageConfigDataShard {
  if (c2 === undefined)
    return c1;
  return {
    ...c1,
    ...c2,
    registries: { ...c1.registries, ...c2.registries },
    files: { ...c1.files, ...c2.files }
  };
}

async function tryLoadJsonConfigFromFile(file: string): Promise<PlRegPackageConfigDataShard | undefined> {
  return tryLoadFile(file, (buf) => PlRegPackageConfigDataShard.parse(JSON.parse(buf.toString())));
}

async function tryLoadYamlConfigFromFile(file: string): Promise<PlRegPackageConfigDataShard | undefined> {
  return tryLoadFile(file, (buf) => PlRegPackageConfigDataShard.parse(YAML.parse(buf.toString())));
}

async function loadConfigShard(): Promise<PlRegPackageConfigDataShard> {
  let conf = PlRegPackageConfigDataShard.parse({});

  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile('./.pl.reg.json'));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile('./.pl.reg.yaml'));
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile(`${getHomeDir()}/.pl.reg.json`));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile(`${getHomeDir()}/.pl.reg.yaml`));
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile(PlPackageJsonConfigFile));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile(PlPackageYamlConfigFile));

  return conf;
}

let conf: PlRegPackageConfigDataShard | undefined = undefined;
let confPromise: Promise<PlRegPackageConfigDataShard> | undefined = undefined;

async function getConfigShard() {
  if (conf !== undefined)
    return conf;
  if (confPromise !== undefined)
    return await confPromise;
  confPromise = loadConfigShard();
  return await confPromise;
}

export async function getConfig(finalShard: PlRegPackageConfigDataShard) {
  const confShard = await loadConfigShard();
  return new PlRegPackageConfig(
    PlRegFullPackageConfigData.parse(mergeConfigs(confShard, finalShard))
  );
}
