import { Command } from 'commander';
import {
  executeCommand,
  getGlobalOptions,
  getValidatedConfigPath,
  resolveRollup,
  resolveVite,
  type TargetType
} from './utils/index';

export const buildCommand = new Command('build')
  .description('Build the project')
  .option('-w, --watch', 'Watch for changes and rebuild')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = globalOpts.target as TargetType;
    const customBuildConfig = globalOpts.buildConfig;
    const isWatch = options.watch;

    console.log(`Building ${target} project${isWatch ? ' in watch mode' : ''}...`);

    try {
      if (target === 'browser' || target === 'browser-lib') {
        await buildWithVite(target, customBuildConfig, isWatch);
      } else {
        await buildWithRollup(target, customBuildConfig, isWatch);
      }
      
      console.log('Build completed successfully');
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  });

async function buildWithVite(target: TargetType, customConfig?: string, isWatch?: boolean): Promise<void> {
  const viteCommand = resolveVite();
  const viteArgs = ['build'];
  const configPath = getValidatedConfigPath(customConfig, `vite.${target}.config.js`);
  
  viteArgs.push('--config', configPath);
  
  if (isWatch) {
    viteArgs.push('--watch');
  }
  
  const mode = isWatch ? 'development' : 'production';
  viteArgs.push('--mode', mode);

  await executeCommand(viteCommand, viteArgs);
}

async function buildWithRollup(target: TargetType, customConfig?: string, isWatch?: boolean): Promise<void> {
  const rollupCommand = resolveRollup();
  const rollupArgs = ['-c'];
  const configPath = getValidatedConfigPath(customConfig, `rollup.${target}.config.js`);
  
  rollupArgs.push(configPath);
  
  if (isWatch) {
    rollupArgs.push('--watch');
  }

  await executeCommand(rollupCommand, rollupArgs);
}
