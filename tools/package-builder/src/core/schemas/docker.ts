import { z } from 'zod';

// TODO: this is only example of how to structure the code for later development
//       and few thoughts on what how docker build can look like
const dockerBuildRulesSchema = z.object({
    registry: z.string().describe("name of the registry, i.e. 'quay.io'"),
    imageName: z.string().optional().describe("name of docker image inside the registry: <registry>/<imageName>:<version>"),
    version: z.string().optional().describe("version part of docker image tag: <registry>/<imageName>:<version>"),
})

const configSchema = z.object({
    ...dockerBuildRulesSchema.shape,
});

export type config = z.infer<typeof configSchema>
