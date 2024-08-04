import { Flags } from '@oclif/core'

export const BuildFlags = {
    "dev": Flags.string({
        name: "dev",
        description: "build dev version of descriptor",
        options: ['local'],
        required: false,
    }),
}

export function modeFromFlag(dev?: string): BuildMode {
    switch (dev) {
        case 'local':
            return 'dev-local'

        case undefined:
            return 'release'

        default:
            return 'release'
    }
}

export type BuildMode = 'dev-local' | 'release'
