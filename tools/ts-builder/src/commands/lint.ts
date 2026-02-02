import { Command } from 'commander';
import { executeNativeCommand, resolveOxlint } from './utils/index';

export const lintCommand = new Command('lint')
  .description('Lint the project using oxlint')
  .option('--fix', 'Apply fixes automatically')
  .argument('[paths...]', 'Paths to lint (defaults to current directory)')
  .action(async (paths, options) => {
    const oxlintCommand = resolveOxlint();
    const oxlintArgs: string[] = [];

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
