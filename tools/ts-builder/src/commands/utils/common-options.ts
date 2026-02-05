import type { Command } from 'commander';
import type { TargetType } from './config-manager';

export interface GlobalOptions {
  target: TargetType;
  buildConfig?: string;
  serveConfig?: string;
  useSources?: boolean;
}

export interface CommandOptions {
  watch?: boolean;
  port?: string;
  host?: string;
  project?: string;
  target?: string;
}

export function getGlobalOptions(command: Command): GlobalOptions {
  return (command.parent?.opts() || {}) as GlobalOptions;
}

export function requireTarget(globalOpts: GlobalOptions): TargetType {
  if (!globalOpts.target) {
    console.error('Target type is required. Use --target flag.');
    process.exit(1);
  }
  return globalOpts.target;
}

export function getTarget(options: CommandOptions, globalOpts: GlobalOptions): string {
  const target = options.target || globalOpts.target;

  if (!target) {
    console.error('Target type is required. Use --target flag.');
    process.exit(1);
  }

  return target;
}

export function validateTargetForBrowser(target: TargetType): void {
  if (target !== 'browser' && target !== 'browser-lib' && target !== 'block-ui') {
    console.error(`This command only works with browser/browser-lib/block-ui projects. Current target: ${target}`);
    process.exit(1);
  }
}
