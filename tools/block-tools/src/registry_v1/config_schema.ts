import { z } from 'zod';

export const PlRegAddress = z.string().regex(/^(?:s3:|file:)/);
// Regex taken from here:
//   https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
export const SemVer = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Wrong version format, please use valid semver'
  );

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
