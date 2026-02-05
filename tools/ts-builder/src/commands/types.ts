import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { executeCommand, getGlobalOptions, requireTarget, resolveTypeChecker } from './utils/index';

export const typesCommand = new Command('types')
  .description('Type check the project')
  .option('-p, --project <path>', 'Path to tsconfig.json', './tsconfig.json')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = requireTarget(globalOpts);
    const useSources = globalOpts.useSources;
    const tsconfigPath = options.project;

    if (!existsSync(tsconfigPath)) {
      console.error(`TypeScript config not found: ${tsconfigPath}`);
      process.exit(1);
    }

    const commandPath = resolveTypeChecker(target);
    const args = [
      '--noEmit',
      '--project', tsconfigPath,
      '--customConditions', useSources ? 'sources' : ',',
    ];

    await executeCommand(commandPath, args);
  });
