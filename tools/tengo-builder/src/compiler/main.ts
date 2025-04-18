#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathType } from './util';
import type { TemplatesAndLibs } from './compiler';
import { TengoTemplateCompiler } from './compiler';
import { getSha256 } from './source';
import type {
  CompileMode,
  FullArtifactName } from './package';
import {
  fullNameToString,
  typedArtifactNameToString,
} from './package';
import { ArtifactSource, parseSourceFile } from './source';
import { newTemplateFromContent, templateToSource } from './template';
import type winston from 'winston';
import { tryResolve, tryResolveOrError } from '@milaboratories/resolve-helper';
import { serializeTemplate } from '@milaboratories/pl-model-backend';

interface PackageId {
  /** Package name from package.json */
  readonly name: string;
  /** Package version from package.json */
  readonly version: string;
}

interface PackageInfo extends PackageId {
  /** Package type from package.json */
  readonly type: string | undefined;
  /** Path to package root */
  readonly root: string;
  /** Context of package info */
  readonly context: PackageInfoContext;
  /** Dependencies */
  readonly dependencies: PackageInfo[];
}

interface PackageJson {
  name: string;
  version: string;
  type: string | undefined;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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

/**
 * Resolves path to package.json file of the given dependency package.
 */
function resolvePackageJsonPackage(root: string, depPackageName: string): string | undefined {
  if (!path.isAbsolute(root)) {
    throw new Error(`Root path must be absolute: ${root}`);
  }

  // First approach: resolving package's main entry point and try to find package.json
  // in dir tree upwards.
  let resolved = tryResolve(root, depPackageName);
  if (resolved) {
    let depth = 0;
    do {
      const p = path.join(resolved, 'package.json');
      if (pathType(p) === 'file')
        return p;
      depth++;
      resolved = path.dirname(resolved);
    } while (depth < 7 && path.basename(resolved) !== 'node_modules');
  }

  // Second approach: trying to find package.json in the package dir.
  const resolved2 = tryResolveOrError(root, `${depPackageName}/package.json`);
  if (resolved2.result === undefined) {
    if (resolved2.err === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
      // tolerating not-exported package.json for dev dependencies
      return undefined;
    throw new Error(`Can't resolve package.json for package ${depPackageName ?? '.'} relative to ${root}`);
  }
  return resolved2.result;
}

export function resolvePackageJsonRoot(root: string): string {
  if (!path.isAbsolute(root)) {
    throw new Error(`Root path must be absolute: ${root}`);
  }

  const p = path.join(root, 'package.json');
  if (pathType(p) === 'file')
    return p;
  throw new Error(`Can't resolve package.json in ${root}`);
}

type PackageInfoContext = 'root' | 'dependency' | 'devDependency';

/**
 * Get package info from package.json and all dependencies.
 */
export function getPackageInfo(
  root: string,
  logger: winston.Logger,
  context: PackageInfoContext = 'root',
): PackageInfo {
  const packageJsonPath = resolvePackageJsonRoot(root);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString()) as PackageJson;

  // resolving dependencies
  const depInfos: PackageInfo[] = [];

  if (packageJson.dependencies && context !== 'devDependency') {
    for (const dep of Object.keys(packageJson.dependencies)) {
      const depPackageJson = resolvePackageJsonPackage(root, dep);
      if (depPackageJson === undefined)
        throw new Error(`Can't resolve package.json for dependency ${dep} of ${root}`);
      const depRoot = path.dirname(depPackageJson);
      depInfos.push(getPackageInfo(depRoot, logger, 'dependency'));
    }
  }

  if (packageJson.devDependencies && context === 'root') {
    for (const dep of Object.keys(packageJson.devDependencies)) {
      const depPackageJson = resolvePackageJsonPackage(root, dep);
      if (depPackageJson === undefined) {
        logger.warn(`Can't resolve package.json for dev dependency ${dep} of ${root}`);
        // tolerating not-exported package.json for dev dependencies
        continue;
      }
      const depRoot = path.dirname(depPackageJson);
      depInfos.push(getPackageInfo(depRoot, logger, 'devDependency'));
    }
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    dependencies: depInfos,
    root,
    context,
  };
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
  packageInfo: PackageInfo,
): void {
  for (const dep of packageInfo.dependencies)
    loadDependencies(logger, compiler, dep);

  if (packageInfo.context === 'root')
    // we are not reading compiled files for root package
    return;

  // we are in package folder
  const libDistFolder = resolveLibsDst('dist', packageInfo.root);
  const tplDistFolder = resolveTemplatesDst('dist', packageInfo.root);
  const softwareDistFolder = resolveSoftwareDst('dist', packageInfo.root);
  const assetDistFolder = resolveAssetsDst('dist', packageInfo.root);

  const libDistExists = pathType(libDistFolder) === 'dir';
  const tplDistExists = pathType(tplDistFolder) === 'dir';
  const softwareDistExists = pathType(softwareDistFolder) === 'dir';
  const assetDistExists = pathType(assetDistFolder) === 'dir';

  if (!libDistExists && !tplDistExists && !softwareDistExists && !assetDistExists)
    // if neither of tengo-specific folders detected, skipping package
    return;

  const packageId = { name: packageInfo.name, version: packageInfo.version };

  if (libDistExists) {
    loadLibsFromDir(logger, packageId, 'dist', libDistFolder, compiler);
  }

  if (tplDistExists) {
    loadTemplatesFromDir(logger, packageId, 'dist', tplDistFolder, compiler);
  }

  if (softwareDistExists) {
    loadSoftwareFromDir(logger, packageId, 'dist', softwareDistFolder, compiler);
  }

  if (assetDistExists) {
    loadAssetsFromDir(logger, packageId, 'dist', assetDistFolder, compiler);
  }
}

function loadLibsFromDir(
  logger: winston.Logger,
  packageId: PackageId,
  mode: CompileMode,
  folder: string,
  compiler: TengoTemplateCompiler,
) {
  for (const f of fs.readdirSync(folder)) {
    const file = path.resolve(folder, f);
    if (!f.endsWith(compiledLibSuffix)) throw new Error(`unexpected file in 'lib' folder: ${file}`);
    const fullName: FullArtifactName = {
      type: 'library',
      pkg: packageId.name,
      id: f.slice(0, f.length - compiledLibSuffix.length),
      version: packageId.version,
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
  packageId: PackageId,
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
      pkg: packageId.name,
      id: f.slice(0, f.length - compiledTplSuffix.length),
      version: packageId.version,
    };
    const tpl = newTemplateFromContent(mode, fullName, fs.readFileSync(file));
    compiler.addTemplate(templateToSource(tpl));
    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
  }
}

function loadSoftwareFromDir(
  logger: winston.Logger,
  packageId: PackageId,
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
      pkg: packageId.name,
      id: f.slice(0, f.length - compiledSoftwareSuffix.length),
      version: packageId.version,
    };

    const source = fs.readFileSync(file).toString();

    const software = new ArtifactSource(
      mode,
      fullName,
      getSha256(source),
      source,
      file,
      [],
      [],
    );

    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    compiler.addSoftware(software);
  }
}

function loadAssetsFromDir(
  logger: winston.Logger,
  packageId: PackageId,
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
      pkg: packageId.name,
      id: f.slice(0, f.length - compiledAssetSuffix.length),
      version: packageId.version,
    };

    const source = fs.readFileSync(file).toString();

    const asset = new ArtifactSource(
      mode,
      fullName,
      getSha256(source),
      source,
      file,
      [],
      [],
    );

    logger.debug(`Adding dependency ${fullNameToString(fullName)} from ${file}`);
    compiler.addAsset(asset);
  }
}

export function parseSources(
  logger: winston.Logger,
  packageId: PackageId,
  mode: CompileMode,
  root: string,
  subdir: string,
): ArtifactSource[] {
  const sources: ArtifactSource[] = [];

  for (const f of fs.readdirSync(path.join(root, subdir))) {
    const inRootPath = path.join(subdir, f); // path to item inside given <root>
    const fullPath = path.join(root, inRootPath); // full path to item from CWD (or abs path, if <root> is abs path)

    if (pathType(fullPath) === 'dir') {
      const nested = parseSources(logger, packageId, mode, root, inRootPath);
      sources.push(...nested);
      continue;
    }

    // Handling index.lib.tengo files: rename them to <package-name>.lib.tengo
    const artifactName = f === 'index.lib.tengo' ? `${path.dirname(inRootPath)}.lib.tengo` : inRootPath;

    const fullName = fullNameFromFileName(packageId, artifactName.replaceAll(path.sep, '.'));
    if (!fullName) {
      logger.info(`Skipping unknown file type: ${artifactName}`);
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
  packageInfo: PackageInfo,
  mode: CompileMode,
): TengoTemplateCompiler {
  const compiler = new TengoTemplateCompiler(mode);

  // collect all data (templates, libs and software) from dependency tree
  loadDependencies(logger, compiler, packageInfo);

  return compiler;
}

export function fullNameFromFileName(
  packageId: PackageId,
  artifactName: string,
): FullArtifactName | null {
  const pkgAndVersion = { pkg: packageId.name, version: packageId.version };
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

export function compile(logger: winston.Logger, packageInfo: PackageInfo, mode: CompileMode): TemplatesAndLibs {
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
      fs.writeFileSync(file, serializeTemplate(tpl.data));
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
