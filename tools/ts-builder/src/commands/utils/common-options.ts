import { Command } from 'commander';

export interface GlobalOptions {
  target: string;
  buildConfig?: string;
  serveConfig?: string;
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

export function getTarget(options: CommandOptions, globalOpts: GlobalOptions): string {
  const target = options.target || globalOpts.target;
  
  if (!target) {
    console.error('Target type is required. Use --target flag.');
    process.exit(1);
  }
  
  return target;
}

export function validateTargetForBrowser(target: string): void {
  if (target !== 'browser' && target !== 'browser-lib') {
    console.error(`This command only works with browser/browser-lib projects. Current target: ${target}`);
    process.exit(1);
  }
}
