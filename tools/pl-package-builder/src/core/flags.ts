import { Flags } from '@oclif/core'
import * as util from './util'

export const GlobalFlags = {
    "log-level": Flags.string({
        description: "logging level",
        default: "info",
        options: ["error", "warn", "info", "debug"],
    })
}

export const BuildFlags = {
    "dev": Flags.string({
        name: "dev",
        description: "build dev version of descriptor",
        options: ['local'],
        required: false,
    }),
}

export const ArchFlags = {
    "os": Flags.string({
        description: "OS supported by software. Has no effect on cross-platform packages",
        default: util.currentOS(),
        options: util.OSes,
    }),

    "arch": Flags.string({
        description: "architecture supported by software. Has no effect on cross-platform packages",
        default: util.currentArch(),
        options: util.Arches,
    })
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
