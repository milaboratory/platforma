#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { findNodeModules, pathType } from './util';
import type { TemplatesAndLibs } from './compiler';
import { TengoTemplateCompiler } from './compiler';
import type {
  CompileMode,
  FullArtifactName } from './package';
import {
  artifactNameToString,
  fullNameToString,
  typedArtifactNameToString,
} from './package';
import { ArtifactSource, parseSourceFile } from './source';
import { Template } from './template';
import type winston from 'winston';

interface PackageJson {
  name: string;
  version: string;
  type: string;
}

const compiledTplSuffix = '.plj.gz';
const compiledLibSuffix = '.lib.tengo';
const compiledSoftwareSuffix = '.sw.json';
const compiledAssetSuffix = '.as.json';

// We need to keep track of dependencies for correct tgo-test CLI utility configuraiton.
// It is much simpler to do this here, than duplicate all tle logic regarding dependencies
// in go code.
const srcTestSuffix = '.test.tengo';

const srcTplSuffix = '.tpl.tengo';
const srcLibSuffix = '.lib.tengo';
const srcSoftwareSuffix = '.sw.json';
const srcAssetSuffix = '.as.json';
const compilableSuffixes = [srcLibSuffix, srcTplSuffix, srcSoftwareSuffix, srcAssetSuffix];

export function getPackageInfo(): PackageJson {
  const packageInfo: PackageJson = JSON.parse(fs.readFileSync('package.json').toString()) as PackageJson;
  return packageInfo;
}

function resolveLibsDst(mode: CompileMode, root: string) {
  return path.resolve(root, mode, 'tengo', 'lib');
}

function resolveTemplatesDst(mode: CompileMode, root: string) {
  return path.resolve(root, mode, 'tengo', 'tpl');
}

function resolveSoftwareDst(mode: CompileMode, root: string) {
  return path.resolve(root, mode, 'tengo', 'software');
}

function resolveAssetsDst(mode: CompileMode, root: string) {
  return path.resolve(root, mode, 'tengo', 'asset');
}

function loadDependencies(
  logger: winston.Logger,
  compiler: TengoTemplateCompiler,
  packageInfo: PackageJson,
  searchIn: string,
  isLink: boolean = false,
): void {
  const packageJsonPath = path.resolve(searchIn, 'package.json');

  if (pathType(packageJsonPath) !== 'file') {
    // We're not in package root. Recursively iterate over all folders looking for packages.

    for (const f of fs.readdirSync(searchIn)) {
      const isLink = pathType(path.join(searchIn, f)) === 'link';
      const file = path.resolve(searchIn, f);
      const type = pathType(file);
      if (type === 'dir') {
        loadDependencies(logger, compiler, packageInfo, file, isLink);
      }
    }

    return;
  }

  // we are in package folder
  const libDistFolder = resolveLibsDst('dist', searchIn);
  const tplDistFolder = resolveTemplatesDst('dist', searchIn);
  const softwareDistFolder = resolveSoftwareDst('dist', searchIn);
  const assetDistFolder = resolveAssetsDst('dist', searchIn);

  const libDistExists = pathType(libDistFolder) === 'dir';
  const tplDistExists = pathType(tplDistFolder) === 'dir';
  const softwareDistExists = pathType(softwareDistFolder) === 'dir';
  const assetDistExists = pathType(assetDistFolder) === 'dir';

  if (!libDistExists && !tplDistExists && !softwareDistExists && !assetDistExists)
    // if neither of tengo-specific folders detected, skipping package
    return;

  // we are in tengo dependency folder
  const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString()) as PackageJson;

  // in a workspace we will find ourselves in node_modules, ignoring
  if (packageJson.name === packageInfo.name) return;

  if (pathType(path.resolve(searchIn, 'node_modules')) === 'dir' && isLink)
    throw new Error(
      `nested node_modules is a sign of library dependencies version incompatibility in ${searchIn}`,
    );

  if (libDistExists) {
    loadLibsFromDir(logger, packageJson, 'dist', libDistFolder, compiler);
  }

  if (tplDistExists) {
    loadTemplatesFromDir(logger, packageJson, 'dist', tplDistFolder, compiler);
  }

  if (softwareDistExists) {
    loadSoftwareFromDir(logger, packageJson, 'dist', softwareDistFolder, compiler);
  }

  if (assetDistExists) {
    loadAssetsFromDir(logger, packageJson, 'dist', assetDistFolder, compiler);
  }
}

function loadLibsFromDir(
  logger: winston.Logger,
  packageJson: PackageJson,
  mode: CompileMode,
  folder: string,
  compiler: TengoTemplateCompiler,
) {
  for (const f of fs.readdirSync(folder)) {
    const file = path.resolve(folder, f);
    if (!f.endsWith(compiledLibSuffix)) throw new Error(`unexpected file in 'lib' folder: ${file}`);
    const fullName: FullArtifactName = {
      type: 'library',
      pkg: packageJson.name,
      id: f.slice(0, f.length - compiledLibSuffix.length),
      version: packageJson.version,
    };
    const src = parseSourceFile(logger, mode, file, fullName, true);
    compiler.addLib(src);
    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    if (src.dependencies.length > 0) {
      logger.debug('Dependencies:');
      for (const dep of src.dependencies) logger.debug(`  - ${typedArtifactNameToString(dep)}`);
    }
  }
}

function loadTemplatesFromDir(
  logger: winston.Logger,
  packageJson: PackageJson,
  mode: CompileMode,
  folder: string,
  compiler: TengoTemplateCompiler,
) {
  // adding templates
  for (const f of fs.readdirSync(folder)) {
    const file = path.resolve(folder, f);
    if (!f.endsWith(compiledTplSuffix)) throw new Error(`unexpected file in 'tpl' folder: ${file}`);
    const fullName: FullArtifactName = {
      type: 'template',
      pkg: packageJson.name,
      id: f.slice(0, f.length - compiledTplSuffix.length),
      version: packageJson.version,
    };
    const tpl = new Template(mode, fullName, { content: fs.readFileSync(file) });
    compiler.addTemplate(tpl);
    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
  }
}

function loadSoftwareFromDir(
  logger: winston.Logger,
  packageJson: PackageJson,
  mode: CompileMode,
  folder: string,
  compiler: TengoTemplateCompiler,
) {
  for (const f of fs.readdirSync(folder)) {
    const file = path.resolve(folder, f);
    if (!f.endsWith(compiledSoftwareSuffix))
      throw new Error(`unexpected file in 'software' folder: ${file}`);
    const fullName: FullArtifactName = {
      type: 'software',
      pkg: packageJson.name,
      id: f.slice(0, f.length - compiledSoftwareSuffix.length),
      version: packageJson.version,
    };

    const software = new ArtifactSource(mode, fullName, fs.readFileSync(file).toString(), file, [], []);

    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    compiler.addSoftware(software);
  }
}

function loadAssetsFromDir(
  logger: winston.Logger,
  packageJson: PackageJson,
  mode: CompileMode,
  folder: string,
  compiler: TengoTemplateCompiler,
) {
  for (const f of fs.readdirSync(folder)) {
    const file = path.resolve(folder, f);
    if (!f.endsWith(compiledAssetSuffix))
      throw new Error(`unexpected file in 'asset' folder: ${file}`);
    const fullName: FullArtifactName = {
      type: 'asset',
      pkg: packageJson.name,
      id: f.slice(0, f.length - compiledAssetSuffix.length),
      version: packageJson.version,
    };

    const asset = new ArtifactSource(mode, fullName, fs.readFileSync(file).toString(), file, [], []);

    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    compiler.addAsset(asset);
  }
}

export function parseSources(
  logger: winston.Logger,
  packageInfo: PackageJson,
  mode: CompileMode,
  root: string,
  subdir: string,
): ArtifactSource[] {
  const sources: ArtifactSource[] = [];

  for (const f of fs.readdirSync(path.join(root, subdir))) {
    const inRootPath = path.join(subdir, f); // path to item inside given <root>
    const fullPath = path.join(root, inRootPath); // full path to item from CWD (or abs path, if <root> is abs path)

    if (pathType(fullPath) === 'dir') {
      const nested = parseSources(logger, packageInfo, mode, root, inRootPath);
      sources.push(...nested);
      continue;
    }

    const artifactName
      = f === 'index.lib.tengo' ? `${path.dirname(inRootPath)}.lib.tengo` : inRootPath;

    const fullName = fullNameFromFileName(packageInfo, artifactName.replaceAll(path.sep, '.'));
    if (!fullName) {
      continue; // skip unknown file types
    }

    // if (subdir != '') {
    //   // prettier-ignore
    //   throw new Error(`Templates and libraries should reside only inside '${root}' dir.
    //    You are free to have any file and dirs structure inside '${root}' keeping other files where you want,
    //    but regarding ${compilableSuffixes.join(', ')}, the flat file structure is mandatory.`);
    // }

    const file = path.resolve(root, inRootPath);
    logger.debug(`Parsing ${fullNameToString(fullName)} from ${file}`);
    const newSrc = parseSourceFile(logger, mode, file, fullName, true);
    if (newSrc.dependencies.length > 0) {
      logger.debug('Detected dependencies:');
      for (const dep of newSrc.dependencies) logger.debug(`  - ${typedArtifactNameToString(dep)}`);
    }

    sources.push(newSrc);
  }

  return sources;
}

export function newCompiler(
  logger: winston.Logger,
  packageInfo: PackageJson,
  mode: CompileMode,
): TengoTemplateCompiler {
  const compiler = new TengoTemplateCompiler(mode);

  // collect all data (templates, libs and software) from dependency tree
  loadDependencies(logger, compiler, packageInfo, findNodeModules());

  return compiler;
}

function fullNameFromFileName(
  packageJson: PackageJson,
  artifactName: string,
): FullArtifactName | null {
  const pkgAndVersion = { pkg: packageJson.name, version: packageJson.version };
  if (artifactName.endsWith(srcLibSuffix)) {
    return {
      ...pkgAndVersion,
      id: artifactName.substring(0, artifactName.length - srcLibSuffix.length),
      type: 'library',
    };
  }

  if (artifactName.endsWith(srcTplSuffix)) {
    return {
      ...pkgAndVersion,
      id: artifactName.substring(0, artifactName.length - srcTplSuffix.length),
      type: 'template',
    };
  }

  if (artifactName.endsWith(srcSoftwareSuffix)) {
    return {
      ...pkgAndVersion,
      id: artifactName.substring(0, artifactName.length - srcSoftwareSuffix.length),
      type: 'software',
    };
  }

  if (artifactName.endsWith(srcAssetSuffix)) {
    return {
      ...pkgAndVersion,
      id: artifactName.substring(0, artifactName.length - srcAssetSuffix.length),
      type: 'asset',
    };
  }

  if (artifactName.endsWith(srcTestSuffix)) {
    return {
      ...pkgAndVersion,
      id: artifactName.substring(0, artifactName.length - srcTestSuffix.length),
      type: 'test',
    };
  }

  return null;
}

export function compile(logger: winston.Logger, mode: CompileMode): TemplatesAndLibs {
  const packageInfo = getPackageInfo();
  const compiler = newCompiler(logger, packageInfo, mode);
  const sources = parseSources(logger, packageInfo, mode, 'src', '');

  // checking that we have something to do
  if (sources.length === 0) {
    const lookFor: string[] = [];
    for (const suffix of compilableSuffixes) {
      lookFor.push(`*${suffix}`);
    }

    logger.error(`Nothing to compile. Looked for ${lookFor.join(', ')}`);
    process.exit(1);
  }

  // compilation
  logger.info(`Compiling '${mode}'...`);
  const compiled = compiler.compileAndAdd(sources);
  logger.debug(`Done.`);

  return compiled;
}

export function savePacks(logger: winston.Logger, compiled: TemplatesAndLibs, mode: CompileMode) {
  // writing libs
  if (compiled.libs.length > 0) {
    const libOutput = resolveLibsDst(mode, '.');
    fs.mkdirSync(libOutput, { recursive: true });
    for (const lib of compiled.libs) {
      const file = path.resolve(libOutput, lib.fullName.id + compiledLibSuffix);
      logger.info(`  - writing ${file}`);
      fs.writeFileSync(file, lib.src);
    }
  }

  // writing templates
  if (compiled.templates.length > 0) {
    const tplOutput = resolveTemplatesDst(mode, '.');
    fs.mkdirSync(tplOutput, { recursive: true });
    for (const tpl of compiled.templates) {
      const file = path.resolve(tplOutput, tpl.fullName.id + compiledTplSuffix);
      logger.info(`  - writing ${file}`);
      fs.writeFileSync(file, tpl.content);
    }
  }

  // writing software
  if (compiled.software.length > 0) {
    const swOutput = resolveSoftwareDst(mode, '.');
    fs.mkdirSync(swOutput, { recursive: true });
    for (const sw of compiled.software) {
      const file = path.resolve(swOutput, sw.fullName.id + compiledSoftwareSuffix);
      logger.info(`  - writing ${file}`);
      fs.writeFileSync(file, sw.src);
    }
  }

  // writing assets
  if (compiled.assets.length > 0) {
    const swOutput = resolveAssetsDst(mode, '.');
    fs.mkdirSync(swOutput, { recursive: true });
    for (const sw of compiled.software) {
      const file = path.resolve(swOutput, sw.fullName.id + compiledAssetSuffix);
      logger.info(`  - writing ${file}`);
      fs.writeFileSync(file, sw.src);
    }
  }
}
