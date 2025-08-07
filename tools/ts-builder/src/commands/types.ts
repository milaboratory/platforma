import { Command } from 'commander';
import { existsSync } from 'fs';
import { executeCommand, getGlobalOptions, resolveTypeChecker, type TargetType } from './utils/index';

export const typesCommand = new Command('types')
  .description('Type check the project')
  .option('-p, --project <path>', 'Path to tsconfig.json', './tsconfig.json')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = globalOpts.target as TargetType;
    const tsconfigPath = options.project;

    console.log(`Type checking with ${tsconfigPath}...`);

    if (!existsSync(tsconfigPath)) {
      console.error(`TypeScript config not found: ${tsconfigPath}`);
      process.exit(1);
    }

    const commandPath = resolveTypeChecker(target);
    const args = ['--noEmit', '--project', tsconfigPath];
    
    await executeCommand(commandPath, args);
  });
