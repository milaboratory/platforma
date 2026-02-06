import { Command } from "commander";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { executeNativeCommand, resolveOxfmt } from "./utils/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getDefaultConfigPath(): string {
  // __dirname points to dist/commands after build, config is in dist/configs
  return join(__dirname, "..", "configs", "oxfmtrc.json");
}

export interface FormatOptions {
  check?: boolean;
  fix?: boolean;
  config?: string;
}

export async function runFormat(paths: string[], options: FormatOptions = {}): Promise<void> {
  const oxfmtCommand = resolveOxfmt();
  const oxfmtArgs: string[] = [];

  // Determine config path
  let configPath: string | undefined;
  if (options.config) {
    configPath = options.config;
  } else {
    // Check if local .oxfmtrc.json exists in current directory
    const localConfig = join(process.cwd(), ".oxfmtrc.json");
    if (existsSync(localConfig)) {
      configPath = localConfig;
    } else {
      // Use default config from ts-builder
      configPath = getDefaultConfigPath();
    }
  }

  if (options.check) {
    oxfmtArgs.push("--check");
  }

  if (configPath) {
    oxfmtArgs.push("--config", configPath);
  }

  if (paths && paths.length > 0) {
    oxfmtArgs.push(...paths);
  }

  console.log(options.check ? "Checking formatting..." : "Formatting project...");

  await executeNativeCommand(oxfmtCommand, oxfmtArgs);

  console.log(
    options.check ? "Format check completed successfully" : "Formatting completed successfully",
  );
}

export const formaterCommand = new Command("formater")
  .description("Format the project using oxfmt (one of --check or --fix is required)")
  .option("--check", "Check files")
  .option("--fix", "Format files")
  .option("--config <path>", "Path to oxfmt config file")
  .argument("[paths...]", "Paths to format (defaults to current directory)")
  .action(async (paths, options) => {
    if (!options.check && !options.fix) {
      console.error("Error: one of --check or --fix is required");
      process.exit(1);
    }
    await runFormat(paths, options);
  });
