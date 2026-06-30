import { Command, Option } from "commander";

/** Add one or more groups of options to a command, preserving group order. */
export function addOptions(cmd: Command, ...optionGroups: Option[][]): Command {
  for (const group of optionGroups) {
    for (const opt of group) cmd.addOption(opt);
  }
  return cmd;
}

// Comma-delimited, repeatable collector: `--tags-additional-args -e,-x` and/or
// repeated occurrences accumulate into a single string[].
function collectComma(value: string, previous: string[]): string[] {
  return previous.concat(value.split(","));
}

export const GlobalOptions = (): Option[] => [
  new Option("--log-level <level>", "logging level")
    .choices(["error", "warn", "info", "debug"])
    .default("info"),
];

export const CtagsOptions = (): Option[] => [
  new Option("--generate-tags", "generate tags, default false").default(false),
  new Option(
    "--tags-file <path>",
    'where to put ".tags" file, it should be a root of VS Code project',
  ).default("../../.tags"), // usually a user opens a directory with all blocks
  new Option(
    "--tags-additional-args <args>",
    "additional flags for universal-ctags command: e.g. -e for emacs",
  )
    .argParser(collectComma)
    .default([] as string[]),
];

export const ArtifactTypeOptions = (): Option[] => [
  new Option("-t, --type <type>", "artifact type")
    .choices(["all", "library", "template", "test", "software", "asset", "wasm"])
    .default("all"),
];
