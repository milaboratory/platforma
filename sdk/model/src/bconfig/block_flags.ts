import type { ArrayTypeUnion, Assert, Is, IsSubtypeOf } from './utils';

/**
 * Block-specific feature flags. Define flags that are interpreted by the desktop app to select
 * appropriate API to expose into Model and UI runtimes.
 *
 * Flags are split into two categories:
 *   - supports... - those flags tells the desktop app that the block supports certain APIs, but can without them as well
 *   - requires... - those flags tells the desktop app that the block requires certain APIs, and if desktop app doesn't support it, it can't be used in the block
 */
export type BlockCodeFeatureFlags = Record<`supports${string}`, boolean | undefined> & Record<`requires${string}`, boolean | undefined>;

export type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
};

export const AllSupportsFeatureFlags
  = ['supportsLazyState'] as const;

export const AllRequiresFeatureFlags
  = [] as const;

export function checkFlag(flags: BlockCodeFeatureFlags | undefined, flag: `requires${string}` | `supports${string}`): boolean {
  if (flags === undefined) return false;
  return flags[flag] === true;
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

//
// Assertions
//

// This assertion ensures that BlockConfigV3KnownFeatureFlags is a subtype of BlockConfigV3FeatureFlags.
// It will produce a compile-time error if there's a mismatch.
type _KnownFlagsAreValidFlags = Assert<IsSubtypeOf<BlockCodeKnownFeatureFlags, BlockCodeFeatureFlags>>;

// This check ensures that all keys in BlockConfigV3FeatureFlags are covered in the arrays above.
// It will produce a compile-time error if there's a mismatch.
type _AllFlagsAreCovered = Assert<
  Is<
    keyof BlockCodeKnownFeatureFlags,
    ArrayTypeUnion<typeof AllRequiresFeatureFlags, typeof AllSupportsFeatureFlags>
  >
>;
