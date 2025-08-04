import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TargetType } from './config-manager';

/**
 * Resolves the path to an executable in the ts-builder's node_modules/.bin directory
 * This ensures that ts-builder is self-contained and can work outside of monorepo
 */
export function resolveExecutable(executableName: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Navigate to ts-builder root from tools/ts-builder/dist/commands/utils/
  const jsBuilderRoot = resolve(__dirname, '../../../');
  return resolve(jsBuilderRoot, 'node_modules/.bin', executableName);
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
