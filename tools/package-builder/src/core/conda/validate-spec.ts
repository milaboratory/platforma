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

const FORBIDDEN_CHANNELS = ['main', 'r', 'msys2'];
const FORBIDDEN_CHANNEL_URL_PATTERNS = [
  // Matches URLs like https://repo.anaconda.com/pkgs/main or http://any-domain.com/pkgs/r
  /^https?:\/\/.*\/pkgs\/(main|r|msys2)\/?$/i,
  // Matches URLs like https://anaconda.com/something/main or https://anaconda.org/path/r
  /^https?:\/\/.*anaconda\.(com|org)\/.*\/(main|r|msys2)\/?$/i,
  // Matches URLs like https://anaconda.org/main (directly after domain)
  /^https?:\/\/.*anaconda\.(com|org)\/(main|r|msys2)\/?$/i,
];
const DEFAULT_CHANNEL_NAME = 'defaults'; // defaults channel includes 'main'

/**
 * Validates a conda spec file to ensure it doesn't use forbidden channels
 * @param specPath Path to the conda spec file
 * @param logger Winston logger instance
 * @throws Error if forbidden channels are found
 */
export function validateCondaSpec(specPath: string, logger: winston.Logger): void {
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
 * @param channels Array of channel names (can be names or URLs)
 * @returns Array of error messages for forbidden channels
 */
function validateChannels(channels: string[]): string[] {
  const errors: string[] = [];

  for (const channel of channels) {
    const channelTrimmed = channel.trim();
    const channelLower = channelTrimmed.toLowerCase();

    // Check explicit channel names
    if (FORBIDDEN_CHANNELS.includes(channelLower)) {
      errors.push(`  - Forbidden channel '${channelTrimmed}' in channels list`);
      continue;
    }

    // Check 'defaults' channel (includes 'main')
    if (channelLower === DEFAULT_CHANNEL_NAME) {
      errors.push(`  - Forbidden channel '${channelTrimmed}' (includes 'main') in channels list`);
      continue;
    }

    // Check URL formats for forbidden channels
    for (const pattern of FORBIDDEN_CHANNEL_URL_PATTERNS) {
      if (pattern.test(channelTrimmed)) {
        errors.push(`  - Forbidden channel URL '${channelTrimmed}' in channels list`);
        break;
      }
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

      // Check 'defaults' channel prefix (includes 'main')
      if (channelLower === DEFAULT_CHANNEL_NAME) {
        errors.push(`  - Forbidden channel prefix '${channel}::' (includes 'main') in dependency '${dep}'`);
      }

      // Check URL-based channel prefixes (rare but possible)
      for (const pattern of FORBIDDEN_CHANNEL_URL_PATTERNS) {
        if (pattern.test(channel)) {
          errors.push(`  - Forbidden channel URL prefix in dependency '${dep}'`);
          break;
        }
      }
    }
  }

  return errors;
}
