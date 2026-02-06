import { Command } from 'commander';
import {
  createConfigFile,
  createFmtConfig,
  createLintConfig,
  createServeConfig,
  createTsConfig,
  getGlobalOptions,
  getOxlintConfigForTarget,
  getTarget,
  isBuildableTarget,
  type CommandOptions,
  type TargetType,
} from '../utils/index';

export const initConfigsCommand = new Command('init-configs')
  .description('Initialize all config files for the target (tsconfig, build, lint, fmt)')
  .option('--target <target>', 'Target type (node|browser|browser-lib|block-model|block-ui|block-test)')
  .action(async (options: CommandOptions, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = getTarget(options, globalOpts) as TargetType;

    console.log(`Initializing configs for ${target} target...\n`);

    try {
      createTsConfig(target);
    } catch (error) {
      console.error('Failed to create tsconfig.json:', error);
    }

    if (isBuildableTarget(target)) {
      try {
        createConfigFile(target);
      } catch (error) {
        console.error('Failed to create build config:', error);
      }
    }

    const isBrowserTarget = target === 'browser' || target === 'browser-lib' || target === 'block-ui';
    if (isBrowserTarget) {
      try {
        createServeConfig();
      } catch (error) {
        console.error('Failed to create serve config:', error);
      }
    }

    try {
      const configType = getOxlintConfigForTarget(target);
      createLintConfig(configType);
    } catch (error) {
      console.error('Failed to create .oxlintrc.json:', error);
    }

    try {
      createFmtConfig();
    } catch (error) {
      console.error('Failed to create .oxfmtrc.json:', error);
    }

    console.log('\nDone.');
  });
