import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import * as pkg from './pkg.js';
import * as util from './util.js';

const platformName = os.arch() === 'arm64' ? 'linux-aarch64' : `linux-x64`;

function useCaching(logger) {
  if (util.isOK('which ccache')) {
    useCCache(logger)
  } else if (util.isOK('which sccache')) {
    useSCCache(logger)
  } else {
    logger.warn('No caching tool found. Builds will be slow.')
  }
}

/**
 * Setup current process environment to integrate with sccache
 *
 * @param {winston.Logger} logger
 */
function useSCCache(logger) {
  logger.info("Using sccache as build caching tool...")
  process.env.SCCACHE_GHA_ENABLED = "true"
  process.env.CC = `sccache gcc`
  process.env.CXX = `sccache g++`
}

/**
 * Setup current process environment to integrate with ccache
 *
 * @param {winston.Logger} logger
 */
function useCCache(logger) {
  logger.info("Using ccache as build caching tool...")
  process.env.CC = `ccache gcc`
  process.env.CXX = `ccache g++`
}

async function installSystemPackages(logger) {
  const originalAptSources = '/etc/apt/sources.list';
  logger.info(`Analyzing '${originalAptSources}'`);

  const modifiedAptSources = path.join(os.tmpdir(), 'apt-sources-list');
  let srcExists = false;

  const lines = fs.readFileSync(originalAptSources).toString().split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\s*#\s*(deb-src)\s+.*\s+(universe)\s*$/.test(line)) {
      srcExists = true;
      lines[i] = line.replace(/^\s*#\s*/, '');
    }
    if (/^\s*deb-src\s+/.test(line)) {
      srcExists = true;
    }
  }

  if (srcExists) {
    logger.info(`Patching '${originalAptSources}'`);
    fs.writeFileSync(modifiedAptSources, lines.join('\n'));
    util.runInherit(`sudo mv '${modifiedAptSources}' '${originalAptSources}'`);
  } else {
    logger.warn(
      `WARNING! No 'deb-src' records found in '${originalAptSources}'. 'apt-get build-dep' would probably fail.`
    );
  }

  logger.info('Installing packages');
  util.runInherit(`sudo apt-get update`);
  util.runInherit(`sudo apt-get install --yes rsync build-essential unzip curl patchelf r-recommended`);
  util.runInherit(`sudo apt-get install --yes libssl-dev libcurl4-openssl-dev libpng-dev liblapack-dev libblas-dev libfontconfig1-dev libxml2-dev`);
  util.runInherit(`sudo apt-get build-dep --yes r-base`);
}

function getGCCMajorVersion() {
  const output = util.run('gcc --version')

  const firstLine = output.split('\n')[0];
  const versionPart = firstLine.split(' ')[2];
  const majorVersion = versionPart.split('.')[0];
  return parseInt(majorVersion, 10);
}

async function getRSources(logger, version) {
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

function configureRBuild(logger, version, sourcesDir, installDir) {
  logger.info(`Configuring R build`);

  util.runInherit(`${sourcesDir}/tools/rsync-recommended`, {
    cwd: sourcesDir
  });

  const buildDir = path.join(util.buildDir, 'R', version);
  fs.mkdirSync(buildDir, { recursive: true });

  const configSiteName = 'config.site';
  fs.copyFileSync(
    path.join(sourcesDir, configSiteName),
    path.join(buildDir, configSiteName)
  );

  logger.info(`  running '${sourcesDir}/configure'...`);
  const installDirAbs = path.resolve(installDir);
  util.runInherit(
    `${sourcesDir}/configure --with-blas=no --with-lapack=no --with-x=no --prefix=${installDirAbs}`,
    { cwd: buildDir }
  );

  return buildDir;
}

function buildRDist(logger, buildDir, installRoot, rRoot) {
  util.runInherit(`make`, { cwd: buildDir });
  util.runInherit(`make install`, { cwd: buildDir });

  // Move core of R installation into desired R root, leaving behind all supporting
  // (and unnecessary) files.
  if (fs.existsSync(rRoot)) {
    fs.rmSync(rRoot, { recursive: true })
  }
  fs.renameSync(path.join(installRoot, 'lib', 'R'), rRoot);

  // 1st round of dependencies collection with binaries ELF patching to make R work from
  // its new location. We'll collect dependencies of installed packages later by one more round.
  collectDependencies(logger, rRoot, true);
}

const systemLibs = [
  /ld-linux-x86-64\.so(\.[0-9.]+)?$/,
  /libc\.so(\.[0-9.]+)?$/,
  /libm\.so(\.[0-9.]+)?$/,
  /libcom_err\.so(\.[0-9.]+)?$/,
  /libstdc\+\+\.so(\.[0-9.]+)?$/,
  /libresolv\.so(\.[0-9.]+)?$/
];

function collectDependencies(logger, installDir, patchElf = false) {
  logger.info('Collecting libraries to make R distribution portable');

  const libsDir = path.join(installDir, 'lib');
  const allLibs = () => util.findFiles(installDir, /\.so(\.[0-9.]+)?$/);
  const executables = [path.join(installDir, 'bin/exec/R')];

  const collected = collectSoLibs(
    logger,
    [...executables, ...allLibs()],
    libsDir,
    systemLibs
  );
  logger.info(
    `Libraries collected into '${libsDir}':\n  ${collected.join('\n  ')}`
  );

  if (patchElf) {
    for (const binName of [...executables]) {
      const relativeLibLocation = path.relative(path.dirname(binName), libsDir);
      const newRPath = `$ORIGIN/${relativeLibLocation}`;
      logger.info(`  patching ELF in '${binName}' (rpath = '${newRPath}')...`);
      patchBinElf(logger, binName, newRPath);
    }
  }
}

function collectSoLibs(logger, binaryFiles, libsDir, libsToIgnore) {
  const allDependencies = new Set();

  binaryFiles.forEach((binaryFile) => {
    logger.info(`Loading library dependencies of '${binaryFile}'`);

    libLoop: for (const libPath of getBinDependencies(binaryFile)) {
      if (path.resolve(libPath).startsWith(path.resolve(libsDir))) {
        continue libLoop; // already in desired libs dir
      }

      for (const ignoreRule of libsToIgnore) {
        if (
          (typeof ignoreRule === 'function' && ignoreRule(libPath)) ||
          (ignoreRule instanceof RegExp && ignoreRule.test(libPath))
        ) {
          continue libLoop; // lib is ignored
        }
      }

      allDependencies.add(libPath);
    }
  });

  const collectedLibs = Array.from(allDependencies);

  for (const libPath of collectedLibs) {
    logger.info(`  copying '${libPath}'`);
    const targetPath = path.join(libsDir, path.basename(libPath));
    fs.copyFileSync(libPath, targetPath);
  }

  return collectedLibs;
}

function getBinDependencies(binaryFile) {
  const output = util.run(`ldd '${binaryFile}'`).toString();
  /*
    The output of ldd looks like this:
      linux-vdso.so.1 (0x00007f2f6859d000)
      libRblas.so => not found
      libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007f2f684ac000)
      libreadline.so.8 => not found
      libpcre2-8.so.0 => /lib/x86_64-linux-gnu/libpcre2-8.so.0 (0x00007f2f67f66000)
      liblzma.so.5 => /lib/x86_64-linux-gnu/liblzma.so.5 (0x00007f2f6847a000)
      libbz2.so.1.0 => /lib/x86_64-linux-gnu/libbz2.so.1.0 (0x00007f2f68464000)
      libz.so.1 => /lib/x86_64-linux-gnu/libz.so.1 (0x00007f2f67f4a000)
      libtirpc.so.3 => not found
      libicuuc.so.70 => not found
      libicui18n.so.70 => not found
      libgomp.so.1 => not found
      libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f2f67c00000)
      /lib64/ld-linux-x86-64.so.2 (0x00007f2f6859f000)
  */

  // Split by every space symbol. Lines that start with '/' are most likely absolute paths to libraries.
  return util.uniq(
    output
      .split(/\s/)
      .filter((l) => l.startsWith('/'))
      .sort()
  );
}

/**
 * Patch binary file updating its RPATH
 *
 * @param {winston.Logger} logger
 * @param {string} binaryFile - binary file to patch. .so or executable.
 * @param {string} rpath - new RPATH to set
 */
function patchBinElf(logger, binaryFile, rpath) {
  util.runInherit(`patchelf --remove-rpath '${binaryFile}'`);
  util.runInherit(`patchelf --set-rpath '${rpath}' '${binaryFile}'`);
}

/**
 * Build portable R distribution and all required packages from sources
 *
 * @param {winston.Logger} logger
 * @param {string} version - R version to build
 */
export async function buildR(logger, version) {
  if (os.platform() !== 'linux') {
    logger.error(`Current OS is not Linux (os.platform=${os.platform()})`);
    process.exit(1);
  }

  useSCCache(logger)

  const distDir = path.join(util.rDistDir, platformName);

  fs.mkdirSync(path.dirname(distDir), { recursive: true });
  fs.mkdirSync(util.downloadsDir, { recursive: true });

  await installSystemPackages(logger);

  const rSourcesDir = await getRSources(logger, version);
  const installDir = path.join(util.rDistDir, 'tmp-install');
  const rBuildDir = configureRBuild(logger, version, rSourcesDir, installDir);

  buildRDist(logger, rBuildDir, installDir, distDir);

  fs.renameSync(path.join(distDir, 'bin/R'), path.join(distDir, 'bin/R.orig'))
  fs.copyFileSync(pkg.asset('R.linux.sh'), path.join(distDir, 'bin/R'));
  fs.chmodSync(path.join(distDir, 'bin/R'), 0o755)

  const gccVersion = getGCCMajorVersion()
  const gccUtilsPath = path.join('/usr/lib/gcc/x86_64-linux-gnu', gccVersion.toString())

  util.installBasicRPackages(logger, distDir, [gccUtilsPath]);
}

export async function buildDeps(logger, version) {
  if (os.platform() !== 'linux') {
    logger.error(`Current OS is not Linux (os.platform=${os.platform()})`);
    process.exit(1);
  }

  useSCCache(logger);

  const distDir = path.join(util.rDistDir, platformName);

  const gccVersion = getGCCMajorVersion()
  const gccUtilsPath = path.join('/usr/lib/gcc/x86_64-linux-gnu', gccVersion.toString())

  util.buildRDependencies(
    logger,
    distDir,
    path.join(distDir, 'packages'),
    'dependencies',
    [gccUtilsPath],
  )

  // We need to collect dependencies AFTER all packages intallation
  // to save also deps of the packages (which are wider than R itself)
  collectDependencies(logger, distDir);
}
