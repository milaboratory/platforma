import winston from "winston";
import { run } from "./run";
import { configLocalYaml, wdPath } from "./workdir";
import fs from 'fs/promises';
import { LocalPlBinary } from "./binary";
import { fileExists } from '@milaboratories/ts-helpers';

export type LocalPlOptions = {
  workingDir: string;
  config: string;
  version: string;
  binary: LocalPlBinary;
};

export async function runPl(logger: winston.Logger, opts: LocalPlOptions) {
  const configPath = wdPath(opts.workingDir, configLocalYaml);
  if (!(await fileExists(configPath))) {
    logger.debug(`writing configuration '${configPath}'...`);
    await fs.writeFile(configPath, opts.config);
  }

  // run(
  //   logger, 
  // )
}

