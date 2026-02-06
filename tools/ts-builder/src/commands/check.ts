import { Command } from "commander";
import { getGlobalOptions } from "./utils/index";
import { runTypeCheck } from "./types";
import { runLint as runLinter } from "./linter";
import { runFormat as runFormatter } from "./formater";

export const checkCommand = new Command("check")
  .description("Run type-check, lint, and format check")
  .option("-p, --project <path>", "Path to tsconfig.json", "./tsconfig.json")
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);

    await runTypeCheck(globalOpts, options.project);
    await runLinter([], { check: true });
    await runFormatter([], { check: true });

    console.log("All checks passed!");
  });

export const formatCommand = new Command("format")
  .description("Run lint fix and format fix")
  .action(async () => {
    await runLinter([], { fix: true });
    await runFormatter([], { fix: true });

    console.log("All fixes applied!");
  });
