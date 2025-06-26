import type { BlockCodeFeatureFlags, BlockCodeKnownFeatureFlags } from './block_flags';
import type { FilterKeysByPrefix } from './type_utils';

export function checkBlockFlag(flags: BlockCodeFeatureFlags | undefined, flag: keyof BlockCodeKnownFeatureFlags, flagValue: boolean | number = true): boolean {
  if (flags === undefined) return false;
  return flags[flag] === flagValue;
}

/**
   * Extracts all requirements from the feature flags.
   * @param flags - The feature flags.
   * @returns A set of requirements.
   */
export function extractAllRequirements(flags: BlockCodeFeatureFlags | undefined): Set<`requires${string}`> {
  if (flags === undefined) return new Set();
  return new Set(Object.entries(flags)
    .filter(([key, value]) => key.startsWith('requires') && value === true)
    .map(([key]) => key as `requires${string}`));
}

/**
   * Extracts all supports from the feature flags.
   * @param flags - The feature flags.
   * @returns A set of supports.
   */
export function extractAllSupports(flags: BlockCodeFeatureFlags | undefined): Set<`supports${string}`> {
  if (flags === undefined) return new Set();
  return new Set(Object.entries(flags)
    .filter(([key, value]) => key.startsWith('supports') && value === true)
    .map(([key]) => key as `supports${string}`));
}

export class IncompatibleFlagsError extends Error {
  name = 'IncompatibleFlagsError';
  constructor(public readonly incompatibleFlags: Map<`requires${string}`, number | boolean>) {
    super(`Some of the block requirements are not supported by the runtime: ${Array.from(incompatibleFlags.entries()).map(([key, value]) => `${key}: ${value}`).join(', ')}`);
  }
}

/**
   * A type that represents a supported requirement.
   * @remarks
   * This type is used to represent a supported requirement.
   * It is a subtype of `BlockCodeKnownFeatureFlags` and is used to represent a supported requirement.
   * It is used to represent a supported requirement.
   */
export type SupportedRequirement = FilterKeysByPrefix<BlockCodeKnownFeatureFlags, 'requires'>;

export class RuntimeCapabilities {
  private readonly supportedRequirements: Map<`requires${string}`, Set<number | boolean>> = new Map();

  /**
     * Adds a supported requirement to the runtime capabilities.
     * @param requirement - The requirement.
     * @param value - The value of the requirement. If not provided, defaults to true.
     */
  public addSupportedRequirement(requirement: SupportedRequirement, value: number | boolean = true): this {
    if (!this.supportedRequirements.has(requirement)) {
      this.supportedRequirements.set(requirement, new Set());
    }
    this.supportedRequirements.get(requirement)!.add(value);
    return this;
  }

  /**
     * Returns a map of incompatible flags. If the block flags are compatible, returns undefined.
     * @param blockFlags - The block flags.
     * @returns A map of incompatible flags, or undefined if the block flags are compatible.
     */
  public getIncompatibleFlags(blockFlags: BlockCodeFeatureFlags | undefined): Map<`requires${string}`, number | boolean> | undefined {
    if (blockFlags === undefined) return undefined;
    const incompatibleFlags = new Map<`requires${string}`, number | boolean>();
    for (const [key, value] of Object.entries(blockFlags)) {
      if (key.startsWith('requires')) {
        if (value === undefined) continue;
        const supportedValues = this.supportedRequirements.get(key as `requires${string}`);
        if (supportedValues !== undefined && !supportedValues.has(value as number | boolean)) {
          incompatibleFlags.set(key as `requires${string}`, value as number | boolean);
        }
      }
    }
    return incompatibleFlags.size === 0 ? undefined : incompatibleFlags;
  }

  /**
     * Checks if the block flags are compatible with the runtime capabilities.
     * @param blockFlags - The block flags.
     * @returns True if the block flags are compatible, false otherwise.
     */
  public checkCompatibility(blockFlags: BlockCodeFeatureFlags | undefined): boolean {
    return this.getIncompatibleFlags(blockFlags) === undefined;
  }

  /**
     * Throws an error if the block flags are incompatible with the runtime capabilities.
     * @param blockFlags - The block flags.
     * @throws IncompatibleFlagsError if the block flags are incompatible with the runtime capabilities.
     */
  public throwIfIncompatible(blockFlags: BlockCodeFeatureFlags | undefined) {
    const incompatibleFlags = this.getIncompatibleFlags(blockFlags);
    if (incompatibleFlags !== undefined)
      throw new IncompatibleFlagsError(incompatibleFlags);
  }
}
