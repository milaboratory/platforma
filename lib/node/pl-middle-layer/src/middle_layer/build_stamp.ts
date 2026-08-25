/** Injected by rolldown at build time, see `build.node.config.js`. Absent when the package is
 *  consumed straight from sources (`USE_SOURCES=1`), because no build step runs then. */
declare const __PL_ML_BUILD_STAMP__: string | undefined;

function injectedStamp(): string | undefined {
  try {
    // Read inside a try: with no build step the identifier is an undeclared global, and
    // reading it throws a ReferenceError rather than yielding undefined.
    return __PL_ML_BUILD_STAMP__;
  } catch {
    return undefined;
  }
}

/**
 * Identifies the build of this package, and through it the rules that shape what a persisted
 * tree mirror contains: the pruning function, the field filter and the traversal stop rules,
 * all of which live in this package. (The finality predicate comes from pl-client and is NOT
 * covered, which is harmless: finality is recomputed on restore, so it is the one rule that
 * cannot poison a stored file.)
 *
 * Used as a cache-key component, so a change to those rules invalidates every snapshot, costing
 * one cold open. Each built artifact bakes in one stamp, so reopens stay warm across restarts
 * of an installed version. A build from a dirty worktree includes the build time, so editing
 * those rules locally can never hit a snapshot written under the old ones. In practice release
 * builds are dirty too, because CI writes version bumps into the worktree before building; that
 * costs nothing, since the stamp only has to be stable within an artifact.
 *
 * With no build at all (sources mode) the value is a constant. That deliberately trades away
 * the dirty-worktree guarantee: it means someone running from sources exercises the restore
 * path at all, rather than every snapshot being a guaranteed miss for the one audience most
 * likely to find its defects. The exposure it reintroduces, editing pruning rules from sources
 * and hitting a mirror written under the old ones, is the local-development gap the design
 * already accepts, and `treeSnapshots: false` or deleting the directory clears it.
 */
export const ML_BUILD_STAMP: string = injectedStamp() ?? "sources";
