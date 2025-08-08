import { TargetType } from './config-manager';

export function resolveExecutable(executableName: string): string {
  return `npx ${executableName}`;
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
