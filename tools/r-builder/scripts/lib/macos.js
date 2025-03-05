import path from 'path';
import os from 'os';
import fs from 'fs';
import fsextra from 'fs-extra';

import * as pkg from './pkg.js';
import * as util from './util.js';
import * as srcs from './macos_src.js';

const platformName = os.arch() === 'arm64' ? 'macosx-aarch64' : `macosx-x64`;

function currentArch() {
  return util.run('uname -m'); // 'x86_64' or 'arm64'
}

async function installR(logger, version) {
  logger.info(`Downloading R ${version}...`);

  const rPkgPath = path.join(util.downloadsDir, `R-${version}.pkg`);
  const rArch = currentArch()
  await util.download(
    logger,
    `https://cloud.r-project.org/bin/macosx/big-sur-${rArch}/base/R-${version}-${rArch}.pkg`,
    rPkgPath
  );

  logger.info(`Installing R ${version}...`);
  util.runInherit(`sudo installer -pkg '${rPkgPath}' -target /`);

  return fs.realpathSync('/Library/Frameworks/R.framework/Resources')
}

export async function buildR(logger, version) {
  if (os.platform() !== 'darwin') {
    logger.error(`Current OS is not MacOS X (os.platform=${os.platform()})`);
    process.exit(1);
  }

  const distDir = path.join(util.rDistDir, platformName);

  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(util.downloadsDir, { recursive: true });

  const gFortran = await srcs.installGNUFortran(logger)
  if (gFortran) {
    logger.info(`Adding '${gFortran}/bin' into PATH`);
    process.env.PATH = `${gFortran}/bin:${process.env.PATH}`;
  }

  const rRootPath = await installR(logger, version)
  await fsextra.copy(rRootPath, distDir)

  fs.renameSync(path.join(distDir, 'bin/R'), path.join(distDir, 'bin/R.orig'))
  fs.copyFileSync(pkg.asset('R.macos.sh'), path.join(distDir, 'bin/R'))

  util.installBasicRPackages(logger, distDir);
}

export async function buildDeps(logger, version) {
  const distDir = path.join(util.rDistDir, platformName);

  util.buildRDependencies(
    logger,
    distDir,
    path.join(distDir, 'packages'),
    'dependencies',
  )
}
