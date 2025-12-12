import { Command } from 'commander';
import {
  executeCommand,
  getGlobalOptions,
  getValidatedConfigPath,
  resolveVite,
  validateTargetForBrowser,
} from './utils/index';

export const serveCommand = new Command('serve')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('--host <host>', 'Host address', 'localhost')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = globalOpts.target;
    const customServeConfig = globalOpts.serveConfig;
    const useSources = globalOpts.useSources;

    validateTargetForBrowser(target);

    console.log(`Starting dev server for ${target} project${useSources ? ' with sources condition' : ''}...`);

    try {
      const viteCommand = resolveVite();
      const viteArgs = ['dev'];
      const configPath = getValidatedConfigPath(customServeConfig, `vite.${target}.config.js`);

      viteArgs.push('--config', configPath);

      viteArgs.push('--port', options.port);
      viteArgs.push('--host', options.host);

      const env = useSources ? { USE_SOURCES: '1' } : undefined;
      await executeCommand(viteCommand, viteArgs, env);
    } catch (error) {
      console.error('Failed to start dev server:', error);
      process.exit(1);
    }
  });
