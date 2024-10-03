import { Flags } from '@oclif/core'

export const LogLevelFlag = {
    "log-level": Flags.string({
        description: "logging level",
        default: "info",
        options: ["error", "warn", "info", "debug"],
        required: false,
    })
}

export const CommandsRootFlag = {
    'commands-root': Flags.string({
        description: "path to directory, where command declaration files are located",
        default: './src/commands/',
    }),
}

export const SourceExtensionFlag = {
    'source-extension': Flags.string({
        description: "extension of files with command declarations",
        default: '.ts',
    }),
}
export const IndexFileFlag = {
    'index-file': Flags.string({
        description: "[default: './src/index.<ext>'] path to file to be generated",
    })
}
