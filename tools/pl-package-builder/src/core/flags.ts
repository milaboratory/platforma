import { Flags } from '@oclif/core'
import { Archs as Arches, ArchType, OSes, OStype } from './util'
import * as os from 'os';

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
        description: "OS supported by software (for binary package)",
        default: currentOS(),
        options: OSes,
    }),

    "arch": Flags.string({
        description: "architecture supported by software (for binary package)",
        default: currentArch(),
        options: Arches,
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

export function currentOS(): OStype {
    const platform = os.platform()
    switch (platform) {
        case 'darwin':
            return 'macosx';
        case 'linux':
            return 'linux';
        case 'win32':
            return 'windows';
        default:
            throw new Error(`operating system '${platform}' is not currently supported by Platforma ecosystem. The list of OSes supported: ` + JSON.stringify(OSes))
    }
}

export function currentArch(): ArchType {
    const arch = os.arch()
    switch (arch) {
        case 'arm64':
            return 'aarch64'
        case 'x64':
            return 'x64'
        default:
            throw new Error(`processor architecture '${arch}' is not currently supported by Platforma ecosystem. The list of architectures supported: ` + JSON.stringify(Arches))
    }
}
