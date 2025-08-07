import { z } from 'zod';
import * as util from '../util';

export const artifactTypes = ['environment', 'binary', 'java', 'python', 'R', 'conda', 'asset', 'docker'] as const;
export type artifactType = (typeof artifactTypes)[number];

export const buildableTypes: artifactType[] = [
  'environment',
  'binary',
  'java',
  'python',
  'R',
  'conda',
  'asset',
  'docker',
] as const;
export const crossplatformTypes: artifactType[] = ['asset', 'java', 'python', 'R'] as const;

export function isBuildable(aType: artifactType): boolean {
  return buildableTypes.includes(aType);
}

export function isCrossPlatform(aType: artifactType): boolean {
  return crossplatformTypes.includes(aType);
}

export const runEnvironmentTypes = ['java', 'python', 'R', 'conda'] as const;
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

  root: z.string().optional(),
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
    .optional()
    .describe(
      'please, provide settings only for supported platforms: ' + util.AllPlatforms.join(', '),
    ),
});
export type archiveRules = z.infer<typeof archiveRulesSchema>;

const artifactIDSchema = z
  .string()
  .regex(/:/, {
    message:
      'tengo artifact ID must have <npmPackage>:<artifactName> format, e.g @milaboratory/runenv-java-corretto:21.2.0.4.1',
  })
  .describe('ID of tengo build artifact');

export const assetPackageSchema = archiveRulesSchema
  .omit({ roots: true })
  .extend({
    type: z.literal('asset').optional(),
  })
  .strict();
export const typedAssetPackageSchema = archiveRulesSchema.extend({
  type: z.literal('asset'),
});
export type assetPackageConfig = z.infer<typeof assetPackageSchema>;

export const environmentPackageSchema = archiveRulesSchema.extend({
  type: z.literal('environment'),

  runtime: z
    .enum(runEnvironmentTypes)
    .describe('type of runtime this run environment provides: \'java\', \'python\' and so on'),
  ['r-version']: z.string().optional(),

  binDir: z
    .string()
    .describe('path to \'bin\' directory to be added to PATH when software uses this run environment'),
});

export type environmentConfig = z.infer<typeof environmentPackageSchema>;

export const binaryPackageSchema = archiveRulesSchema.extend({
  type: z.literal('binary'),
});
export type binaryPackageConfig = z.infer<typeof binaryPackageSchema>;

export const javaPackageSchema = archiveRulesSchema.extend({
  type: z.literal('java'),
  environment: artifactIDSchema,
});
export type javaPackageConfig = z.infer<typeof javaPackageSchema>;

const pipToolsetSchema = z.strictObject({
  toolset: z.literal('pip'),
  requirements: z.string().describe('path to requrements.txt inside package archive'),
});

export const pythonToolsetSchema = z.discriminatedUnion('toolset', [pipToolsetSchema]);

export const pythonPackageSchema = archiveRulesSchema.extend({
  type: z.literal('python'),
  environment: artifactIDSchema,
  dependencies: pythonToolsetSchema,
});
export type pythonPackageConfig = z.infer<typeof pythonPackageSchema>;

export const rPackageSchema = archiveRulesSchema.extend({
  type: z.literal('R'),
  environment: artifactIDSchema,
});
export type rPackageConfig = z.infer<typeof rPackageSchema>;

// export const condaPackageSchema = archiveRulesSchema.extend({
//   type: z.literal('conda'),
//   environment: artifactIDSchema,
//   lockFile: z.string().describe('path to \'renv.lock\' file inside package archive'),
// });
// export type condaPackageConfig = z.infer<typeof condaPackageSchema>;


export const dockerPackageSchema = archiveRulesSchema.extend({
  type: z.literal('docker'),
  registry: registryOrRef.optional(),

  // build from custom Dockerfile
  context: z.string().describe('relative path to context directory from folder where command is executed or absolute path to context folder'),
  dockerfile: z.string().optional().describe('relative path to \'Dockerfile\' file from folder where command is executed or absolute path to the file'),

  // build from existing image. not used yet
  tag: z.string().optional().describe('name of the image to be built instead of custom one'),
  entrypoint: z.array(z.string()).optional().describe('entrypoint command to be run in the container'),
});
export type dockerPackageConfig = z.infer<typeof dockerPackageSchema>;

export const configSchema = z.discriminatedUnion('type', [
  typedAssetPackageSchema,
  environmentPackageSchema,
  binaryPackageSchema,
  javaPackageSchema,
  pythonPackageSchema,
  rPackageSchema,
  dockerPackageSchema,
  // condaPackageSchema,
]);

export type config = z.infer<typeof configSchema>;

export const listSchema = z.record(z.string(), configSchema);
export type list = z.infer<typeof listSchema>;
