#!/usr/bin/env node

/*
 * Usage check
 */

const args = process.argv.slice(2);

if (args.length !== 0) {
  console.error(`Usage: ${process.argv[1]}`);
  process.exit(1);
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as util from './lib/util.js';
import * as macos from './lib/macos.js';
import * as linux from './lib/linux.js';
import * as windows from './lib/windows.js';

export async function buildRDist(logger, version) {
  const currentOS = os.platform();
  
  const doneFile = `${version}.build-done`
  if (fs.existsSync(doneFile)) {
    logger.info(`Build of R is already done in this environment.\nTo force rebuild remove '${path.resolve(doneFile)}' file and run again.`)
    return
  }

  switch (currentOS) {
    case 'darwin': {
      await macos.buildR(logger, version);
      break;
    }
    
    case 'linux': {
      await linux.buildR(logger, version);
      break;
    }
    
    case 'win32': {
      await windows.buildR(logger, version);
      break;
    }

    default: {
      logger.error(`unsupported OS: ${currentOS}`);
      process.exit(1);
    }
  }

  fs.writeFileSync(doneFile, '');
}

export async function buildRDeps(logger, version) {
  const currentOS = os.platform();
  
  switch (currentOS) {
    case 'darwin': {
      await macos.buildDeps(logger, version);
      break;
    }

    case 'linux': {
      await linux.buildDeps(logger, version);
      break;
    }

    case 'win32': {
      await windows.buildDeps(logger, version);
      break;
    }

    default: {
      logger.error(`unsupported OS: ${currentOS}`);
      process.exit(1);
    }
  }
}

const logger = util.createLogger('debug');

(async () => {
  const version = util.rVersion();
  
  await buildRDist(logger, version)
  await buildRDeps(logger, version)
  
  util.runInherit(`pl-pkg build`);
})().catch((reason) => {
  logger.error(reason)
  logger.debug(reason?.stack)
  process.exit(1)
});
