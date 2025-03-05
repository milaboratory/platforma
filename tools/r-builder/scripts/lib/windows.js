import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import * as pkg from './pkg.js';
import * as util from './util.js';

const platformName = os.arch() === 'arm64' ? 'windows-aarch64' : `windows-x64`;

export async function buildR(logger, version) {
  if (platformName !== 'windows-x64') {
    logger.error(`Current OS is not Windows x64 (${platformName})`);
    process.exit(1);
  }

  const distDir = path.join(util.rDistDir, platformName);

  // Copy Windows R stub files to dist directory
  const stubDir = pkg.asset('windows-x64-stub');
  await fs.promises.cp(stubDir, distDir, {
    recursive: true,
    preserveTimestamps: true,
    force: true,
    errorOnExist: false
  });

  // TODO: R for windows
}

export async function buildDeps(logger, version) {
  const distDir = path.join(util.rDistDir, platformName);

  // Copy original R to current package as we cannot distribute them separately now.
  // util.runInherit(`rsync '${rDistDir}/' '${distDir}/'`)

  // TODO: R for windows
}
