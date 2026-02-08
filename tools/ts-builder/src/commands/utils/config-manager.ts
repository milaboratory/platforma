import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getConfigPath } from "./path-utils.js";

export type TargetType =
  | "node"
  | "browser"
  | "browser-lib"
  | "block-model"
  | "block-ui"
  | "block-test";

export interface ConfigInfo {
  filename: string;
  outputPath: string;
}

// block-test has no build config - it's type-check only
const TARGET_CONFIG_MAP: Record<Exclude<TargetType, "block-test">, ConfigInfo> = {
  node: {
    filename: "rollup.node.config.js",
    outputPath: "./build.node.config.js",
  },
  browser: {
    filename: "vite.browser.config.js",
    outputPath: "./build.browser.config.js",
  },
  "browser-lib": {
    filename: "vite.browser-lib.config.js",
    outputPath: "./build.browser-lib.config.js",
  },
  "block-model": {
    filename: "rollup.block-model.config.js",
    outputPath: "./build.block-model.config.js",
  },
  "block-ui": {
    filename: "vite.block-ui.config.js",
    outputPath: "./build.block-ui.config.js",
  },
};

const TSCONFIG_MAP: Record<TargetType, string> = {
  node: "tsconfig.node.json",
  browser: "tsconfig.browser.json",
  "browser-lib": "tsconfig.browser.json",
  "block-model": "tsconfig.block-model.json",
  "block-ui": "tsconfig.block-ui.json",
  "block-test": "tsconfig.block-test.json",
};

export function getConfigInfo(target: TargetType): ConfigInfo | undefined {
  if (target === "block-test") {
    return undefined; // block-test has no build config
  }
  const config = TARGET_CONFIG_MAP[target];
  if (!config) {
    throw new Error(`Unknown target type: ${target}`);
  }
  return config;
}

export function isBuildableTarget(target: TargetType): boolean {
  return target !== "block-test";
}

export function getValidatedConfigPath(
  customConfig: string | undefined,
  defaultConfigFilename: string,
): string {
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
  if (!configInfo) {
    console.log(`Target "${target}" does not require a build config (type-check only).`);
    return;
  }

  const targetFile = outputPath || configInfo.outputPath;

  if (existsSync(targetFile)) {
    console.warn(`${targetFile} already exists. Skipping...`);
    return;
  }

  const configPath = getConfigPath(configInfo.filename);

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, "utf-8");
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile} for ${target} target`);
}

export function createTsConfig(target: TargetType): void {
  const targetFile = "./tsconfig.json";

  if (existsSync(targetFile)) {
    console.warn("tsconfig.json already exists. Skipping...");
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

  const templateContent = readFileSync(configPath, "utf-8");
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile} for ${target} target`);
}

export function createServeConfig(): void {
  const targetFile = "./serve.config.js";

  if (existsSync(targetFile)) {
    console.warn("serve.config.js already exists. Skipping...");
    return;
  }

  const configPath = getConfigPath("vite.browser.config.js");

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, "utf-8");
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile}`);
}

// Oxlint config types
export type OxlintConfigType =
  | "block-model"
  | "block-ui"
  | "block-test"
  | "test"
  | "node"
  | "browser";

const OXLINT_CONFIG_MAP: Record<OxlintConfigType, string> = {
  "block-model": "oxlint-block-model.json",
  "block-ui": "oxlint-block-ui.json",
  "block-test": "oxlint-block-test.json",
  test: "oxlint-test.json",
  node: "oxlint-node.json",
  browser: "oxlint-browser.json",
};

// Map target types to oxlint config types
const TARGET_TO_OXLINT_MAP: Record<TargetType, OxlintConfigType> = {
  node: "node",
  browser: "browser",
  "browser-lib": "browser",
  "block-model": "block-model",
  "block-ui": "block-ui",
  "block-test": "block-test",
};

export function getOxlintConfigForTarget(target: TargetType): OxlintConfigType {
  return TARGET_TO_OXLINT_MAP[target];
}

export function createLintConfig(configType: OxlintConfigType): void {
  const targetFile = "./.oxlintrc.json";

  if (existsSync(targetFile)) {
    console.warn(".oxlintrc.json already exists. Skipping...");
    return;
  }

  const configFilename = OXLINT_CONFIG_MAP[configType];
  if (!configFilename) {
    throw new Error(`Unknown oxlint config type: ${configType}`);
  }

  const configPath = getConfigPath(configFilename);

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, "utf-8");
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile} with ${configType} preset`);
}

export function createFmtConfig(): void {
  const targetFile = "./.oxfmtrc.json";

  if (existsSync(targetFile)) {
    console.warn(".oxfmtrc.json already exists. Skipping...");
    return;
  }

  const configPath = getConfigPath("oxfmt.json");

  if (!existsSync(configPath)) {
    throw new Error(`Config template not found: ${configPath}`);
  }

  const templateContent = readFileSync(configPath, "utf-8");
  writeFileSync(targetFile, templateContent);

  console.log(`Created ${targetFile}`);
}
