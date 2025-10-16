import { z } from 'zod/v4';
import * as artifacts from './artifacts';
import * as util from '../util';

export const remoteLocationSchema = z.object({
  registry: z.string().describe('name of the registry to use for package download'),
  package: z
    .string()
    .describe('full package path in registry, e.g. \'common/jdk/21.0.2.13.1-{os}-{arch}.tgz'),
});

export const assetSchema = z.object({
  ...remoteLocationSchema.shape,
  url: z.string().describe('asset download URL'),
});
export type assetInfo = z.infer<typeof assetSchema>;

export const dockerSchema = z.object({
  tag: z
    .string()
    .describe('full image tag to pull on backend side to execute this software'),
  entrypoint: z
    .array(z.string())
    .describe('override image\'s entrypoint'),
  cmd: z
    .array(z.string())
    .describe('command to be run in the container'),

  pkg: z
    .string()
    .default('/')
    .describe('what to substitute in place of "{pkg}" variable in "cmd" (for artifacts with docker autogeneration)'),
});
export type dockerInfo = z.infer<typeof dockerSchema>;

export const runEnvironmentSchema = z.object({
  type: z.enum(artifacts.runEnvironmentTypes),
  ...remoteLocationSchema.shape,

  ['r-version']: z.string().optional(),
  ['python-version']: z.string().optional(),
  ['java-version']: z.string().optional(),

  envVars: z
    .array(
      z
        .string()
        .regex(
          /=/,
          'environment variable should be specified in format: <var-name>=<var-value>, i.e.: MY_ENV=value',
        ),
    ).optional(),

  binDir: z.string(),
});
export type runEnvInfo = z.infer<typeof runEnvironmentSchema>;

export const runDependencyJavaSchema = runEnvironmentSchema.extend({
  type: z.literal('java'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
export type runEnvDependencyJava = z.infer<typeof runDependencyJavaSchema>;

export const runDependencyPythonSchema = runEnvironmentSchema.extend({
  type: z.literal('python'),
  ['python-version']: z.string(),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
export type runEnvDependencyPython = z.infer<typeof runDependencyPythonSchema>;

export const runDependencyRSchema = runEnvironmentSchema.extend({
  type: z.literal('R'),
  ['r-version']: z.string(),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
export type runEnvDependencyR = z.infer<typeof runDependencyRSchema>;

export type runEnvDependency = runEnvDependencyJava | runEnvDependencyPython | runEnvDependencyR;

export const commonPackageSettingsSchema = z.object({
  cmd: z.array(z.string()).min(1).describe('run given command, appended by args from workflow'),

  envVars: z
    .array(
      z
        .string()
        .regex(
          /=/,
          'full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes',
        ),
    )
    .optional(),
});

export const binaryPackageSchema = z.object({
  type: z.literal('binary'),
  ...commonPackageSettingsSchema.shape,

  pkg: z.string().optional().describe('location of all package contents in Docker container (default: /app)'),
});

export const javaPackageSettingsSchema = z.object({
  type: z.literal('java'),

  ...commonPackageSettingsSchema.shape,
  runEnv: runDependencyJavaSchema,
});

export const pythonPackageSettingsSchema = z.object({
  type: z.literal('python'),

  ...commonPackageSettingsSchema.shape,
  runEnv: runDependencyPythonSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
});

export const rPackageSettingsSchema = z.object({
  type: z.literal('R'),

  ...commonPackageSettingsSchema.shape,
  runEnv: runDependencyRSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
});

export const condaPackageSchema = z.object({
  type: z.literal('conda'),
  ...commonPackageSettingsSchema.shape,

  ['micromamba-version']: z
    .string()
    .describe('version of micromamba to be used to operate with conda environments'),
  spec: z
    .string()
    .describe('location of spec.yaml describing conda environment, relative to package root.'),
});

export const remoteSoftwareSchema = z.union([
  remoteLocationSchema.extend(binaryPackageSchema.shape),
  remoteLocationSchema.extend(javaPackageSettingsSchema.shape),
  remoteLocationSchema.extend(pythonPackageSettingsSchema.shape),
  remoteLocationSchema.extend(rPackageSettingsSchema.shape),
  remoteLocationSchema.extend(condaPackageSchema.shape),
]);
export type remotePackageInfo = z.infer<typeof remoteSoftwareSchema>;

export const localLocationSchema = z.object({
  hash: z
    .string()
    .describe(
      'hash of software directory. Makes deduplication to work properly when you actively develop software',
    ),
  path: z.string().describe('absolute path to root directory of software on local host'),
});

export const localSoftwareSchema = z.discriminatedUnion('type', [
  localLocationSchema.extend(binaryPackageSchema.shape),
  localLocationSchema.extend(javaPackageSettingsSchema.shape),
  localLocationSchema.extend(pythonPackageSettingsSchema.shape),
  localLocationSchema.extend(rPackageSettingsSchema.shape),
  localLocationSchema.extend(condaPackageSchema.shape),
  // Docker can be used 'as usual' without any special 'local' section magic
]);
export type localPackageInfo = z.infer<typeof localSoftwareSchema>;

// Full .sw.json file schema
export const entrypointSchema = z
  .object({
    isDev: z.boolean().optional(),

    asset: assetSchema.optional(),
    binary: remoteSoftwareSchema.optional(),
    docker: dockerSchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSoftwareSchema.optional(),
  })
  .refine(
    (data) =>
      util.toInt(data.runEnv)
      + util.toInt(data.binary || data.docker) // allow both docker and binary to be set in single entrypoint
      + util.toInt(data.asset)
      + util.toInt(data.local)
      == 1,
    {
      message:
          'entrypoint cannot point to several packages at once: choose \'environment\', \'binary\', \'asset\', \'conda\' or \'local\'',
      path: ['environment | binary | asset | conda | local'],
    },
  );

export type entrypoint = z.infer<typeof entrypointSchema> & {
  id: util.artifactID;
};
