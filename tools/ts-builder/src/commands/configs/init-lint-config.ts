import { Command } from "commander";
import {
  createLintConfig,
  getGlobalOptions,
  getOxlintConfigForTarget,
  type OxlintConfigType,
  type TargetType,
} from "../utils/index";

const VALID_LINT_CONFIGS: OxlintConfigType[] = [
  "block-model",
  "block-ui",
  "block-test",
  "test",
  "node",
  "browser",
];

export const initLintConfigCommand = new Command("init-lint-config")
  .description("Initialize .oxlintrc.json config file")
  .option(
    "--target <target>",
    "Target type to infer lint config (node|browser|block-model|block-ui|block-test)",
  )
  .option("--type <type>", "Lint config type (block-model|block-ui|block-test|test|node|browser)")
  .action(async (options: { target?: string; type?: string }, command) => {
    const globalOpts = getGlobalOptions(command);

    let configType: OxlintConfigType;

    if (options.type) {
      if (!VALID_LINT_CONFIGS.includes(options.type as OxlintConfigType)) {
        console.error(`Invalid lint config type: ${options.type}`);
        console.error(`Valid types: ${VALID_LINT_CONFIGS.join(", ")}`);
        process.exit(1);
      }
      configType = options.type as OxlintConfigType;
    } else {
      const target = (options.target || globalOpts.target) as TargetType;
      if (!target) {
        console.error("Either --target or --type is required.");
        console.error("  --target: node|browser|browser-lib|block-model|block-ui|block-test");
        console.error("  --type: block-model|block-ui|block-test|test|node|browser");
        process.exit(1);
      }
      configType = getOxlintConfigForTarget(target);
    }

    console.log(`Initializing .oxlintrc.json with ${configType} preset...`);

    try {
      createLintConfig(configType);
    } catch (error) {
      console.error("Failed to create .oxlintrc.json:", error);
      process.exit(1);
    }
  });
