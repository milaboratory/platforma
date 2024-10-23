import { z } from 'zod';
import * as artifacts from './artifacts'

const artifactOrRef = z.union([
    z.string(), artifacts.configSchema,
])

const envVarsSchema = z.array(
    z.string().
        regex(/=/, "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes")
)

export const softwareOptionsSchema = z.strictObject({
    artifact: artifactOrRef,

    cmd: z.array(z.string()).
        describe("command to run for this entrypoint. This command will be appended by <args> set inside workflow"),
    envVars: envVarsSchema.
        optional().
        describe("list of environment variables to be set for this entrypoint")
})
export type binaryOptions = z.infer<typeof softwareOptionsSchema>

export const environmentOptionsSchema = z.strictObject({
    artifact: artifactOrRef,
    envVars: envVarsSchema.
        optional().
        describe("list of environment variables to be set for any command inside this run environment")
})

const boolint = (v: any) => v ? 1 : 0

export const infoSchema = z.strictObject({
    asset: z.union([
        z.string(), artifacts.assetPackageSchema,
    ]).optional(),
    binary: softwareOptionsSchema.optional(),
    environment: environmentOptionsSchema.optional(),
}).refine(
    data => (( boolint(data.environment) + boolint(data.binary) + boolint(data.asset)) == 1),
    {
        message: "entrypoint cannot point to several packages at once: choose 'environment', 'binary' or 'asset'",
        path: ['environment | binary | asset']
    }
)

export type info = z.infer<typeof infoSchema>

export const listSchema = z.record(
    z.string().regex(/[-_a-z0-9.]/)
        .describe("name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)"),
    infoSchema,
)
export type list = z.infer<typeof listSchema>
