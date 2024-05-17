import { Flags } from '@oclif/core'

export const GlobalFlags = {
    "log-level": Flags.string({
        description: "logging level",
        default: "warn",
        options: ["error", "warn", "info", "debug"],
    })
}
