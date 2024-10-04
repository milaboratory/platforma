import { assertNever, fileExists, MiLogger } from "@milaboratories/ts-helpers";
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'yaml';

export const configLocalYaml = 'config-local.yaml'

export function getConfigPath(dir: string) {
  return path.join(dir, configLocalYaml);
}

export async function readConfig(configPath: string) {
  return (await fs.readFile(configPath)).toString();
}

export function parseConfig(config: string) {
  return yaml.parse(config);
}

export function stringifyConfig(config: any) {
  return yaml.stringify(config);
}

export async function writeConfig(
  logger: MiLogger,
  configPath: string, config: string,
) {
  logger.info(`writing configuration '${configPath}'...`);
  await fs.writeFile(configPath, config);
}
