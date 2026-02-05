import { Command } from 'commander';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { executeNativeCommand, resolveOxlint } from './utils/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getDefaultConfigPath(): string {
  // __dirname points to dist/commands after build, config is in dist/configs
  return join(__dirname, '..', 'configs', 'oxclint-base.json');
}

export const lintCommand = new Command('lint')
  .description('Lint the project using oxlint')
  .option('--fix', 'Apply fixes automatically')
  .option('--config <path>', 'Path to oxlint config file')
  .argument('[paths...]', 'Paths to lint (defaults to current directory)')
  .action(async (paths, options) => {
    const oxlintCommand = resolveOxlint();
    const oxlintArgs: string[] = [];

    // Determine config path
    let configPath: string | undefined;
    if (options.config) {
      configPath = options.config;
    } else {
      // Check if local .oxlintrc.json exists in current directory
      const localConfig = join(process.cwd(), '.oxlintrc.json');
      if (existsSync(localConfig)) {
        configPath = localConfig;
      } else {
        // Use default config from ts-builder
        configPath = getDefaultConfigPath();
      }
    }

    if (configPath) {
      oxlintArgs.push('--config', configPath);
    }

    // Treat all warnings as errors
    oxlintArgs.push('--deny-warnings');

    if (options.fix) {
      oxlintArgs.push('--fix');
    }

    if (paths && paths.length > 0) {
      oxlintArgs.push(...paths);
    }

    console.log('Linting project...');

    await executeNativeCommand(oxlintCommand, oxlintArgs);

    console.log('Linting completed successfully');
  });
