import { MiLogger } from "@milaboratories/ts-helpers";
import { wdPath } from "./workdir";
import fs from 'fs/promises';

export const configLocalYaml = 'config-local.yaml'

export function configPath(workingDir: string) {
  return wdPath(workingDir, configLocalYaml);
}

export async function writeConfig(
  logger: MiLogger,
  configPath: string, config: string,
) {
  logger.info(`writing configuration '${configPath}'...`);
  await fs.writeFile(configPath, config);
}
