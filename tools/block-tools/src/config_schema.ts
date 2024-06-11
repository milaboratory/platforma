import { z } from 'zod';
import { Logger } from './lib/cmd';
import { BlockRegistry } from './lib/registry';
import { storageByUrl } from './lib/storage';
import { FullBlockPackageName } from './lib/v1_repo_schema';
import { PlRegAddress, SemVer } from './config';

export const PlPackageConfigData = z.object({
  organization: z.string(),
  package: z.string(),
  version: SemVer.optional(),
  files: z.record(
    z.string().regex(/^[^\/]+$/),
    z.string()
  ).default({}),
  meta: z.object({}).passthrough()
});

export const PlRegCommonConfigData = z.object({
  registries: z.record(z.string(), PlRegAddress).default({}),
  registry: z.string().optional()
});
export type PlRegCommonConfigData = z.infer<typeof PlRegCommonConfigData>

export const PlRegFullPackageConfigData =
  PlRegCommonConfigData
    .merge(PlPackageConfigData)
    .required({ registry: true, version: true });
export type PlRegFullPackageConfigData = z.infer<typeof PlRegFullPackageConfigData>
export const PlRegPackageConfigDataShard = PlRegFullPackageConfigData
  .partial()
  .required({
    registries: true,
    files: true
  });
export type PlRegPackageConfigDataShard = z.infer<typeof PlRegPackageConfigDataShard>

export class PlRegPackageConfig {
  constructor(public readonly conf: PlRegFullPackageConfigData) {
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

export const PlPackageJsonConfigFile = 'pl.package.json';
export const PlPackageYamlConfigFile = 'pl.package.yaml';
