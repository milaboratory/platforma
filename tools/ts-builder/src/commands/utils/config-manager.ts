import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getConfigPath } from './path-utils.js';

export type TargetType = 'node' | 'browser' | 'browser-lib' | 'block-model';

export interface ConfigInfo {
  filename: string;
  outputPath: string;
}

const TARGET_CONFIG_MAP: Record<TargetType, ConfigInfo> = {
  'node': {
    filename: 'rollup.node.config.js',
    outputPath: './build.node.config.js',
  },
  'browser': {
    filename: 'vite.browser.config.js',
    outputPath: './build.browser.config.js',
  },
  'browser-lib': {
    filename: 'vite.browser-lib.config.js',
    outputPath: './build.browser-lib.config.js',
  },
  'block-model': {
    filename: 'rollup.block-model.config.js',
    outputPath: './build.block-model.config.js',
  },
};

const TSCONFIG_MAP: Record<TargetType, string> = {
  'node': 'tsconfig.node.json',
  'browser': 'tsconfig.browser.json',
  'browser-lib': 'tsconfig.browser.json',
  'block-model': 'tsconfig.node.json',
};

export function getConfigInfo(target: TargetType): ConfigInfo {
  const config = TARGET_CONFIG_MAP[target];
  if (!config) {
    throw new Error(`Unknown target type: ${target}`);
  }
  return config;
}

export function getValidatedConfigPath(customConfig: string | undefined, defaultConfigFilename: string): string {
  if (customConfig) {
    if (!existsSync(customConfig)) {
      console.error(`Custom config not found: ${customConfig}`);
      process.exit(1);
    }
    console.log(`Using custom config: ${customConfig}`);
    return customConfig;
  }

  return getConfigPath(defaultConfigFilename);
}

export function createConfigFile(target: TargetType, outputPath?: string): void {
  const configInfo = getConfigInfo(target);
  const targetFile = outputPath || configInfo.outputPath;

  if (existsSync(targetFile)) {
    console.warn(`${targetFile} already exists. Skipping...`);
    return;
  }

  const configPath = getConfigPath(configInfo.filename);

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, 'utf-8');
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile} for ${target} target`);
}

export function createTsConfig(target: TargetType): void {
  const targetFile = './tsconfig.json';

  if (existsSync(targetFile)) {
    console.warn('tsconfig.json already exists. Skipping...');
    return;
  }

  const configFilename = TSCONFIG_MAP[target];
  if (!configFilename) {
    throw new Error(`Unknown target type: ${target}`);
  }

  const configPath = getConfigPath(configFilename);

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, 'utf-8');
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile} for ${target} target`);
}

export function createServeConfig(): void {
  const targetFile = './serve.config.js';

  if (existsSync(targetFile)) {
    console.warn('serve.config.js already exists. Skipping...');
    return;
  }

  const configPath = getConfigPath('vite.browser.config.js');

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, 'utf-8');
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile}`);
}
