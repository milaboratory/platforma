import { z } from 'zod';

export const runEnvironmentTypes = ['java', 'python', 'R', 'conda'] as const;
export type runEnvironmentType = (typeof runEnvironmentTypes)[number];

export const registrySchema = z.strictObject({
    name: z.string(),
    storageURL: z.string().optional(),
})
export type registry = z.infer<typeof registrySchema>

// common fields both for 'environment' and 'binary'
const packageArchiveRulesSchema = z.object({
    registry: registrySchema,
    name: z.string().optional(),
    version: z.string().optional(),
    crossplatform: z.boolean().optional().default(false),
    root: z.string().min(1),
})
export type archiveRules = z.infer<typeof packageArchiveRulesSchema>

export const entrypointSchema = z.object({
    cmd: z.array(z.string()).
        describe("command to run for this entrypoint. This command will be appended by <args> set inside workflow"),
    envVars: z.array(
        z.string().
            regex(/=/, "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes")
    ).
        optional().
        describe("list of environment variables to be set for this entrypoint")
})

export type entrypointInfo = z.infer<typeof entrypointSchema>

const artifactIDSchema = z.string().
    regex(/:/, { message: "tengo artifact ID must have <npmPackage>:<artifactName> format, e.g @milaboratory/runenv-java-corretto:21.2.0.4.1" }).
    describe("ID of tengo build artifact")

const entrypointsListSchema = z.record(
    z.string().regex(/[-_a-z0-9.]/)
    .describe("name of entrypoint descriptor, client should import to use this entrypoint (ll.importSoftware)"),
    entrypointSchema,
)

export const binaryPackageSchema = packageArchiveRulesSchema.extend({
    type: z.literal('binary').optional(),
    environment: z.undefined(),

    entrypoints: entrypointsListSchema,
})
export type binaryPackageConfig = z.infer<typeof binaryPackageSchema>

export const javaPackageSchema = packageArchiveRulesSchema.extend({
    type: z.literal("java"),
    environment: artifactIDSchema,

    entrypoints: entrypointsListSchema,
})
export type javaPackageConfig = z.infer<typeof javaPackageSchema>

export const pythonPackageSchema = packageArchiveRulesSchema.extend({
    type: z.literal("python"),
    environment: artifactIDSchema,

    entrypoints: entrypointsListSchema,

    requirements: z.string().
        describe("path to requrements.txt inside package archive"),
})
export type pythonPackageConfig = z.infer<typeof pythonPackageSchema>

export const rPackageSchema = packageArchiveRulesSchema.extend({
    type: z.literal("R"),
    environment: artifactIDSchema,

    entrypoints: entrypointsListSchema,

    renvLock: z.string().
        describe("path to 'renv.lock' file inside package archive"),
})
export type rPackageConfig = z.infer<typeof rPackageSchema>

export const condaPackageSchema = packageArchiveRulesSchema.extend({
    type: z.literal("conda"),
    environment: artifactIDSchema,

    entrypoints: entrypointsListSchema,
})
export type condaPackageConfig = z.infer<typeof condaPackageSchema>

export const configSchema = z.discriminatedUnion('type', [
    binaryPackageSchema,
    javaPackageSchema,
    pythonPackageSchema,
    rPackageSchema,
    condaPackageSchema,
])

export type config = z.infer<typeof configSchema>

export const environmentConfigSchema = packageArchiveRulesSchema.extend({
    type: z.enum(runEnvironmentTypes).
        describe("run environment type"),

    entrypointName: z.string()
        .describe("name of descriptor (.sw.json) to be created for this run environment"),
    binDir: z.string().
        describe("path to 'bin' directory to be added to PATH when software uses this run environment"),
});

export type environmentConfig = z.infer<typeof environmentConfigSchema>
