import { Command } from "commander";
import { createFmtConfig } from "../utils/index";

export const initFmtConfigCommand = new Command("init-fmt-config")
  .description("Initialize .oxfmtrc.json config file")
  .action(async () => {
    console.log("Initializing .oxfmtrc.json...");

    try {
      createFmtConfig();
    } catch (error) {
      console.error("Failed to create .oxfmtrc.json:", error);
      process.exit(1);
    }
  });
