import { Command } from "commander";
import { existsSync } from "node:fs";
import { executeCommand, getGlobalOptions, requireTarget, resolveTypeChecker } from "./utils/index";
import type { GlobalOptions } from "./utils/index";

export async function runTypeCheck(globalOpts: GlobalOptions, project: string): Promise<void> {
  const target = requireTarget(globalOpts);
  const tsconfigPath = project;

  if (!existsSync(tsconfigPath)) {
    console.error(`TypeScript config not found: ${tsconfigPath}`);
    process.exit(1);
  }

  const commandPath = resolveTypeChecker(target);
  const args = [
    "--noEmit",
    "--project",
    tsconfigPath,
    "--customConditions",
    // Non-sources mode resolves workspace deps via their built `dist` (types/import
    // conditions). We must still override the base tsconfig's `customConditions:
    // ["sources"]`, so we pass a benign non-"sources" condition. TypeScript 7's CLI
    // parses a bare "," as a source-file positional (TS5042), so use "default" instead.
    globalOpts.useSources ? "sources" : "default",
  ];

  await executeCommand(commandPath, args);
}

export const typesCommand = new Command("type-check")
  .description("Type check the project")
  .option("-p, --project <path>", "Path to tsconfig.json", "./tsconfig.json")
  .action(async (options, command) => {
    await runTypeCheck(getGlobalOptions(command), options.project);
  });
