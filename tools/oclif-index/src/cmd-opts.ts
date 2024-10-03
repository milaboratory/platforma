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
        description: "path to directory, where command declaration files are located. Default is './src/commands/'",
        default: './src/commands/',
    }),
}

export const SourceExtensionFlag = {
    'source-extension': Flags.string({
        description: "extension of files with command declarations. Default is '.ts'",
        default: '.ts',
    }),
}
export const IndexFileFlag = {
    'index-file': Flags.string({
        description: "path to file to be generated. Default is './src/index.<ext>'",
    })
}
