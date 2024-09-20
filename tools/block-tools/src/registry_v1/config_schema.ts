import { z } from 'zod';
import { PlRegAddress } from '../common_types';
import { SemVer } from '@milaboratories/pl-model-middle-layer';

export const PlPackageConfigData = z.object({
  organization: z.string(),
  package: z.string(),
  version: SemVer.optional(),
  files: z.record(z.string().regex(/^[^\/]+$/), z.string()).default({}),
  meta: z.object({}).passthrough()
});

export const PlRegCommonConfigData = z.object({
  registries: z.record(z.string(), PlRegAddress).default({}),
  registry: z.string().optional()
});
export type PlRegCommonConfigData = z.infer<typeof PlRegCommonConfigData>;

export const PlRegFullPackageConfigData = PlRegCommonConfigData.merge(PlPackageConfigData).required(
  { registry: true, version: true }
);
export type PlRegFullPackageConfigData = z.infer<typeof PlRegFullPackageConfigData>;
export const PlRegPackageConfigDataShard = PlRegFullPackageConfigData.partial().required({
  registries: true,
  files: true
});
export type PlRegPackageConfigDataShard = z.infer<typeof PlRegPackageConfigDataShard>;

export const PlPackageJsonConfigFile = 'pl.package.json';
export const PlPackageYamlConfigFile = 'pl.package.yaml';
