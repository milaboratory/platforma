import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';

import * as tar from 'tar';
import winston from 'winston';
import zlib from 'zlib';
import axios from 'axios';
import xz from 'xz';

import * as pkg from './pkg.js';

// All paths are relative here by intention:
// we maintain the same directory hierarchy across all packages.
export const rDistDir = 'rdist'; // where built R would be stored
export const buildDir = 'build'; // where intermediate build files would be stored
export const downloadsDir = `${buildDir}/artifacts/dld`;
export const artifactsDir = `${buildDir}/artifacts/pkg`;

export const dependenciesDir = 'dependencies'; // where to search for dependencies specification (init.R or renv.lock)
const renvDirName = 'renv-root' // directory with all renv cache stored inside final R run environment distribution

const pipelineAsync = promisify(pipeline);

export function run(command, opts = {}) {
  const processOpts = {
    ...opts,
    env: {
      ...process.env,
      ...opts.env,
    },
    stdio: 'pipe'
  }

  const stdout = child_process.execSync(command, processOpts);
  return stdout.toString();
}

export function packageJson() {
  if (!fs.existsSync("package.json")) {
    throw new Error("file 'package.json' not found in current directory. The script should be executed from package root dir.")
  }

  return JSON.parse(fs.readFileSync("package.json"))
}

export function rVersion() {
  const v = packageJson()?.["block-software"]?.entrypoints?.main?.environment?.artifact?.["r-version"]
  if (!v) {
    throw new Error("Expected main entrypoint to have R type and to have R version defined: 'block-software.entrypoints.main.environment.artifact.r-version' is not set")
  }

  return v
}

export function runInherit(command, opts = {}) {
  const processOpts = {
    ...opts,
    env: {
      ...process.env,
      ...opts.env,
    },
    stdio: 'inherit'
  }
  child_process.execSync(command, processOpts);
}

export function isOK(command) {
  try {
    child_process.execSync(command, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

export function patchEnvPath(varName, pathToAdd) {
  if (!process.env[varName]) {
    process.env[varName] = pathToAdd;
    return;
  }

  const items = process.env[varName].split(path.delimiter);
  const newValue = [pathToAdd, ...items].join(path.delimiter);
  process.env[varName] = newValue;
}

var showProgress = process.stdout.isTTY;

export async function download(logger, url, destination) {
  if (fs.existsSync(destination)) {
    logger.info(`  download skipped: ${destination} already exists`);
    return Promise.resolve()
  }

  const writer = fs.createWriteStream(destination);

  const response = await axios.get(url, {
    responseType: 'stream'
  });

  if (showProgress) {
    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    const knownSize = totalBytes > 0;
    var downloadedBytes = 0;

    response.data.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = knownSize
        ? (downloadedBytes / totalBytes) * 100
        : downloadedBytes;
      const percents = knownSize ? progress.toFixed(2) + '% ' : '';
      const bytes = knownSize
        ? `(${downloadedBytes.toString()}/${totalBytes.toString()})`
        : downloadedBytes.toString();
      process.stdout.write(`  downloading: ${percents}${bytes}\r`);
    });
  }

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      process.stdout.write('\n');
      writer.close(resolve);
    });
    writer.on('error', (err) => {
      process.stdout.write('\n');
      fs.unlink(destination, () => reject(err));
    });
  });
}

export async function extractTarXz(archivePath, destination) {
  const archiveStream = fs.createReadStream(archivePath);

  const decompress = new xz.Decompressor();

  await pipelineAsync(
    archiveStream,
    decompress,
    tar.extract({ cwd: destination })
  );
}

export async function extractTarGz(archivePath, destination) {
  await pipelineAsync(
    fs.createReadStream(archivePath),
    zlib.createUnzip(),
    tar.extract({ cwd: destination })
  );
}

export function findFiles(dir, filter) {
  let results = [];

  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(filePath, filter));
    } else {
      if (
        (typeof filter === 'function' && filter(file)) ||
        (filter instanceof RegExp && filter.test(file))
      ) {
        results.push(filePath);
      }
    }
  });

  return results;
}

export function uniq(list) {
  return list.filter((item, index) => {
    return index === 0 || item !== list[index - 1];
  });
}

/**
 * Quote each item in given <list>
 *
 * @param {string[] | string} list - items to quote
 * @param {' | "} q - quote symbol to use: ' or "
 * @returns {string[]} - list of quoted items
 */
export function quote(list, q = "'") {
  if (!list) {
    return [];
  }

  if (typeof list === 'string') {
    list = [list];
  }

  return list.map((item) => `${q}${item.replaceAll(q, '\\' + q)}${q}`);
}

/**
 * Convert list of strings into R list definition (c("item1", "item2", "..."))
 *
 * @param {string[]} items - list of items to convert
 * @param {' | "} q - quote symbol to use (' or ")
 * @returns {string}
 */
function rList(items, q = '"') {
  return `c(${quote(items, q).join(',')})`
}

export function retry(logger, maxAttempts, msg, cb) {
  let i = 0;

  while (true) {
    i++;

    try {
      return cb();
    } catch (e) {
      logger.error(msg + ': ' + e);
      if (i >= maxAttempts) {
        throw e;
      }
    }
  }
}

export function createLogger(level = 'debug') {
  return winston.createLogger({
    level: level,

    format: winston.format.combine(
      winston.format.printf(({ level, message }) => {
        const indent = ' '.repeat(level.length + 2); // For ': ' after the level
        const indentedMessage = message
          .split('\n')
          .map((line, index) => (index === 0 ? line : indent + line))
          .join('\n');

        const colorize = (l) => winston.format.colorize().colorize(l, l);

        return `${colorize(level)}: ${indentedMessage}`;
      })
    ),

    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true
      })
    ]
  });
}

/**
 * Run R command
 *
 * @param {winston.Logger} logger
 * @param {string} rRoot - path to R installation root
 * @param {string[]} args - command run arguments
 * @param {{ paths?: string[],
 *           wd?: string,
 *           createWD?: boolean,
 *           env?: Record<string, string> }} opts - additional run parameters
 */
export function runR(logger, rRoot, args, opts = {}) {
  const cmdToRun = `${path.resolve(rRoot, 'bin/R')} ${args.join(' ')}`;
  const renvRoot = path.join(path.resolve(rRoot), renvDirName)

  env = {
    RHOME: path.resolve(rRoot),
    R_HOME_DIR: path.resolve(rRoot),
    RENV_PATHS_ROOT: renvRoot,
    RENV_PATHS_BINARY: path.join(renvRoot, 'binaries'),
    RENV_PATHS_SOURCE: path.join(renvRoot, 'sources'),
    RENV_PATHS_CACHE: path.join(renvRoot, 'cache'),
    RENV_PATHS_PREFIX: 'common',
    RENV_PATHS_PREFIX_AUTO: 'FALSE',
    RENV_CONFIG_AUTO_SNAPSHOT: 'FALSE',
    RENV_CONFIG_SYNCHRONIZED_CHECK: 'FALSE',

    ...opts?.env,
  }

  if (opts?.paths) {
    env.PATH = `${process.env['PATH']}:${opts.paths.join(':')}`
  }

  const runOpts = {
    cwd: opts?.wd,
    env: env,
  }

  logger.debug("Running command", cmdToRun, runOpts)

  if (opts?.wd && !fs.existsSync(opts.wd) && opts?.createWD) {
    logger.debug("creating working directory for command")
    fs.mkdirSync(opts.wd, { recursive: true })
  }
  runInherit(cmdToRun, runOpts);
}

/**
 * Run R command
 *
 * @param {winston.Logger} logger
 * @param {string} rRoot - path to R installation root
 * @param {string[]} args - command run arguments
 * @param {{ paths?: string[],
 *           wd?: string,
 *           env?: Record<string, string> }} opts - additional run parameters
 */
function runInRenv(logger, rRoot, args, opts = {}) {
  runR(logger, rRoot, ['--quiet', '--no-echo', '--no-save', '--no-restore', '-e', quote('renv::activate()')], opts)
  runR(logger, rRoot, args, opts)
}

const basicRPackages = [
  'renv',
  'devtools',
  'usethis',
  "pkgdepends",
];

/**
 * Install the most basic R packages that are required all the time (like alternative package managers)
 *
 * @param {winston.Logger} logger
 * @param {string} rRoot - path to R installation root
 * @param {string[]} additionalPaths - list of paths to be appended to PATH environment variable during execution
 */
export function installBasicRPackages(logger, rRoot, additionalPaths = []) {
  const install = (...pkgs) => {
    return `install.packages(${rList(pkgs)}, repos="https://cloud.r-project.org/")`;
  };

  logger.info(`Installing basic R packages to make them be available by default.`, basicRPackages);

  runR(logger, rRoot,
    ['--no-echo',
      '-e', ...quote(install(...basicRPackages), "'")],
    { paths: additionalPaths },
  );
}

/**
 * Read and parse R dependencies file, providing structured information on list of packages to be installed.
 *
 * @param {winston.Logger} logger
 * @param {string} depsFile
 * @returns {{
 *              type: string,
 *              version?: string,
 *              packages: string[]
 *           }[]}
 */
export function readRDependencies(logger, depsFile) {
  const fileContent = fs.readFileSync(depsFile, 'utf-8');
  const deps = JSON.parse(fileContent)
  logger.debug(`R dependencies loaded`, deps)
  return deps
}

/**
 * Build R dependencies and store prebuilt package archives in <packagesRoot> directory, so it can later be used
 * as packages source during installation process on client side.
 *
 * @param {winston.Logger} logger
 * @param {string} rRoot - path to R installation root
 * @param {string} packagesRoot - path to directory wher R binary package archives should be stored.
 * @param {string[]} additionalPaths - list of paths to be appended to PATH environment variable during execution
 */
export function buildRDependencies(
  logger,
  rRoot,
  packagesRoot,
  depsDir,
  additionalPaths = [],
) {
  if (!fs.existsSync(packagesRoot)) {
    fs.mkdirSync(packagesRoot, { recursive: true })
  }

  const projectsFile = path.join(path.resolve(rRoot), renvDirName, 'projects')
  const origProjectsFile = projectsFile + '.orig'
  if (fs.existsSync(projectsFile)) {
    fs.renameSync(projectsFile, origProjectsFile)
  }

  const allDeps = new Set();
  let biocVersion = ''

  const lockFile = 'renv.lock'
  const initFile = 'init.R'

  const lockPath = path.join(depsDir, lockFile)

  if (fs.existsSync(lockPath)) {
    runInRenv(logger, rRoot, [
      '--no-echo',
      '-e', ...quote(`renv::restore( clean = TRUE )`),
    ], {
      wd: tempRenvDir,
      paths: additionalPaths,
    })

  } else {
    if (!fs.existsSync(path.join(depsDir, initFile))) {
      throw new Error(
        `directory ${depsDir} has no ${lockFile} or ${initFile}. No dependencies detected.\n`+
        `Create empty init.R file if you really need empty R run environment without any preinstalled dependencies`
      )
    }

    runInRenv(logger, rRoot, ['--no-echo', `--file=${initFile}`], {
      wd: tempRenvDir,
      paths: additionalPaths,
    })
  }

  const lockData = fs.readFileSync(lockPath, { encoding: 'utf-8' });
  const lockInfo = JSON.parse(lockData.toString())
  for (const pkgInfo of Object.values(lockInfo.Packages)) {
    allDeps.add(`${pkgInfo.Package}@${pkgInfo.Version}`)
    if (pkgInfo.Package === 'BiocVersion') {
      if (biocVersion !== '' && biocVersion !== pkgInfo.Version) {
        throw new Error(`BiocVersion conflict: ${pkgInfo.Version} and ${biocVersion} cannot be used in the same run environment`)
      }
      biocVersion = pkgInfo.Version
    }
  }

  fs.rmSync(tempRenvDir, { recursive: true })
  if (fs.existsSync(origProjectsFile)) {
    fs.renameSync(origProjectsFile, projectsFile)
  }

  runR(logger, rRoot,
    [
      `--file=${pkg.asset('collect-dependencies.R')}`,
      `--args ${quote(Array.from(allDeps)).join(' ')}`
    ], {
    wd: packagesRoot,
    createWD: true,
    paths: additionalPaths,
  })

  biocVersion = biocVersion.split('.').slice(0, -1).join('.') // 3.20.0 -> 3.20

  patchREnviron(logger, rRoot, {
    R_BIOC_VERSION: biocVersion,
    BIOCONDUCTOR_ONLINE_VERSION_DIAGNOSIS: "FALSE",

    RENV_PATHS_PREFIX: "common",
    RENV_CONFIG_AUTO_SNAPSHOT: "FALSE",
    RENV_CONFIG_SYNCHRONIZED_CHECK: "FALSE",
  },
    "Environment customisation for Platforma Backend");
}

/**
 * Appends Renviron file with defaults for given environment variables.
 *
 * @param {winston.Logger} logger
 * @param {string} rRoot
 * @param {Record<string, string>} envs
 */
function patchREnviron(
  logger,
  rRoot,
  envs = {},
  comment = "",
) {
  let rEnvironPath = path.join(rRoot, 'etc', 'Renviron')
  if (!fs.existsSync(rEnvironPath)) {
    rEnvironPath = path.join(rRoot, 'etc', 'Renviron.site')
  }
  if (!fs.existsSync(rEnvironPath)) {
    throw new Error(`Renviron file not found in ${path.join(rRoot, 'etc')} directory. Can't patch default R environment settings`)
  }

  if (comment) {
    fs.appendFileSync(rEnvironPath, `\n\n##\n## ${comment}\n##\n\n`, 'utf8');
  }

  for (const [envName, envValue] of Object.entries(envs)) {
    line = `${envName}=\${${envName}:-'${envValue}'}`
    fs.appendFileSync(rEnvironPath, line + '\n', 'utf8');
  }
}

/**
 * Recreate directory by removing it and creating back.
 *
 * @param {string} dir - path to directory
 */
function recreateDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true })
  }
  fs.mkdirSync(dir, { recursive: true })

}
