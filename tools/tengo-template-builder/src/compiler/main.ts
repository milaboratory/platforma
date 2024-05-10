#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { findNodeModules, pathType } from './util';
import { TengoTemplateCompiler } from './compiler';
import { artifactNameToString, FullArtifactName, fullNameToString } from './package';
import { ArtifactSource, parseSource } from './source';
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
      const src = parseSource(fs.readFileSync(file).toString(), fullName, false);
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

function parseSources(
  logger: winston.Logger, packageInfo: PackageJson,
  target: string): ArtifactSource[] {
  const sources: ArtifactSource[] = [];

  for (const f of fs.readdirSync(target)) {
    const relPath = path.join(target, f)

    if (pathType(relPath) === "dir") {
      sources.push(...parseSources(logger, packageInfo, relPath))
      continue
    }

    const fullName = fullNameFromFileName(packageInfo, f);
    if (!fullName) {
      logger.warn(`unknown file type ${f}`)
      continue
    }

    const file = path.resolve('src', f);
    logger.info(`Parsing ${fullNameToString(fullName)} from ${file}`);
    const src = parseSource(fs.readFileSync(file).toString(), fullName, true);
    if (src.dependencies.length > 0) {
      logger.debug('Detected dependencies:');
      for (const dep of src.dependencies)
        logger.debug(`  - ${artifactNameToString(dep)}`);
    }
    sources.push(src);
  }

  return sources
}

function fullNameFromFileName(packageJson: PackageJson, fileName: string): FullArtifactName | null {
  const pkgAndVersion = { pkg: packageJson.name, version: packageJson.version };
  if (fileName.endsWith(srcLibSuffix))
    return { ...pkgAndVersion, id: fileName.substring(0, fileName.length - srcLibSuffix.length), type: 'library' };
  
  if (fileName.endsWith(srcTplSuffix))
    return { ...pkgAndVersion, id: fileName.substring(0, fileName.length - srcTplSuffix.length), type: 'template' };

  return null;
}

export function compile() {
  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.printf(({ level, message }) => {
      return `${level.padStart(6, ' ')}: ${message}`;
    }),
    transports: [
      new winston.transports.Console({ handleExceptions: true })
    ]
  });

  // reading current package.json
  const packageInfo: PackageJson = JSON.parse(fs.readFileSync('package.json').toString());
  
  const compiler = new TengoTemplateCompiler();

  // collecting all dependencies from node_modules
  loadDependencies(
    logger, compiler, packageInfo,
    findNodeModules()
  );

  // collecting all source artifacts
  const sources = parseSources(logger, packageInfo, 'src')

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

  // writing results

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
