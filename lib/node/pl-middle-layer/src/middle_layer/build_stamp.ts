import { randomUUID } from "node:crypto";

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
 * Identifies the build of this package, and through it every rule that shapes what a
 * persisted tree mirror contains: the pruning function, the field filter, the traversal stop
 * rules and the finality predicate all live in this package or in one it pins.
 *
 * Used as a cache-key component, so any change to those rules invalidates every snapshot,
 * costing one cold open. A build from a clean worktree stamps its commit, so released builds
 * share a stamp and reopens stay warm across restarts. A build from a dirty worktree stamps
 * the build time as well, so editing those rules locally can never hit a snapshot written
 * under the old ones.
 *
 * With no build at all (sources mode) the value is unique per process, so nothing ever hits.
 * That is the safe direction: an unbuilt tree has no way to say which rules were in force.
 */
export const ML_BUILD_STAMP: string = injectedStamp() ?? `unbuilt-${randomUUID()}`;
