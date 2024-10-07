import winston from 'winston';
import { getPackageInfo, newCompiler, parseSources } from '../compiler/main';
import { typedArtifactNameToString } from '../compiler/package';

export function dumpAll(logger: winston.Logger, stream: NodeJS.WritableStream): void {
  const packageInfo = getPackageInfo();

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  const compiler = newCompiler(logger, packageInfo, 'dist');

  // group output by type:
  //  - all libs
  //  - all templates
  //  - all tests

  // Libs

  for (const lib of compiler.allLibs()) {
    logger.debug(`Dumping to pl-tester: ${typedArtifactNameToString(lib.fullName)}`);
    stream.write(JSON.stringify(lib) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'library') {
      logger.debug(`Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)}`);
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Templates

  for (const tpl of compiler.allTemplates()) {
    logger.debug(`Dumping to pl-tester: ${typedArtifactNameToString(tpl.fullName)}`);
    stream.write(JSON.stringify(tpl) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'template') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)} ${src.srcName}`
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Software

  for (const sw of compiler.allSoftware()) {
    logger.debug(`Dumping to pl-tester: ${typedArtifactNameToString(sw.fullName)}`);
    stream.write(JSON.stringify(sw) + '\n');
  }

  for (const src of sources) {
    if (src.fullName.type === 'software') {
      logger.debug(`Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)}`);
      stream.write(JSON.stringify(src) + '\n');
    }
  }

  // Tests

  for (const src of sources) {
    if (src.fullName.type === 'test') {
      logger.debug(
        `Dumping to pl-tester: ${typedArtifactNameToString(src.fullName)} ${src.srcName}`
      );
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}

export function dumpLibs(
  logger: winston.Logger,
  dumpDeps: boolean,
  stream: NodeJS.WritableStream
): void {
  const packageInfo = getPackageInfo();

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  if (!dumpDeps) {
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

export function dumpTemplates(logger: winston.Logger, stream: NodeJS.WritableStream): void {
  const packageInfo = getPackageInfo();

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  for (const src of sources) {
    if (src.fullName.type === 'template') {
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}

export function dumpSoftware(logger: winston.Logger, stream: NodeJS.WritableStream): void {
  const packageInfo = getPackageInfo();

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  for (const src of sources) {
    if (src.fullName.type === 'software') {
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}

export function dumpTests(logger: winston.Logger, stream: NodeJS.WritableStream): void {
  const packageInfo = getPackageInfo();

  const sources = parseSources(logger, packageInfo, 'dist', 'src', '');

  for (const src of sources) {
    if (src.fullName.type === 'test') {
      stream.write(JSON.stringify(src) + '\n');
    }
  }
}
