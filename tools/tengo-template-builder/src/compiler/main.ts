#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { findNodeModules, pathType } from './util';
import { TemplatesAndLibs, TengoTemplateCompiler } from './compiler';
import { artifactNameToString, FullArtifactName, fullNameToString } from './package';
import { ArtifactSource, parseSourceFile } from './source';
import { Template } from './template';
import winston from 'winston';

interface PackageJson {
  'name': string;
  'version': string;
}

const compiledTplSuffix = '.plj.gz';
const compiledLibSuffix = '.lib.tengo';

const srcTplSuffix = '.tpl.tengo';
const srcLibSuffix = '.lib.tengo';
const validSuffixes = [srcLibSuffix, srcTplSuffix];

export function createLogger(): winston.Logger {
  return winston.createLogger({
    level: 'debug',
    format: winston.format.printf(({ level, message }) => {
      return `${level.padStart(6, ' ')}: ${message}`;
    }),
    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true
      })
    ]
  });
}

export function getPackageInfo(): PackageJson {
  const packageInfo: PackageJson = JSON.parse(fs.readFileSync('package.json').toString());
  return packageInfo
}

function resolveDistLibs(root: string) {
  return path.resolve(root, 'dist', 'tengo', 'lib');
}

function resolveDistTemplates(root: string) {
  return path.resolve(root, 'dist', 'tengo', 'tpl');
}

const loadDependencies = (
  logger: winston.Logger,
  compiler: TengoTemplateCompiler,
  packageInfo: PackageJson,
  target: string) => {
  const packageJsonPath = path.resolve(target, 'package.json');

  if (pathType(packageJsonPath) !== 'file') {
    // recursively iterate over all folders
    for (const f of fs.readdirSync(target)) {
      const file = path.resolve(target, f);
      const type = pathType(file);
      if (type === 'dir')
        loadDependencies(logger, compiler, packageInfo, file);
    }
    return;
  }

  // we are in package folder

  const libFolder = resolveDistLibs(target);
  const tplFolder = resolveDistTemplates(target);

  const libFolderExists = pathType(libFolder) === 'dir';
  const tplFolderExists = pathType(tplFolder) === 'dir';

  if (!libFolderExists && !tplFolderExists)
    // if neither of tengo-specific folders detected, skipping package
    return;

  // we are in tengo dependency folder

  const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

  // in a workspace we will find ourselves in node_modules, ignoring
  if (packageJson.name === packageInfo.name)
    return;

  if (pathType(path.resolve(target, 'node_modules')) === 'dir')
    throw new Error(`nested node_modules is a sign of library dependencies version incompatibility in ${target}`);

  if (libFolderExists) {
    // adding libs
    for (const f of fs.readdirSync(libFolder)) {
      const file = path.resolve(libFolder, f);
      if (!f.endsWith(compiledLibSuffix))
        throw new Error(`unexpected file: ${file}`);
      const fullName: FullArtifactName = {
        type: 'library',
        pkg: packageJson.name,
        id: f.slice(0, f.length - compiledLibSuffix.length),
        version: packageJson.version
      };
      const src = parseSourceFile(file, fullName, false);
      compiler.addLib(src);
      logger.info(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
      if (src.dependencies.length > 0) {
        logger.debug('Dependencies:');
        for (const dep of src.dependencies)
          logger.debug(`  - ${artifactNameToString(dep)}`);
      }
    }
  }

  if (tplFolderExists) {
    // adding templates
    for (const f of fs.readdirSync(tplFolder)) {
      const file = path.resolve(tplFolder, f);
      if (!f.endsWith(compiledTplSuffix))
        throw new Error(`unexpected file: ${file}`);
      const fullName: FullArtifactName = {
        type: 'template',
        pkg: packageJson.name,
        id: f.slice(0, f.length - compiledTplSuffix.length),
        version: packageJson.version
      };
      const tpl = new Template(fullName, { content: fs.readFileSync(file) });
      compiler.addTemplate(tpl);
      logger.info(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    }
  }
};

export function parseSources(
  logger: winston.Logger, packageInfo: PackageJson,
  root: string, subdir: string,
): ArtifactSource[] {

  const sources: ArtifactSource[] = [];

  for (const f of fs.readdirSync(path.join(root, subdir))) {
    const inRootPath = path.join(subdir, f) // path to item inside given <root>
    const fullPath = path.join(root, inRootPath) // full path to item from CWD (or abs path, if <root> is abs path)

    if (pathType(fullPath) === "dir") {
      // Just check that no libs or templates reside inside nested directories.
      // We forbid that for now for sake of simplicity.
      parseSources(logger, packageInfo, root, inRootPath)
      continue
    }

    const fullName = fullNameFromFileName(packageInfo, inRootPath);
    if (!fullName) {
      if (subdir == '') {
        // Do not print warnings for all 'excess' files in subdirs.
        // As long as we forbid templates and libs in subdirs, there is no point
        // to warn on each file inside. Just stay silent until the error appears.
        logger.warn(`unknown file type ${f}`)
      }
      continue
    }

    if (subdir != '') {
      throw new Error(`Templates and libraries should reside only inside '${root}' dir.
       You are free to have any file and dirs structure inside '${root}' keeping other files where you want,
       but regarding ${validSuffixes.join(", ")}, the flat file structure is mandatory.`);
    }

    const file = path.resolve(root, inRootPath);
    logger.info(`Parsing ${fullNameToString(fullName)} from ${file}`);
    const newSrc = parseSourceFile(file, fullName, true);
    if (newSrc.dependencies.length > 0) {
      logger.debug('Detected dependencies:');
      for (const dep of newSrc.dependencies)
        logger.debug(`  - ${artifactNameToString(dep)}`);
    }

    sources.push(newSrc)
  }

  return sources
}

export function newCompiler(logger: winston.Logger, packageInfo: PackageJson) : TengoTemplateCompiler {
  const compiler = new TengoTemplateCompiler();

  // collect all data (templates and libs) from dependency tree
  loadDependencies(
    logger, compiler, packageInfo,
    findNodeModules()
  );

  return compiler
}

function fullNameFromFileName(packageJson: PackageJson, fileName: string): FullArtifactName | null {
  const pkgAndVersion = { pkg: packageJson.name, version: packageJson.version };
  if (fileName.endsWith(srcLibSuffix))
    return { ...pkgAndVersion, id: fileName.substring(0, fileName.length - srcLibSuffix.length), type: 'library' };
  
  if (fileName.endsWith(srcTplSuffix))
    return { ...pkgAndVersion, id: fileName.substring(0, fileName.length - srcTplSuffix.length), type: 'template' };

  return null;
}

export function compile(logger : winston.Logger) : TemplatesAndLibs {
  const packageInfo = getPackageInfo()
  const compiler = newCompiler(logger, packageInfo)
  const sources = parseSources(logger, packageInfo, 'src', '')

  // checking that we have something to do
  if (sources.length === 0) {
    const lookFor: string[] = []
    for (const suffix of validSuffixes) {
      lookFor.push(`*${suffix}`)
    }

    logger.error(`Nothing to compile. Looked for ${lookFor.join(", ")}`);
    process.exit(1);
  }


  // compilation
  logger.info(`Compilation...`);
  const compiled = compiler.compileAndAdd(sources);
  logger.info(`Done.`);

  return compiled
}

export function savePacks(logger: winston.Logger, compiled : TemplatesAndLibs) {
  // writing libs
  if (compiled.libs.length > 0) {
    const libOutput = resolveDistLibs('.');
    fs.mkdirSync(libOutput, { recursive: true });
    for (const lib of compiled.libs) {
      const file = path.resolve(libOutput, lib.fullName.id + compiledLibSuffix);
      logger.info(`Writing ${file}`);
      fs.writeFileSync(file, lib.src);
    }
  }

  // writing templates
  if (compiled.templates.length > 0) {
    const tplOutput = resolveDistTemplates('.');
    fs.mkdirSync(tplOutput, { recursive: true });
    for (const tpl of compiled.templates) {
      const file = path.resolve(tplOutput, tpl.fullName.id + compiledTplSuffix);
      logger.info(`Writing ${file}`);
      fs.writeFileSync(file, tpl.content);
    }
  }
}
