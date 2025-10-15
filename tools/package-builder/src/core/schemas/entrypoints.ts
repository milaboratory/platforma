import { z } from 'zod';
import * as artifacts from './artifacts';
import * as util from '../util';

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

const orRef = <T extends z.ZodTypeAny>(schema: T): z.ZodUnion<[z.ZodString, T]> => z.union([z.string(), schema]);

const withArtifact = <
  S extends z.ZodObject<z.ZodRawShape>,
  A extends z.ZodTypeAny,
>(schema: S, art: A) => {
  type ResultShape = S['shape'] & { artifact: z.ZodUnion<[z.ZodString, A]> };
  return schema.extend({ artifact: orRef(art) }) as z.ZodObject<ResultShape, S['_def']['unknownKeys'], S['_def']['catchall']>;
};

export const softwareOptionsSchema = z.strictObject({
  cmd: z
    .array(z.string())
    .describe(
      'command to run for this entrypoint. This command will be appended by <args> set inside workflow',
    ),
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for this entrypoint'),
});

export const environmentOptionsSchema = z.strictObject({
  artifact: orRef(artifacts.environmentPackageSchema),
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for any command inside this run environment'),
});

// Full schema of single entrypoint in block-software.entrypoints
export const entrypointSchema = z
  .strictObject({
    reference: referenceSchema.optional(),
    asset: z.union([z.string(), artifacts.assetPackageSchema]).optional(),

    binary: z.union([
      softwareOptionsSchema.extend({ artifact: z.union([z.string(), artifacts.binaryPackageSchema]) }),
      softwareOptionsSchema.extend({ artifact: z.union([z.string(), artifacts.javaPackageSchema]) }),
      softwareOptionsSchema.extend({ artifact: z.union([z.string(), artifacts.pythonPackageSchema]) }),
      softwareOptionsSchema.extend({ artifact: z.union([z.string(), artifacts.rPackageSchema]) }),
    ]).optional(), // TODO: reduce nesting: put java, python and r to the level of binary, like conda.

    conda: withArtifact(softwareOptionsSchema, artifacts.condaPackageSchema).optional(),

    environment: environmentOptionsSchema.optional(),

    docker: withArtifact(softwareOptionsSchema, artifacts.dockerPackageSchema).optional(),
  })
  .refine(
    (data) => {
      const n = util.toInt(data.reference)
        + util.toInt(data.asset)
        + util.toInt(data.binary || (data.binary && data.docker)) // allow both docker and binary to be set in single entrypoint
        + util.toInt(data.conda || (data.conda && data.docker)) // allow both docker and conda to be set in single entrypoint
        + util.toInt(data.environment);

      if (n === 0) {
        return Boolean(data.docker); // allow separate docker entrypoints (without binary/conda/...)
      }

      return n === 1;
    },
    {
      message:
        'entrypoint cannot point to several packages at once: choose \'reference\', \'asset\', \'binary\', \'environment\' or \'docker\'',
      path: ['reference | asset | binary | environment | docker'],
    },
  );

export type info = z.infer<typeof entrypointSchema>;

// Full block-software.entrypoints list schema
export const listSchema = z.record(
  z
    .string()
    .regex(/[-_a-z0-9.]/)
    .describe(
      'name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)',
    ),
  entrypointSchema,
);
export type list = z.infer<typeof listSchema>;

// export interface PackageArchiveInfo extends artifacts.archiveRules {
//   name: string;
//   version: string;

//   fullName: (platform: util.PlatformType) => string; // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
//   contentRoot: (platform: util.PlatformType) => string; // absolute path to package's content root
// }

// const _softwareEntrypointsList = z.record(z.string(), softwareOptionsSchema);
// export type SoftwareEntrypoints = z.infer<typeof _softwareEntrypointsList>;

// const _environmentEntrypointsList = z.record(z.string(), environmentOptionsSchema);
// export type EnvironmentEntrypoints = z.infer<typeof _environmentEntrypointsList>;

// export interface AssetPackage extends artifacts.assetPackageConfig, PackageArchiveInfo {
//   type: 'asset';
//   registry: artifacts.registry;
//   name: string;
//   version: string;
// }

// export interface RunEnvironmentPackage extends artifacts.environmentConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;

//   namePattern: string; // address to put into sw.json (common/sleep/1.2.3-{os}-{arch}.tgz)
// }

// export interface BinaryPackage extends artifacts.binaryPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;

//   namePattern: string; // address to put into sw.json (common/sleep/1.2.3-{os}-{arch}.tgz)
// }

// export interface CondaPackage extends artifacts.condaPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;

//   namePattern: string; // address to put into sw.json (common/sleep/1.2.3-{os}-{arch}.tgz)
// }

// export interface JavaPackage extends artifacts.javaPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;
// }

// export interface PythonPackage extends artifacts.pythonPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;
// }

// export interface RPackage extends artifacts.rPackageConfig, PackageArchiveInfo {
//   registry: artifacts.registry;
//   name: string;
//   version: string;
// }

// export interface DockerPackage extends artifacts.dockerPackageConfig {
//   name: string;
//   version: string;

//   fullName: (platform: util.PlatformType) => string; // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
//   contentRoot: (platform: util.PlatformType) => string; // absolute path to package's content root
// }

// export type Package = AssetPackage | RunEnvironmentPackage | BinaryPackage | CondaPackage | JavaPackage | PythonPackage | RPackage | DockerPackage;
// export type PackageType = Package['type'];

export type withID<T> = T & {
  id: string;
};

export interface ReferenceEntrypoint {
  type: 'reference';
  name: string;
  reference: string;
}

export interface AssetEntrypoint {
  type: 'asset';
  name: string;
  artifact: artifacts.withId<artifacts.assetPackageConfig>;
}

export interface SoftwareEntrypoint {
  type: 'software';
  name: string;
  artifact: artifacts.withId<
    artifacts.binaryPackageConfig
    | artifacts.condaPackageConfig
    | artifacts.javaPackageConfig
    | artifacts.pythonPackageConfig
    | artifacts.rPackageConfig
    | artifacts.dockerPackageConfig
  >;
  cmd: string[];
  env: string[];
}

export interface EnvironmentEntrypoint {
  type: 'environment';
  name: string;
  artifact: artifacts.withId<artifacts.environmentConfig>;
  env: string[];
}

export type PackageEntrypoint = AssetEntrypoint | SoftwareEntrypoint | EnvironmentEntrypoint;
export type Entrypoint = ReferenceEntrypoint | PackageEntrypoint;
export type EntrypointType = Extract<Entrypoint, { type: string }>['type'];
