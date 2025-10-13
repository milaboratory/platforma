import type winston from 'winston';
import { getPackageInfo, newCompiler, compile, parseSources } from '../compiler/main';
import type { ArtifactType } from '../compiler/package';
import { typedArtifactNameToString } from '../compiler/package';
import type { TemplateDataV3 } from '@milaboratories/pl-model-backend';

export function dumpAll(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
): void {
  const packageInfo = getPackageInfo(process.cwd(), logger);

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  const compiler = newCompiler(logger, packageInfo, 'dist');

  // group output by type:
  //  - all libs
  //  - all templates
  //  - all software
  //  - all assets
  //  - all tests

  // Libs

  for (const lib of compiler.allLibs()) {
    logger.debug(
      `Dumping to pl-tester: ${typedArtifactNameToString(lib.fullName)}`,
    );
    stream.write(JSON.stringify(lib) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'library') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)}`,
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Templates

  for (const tpl of compiler.allTemplates()) {
    logger.debug(
      `Dumping to pl-tester: ${typedArtifactNameToString(tpl.fullName)}`,
    );
    stream.write(JSON.stringify(tpl) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'template') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)} ${
          src.srcName
        }`,
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Software

  for (const sw of compiler.allSoftware()) {
    logger.debug(
      `Dumping to pl-tester: ${typedArtifactNameToString(sw.fullName)}`,
    );
    stream.write(JSON.stringify(sw) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'software') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)}`,
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Assets

  for (const asset of compiler.allAssets()) {
    logger.debug(
      `Dumping to pl-tester: ${typedArtifactNameToString(asset.fullName)}`,
    );
    stream.write(JSON.stringify(asset) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'asset') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)}`,
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Tests

  for (const src of sources) {
    if (src.fullName.type === 'test') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)} ${
          src.srcName
        }`,
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}

export function dumpLibs(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
  recursive: boolean,
): void {
  const packageInfo = getPackageInfo(process.cwd(), logger);

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  if (!recursive) {
    for (const src of sources) {
      if (src.fullName.type === 'library') {
        stream.write(JSON.stringify(src) + '\n');
      }
    }

    return;
  }

  const compiler = newCompiler(logger, packageInfo, 'dist');
  for (const src of sources) {
    if (src.fullName.type === 'library') {
      compiler.addLib(src);
    }
  }

  for (const lib of compiler.allLibs()) {
    stream.write(JSON.stringify(lib) + '\n');
  }
}

function dumpArtifacts(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
  aType: ArtifactType,
): void {
  const packageInfo = getPackageInfo(process.cwd(), logger);

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');
  for (const src of sources) {
    if (src.fullName.type === aType) {
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}

export function dumpTemplates(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
): void {
  dumpArtifacts(logger, stream, 'template');
}

export function dumpSoftware(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
): void {
  const packageInfo = getPackageInfo(process.cwd(), logger);
  const compiled = compile(logger, packageInfo, 'dist');

  const hashes = new Set<string>();
  const sourceMap = new Map<string, string>();
  for (const tpl of compiled.templates) {
    Object.entries(tpl.data.hashToSource).forEach(([hash, src]) => sourceMap.set(hash, src));
    getTemplateSoftware(stream, tpl.data.template).forEach((hash) => hashes.add(hash));
  }

  for (const hash of hashes) {
    const src = sourceMap.get(hash);
    if (src) {
      stream.write(src);
      if (!src.endsWith('\n')) {
        stream.write('\n');
      }
    } else {
      throw new Error(`Source not found for hash: ${hash}`);
    }
  }
}

function getTemplateSoftware(stream: NodeJS.WritableStream, tpl: TemplateDataV3): Set<string> {
  const hashes = new Set<string>();
  for (const sw of Object.values(tpl.software)) {
    hashes.add(sw.sourceHash);
  }
  for (const subTpl of Object.values(tpl.templates)) {
    getTemplateSoftware(stream, subTpl).forEach((hash) => hashes.add(hash));
  }

  return new Set(hashes);
}

export function dumpAssets(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
): void {
  dumpArtifacts(logger, stream, 'asset');
}

export function dumpTests(
  logger: winston.Logger,
  stream: NodeJS.WritableStream,
): void {
  dumpArtifacts(logger, stream, 'test');
}
