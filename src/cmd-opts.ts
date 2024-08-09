import { Flags } from '@oclif/core'

export const GlobalFlags = {
    "log-level": Flags.string({
        description: "logging level",
        default: "info",
        options: ["error", "warn", "info", "debug"],
        required: false,
    })
}

export const ImageFlag = {
    image: Flags.string({
        description: 'use custom docker image to run platforma'
    })
}

export const VersionFlag = {
    version: Flags.string({
        description: 'use custom platforma release (official docker image of custom version)'
    })
}

export const StorageFlag = {
    storage: Flags.string({
        description: "specify path on host to be used as storage for all Platforma Backend data",
    })
}

export const ConfigFlag = {
    config: Flags.string({
        description: "use custom Platforma Backend config",
    })
}

export const StoragePrimaryFlag = {
    'storage-primary': Flags.string({
        description: "specify path on host to be mounted to platforma docker container as 'primary' storage",
    })
}

export const StorageLibraryFlag = {
    'storage-library': Flags.string({
        description: "specify path on host to be mounted to platforma docker container as 'library' storage",
    })
}
