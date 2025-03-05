// This imodule contains code for building R on Mac OS X from sources.
// As R project provides official binary builds in their installer AND
// their installers can relatively simply be converted to 'portable'
// versions, we do not have to build our own R binaries.
// But still, if we will need it any time in future, this scripts would be
// very helpful starting point.

import path from 'path';
import os from 'os';
import fs from 'fs';

import * as util from './util.js';

const platformName = os.arch() === 'arm64' ? 'macosx-aarch64' : `macosx-x64`;

function currentMacOSXVersion() {
  return util.run('sw_vers -productVersion').toString().trim(); // i.e. 14.4.1
}

function currentArch() {
  return util.run('uname -m');
}

export async function installGNUFortran(logger) {
  const gfortranArchivePath = path.join(util.downloadsDir, 'gfortran.tar.xz');
  const gfortranDistPath = path.join(util.artifactsDir, 'gfortran');
  const gfortranGlobal = '/opt/gfortran';

  logger.info(`Checking GNU Fortran...`);

  if (util.isOK('gfortran --help')) {
    logger.info(`  GNU Fortran is already available.`);
    return ''; // gfortran's 'bin/' already in PATH
  }
  if (fs.existsSync(path.join(gfortranGlobal, 'bin', 'gfortran'))) {
    logger.info(`  GNU Fortran is already installed to '${gfortranGlobal}'.`);
    return gfortranGlobal; // should add it's 'bin/' to PATH
  }

  logger.info(`Downloading GNU Fortran...`);
  await util.download(
    logger,
    'https://github.com/R-macos/gcc-12-branch/releases/download/12.2-darwin-r0/gfortran-12.2-darwin20-r0-universal.tar.xz',
    gfortranArchivePath
  );

  logger.info(`  installing GNU Fortran to '${gfortranDistPath}'...`);

  fs.mkdirSync(gfortranDistPath, { recursive: true });
  await util.extractTarXz(gfortranArchivePath, gfortranDistPath);
  const localGfortranRoot = path.join(gfortranDistPath, 'opt', 'gfortran');

  const systemSDKPath = util.run('xcrun --show-sdk-path').toString().trim();
  logger.info(`  linking system SDK path '${systemSDKPath}' into GNU Fortran`);
  fs.rmSync(path.join(localGfortranRoot, 'SDK'));

  fs.symlinkSync(systemSDKPath, path.join(localGfortranRoot, 'SDK'));

  logger.info(`  linking GNU Fortran to '${gfortranGlobal}'...`);
  util.runInherit(
    `sudo ln -sfn '${path.resolve(localGfortranRoot)}' '${gfortranGlobal}'`
  );

  return gfortranGlobal;
}

export async function installMacTeX(logger) {
  logger.info(`Downloading MacTeX...`);

  const macTeXPkgPath = path.join(util.downloadsDir, 'MacTeX.pkg');
  await util.download(
    logger,
    'https://mirror.ctan.org/systems/mac/mactex/MacTeX.pkg',
    macTeXPkgPath
  );

  if (util.isOK('tex')) {
    logger.info(`MacTeX seems to be already installed.`);
    return;
  }

  logger.info(`Installing MacTeX...`);
  util.runInherit(`sudo installer -pkg '${macTeXPkgPath}' -target /`);
}

export async function installXQuartz(logger) {
  logger.info(`Downloading XQuartz...`);

  const xQuartzPkgPath = path.join(util.downloadsDir, 'XQuartz.pkg');
  await util.download(
    logger,
    'https://github.com/XQuartz/XQuartz/releases/download/XQuartz-2.8.5/XQuartz-2.8.5.pkg',
    xQuartzPkgPath
  );

  if (util.isOK('XQuartz')) {
    logger.info(`XQuartz seems to be already installed.`);
    return;
  }

  logger.info(`Installing XQuartz...`);
  util.runInherit(`sudo installer -pkg '${xQuartzPkgPath}' -target /`);
}

export async function installRTools(logger) {
  const toolsRepoDir = path.join(util.artifactsDir, 'r-recipes');
  fs.mkdirSync(path.dirname(toolsRepoDir), { recursive: true });

  if (!fs.existsSync(toolsRepoDir)) {
    logger.info(`Downloading additional R tools recipes...`);
    util.runInherit(
      `git clone https://github.com/R-macos/recipes.git ${toolsRepoDir}`
    );
  }

  logger.info(`Installing additional R tools...`);

  const arch = currentArch();
  const installPrefix = `/opt/R/${arch.toString().trim()}`;
  util.runInherit(`sudo mkdir -p '${installPrefix}'`);

  // Sometimes r-base-dev fails because of network errors, like rate limiting on remote side, or failed archive downloads.
  // We try to re-run the build script, because it is several times faster than restarting whole CI build, as
  // 'make' under r-base-dev skips already built targets.
  util.retry(logger, 3, 'Additional tool installation failed', () =>
    util.runInherit('sudo -E ./build.sh r-base-dev', {
      cwd: toolsRepoDir,
      env: {
        PREFIX: installPrefix
      }
    })
  );

  return path.resolve(installPrefix);
}

export async function getRSources(logger, version) {
  const rSourcesArchive = path.join(util.downloadsDir, `R-${version}.tar.gz`);

  logger.info(`Downloading R ${version} sources...`);
  await util.download(
    logger,
    `https://cran.r-project.org/src/base/R-4/R-${version}.tar.gz`,
    rSourcesArchive
  );

  const rSourcesDir = path.join(util.artifactsDir);
  fs.mkdirSync(rSourcesDir, { recursive: true });

  logger.info(`Extracting R sources from archive...`);
  await util.extractTarGz(rSourcesArchive, rSourcesDir);

  return path.resolve(rSourcesDir, `R-${version}`);
}

export function configureRBuild(
  logger,
  version,
  sourcesDir,
  installDir,
  rToolsDir,
  fortranRoot
) {
  logger.info(`Configuring R build...`);

  util.runInherit(`${sourcesDir}/tools/rsync-recommended`, {
    cwd: sourcesDir
  });

  const buildDir = path.join(util.buildDir, 'R', version);
  fs.mkdirSync(buildDir, { recursive: true });

  const configSiteName = 'config.site';
  logger.info(`  patching '${path.join(sourcesDir, configSiteName)}'...`);
  let configSiteContent = fs
    .readFileSync(path.join(sourcesDir, configSiteName), 'utf-8')
    .toString();

  let hasARCH = false;
  let hasOS = false;
  for (const line in configSiteContent.split('\n')) {
    hasARCH = hasARCH || /^\s*ARCH\s*=/.test(line);
    hasOS = hasOS || /^\s*OSVER\s*=/.test(line);
  }

  const osMajor = currentMacOSXVersion().split('.')[0] + '.0'; // 14.4.1 -> 14.0
  const arch = currentArch();
  if (hasOS) {
    configSiteContent = replace(/^\s*OS\s*=/, `OSVER=${osMajor}`);
  } else {
    configSiteContent += `\nOSVER=${osMajor}\n`;
  }
  if (hasARCH) {
    configSiteContent = replace(/^\s*ARCH\s*=/, `ARCH=${arch}`);
  } else {
    configSiteContent += `\nARCH=${arch}\n`;
  }

  fs.writeFileSync(path.join(buildDir, configSiteName), configSiteContent);

  logger.info(`  running '${sourcesDir}/configure'...`);
  const installDirAbs = path.resolve(installDir);
  util.runInherit(
    `${sourcesDir}/configure --with-blas=no --with-lapack=no --with-x=no --prefix=${installDirAbs}`,
    {
      cwd: buildDir,
      env: {
        CC: 'sccache clang',
        CFLAGS: `-Wall -g -O2 -pedantic -mmacosx-version-min=${osMajor} -arch ${arch} -falign-functions=64 -Wno-error=implicit-function-declaration`,
        CPPFLAGS: `-I${rToolsDir}/include`,
        FC: `${fortranRoot}/bin/gfortran`,
        FCFLAGS: `-Wall -g -O2 -pedantic -mmacosx-version-min=${osMajor} -arch ${arch} -mtune=native`,
        LDFLAGS: `-L${rToolsDir}/lib`,
        CXX: 'sccache clang',
        CXXFLAGS: `-Wall -g -O2 -pedantic -mmacosx-version-min=${osMajor} -arch ${arch} -falign-functions=64`,
        R_LD_LIBRARY_PATH: `${rToolsDir}/lib`,
        PKG_CONFIG: `${rToolsDir}/bin/pkg-config`,
        PKG_CONFIG_PATH: `${rToolsDir}/lib/pkgconfig:${rToolsDir}/share/pkgconfig:/usr/lib/pkgconfig:/opt/X11/lib/pkgconfig:/opt/X11/share/pkgconfig`
      }
    }
  );

  return buildDir;
}

export function buildRFramework(logger, buildDir) {
  logger.info('Bundling and installing R');
  util.runInherit(`make`, { cwd: buildDir });
  util.runInherit(`make install`, { cwd: buildDir });
}

export function collectLibraries(logger, rRoot) {
  const dstLibsDir = 'lib/R/lib';

  const allLibs = () => util.findFiles(path.resolve(rRoot), /\.(dylib|so)$/);

  logger.info("Consolidating all dynamic library dependencies into R's root");

  const fixRLibs = allLibs()
    .map((libPath) => `--fix-file '${libPath}'`)
    .join(' ');

  // Collect all libraries into '<rRoot>/lib/R/lib'
  util.runInherit(
    `dylibbundler` +
      ` --bundle-deps` +
      ` --dest-dir '${dstLibsDir}'` +
      ` --search-path '${dstLibsDir}'` +
      ` --skip-missing` +
      ` --skip-existing` +
      ` --install-path '@rpath'` +
      ` ${fixRLibs}` +
      ` --fix-file 'lib/R/bin/exec/R'`,
    { cwd: rRoot }
  );

  // Patch R binary to set RPATH to be relative to executable.
  util.runInherit(
    `install_name_tool` +
      ` -add_rpath` +
      ` '@executable_path/../../lib/'` +
      ` 'lib/R/bin/exec/R'`,
    { cwd: rRoot }
  );
}

export async function buildRPackage() {
  if (os.platform() !== 'darwin') {
    logger.error(`Current OS is not MacOS X (os.platform=${os.platform()})`);
    process.exit(1);
  }

  const distDir = path.join(util.rDistDir, version, platformName);

  process.chdir(util.repoRoot);
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(util.downloadsDir, { recursive: true });

  if (!util.isOK('xcode-select --print-path')) {
    // 1. Install Command Line Tools for XCode as they are not present in current system
    util.runInherit('sudo xcode-select --install');
  }

  const fortranPrefix = await installGNUFortran(logger);
  if (fortranPrefix) {
    logger.info(`Adding '${fortranPrefix}/bin' into PATH`);
    process.env.PATH = `${fortranPrefix}/bin:${process.env.PATH}`;
  }

  await installMacTeX(logger);
  await installXQuartz(logger);
  const toolsPrefix = await installRTools(logger);
  util.patchEnvPath('PATH', `${toolsPrefix}/bin`);

  const rSourcesDir = await getRSources(logger, version);
  const rBuildDir = configureRBuild(
    logger,
    version,
    rSourcesDir,
    distDir,
    toolsPrefix,
    fortranPrefix
  );

  buildRFramework(logger, rBuildDir);

  const rStartScriptPath = path.join(util.repoRoot, util.assetsRoot, 'R.macos.sh');

  fs.copyFileSync(rStartScriptPath, path.join(distDir, 'bin/R'));
  fs.copyFileSync(rStartScriptPath, path.join(distDir, 'lib/R/bin/R'));

  installBasicRPackages(logger, distDir);
  collectLibraries(logger, distDir);
}
