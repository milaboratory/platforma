import { Command } from "commander";
import {
  createConfigFile,
  getGlobalOptions,
  getTarget,
  type CommandOptions,
  type TargetType,
} from "../utils/index";

export const initBuildConfigCommand = new Command("init-build-config")
  .description("Initialize build config")
  .option("--target <target>", "Target type (node|browser|browser-lib|block-model)")
  .action(async (options: CommandOptions, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = getTarget(options, globalOpts) as TargetType;

    console.log(`Initializing build config for ${target} target...`);

    try {
      createConfigFile(target);
    } catch (error) {
      console.error("Failed to create build config:", error);
      process.exit(1);
    }
  });
