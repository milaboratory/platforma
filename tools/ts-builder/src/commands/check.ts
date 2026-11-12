import { Command } from "commander";
import { buildTsconfig } from "../configs/utils/buildTsconfig";
import { getGlobalOptions } from "./utils/index";
import { runTypeCheck } from "./types";
import { runLint as runLinter } from "./linter";
import { runFormat as runFormatter } from "./formatter";

export const checkCommand = new Command("check")
  .description("Run type-check, lint, and format check")
  .option(
    "-p, --project <path>",
    "Path to tsconfig (default: tsconfig.build.json if present, else tsconfig.json)",
  )
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);

    await runTypeCheck(globalOpts, options.project ?? buildTsconfig());
    await runLinter([], { check: true });
    await runFormatter([], { check: true });

    console.log("All checks passed!");
  });
