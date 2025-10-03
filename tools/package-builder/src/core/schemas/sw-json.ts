import { z } from 'zod';
import * as artifacts from './artifacts';
import * as util from '../util';

export const externalPackageLocationSchema = z.object({
  registry: z.string().describe('name of the registry to use for package download'),
  package: z
    .string()
    .describe('full package path in registry, e.g. \'common/jdk/21.0.2.13.1-{os}-{arch}.tgz'),
});

export const assetSchema = z.object({
  ...externalPackageLocationSchema.shape,
  url: z.string().describe('asset download URL'),
});
export type assetInfo = z.infer<typeof assetSchema>;

export const dockerSchema = z.object({
  tag: z.string().describe('name of the image to be built instead of custom one'),
  entrypoint: z.array(z.string()).describe('entrypoint command to be run in the container'),
  cmd: z.array(z.string()).describe('command to be run in the container'),
  pkg: z.string().optional().describe('custom working directory in Docker container (only for Python packages)'),
});
export type dockerInfo = z.infer<typeof dockerSchema>;

export const runEnvironmentSchema = z.object({
  type: z.enum(artifacts.runEnvironmentTypes),
  ...externalPackageLocationSchema.shape,

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

export const runDependencyCondaSchema = runEnvironmentSchema.extend({
  type: z.literal('conda'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
export type runEnvDependencyConda = z.infer<typeof runDependencyCondaSchema>;

export type runEnvDependency = runEnvDependencyJava | runEnvDependencyPython | runEnvDependencyR | runEnvDependencyConda;

export const anyPackageSettingsSchema = z.object({
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

export const binaryPackageSettingsSchema = z.object({
  type: z.literal('binary'),
  ...anyPackageSettingsSchema.shape,

  runEnv: z.undefined(),
  pkg: z.string().optional().describe('custom working directory in Docker container (default: /app)'),
});

export const javaPackageSettingsSchema = z.object({
  type: z.literal('java'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyJavaSchema,
});

export const pythonPackageSettingsSchema = z.object({
  type: z.literal('python'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyPythonSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
  pkg: z.string().optional().describe('custom working directory in Docker container (default: /app)'),
});

export const rPackageSettingsSchema = z.object({
  type: z.literal('R'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyRSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
});

export const condaPackageSettingsSchema = z.object({
  type: z.literal('conda'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyCondaSchema,

  renvLock: z
    .string()
    .optional()
    .describe('contents of renv.lock for R language virtual env bootstrap'),
});

export const binarySchema = z.union([
  externalPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(rPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
]);
export type binaryInfo = z.infer<typeof binarySchema>;

export const localPackageLocationSchema = z.object({
  hash: z
    .string()
    .describe(
      'hash of software directory. Makes deduplication to work properly when you actively develop software',
    ),
  path: z.string().describe('absolute path to root directory of software on local host'),
});

export const localSchema = z.discriminatedUnion('type', [
  localPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(rPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
]);
export type localInfo = z.infer<typeof localSchema>;

// Full .sw.json file schema
export const entrypointSchema = z
  .object({
    isDev: z.boolean().optional(),

    asset: assetSchema.optional(),
    binary: binarySchema.optional(),
    docker: dockerSchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSchema.optional(),
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
          'entrypoint cannot point to several packages at once: choose \'environment\', \'binary\', \'asset\' or \'local\'',
      path: ['environment | binary | asset | local'],
    },
  );

export type entrypoint = z.infer<typeof entrypointSchema> & {
  id: util.artifactID;
};
