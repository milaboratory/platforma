import { z } from 'zod/v4';
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

const orRef = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([
    z.string('not a reference to artifact')
      .describe('reference to artifact in "artifacts" section'),
    schema,
  ]);

// Common options for all software packages: everything that can be run on backend side.
export const softwareOptionsSchema = z.strictObject({
  cmd: z
    .array(
      z.string('command artument must be a string'),
    )
    .min(1, { error: 'at least one argument is required' })
    .refine(
      (cmd) => cmd[0].trim() != '',
      { error: 'first cmd argument must be non-empty string' },
    )
    .describe(
      'command to run for this entrypoint. This command will be appended by <args> set inside workflow',
    ),
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for this entrypoint'),
});
export type softwareOptionsType = z.infer<typeof softwareOptionsSchema>;

export const environmentOptionsSchema = z.strictObject({
  artifact: orRef(artifacts.environmentSchema.omit({ type: true })),
  envVars: envVarsSchema
    .optional()
    .describe('list of environment variables to be set for any command inside this run environment'),
});

// Full schema of single entrypoint in block-software.entrypoints
export const entrypointSchema = z
  .strictObject({
    reference: referenceSchema.optional(),
    asset: orRef(artifacts.assetSchema.omit({ type: true })).optional(),
    environment: environmentOptionsSchema.optional(),

    binary: z.union([
      softwareOptionsSchema.extend({ artifact: orRef(artifacts.binarySchema) }),
      softwareOptionsSchema.extend({ artifact: orRef(artifacts.javaSchema) }),
      softwareOptionsSchema.extend({ artifact: orRef(artifacts.pythonSchema) }),
      softwareOptionsSchema.extend({ artifact: orRef(artifacts.rSchema) }),
    ]).optional(), // TODO: reduce nesting: put java, python and r to the level of binary, like conda.

    conda: softwareOptionsSchema.extend({ artifact: orRef(artifacts.condaSchema.omit({ type: true })) }).optional(),
    docker: softwareOptionsSchema.extend({ artifact: orRef(artifacts.dockerSchema.omit({ type: true })) }).optional(),
  })
  .refine(
    (data) => {
      const n = util.toInt(data.reference)
        + util.toInt(data.asset && !data.docker) // no docker for assets
        + util.toInt(data.binary || (data.binary && data.docker)) // allow both docker and binary to be set in single entrypoint
        + util.toInt(data.conda || (data.conda && data.docker)) // allow both docker and conda to be set in single entrypoint
        + util.toInt(data.environment && !data.docker); // no docker for environments

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
export type entrypointType = z.infer<typeof entrypointSchema>;

// Full block-software.entrypoints list schema
export const entrypointListSchema = z.record(
  z
    .string()
    .regex(/[-_a-z0-9.]/)
    .describe(
      'name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)',
    ),
  entrypointSchema,
);
export type entrypointListType = z.infer<typeof entrypointListSchema>;

export interface ReferenceEntrypoint {
  type: 'reference';
  name: string;
  reference: string;
}

export interface AssetEntrypoint {
  type: 'asset';
  name: string;
  artifact: artifacts.withId<artifacts.assetType>;
}

export interface SoftwareEntrypoint {
  type: 'software';
  name: string;
  artifact: artifacts.withId<
    artifacts.binaryType
    | artifacts.condaType
    | artifacts.javaType
    | artifacts.pythonType
    | artifacts.rType
    | artifacts.dockerType
  >;
  cmd: string[];
  env: string[];
}

export interface EnvironmentEntrypoint {
  type: 'environment';
  name: string;
  artifact: artifacts.withId<artifacts.environmentType>;
  env: string[];
}

export type PackageEntrypoint = AssetEntrypoint | SoftwareEntrypoint | EnvironmentEntrypoint;
export type Entrypoint = ReferenceEntrypoint | PackageEntrypoint;
export type EntrypointType = Extract<Entrypoint, { type: string }>['type'];
