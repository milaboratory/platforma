import { z } from 'zod';
import * as artifacts from './artifacts';
import * as util from '../util';

const artifactOrRef = z.union([z.string(), artifacts.configSchema]);

const envVarsSchema = z.array(
  z
    .string()
    .regex(
      /=/,
      'full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes',
    ),
);

export const EnyrypointReferencePattern
  = /^(?<fullName>(?:(?<scope>@[a-z0-9-.]+)\/)?(?<name>[a-z0-9-.]+))\/(?<path>.*)$/;

export const referenceSchema = z
  .string()
  .regex(
    EnyrypointReferencePattern,
    'entrypoint reference must contain full package name and path to the file inside',
  );

export const softwareOptionsSchema = z.strictObject({
  artifact: artifactOrRef,

  cmd: z
    .array(z.string())
    .describe(
      'command to run for this entrypoint. This command will be appended by <args> set inside workflow',
    ),
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for this entrypoint'),
});
export type binaryOptions = z.infer<typeof softwareOptionsSchema>;

export const environmentOptionsSchema = z.strictObject({
  artifact: artifactOrRef,
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for any command inside this run environment'),
});

// Full schema of single entrypoint in block-software.entrypoints
export const infoSchema = z
  .strictObject({
    reference: referenceSchema.optional(),
    asset: z.union([z.string(), artifacts.assetPackageSchema]).optional(),
    binary: softwareOptionsSchema.optional(),
    environment: environmentOptionsSchema.optional(),
    docker: softwareOptionsSchema.optional(),
  })
  .refine(
    (data) => {
      const n = util.toInt(data.reference)
        + util.toInt(data.asset)
        + util.toInt(data.binary || data.docker) // allow both docker and binary to be set in single entrypoint
        + util.toInt(data.environment);
      return n === 1;
    },
    {
      message:
        'entrypoint cannot point to several packages at once: choose \'reference\', \'asset\', \'binary\', \'environment\' or \'docker\'',
      path: ['reference | asset | binary | environment | docker'],
    },
  );

export type info = z.infer<typeof infoSchema>;

// Full block-software.entrypoints list schema
export const listSchema = z.record(
  z
    .string()
    .regex(/[-_a-z0-9.]/)
    .describe(
      'name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)',
    ),
  infoSchema,
);
export type list = z.infer<typeof listSchema>;

export interface PackageArchiveInfo extends artifacts.archiveRules {
  name: string;
  version: string;
  crossplatform: boolean;

  fullName: (platform: util.PlatformType) => string; // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
  namePattern: string; // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)

  contentRoot: (platform: util.PlatformType) => string; // absolute path to package's content root
}

const _softwareEntrypointsList = z.record(z.string(), softwareOptionsSchema);
export type SoftwareEntrypoints = z.infer<typeof _softwareEntrypointsList>;

const _environmentEntrypointsList = z.record(z.string(), environmentOptionsSchema);
export type EnvironmentEntrypoints = z.infer<typeof _environmentEntrypointsList>;

export interface AssetPackage extends artifacts.assetPackageConfig, PackageArchiveInfo {
  type: 'asset';
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
}

export interface RunEnvironmentPackage extends artifacts.environmentConfig, PackageArchiveInfo {
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
}

export interface BinaryPackage extends artifacts.binaryPackageConfig, PackageArchiveInfo {
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
}
export interface JavaPackage extends artifacts.javaPackageConfig, PackageArchiveInfo {
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
}
export interface PythonPackage extends artifacts.pythonPackageConfig, PackageArchiveInfo {
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
}
export interface RPackage extends artifacts.rPackageConfig, PackageArchiveInfo {
  registry: artifacts.registry;
  name: string;
  version: string;
  crossplatform: boolean;

  isMultiroot: boolean;
  fullName: (platform: util.PlatformType) => string; // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
  contentRoot(platform: util.PlatformType): string;
}
// export interface CondaPackage extends artifacts.condaPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;
//   crossplatform: boolean;
// }
export interface DockerPackage extends artifacts.dockerPackageConfig {
  registry: artifacts.registry; // TODO: delete this field
  name: string;
  version: string;
  crossplatform: boolean;

  fullName: (platform: util.PlatformType) => string; // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
  namePattern: string; // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)

  contentRoot(platform: util.PlatformType): string;
}

export type BuildablePackage =
  | AssetPackage
  | RunEnvironmentPackage
  | BinaryPackage
  | JavaPackage
  | PythonPackage
  | RPackage
  | DockerPackage;
// CondaPackage

export type PackageConfig = BuildablePackage & {
  id: string;
  platforms: util.PlatformType[];

  isBuildable: boolean;
  isMultiroot: boolean;
  contentRoot(platform: util.PlatformType): string;
};

export interface ReferenceEntrypoint {
  type: 'reference';
  name: string;
  reference: string;
}

export interface AssetEntrypoint {
  type: 'asset';
  name: string;
  package: PackageConfig;
}

export interface SoftwareEntrypoint {
  type: 'software';
  name: string;
  package: PackageConfig;
  cmd: string[];
  env: string[];
}

export interface EnvironmentEntrypoint {
  type: 'environment';
  name: string;
  package: PackageConfig;
  env: string[];
}

export type PackageEntrypoint = AssetEntrypoint | SoftwareEntrypoint | EnvironmentEntrypoint;
export type Entrypoint = ReferenceEntrypoint | PackageEntrypoint;
export type EntrypointType = Extract<Entrypoint, { type: string }>['type'];
