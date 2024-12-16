import fs from 'fs';
import path from 'path';
import * as winston from 'winston';
import * as process from 'process';

export function createLogger(level: string = 'debug'): winston.Logger {
  return winston.createLogger({
    level: level,
    format: winston.format.printf(({ level, message }) => {
      const indent = ' '.repeat(level.length + 2); // For ': ' after the level
      if (typeof message !== 'string') {
        const messageJson = JSON.stringify(message);
        throw Error(`logger message ${messageJson} is not a string`);
      }
      const indentedMessage = message
        .split('\n')
        .map((line: string, index: number) => (index === 0 ? line : indent + line))
        .join('\n');

      const colorize = (l: string) => winston.format.colorize().colorize(l, l);

      return `${colorize(level)}: ${indentedMessage}`;
    }),
    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true
      })
    ]
  });
}

export function findPackageRoot(logger: winston.Logger, startPath?: string): string {
  if (!startPath) {
    startPath = process.cwd();
  }

  logger.debug(`Detecting package root...`);
  const pkgRoot = searchPathUp(startPath, startPath, 'package.json');
  logger.debug(`  package root found at '${pkgRoot}'`);

  return pkgRoot;
}

function searchPathUp(startPath: string, pathToCheck: string, itemToCheck: string): string {
  const itemPath = path.resolve(pathToCheck, itemToCheck);

  if (fs.existsSync(itemPath)) {
    return pathToCheck;
  }

  const parentDir = path.dirname(pathToCheck);
  if (parentDir === pathToCheck || pathToCheck === '') {
    throw new Error(
      `failed to find '${itemToCheck}' file in any of parent directories starting from '${startPath}'`
    );
  }

  return searchPathUp(startPath, parentDir, itemToCheck);
}

export function parseOclifConfig(packageJson: any) {
  if (!packageJson.oclif || !packageJson.oclif.commands) {
    throw new Error('Invalid oclif configuration in package.json');
  }
  return packageJson.oclif.commands;
}

/**
 * Searches for the command name in the specified file.
 * @param filePath - The path to the file to be searched.
 * @returns The command name if found, otherwise null.
 */
export function getCommandInfo(filePath: string): {
  className: string;
  isDefaultExport: boolean;
} {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const commandNamePattern =
    /export\s+(default\s+)?class\s+(\w+)\s+extends\s+(oclif|core\.)?Command\s*{?/;
  const match = fileContent.match(commandNamePattern);
  if (match) {
    return {
      className: match[2],
      isDefaultExport: !!match[1]
    };
  }

  const processorDirectivePattern =
    /^[\t ]*\/\/oclif-index:\s*export-command[\t ]*(?:\r?\n|\r)[\t ]*export[\t ]+default[\t ]+(?:class[\t ]*)?(?<className>[a-zA-Z0-9-_]+)/m;
  const matchDirective = fileContent.match(processorDirectivePattern);
  if (matchDirective) {
    return {
      className: matchDirective.groups!.className,
      isDefaultExport: true
    };
  }

  return {
    className: '',
    isDefaultExport: false
  };
}
