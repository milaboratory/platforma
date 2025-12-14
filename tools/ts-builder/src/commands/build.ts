import { Command } from 'commander';
import {
  executeCommand,
  getConfigInfo,
  getGlobalOptions,
  getValidatedConfigPath,
  isBuildableTarget,
  resolveRollup,
  resolveVite,
  type TargetType,
} from './utils/index';

export const buildCommand = new Command('build')
  .description('Build the project')
  .option('-w, --watch', 'Watch for changes and rebuild')
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = globalOpts.target;
    const customBuildConfig = globalOpts.buildConfig;
    const useSources = globalOpts.useSources;
    const isWatch = options.watch;

    if (!isBuildableTarget(target)) {
      console.error(`Target "${target}" does not support building. Use "types" command for type-checking only.`);
      process.exit(1);
    }

    console.log(`Building ${target} project${isWatch ? ' in watch mode' : ''}${useSources ? ' with sources condition' : ''}...`);

    try {
      if (target === 'browser' || target === 'browser-lib' || target === 'block-ui') {
        await buildWithVite(target, { customConfig: customBuildConfig, isWatch, useSources });
      } else {
        await buildWithRollup(target, { customConfig: customBuildConfig, isWatch, useSources });
      }

      console.log('Build completed successfully');
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  });

async function buildWithVite(target: TargetType, options?: {
  customConfig?: string;
  isWatch?: boolean;
  useSources?: boolean;
}): Promise<void> {
  const viteCommand = resolveVite();
  const viteArgs = ['build'];
  const configInfo = getConfigInfo(target);
  const configPath = getValidatedConfigPath(options?.customConfig, configInfo!.filename);

  viteArgs.push('--config', configPath);

  if (options?.isWatch) {
    viteArgs.push('--watch');
  }

  const mode = options?.isWatch ? 'development' : 'production';
  viteArgs.push('--mode', mode);

  const env = options?.useSources ? { USE_SOURCES: '1' } : undefined;
  await executeCommand(viteCommand, viteArgs, env);
}

async function buildWithRollup(target: TargetType, options?: {
  customConfig?: string;
  isWatch?: boolean;
  useSources?: boolean;
}): Promise<void> {
  const rollupCommand = resolveRollup();
  const rollupArgs = ['-c'];
  const configInfo = getConfigInfo(target);
  const configPath = getValidatedConfigPath(options?.customConfig, configInfo!.filename);

  rollupArgs.push(configPath);

  if (options?.isWatch) {
    rollupArgs.push('--watch');
  }

  const env = options?.useSources ? { USE_SOURCES: '1' } : undefined;
  await executeCommand(rollupCommand, rollupArgs, env);
}
