import type { BlockPackId } from "@milaboratories/pl-model-middle-layer";
import { AnyChannel, StableChannel } from "@milaboratories/pl-model-middle-layer";
import * as semver from "semver";
import type { KindOverview } from "./schema_kinds";

/**
 * PURE, IO-free block-kind resolution core.
 *
 * Given a parsed {@link KindOverview} projection (fetched by the reader) and a
 * version selector, this module answers "which concrete implementing block
 * satisfies `{name}@{selector}`?" with a discriminated {@link KindResolution}.
 *
 * Everything here is fed literals in unit tests — no `FolderReader`, no cache,
 * no `semver` use beyond range math. This is the net-new, correctness-critical
 * seam (implementation-path §6): selector→range translation and channel
 * selection each have edges worth isolating and testing.
 *
 * Naming: this module never parses the `{name}@{version}` *reference* string
 * (that codec is `parseKindRef`, block_kind_ref.ts) nor the npm-name→path split
 * (`npmNameToKindPath`, schema_kinds.ts). It consumes an already-split selector.
 */

/**
 * The three version-selector tiers of the redefined-semver scheme
 * (01-kind-and-lifecycle.md:63):
 *   - `exact` — `@X.Y.Z`, pin to one version.
 *   - `patch` — `~X.Y.Z`, behavior frozen (patch floats).
 *   - `minor` — `^X.Y.Z`, behavior floats (minor floats).
 */
export type SelectorOp = "exact" | "patch" | "minor";

export interface Selector {
  op: SelectorOp;
  version: string;
}

/**
 * Split a raw selector string into its {@link Selector} operator + version.
 *
 * The leading character encodes the tier: `~`→patch, `^`→minor, `@`→exact.
 * A bare version (no recognized leading operator) is treated as `exact`. Note
 * that `@` as a *leading* char is redundant with the bare form and accepted
 * only because the reference form is `{name}@{version}` — after `parseKindRef`
 * splits on the final `@`, the version half is normally bare or `~`/`^`-prefixed.
 */
export function parseSelector(raw: string): Selector {
  const s = raw.trim();
  switch (s[0]) {
    case "~":
      return { op: "patch", version: s.slice(1) };
    case "^":
      return { op: "minor", version: s.slice(1) };
    case "@":
      return { op: "exact", version: s.slice(1) };
    default:
      return { op: "exact", version: s };
  }
}

/**
 * Map a {@link Selector} to a semver range string:
 *   - `exact` — `=X.Y.Z`
 *   - `patch` — `>=X.Y.Z <X.(Y+1).0-0`, behavior frozen, params float
 *   - `minor` — `>=X.Y.Z <(X+1).0.0-0`, behavior floats, never crosses a params-break
 *
 * The kind scheme redefines the *meaning* of major/minor/patch, not the range
 * arithmetic — so the arithmetic is written out here rather than delegated to
 * npm's `~`/`^` operators, which are not major-agnostic. Below 1.0.0 npm expands
 * both `^0.2.3` and `~0.2.3` to `>=0.2.3 <0.3.0-0`, treating a `0.x` minor as the
 * breaking boundary per ecosystem convention. Under the kind scheme a
 * params-break is a MAJOR bump at every major including zero, and nothing
 * guarantees a kind starts at `1.0.0`, so borrowing `^` would silently collapse
 * `patch` and `minor` into one tier for any `0.x` kind — erasing the distinction
 * the whole scheme rests on.
 *
 * For `X >= 1` these forms are equivalent to `~`/`^`, down to npm's `-0`
 * upper-bound suffix that keeps prereleases of the boundary out of range.
 *
 * @throws if `sel.version` is not a valid semver version. {@link parseSelector}
 *   does not validate it; the model-side `parseKindSelector` does.
 */
export function selectorToRange(sel: Selector): string {
  if (sel.op === "exact") return `=${sel.version}`;
  const major = semver.major(sel.version);
  const minor = semver.minor(sel.version);
  const upperBound = sel.op === "patch" ? `${major}.${minor + 1}.0` : `${major + 1}.0.0`;
  return `>=${sel.version} <${upperBound}-0`;
}

/**
 * Outcome of resolving a kind reference against its overview projection.
 *
 * The three failure reasons are distinct on purpose (the caller maps each to a
 * different user-facing error):
 *   - `no-matching-kind-version` — the selector satisfies zero kind versions
 *     (`maxSatisfying` returned `null`).
 *   - `no-implementation` — a kind version matched, but it has no implementing
 *     block at all.
 *   - `no-stable-implementation` — implementing blocks exist for the matched
 *     kind version, but none is on the `stable` channel and `allowUnstable` is
 *     off.
 */
export type KindResolution =
  | { ok: true; blockId: BlockPackId; channel: string }
  | { ok: false; reason: "no-matching-kind-version" }
  | { ok: false; reason: "no-implementation" }
  | { ok: false; reason: "no-stable-implementation" };

export type KindResolutionReason = Extract<KindResolution, { ok: false }>["reason"];

/**
 * Typed error the reader/facade throw when {@link resolveKind} fails, carrying
 * the discriminated {@link KindResolutionReason} and the offending reference so
 * a caller can map it to a spec-level error without re-deriving the reason.
 */
export class KindResolutionError extends Error {
  constructor(
    public readonly reason: KindResolutionReason,
    public readonly ref: string,
  ) {
    super(`Cannot resolve block kind "${ref}": ${reason}`);
    this.name = "KindResolutionError";
  }
}

/**
 * Newest implementing block for `(kindVersion, channel)` from the flat
 * `implementers` list — the RMW source of truth. Newest by *block* version via
 * `semver.gt`. Under `allowUnstable` every implementer of the kind version is
 * eligible regardless of channel membership (the `AnyChannel` view); otherwise
 * only implementers published to `channel` count.
 */
function pickNewestImplementer(
  implementers: KindOverview["implementers"],
  kindVersion: string,
  channel: string,
  allowUnstable: boolean,
): BlockPackId | undefined {
  const candidates = implementers.filter(
    (i) => semver.eq(i.kindVersion, kindVersion) && (allowUnstable || i.channels.includes(channel)),
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (semver.gt(b.id.version, a.id.version) ? b : a)).id;
}

/**
 * Resolve a kind reference to a concrete implementing block.
 *
 * 1. Pick the newest kind version satisfying the selector via
 *    `semver.maxSatisfying` over the overview's `kindVersions`.
 * 2. Select the target channel: `stable` by default, `any` when `allowUnstable`
 *    is set (the apply-time flag).
 * 3. Pick the newest implementing block in that `(version, channel)` via
 *    `semver.gt`, reading the flat `implementers` source of truth and falling
 *    back to the derived `latestByChannel` projection for older overviews.
 *
 * @param overview parsed & normalized kind projection (reader-supplied).
 * @param selector either a raw selector string (`^1.2.3`, `~1.2.3`, `1.2.3`)
 *   or a pre-parsed {@link Selector}.
 */
export function resolveKind(
  overview: KindOverview,
  selector: string | Selector,
  opt: { allowUnstable: boolean },
): KindResolution {
  const sel = typeof selector === "string" ? parseSelector(selector) : selector;
  const range = selectorToRange(sel);

  const versions = overview.kindVersions.map((v) => v.kindVersion);
  const picked = semver.maxSatisfying(versions, range);
  if (picked === null) return { ok: false, reason: "no-matching-kind-version" };

  const entry = overview.kindVersions.find((v) => semver.eq(v.kindVersion, picked));
  const channel = opt.allowUnstable ? AnyChannel : StableChannel;

  const blockId =
    pickNewestImplementer(overview.implementers, picked, channel, opt.allowUnstable) ??
    entry?.latestByChannel[channel];
  if (blockId) return { ok: true, blockId, channel };

  // Nothing in the target channel. Distinguish "no implementer at all" from
  // "implementers exist but none stable". When `allowUnstable` is set the target
  // channel is `any`, so an empty result here always means zero implementers.
  const hasAnyImpl =
    overview.implementers.some((i) => semver.eq(i.kindVersion, picked)) ||
    (entry !== undefined && Object.keys(entry.latestByChannel).length > 0);

  if (!hasAnyImpl) return { ok: false, reason: "no-implementation" };
  return { ok: false, reason: "no-stable-implementation" };
}
