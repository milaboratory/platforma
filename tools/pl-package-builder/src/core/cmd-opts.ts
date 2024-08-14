import { Flags } from '@oclif/core'
import * as util from './util'
import * as envs from './envs'

export const GlobalFlags = {
    "log-level": Flags.string({
        description: "logging level",
        default: "info",
        options: ["error", "warn", "info", "debug"],
        required: false,
    })
}

const devModeValues = ['local'] as const;
export type devModeName = (typeof devModeValues)[number];

export const BuildFlags = {
    "dev": Flags.string({
        env: envs.PL_PKG_DEV,
        description: "build dev version of descriptor",
        options: devModeValues,
        required: false,
    }),
}

export const DescriptorNameFlag = {
    "descriptor-name": Flags.string({
        // env: envs.PL_PKG_NAME, // !! this env is used 'globally' right inside package-info.ts !!
        description: "override name of package descriptor (<name>.sw.json) to be generated",
        required: false,
    }),
}

export const VersionFlag = {
    "version": Flags.string({
        // env: envs.PL_PKG_VERSION, // !! this env is used 'globally' right inside package-info.ts !!
        description: "override version of package to be built (ignore versions in pl.package.yaml and package.json)",
        required: false,
    }),
}

export const ArchFlags = {
    "os": Flags.string({
        env: envs.PL_PKG_OS,
        description: "OS supported by software. Has no effect on cross-platform packages",
        default: util.currentOS(),
        options: util.OSes,
        required: false,
    }),

    "arch": Flags.string({
        env: envs.PL_PKG_ARCH,
        description: "architecture supported by software. Has no effect on cross-platform packages",
        default: util.currentArch(),
        options: util.Arches,
        required: false,
    })
}

export const ArchiveFlag = {
    "archive": Flags.file({
        env: envs.PL_PKG_ARCHIVE,
        description: "path to archive with the pacakge to be built/published. Overrides <os> and <arch> options",
        required: false,
    })
}

export const StorageURLFlag = {
    "storage-url": Flags.string({
        env: envs.PL_PKG_STORAGE_URL,
        description: "publish package archive into given registry, specified by URL, e.g. s3://<bucket>/<some-path-prefix>?region=<region>",
        required: false,
    }),
}

export const ContentRootFlag = {
    "content-root": Flags.directory({
        env: envs.PL_PKG_CONTENT_ROOT,
        description: "path to directory with contents of software package. Overrides settings in pl.package.yaml",
        required: false,
    }),
}

export const SourceFlag = {
    'source': Flags.string({
        description: "add only selected sources to *.sw.json descriptor",
        options: (util.AllSoftwareSources as unknown) as string[],
        multiple: true,
        required: false,
    }),
}

export function modeFromFlag(dev?: devModeName): util.BuildMode {
    switch (dev) {
        case 'local':
            return 'dev-local'

        case undefined:
            return 'release'

        default:
            util.assertNever(dev)
            throw new Error("unknown dev mode") // just to calm down TS type analyzer
    }
}
