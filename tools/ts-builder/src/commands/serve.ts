import { Command } from 'commander';
import {
  executeCommand,
  getGlobalOptions,
  getValidatedConfigPath,
  resolveVite,
  validateTargetForBrowser,
  type TargetType
} from './utils/index';

export const serveCommand = new Command('serve')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('--host <host>', 'Host address', 'localhost')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = globalOpts.target as TargetType;
    const customServeConfig = globalOpts.serveConfig;

    validateTargetForBrowser(target);

    console.log(`Starting dev server for ${target} project...`);

    try {
      const viteCommand = resolveVite();
      const viteArgs = ['dev'];
      const configPath = getValidatedConfigPath(customServeConfig, `vite.${target}.config.js`);
      
      viteArgs.push('--config', configPath);
      
      viteArgs.push('--port', options.port);
      viteArgs.push('--host', options.host);

      await executeCommand(viteCommand, viteArgs);
      
    } catch (error) {
      console.error('Failed to start dev server:', error);
      process.exit(1);
    }
  });
