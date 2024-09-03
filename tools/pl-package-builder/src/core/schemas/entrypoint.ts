import { z } from 'zod';

export const binaryOptionsSchema = z.strictObject({
    cmd: z.array(z.string()).
        describe("command to run for this entrypoint. This command will be appended by <args> set inside workflow"),

    envVars: z.array(
        z.string().
            regex(/=/, "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes")
    ).
        optional().
        describe("list of environment variables to be set for this entrypoint")
})
export type binaryOptions = z.infer<typeof binaryOptionsSchema>

export const infoSchema = z.object({
    artifact: z.string(),
    binary: binaryOptionsSchema.optional()
})
export type info = z.infer<typeof infoSchema>

export const listSchema = z.record(
    z.string().regex(/[-_a-z0-9.]/)
        .describe("name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)"),
    infoSchema,
)
export type list = z.infer<typeof listSchema>
