import { Flags } from '@oclif/core'

export const GlobalFlags = {
  "log-level": Flags.string({
    description: "logging level",
    default: "info",
    options: ["error", "warn", "info", "debug"],
  })
}

export const CtagsFlags = {
  "generate-tags": Flags.boolean({
    description: "generate tags, default true",
    env: "GENERATE_TAGS",
    default: true,
  }),

  "tags-file": Flags.file({
    description: "where to put \".tags\" file, it should be a root of VS Code project",
    env: "TAGS_FILE",
    default: "../../.tags" // usually a user opens a directory with all blocks
  }),

  "tags-additional-args": Flags.string({
    description: "additional flags for universal-ctags command: e.g. -e for emacs",
    env: "TAGS_ADDITIONAL_ARGS",
    default: [],
    multiple: true,
    delimiter: ',',
  })
}
