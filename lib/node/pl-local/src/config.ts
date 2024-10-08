import { MiLogger } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';

export const configLocalYaml = 'config-local.yaml';

export function getConfigPath(dir: string) {
  return path.join(dir, configLocalYaml);
}

export async function readConfig(configPath: string) {
  return (await fs.readFile(configPath)).toString();
}

export async function writeConfig(logger: MiLogger, configPath: string, config: string) {
  logger.info(`writing configuration '${configPath}'...`);
  await fs.writeFile(configPath, config);
}
