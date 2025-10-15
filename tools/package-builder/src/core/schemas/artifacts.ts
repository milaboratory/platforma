import { z } from 'zod';
import * as util from '../util';

export type withType<Typ, Orig> = Orig & { type: Typ };
export type withId<T> = T & { id: string };

export const artifactTypes = ['asset', 'environment', 'binary', 'java', 'python', 'R', 'docker', 'conda'] as const;
export type artifactType = (typeof artifactTypes)[number];

// Artifacts that are built to archive
export const archiveTypes = ['asset', 'environment', 'binary', 'java', 'python', 'R', 'conda'] as const;
export type archiveArtifactType = (typeof archiveTypes)[number];

export const buildableTypes: artifactType[] = [
  'asset',
  'environment',
  'binary',
  'java',
  'python',
  'R',
  'docker',
  'conda',
] as const;
export const crossplatformTypes: artifactType[] = ['asset', 'java', 'python', 'R'] as const;

export const dockerRequiredTypes: artifactType[] = ['python'] as const;

export function isBuildable(aType: artifactType): boolean {
  return buildableTypes.includes(aType);
}

export function isCrossPlatform(aType: artifactType): boolean {
  return crossplatformTypes.includes(aType);
}

export function isDockerRequired(aType: artifactType): boolean {
  return dockerRequiredTypes.includes(aType);
}

export const runEnvironmentTypes = ['java', 'python', 'R'] as const;
export type runEnvironmentType = (typeof runEnvironmentTypes)[number];

export const pythonToolsets = ['pip'] as const;
export type pythonToolsetName = (typeof pythonToolsets)[number];

export const registrySchema = z.strictObject({
  name: z.string(),
  downloadURL: z.string().optional(),
  storageURL: z.string().optional(),
});
export type registry = z.infer<typeof registrySchema>;

export const registryOrRef = z.union([z.string(), registrySchema]);

// common fields for all buildable artifacts
// TODO: create new type for binary packages
const archiveRulesSchema = z.object({
  registry: registryOrRef,

  name: z.string().optional(),
  version: z.string().optional(),

  root: z.string(),
  roots: z
    .record(
      z.enum(
        util.AllPlatforms as [
          (typeof util.AllPlatforms)[number],
          ...(typeof util.AllPlatforms)[number][],
        ],
      ),
      z.string().min(1),
    )
    .describe(
      'please, provide settings only for supported platforms: ' + util.AllPlatforms.join(', '),
    ),
});
export type archiveRules = z.infer<typeof archiveRulesSchema>;

export const artifactIDSchema = z
  .string()
  .regex(/:/, {
    message:
      'tengo artifact ID must have <npmPackage>:<artifactName> format, e.g @milaboratory/runenv-java-corretto:21.2.0.4.1',
  })
  .describe('ID of tengo build artifact');

export type artifactIDString = z.infer<typeof artifactIDSchema>;

export const assetPackageSchema = archiveRulesSchema
  .omit({ roots: true })
  .extend({ type: z.literal('asset') })
  .strict();
export type assetPackageConfig = z.infer<typeof assetPackageSchema>;

export const environmentPackageSchema = archiveRulesSchema
  .omit({ root: true })
  .extend({
    type: z.literal('environment'),

    runtime: z
      .enum(runEnvironmentTypes)
      .describe('type of runtime this run environment provides: \'java\', \'python\' and so on'),

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
      )
      .optional(),

    binDir: z
      .string()
      .describe('path to \'bin\' directory to be added to PATH when software uses this run environment'),
  });

export type environmentConfig = z.infer<typeof environmentPackageSchema>;

export const binaryPackageSchema = archiveRulesSchema
  .omit({ root: true })
  .extend({
    type: z.literal('binary'),
  });
export type binaryPackageConfig = z.infer<typeof binaryPackageSchema>;

export const javaPackageSchema = archiveRulesSchema
  .omit({ roots: true })
  .extend({
    type: z.literal('java'),
    environment: artifactIDSchema,
  });
export type javaPackageConfig = z.infer<typeof javaPackageSchema>;

const pipToolsetSchema = z.strictObject({
  toolset: z.literal('pip'),
  requirements: z.string().describe('path to requrements.txt inside package archive'),
});

export const pythonToolsetSchema = z.discriminatedUnion('toolset', [pipToolsetSchema]);

export const pythonPackageSchema = archiveRulesSchema
  .omit({ roots: true })
  .extend({
    type: z.literal('python'),
    environment: artifactIDSchema,
    dependencies: pythonToolsetSchema.optional(),
    pkg: z.string().optional().describe('custom working directory in Docker container (default: /app/)'),
  });
export type pythonPackageConfig = z.infer<typeof pythonPackageSchema>;

export const rPackageSchema = archiveRulesSchema
  .omit({ roots: true })
  .extend({
    type: z.literal('R'),
    environment: artifactIDSchema,
  });
export type rPackageConfig = z.infer<typeof rPackageSchema>;

export const condaPackageSchema = archiveRulesSchema
  .omit({ root: true })
  .extend({
    type: z.literal('conda'),

    ['micromamba-version']: z
      .string()
      .optional()
      .describe('version of micromamba to be used to operate with conda environments'),

    spec: z
      .string()
      .default('./conda-spec.yaml')
      .describe('path to \'spec.yaml\' file relative to package.json path (default: ./conda-spec.yaml)'),
  });
export type condaPackageConfig = z.infer<typeof condaPackageSchema>;

export const defaultDockerRegistry = 'containers.pl-open.science/milaboratories/pl-containers';
export const dockerPackageSchema = z.object({
  type: z.literal('docker'),

  registry: z
    .string()
    .default(defaultDockerRegistry)
    .describe('registry+repository URL to use for pulling this image'),

  // build from custom Dockerfile
  context: z.string()
    .refine((val) => val !== './' && val !== '.', {
      message: 'Context cannot be "./" or "." - use absolute path or relative path without "./" prefix',
    })
    .describe('relative path to context directory from folder where command is executed or absolute path to context folder (cannot be "./" or ".")'),

  dockerfile: z
    .string()
    .default('./Dockerfile')
    .describe('relative path to \'Dockerfile\' file from folder where command is executed or absolute path to the file'),

  pkg: z.string().optional().describe('{pkg} placeholder value to be used in "cmd" and arguments'),

  // import existing image
  // entrypoint: z
  //   .array(z.string())
  //   .optional()
  //   .describe('replace image\'s ENTRYPOINT with this value when running container'),
});
export type dockerPackageConfig = z.infer<typeof dockerPackageSchema>;

export const configSchema = z.discriminatedUnion('type', [
  assetPackageSchema,
  environmentPackageSchema,
  binaryPackageSchema,
  javaPackageSchema,
  pythonPackageSchema,
  rPackageSchema,
  condaPackageSchema,
  dockerPackageSchema,
]);

export type config = z.infer<typeof configSchema>;
export type archivePackageConfig = Extract<config, { type: archiveArtifactType }>;

export const listSchema = z.record(z.string(), configSchema);
export type list = z.infer<typeof listSchema>;
