import { Command } from "commander";
import { version } from "../package.json" with { type: "json" };
import { buildCommand } from "./commands/build";
import { checkCommand } from "./commands/check";
import { formatterCommand } from "./commands/formatter";
import { initConfigsCommand } from "./commands/configs/init-configs";
import { initBuildConfigCommand } from "./commands/configs/init-build-config";
import { initFmtConfigCommand } from "./commands/configs/init-fmt-config";
import { initLintConfigCommand } from "./commands/configs/init-lint-config";
import { initServeConfigCommand } from "./commands/configs/init-serve-config";
import { initTsconfigCommand } from "./commands/configs/init-tsconfig";
import { linterCommand } from "./commands/linter";
import { serveCommand } from "./commands/serve";
import { typesCommand } from "./commands/types";
import { formatCommand } from "./commands/format";

const program = new Command();

program
  .name("builder")
  .description("Universal build tool for the monorepo packages")
  .version(version);

program
  .option(
    "--target <target>",
    "Project target type (node|browser|browser-lib|block-model|block-ui|block-test)",
  )
  .option("--build-config <path>", "Path to build config file")
  .option("--serve-config <path>", "Path to serve config file")
  .option("--use-sources", 'Use "sources" export condition for resolving packages');

program.addCommand(buildCommand);
program.addCommand(serveCommand);
program.addCommand(checkCommand);
program.addCommand(formatCommand);
program.addCommand(typesCommand);
program.addCommand(linterCommand);
program.addCommand(formatterCommand);
program.addCommand(initConfigsCommand);
program.addCommand(initTsconfigCommand);
program.addCommand(initBuildConfigCommand);
program.addCommand(initServeConfigCommand);
program.addCommand(initLintConfigCommand);
program.addCommand(initFmtConfigCommand);

program.parse();
