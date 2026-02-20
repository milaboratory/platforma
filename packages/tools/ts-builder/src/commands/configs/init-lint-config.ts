import { Command } from "commander";
import {
  createLintConfigReference,
  getGlobalOptions,
  getOxlintConfigForTarget,
  type TargetType,
} from "../utils/index";

export const initLintConfigCommand = new Command("init-lint-config")
  .description("Initialize .oxlintrc.json config file")
  .option(
    "--target <target>",
    "Target type to infer lint config (node|browser|block-model|block-ui|block-test)",
  )
  .action(async (options: { target?: string }, command) => {
    const globalOpts = getGlobalOptions(command);

    const target = (options.target || globalOpts.target) as TargetType;
    if (!target) {
      console.error("--target is required.");
      console.error("  --target: node|browser|browser-lib|block-model|block-ui|block-test");
      process.exit(1);
    }
    const configType = getOxlintConfigForTarget(target);

    console.log(`Initializing .oxlintrc.json with ${configType} preset...`);

    try {
      createLintConfigReference(configType);
    } catch (error) {
      console.error("Failed to create .oxlintrc.json:", error);
      process.exit(1);
    }
  });
