import { Command } from 'commander';
import {
  createTsConfig,
  getGlobalOptions,
  getTarget,
  type CommandOptions,
  type TargetType,
} from './utils/index';

export const initTsconfigCommand = new Command('init-tsconfig')
  .description('Initialize tsconfig.json')
  .option('--target <target>', 'Target type (node|browser|browser-lib|block-model)')
  .action(async (options: CommandOptions, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = getTarget(options, globalOpts) as TargetType;

    console.log(`Initializing tsconfig.json for ${target} target...`);

    try {
      createTsConfig(target);
    } catch (error) {
      console.error('Failed to create tsconfig.json:', error);
      process.exit(1);
    }
  });
