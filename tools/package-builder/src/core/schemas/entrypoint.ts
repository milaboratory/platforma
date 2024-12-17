import { z } from 'zod';
import * as artifacts from './artifacts';
import { toInt } from '../util';

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

export const infoSchema = z
  .strictObject({
    reference: referenceSchema.optional(),
    asset: z.union([z.string(), artifacts.assetPackageSchema]).optional(),
    binary: softwareOptionsSchema.optional(),
    environment: environmentOptionsSchema.optional(),
  })
  .refine(
    (data) =>
      toInt(data.reference) + toInt(data.asset) + toInt(data.binary) + toInt(data.environment) == 1,
    {
      message:
        'entrypoint cannot point to several packages at once: choose \'reference\', \'asset\', \'binary\' or \'environment\'',
      path: ['reference | asset | binary | environment'],
    },
  );

export type info = z.infer<typeof infoSchema>;

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
