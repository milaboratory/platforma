import { Command } from "commander";
import { runLint as runLinter } from "./linter";
import { runFormat as runFormatter } from "./formater";

export const formatCommand = new Command("format")
  .description("Run lint fix and format fix")
  .action(async () => {
    await runLinter([], { fix: true });
    await runFormatter([], { fix: true });

    console.log("All fixes applied!");
  });
