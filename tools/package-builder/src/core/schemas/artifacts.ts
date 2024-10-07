import { z } from 'zod';
import * as util from '../util';

export const artifactTypes = ['environment', 'binary', 'java', 'python'] as const;
export type artifactType = (typeof artifactTypes)[number];

export const buildableTypes: artifactType[] = ['environment', 'binary', 'java', 'python'] as const;

export function isBuildable(aType: artifactType): boolean {
  return buildableTypes.includes(aType);
}

export const runEnvironmentTypes = ['java', 'python'] as const;
export type runEnvironmentType = (typeof runEnvironmentTypes)[number];

export const pythonToolsets = ['pip'] as const;
export type pythonToolsetName = (typeof pythonToolsets)[number];

export const registrySchema = z.strictObject({
  name: z.string(),
  storageURL: z.string().optional()
});
export type registry = z.infer<typeof registrySchema>;

export const registryOrRef = z.union([z.string(), registrySchema]);

// common fields both for 'environment' and 'binary'
const archiveRulesSchema = z.object({
  registry: registryOrRef,
  name: z.string().optional(),
  version: z.string().optional(),
  crossplatform: z.boolean().optional(),

  root: z.string().optional(),
  roots: z
    .record(
      z.enum(
        util.AllPlatforms as [
          (typeof util.AllPlatforms)[number],
          ...(typeof util.AllPlatforms)[number][]
        ]
      ),
      z.string().min(1)
    )
    .optional()
    .describe(
      'please, provide settings only for supported platforms: ' + util.AllPlatforms.join(', ')
    )
});
export type archiveRules = z.infer<typeof archiveRulesSchema>;

const artifactIDSchema = z
  .string()
  .regex(/:/, {
    message:
      'tengo artifact ID must have <npmPackage>:<artifactName> format, e.g @milaboratory/runenv-java-corretto:21.2.0.4.1'
  })
  .describe('ID of tengo build artifact');

export const environmentPackageSchema = archiveRulesSchema.extend({
  type: z.literal('environment'),

  runtime: z
    .enum(runEnvironmentTypes)
    .describe("type of runtime this run environment provides: 'java', 'python' and so on"),

  binDir: z
    .string()
    .describe("path to 'bin' directory to be added to PATH when software uses this run environment")
});

export type environmentConfig = z.infer<typeof environmentPackageSchema>;

export const binaryPackageSchema = archiveRulesSchema.extend({
  type: z.literal('binary'),
  environment: z.undefined()
});
export type binaryPackageConfig = z.infer<typeof binaryPackageSchema>;

export const javaPackageSchema = archiveRulesSchema.extend({
  type: z.literal('java'),
  environment: artifactIDSchema
});
export type javaPackageConfig = z.infer<typeof javaPackageSchema>;

const pipToolsetSchema = z.strictObject({
  toolset: z.literal('pip'),
  requirements: z.string().describe('path to requrements.txt inside package archive')
});

export const pythonToolsetSchema = z.discriminatedUnion('toolset', [pipToolsetSchema]);

export const pythonPackageSchema = archiveRulesSchema.extend({
  type: z.literal('python'),
  environment: artifactIDSchema,
  dependencies: pythonToolsetSchema
});
export type pythonPackageConfig = z.infer<typeof pythonPackageSchema>;

export const renvToolsetSchema = z.strictObject({
  toolset: z.literal('renv'),
  lockFile: z.string().describe("path to 'renv.lock' file inside package archive")
});

export const rToolsetSchema = z.discriminatedUnion('toolset', [renvToolsetSchema]);

export const rPackageSchema = archiveRulesSchema.extend({
  type: z.literal('R'),
  environment: artifactIDSchema,
  dependencies: rToolsetSchema
});
export type rPackageConfig = z.infer<typeof rPackageSchema>;

export const condaPackageSchema = archiveRulesSchema.extend({
  type: z.literal('conda'),
  environment: artifactIDSchema,
  lockFile: z.string().describe("path to 'renv.lock' file inside package archive")
});
export type condaPackageConfig = z.infer<typeof condaPackageSchema>;

export const configSchema = z.discriminatedUnion('type', [
  environmentPackageSchema,
  binaryPackageSchema,
  javaPackageSchema,
  pythonPackageSchema
  // rPackageSchema,
  // condaPackageSchema,
]);

export type config = z.infer<typeof configSchema>;

export const listSchema = z.record(z.string(), configSchema);
export type list = z.infer<typeof listSchema>;
