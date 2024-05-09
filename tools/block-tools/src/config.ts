import YAML from 'yaml';
import { getHomeDir } from '@oclif/core/lib/util/os';
import { tryLoadFile } from './util';
import { storageByUrl } from './lib/storage';
import { BlockRegistry, FullBlockPackageName } from './lib/registry';
import { Logger } from './lib/cmd';
import { z } from 'zod';
import { Config } from '@oclif/core';

export const PlRegAddress = z.string().regex(/^(?:s3:|file:)/);

// Regex taken from here:
//   https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
export const SemVer = z.string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Wrong version format, please use valid semver'
  );

export const PlRegCommonConfigData = z.object({
  registries: z.record(z.string(), PlRegAddress).default({}),
  registry: z.string().optional(),
  organization: z.string().optional()
});
export type PlRegCommonConfigData = z.infer<typeof PlRegCommonConfigData>

export const PlRegPackageConfigData = PlRegCommonConfigData.required({
  registry: true,
  organization: true
}).extend({
  package: z.string(),
  version: SemVer,
  files: z.record(
    z.string().regex(/^[^\/]+$/),
    z.string()
  ).default({}),
  meta: z.object({}).passthrough()
});
export type PlRegPackageConfigData = z.infer<typeof PlRegPackageConfigData>
export const PlRegPackageConfigDataShard = PlRegPackageConfigData
  .partial()
  .required({
    registries: true,
    files: true
  });
export type PlRegPackageConfigDataShard = z.infer<typeof PlRegPackageConfigDataShard>

export class PlRegPackageConfig {
  constructor(public readonly conf: PlRegPackageConfigData) {
  }

  createRegistry(logger?: Logger): BlockRegistry {
    let address = this.conf.registry;
    if (!address.startsWith('file:') && !address.startsWith('s3:')) {
      const regByAlias = this.conf.registries[address];
      if (!regByAlias)
        throw new Error(`Registry with alias "${address}" not found`);
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
  conf = mergeConfigs(conf, await tryLoadJsonConfigFromFile('pl.package.json'));
  conf = mergeConfigs(conf, await tryLoadYamlConfigFromFile('pl.package.yaml'));

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
    PlRegPackageConfigData.parse(mergeConfigs(confShard, finalShard))
  );
}
