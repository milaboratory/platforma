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
    globalOpts.useSources ? "sources" : ",",
  ];

  await executeCommand(commandPath, args);
}

export const typesCommand = new Command("type-check")
  .description("Type check the project")
  .option("-p, --project <path>", "Path to tsconfig.json", "./tsconfig.json")
  .action(async (options, command) => {
    await runTypeCheck(getGlobalOptions(command), options.project);
  });
