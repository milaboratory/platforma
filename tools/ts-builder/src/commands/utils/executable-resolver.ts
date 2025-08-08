import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { TargetType } from './config-manager';

/**
 * Resolves the path to an executable in the ts-builder's node_modules/.bin directory
 * This ensures that ts-builder is self-contained and can work outside of monorepo
 */
export function resolveExecutable(executableName: string): string {
  const from = dirname(import.meta.url);
  const req = createRequire(join(from, 'package.json'));
  const pkgJsonPath = req.resolve(`${executableName}/package.json`);
  const meta = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const binField = meta.bin;
  const rel = typeof binField === 'string'
    ? binField
    : binField?.[executableName] ?? Object.values(binField ?? {})[0];

  if (!rel) throw new Error(`Cannot find "bin" for ${executableName}`);

  return join(dirname(pkgJsonPath), rel);
}

/**
 * Resolves the appropriate type checker executable based on target
 */
export function resolveTypeChecker(target: TargetType): string {
  const commandName = (target === 'browser' || target === 'browser-lib') ? 'vue-tsc' : 'tsc';
  return resolveExecutable(commandName);
}

/**
 * Resolves vite executable
 */
export function resolveVite(): string {
  return resolveExecutable('vite');
}

/**
 * Resolves rollup executable
 */
export function resolveRollup(): string {
  return resolveExecutable('rollup');
}
