import type { ArrayTypeUnion, Assert, Is, IsSubtypeOf } from './type_utils';

/**
 * Block-specific feature flags. Define flags that are interpreted by the desktop app to select
 * appropriate API to expose into Model and UI runtimes.
 *
 * Flags are split into two categories:
 *   - supports... - those flags tells the desktop app that the block supports certain APIs, but can without them as well
 *   - requires... - those flags tells the desktop app that the block requires certain APIs, and if desktop app doesn't support it, it can't be used in the block
 */
export type BlockCodeFeatureFlags = Record<`supports${string}`, boolean | number | undefined> & Record<`requires${string}`, boolean | number | undefined>;

export type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
  readonly requiresUIAPIVersion?: number;
};

export const AllSupportsFeatureFlags
  = ['supportsLazyState'] as const;

export const AllRequiresFeatureFlags
  = ['requiresUIAPIVersion'] as const;

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
