import { run } from "./run";
import { LocalPlBinary } from "./binary";
import { MiLogger } from '@milaboratories/ts-helpers';
import { getBinary } from "./binary_download";
import { configPath, writeConfig } from "./config";

export type LocalPlOptions = {
  workingDir: string;
  config: string;
  version: string;
  binary: LocalPlBinary;
};

export async function runPl(logger: MiLogger, opts: LocalPlOptions) {
  const config = configPath(opts.workingDir);
  writeConfig(logger, config, opts.config);

  let binaryPath = '';
  
  if (opts.binary.type == 'Download') {
    binaryPath = await getBinary(logger, {
      version: opts.binary.version,
      saveTo: opts.binary.dir,
    })
  } else if (opts.binary.type == 'Local') {
    binaryPath = opts.binary.path;
  }

  return run(
    logger,
    binaryPath,
    ['-config', config],
    {env: {...process.env}}
  )
}

