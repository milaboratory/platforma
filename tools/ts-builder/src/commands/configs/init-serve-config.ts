import { Command } from 'commander';
import { createServeConfig } from '../utils/index';

export const initServeConfigCommand = new Command('init-serve-config')
  .description('Initialize serve config')
  .action(async () => {
    console.log('Initializing serve config...');

    try {
      createServeConfig();
    } catch (error) {
      console.error('Failed to create serve config:', error);
      process.exit(1);
    }
  });
