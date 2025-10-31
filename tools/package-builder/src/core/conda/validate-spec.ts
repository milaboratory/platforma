import fs from 'node:fs';
import yaml from 'yaml';
import type winston from 'winston';

export interface CondaSpec {
  channels?: string[];
  dependencies?: (string | Record<string, unknown>)[];
  name?: string;
  prefix?: string;
  [key: string]: unknown;
}

/**
 * Channels that are forbidden because they reference the official Anaconda channel.
 * These channels (main, r, msys2, defaults, anaconda) should be avoided in favor of
 * community-maintained channels like conda-forge to avoid licensing restrictions
 */
const FORBIDDEN_CHANNELS = ['main', 'r', 'msys2', 'defaults', 'anaconda'];

/**
 * Validates a conda spec file to ensure it doesn't use forbidden channels
 * @param logger Winston logger instance
 * @param specPath Path to the conda spec file
 * @throws Error if forbidden channels are found
 */
export function validateCondaSpec(logger: winston.Logger, specPath: string): void {
  logger.debug(`Validating conda spec file: ${specPath}`);

  if (!fs.existsSync(specPath)) {
    throw new Error(`Conda spec file not found: ${specPath}`);
  }

  const specContent = fs.readFileSync(specPath, 'utf-8');
  const spec = yaml.parse(specContent) as CondaSpec;

  if (!spec || typeof spec !== 'object') {
    throw new Error(`Invalid conda spec file format: ${specPath}`);
  }

  const errors: string[] = [];

  if (spec.channels) {
    const channelErrors = validateChannels(spec.channels);
    if (channelErrors.length > 0) {
      errors.push(...channelErrors);
    }
  }

  if (spec.dependencies) {
    const depErrors = validateDependencies(spec.dependencies);
    if (depErrors.length > 0) {
      errors.push(...depErrors);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Conda spec file contains forbidden Anaconda channels:\n${errors.join('\n')}`,
    );
  }

  logger.debug(`Conda spec file validation passed: ${specPath}`);
}

/**
 * Validates that no forbidden channels are in the channels list
 * @param channels Array of channel names
 * @returns Array of error messages for forbidden channels
 */
function validateChannels(channels: string[]): string[] {
  const errors: string[] = [];

  for (const channel of channels) {
    const channelLower = channel.toLowerCase().trim();
    if (FORBIDDEN_CHANNELS.includes(channelLower)) {
      errors.push(`  - Forbidden channel '${channel}' in channels list`);
    }
  }

  return errors;
}

/**
 * Validates that no dependencies use forbidden channel prefixes
 * @param dependencies Array of dependencies (can be strings or objects)
 * @returns Array of error messages for forbidden dependencies
 */
function validateDependencies(dependencies: (string | Record<string, unknown>)[]): string[] {
  const errors: string[] = [];

  for (const dep of dependencies) {
    // Skip non-string dependencies (they might be pip dependencies, etc.)
    if (typeof dep !== 'string') {
      continue;
    }

    // Check if dependency uses channel prefix (format: channel::package)
    if (dep.includes('::')) {
      const [channel, ..._packageParts] = dep.split('::');
      const channelLower = channel.toLowerCase().trim();

      if (FORBIDDEN_CHANNELS.includes(channelLower)) {
        errors.push(`  - Forbidden channel prefix '${channel}::' in dependency '${dep}'`);
      }
    }
  }

  return errors;
}
