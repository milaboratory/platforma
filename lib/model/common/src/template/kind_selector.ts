import type { Branded } from "@milaboratories/helpers";
import type { BlockKindReference } from "../bmodel/block_kind_ref";
import { parseKindRef, splitVersionedName } from "../bmodel/block_kind_ref";

/**
 * Version-selection tier of a template entry's `kind` field (A-0034, A-0036).
 *
 * - `exact` — `X.Y.Z`: this version and no other.
 * - `patch` — `~X.Y.Z`: patch floor, behavior frozen.
 * - `minor` — `^X.Y.Z`: minor floor, behavior floats.
 */
export type KindSelectorOp = "exact" | "patch" | "minor";

/** The version half of a `{name}@{selector}` kind reference, split into parts. */
export type KindSelector = {
  readonly op: KindSelectorOp;
  readonly version: string;
};

/**
 * On-wire reference to a *set* of block kind versions: `{name}@{selector}`, e.g.
 * `@platforma-open/milaboratories.mixcr-clonotyping.kind@~1.2.0`.
 *
 * The template-file form of a kind reference, and the only form the
 * `template-v1` schema accepts in an entry's `kind` field. It is the same string
 * shape as {@link BlockKindReference} widened by the `~`/`^` tiers, but branded
 * separately so a *resolved* kind reference is never silently passed where a
 * selector is expected, or vice versa. Widen an exact reference explicitly with
 * {@link kindReferenceToSelectorReference}.
 */
export type BlockKindSelectorReference = Branded<string, "BlockKindSelectorReference">;

/** `X.Y.Z` with optional semver prerelease and build metadata. */
const semVerRegex =
  /^\d+\.\d+\.\d+(?:-[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/;

/**
 * Split a raw selector string (`1.2.0`, `~1.2.0`, `^1.2.0`) into its parts.
 *
 * The version is validated as `X.Y.Z`, so a range that is legal npm but not part
 * of the kind grammar (`>=1.0.0`, `1.x`, `latest`) is rejected here rather than
 * reaching resolution. Note the deliberate divergence from
 * `tools/block-tools`'s `parseSelector`, which additionally tolerates a leading
 * `@` as `exact`: after the `{name}@{selector}` split a leading `@` can only
 * come from a doubled separator, which is malformed.
 *
 * Mapping a selector onto a concrete version is resolution, not parsing, and
 * lives with the resolver (`kind_resolver.selectorToRange`).
 *
 * @throws if the version part is not `X.Y.Z`
 */
export function parseKindSelector(raw: string): KindSelector {
  const s = raw.trim();
  const op: KindSelectorOp = s.startsWith("~") ? "patch" : s.startsWith("^") ? "minor" : "exact";
  const version = op === "exact" ? s : s.slice(1);
  if (!semVerRegex.test(version)) {
    throw new Error(
      `Malformed kind version selector (expected 'X.Y.Z', '~X.Y.Z' or '^X.Y.Z'): ${raw}`,
    );
  }
  return { op, version };
}

/** Render a {@link KindSelector} back to its on-wire string. */
export function formatKindSelector(sel: KindSelector): string {
  switch (sel.op) {
    case "exact":
      return sel.version;
    case "patch":
      return `~${sel.version}`;
    case "minor":
      return `^${sel.version}`;
  }
}

/**
 * Split a {@link BlockKindSelectorReference} into `{ name, selector }`.
 *
 * @throws if the reference carries no version segment, or the selector is
 *   outside the `X.Y.Z` / `~X.Y.Z` / `^X.Y.Z` grammar
 */
export function parseKindSelectorReference(ref: BlockKindSelectorReference): {
  name: string;
  selector: KindSelector;
} {
  const { name, version } = splitVersionedName(ref, "kind selector reference", "{name}@{selector}");
  return { name, selector: parseKindSelector(version) };
}

/**
 * Compose a {@link BlockKindSelectorReference} from a name and selector.
 *
 * A formatter, not a validator — pass a selector that came from
 * {@link parseKindSelector} or that you constructed from a known-good version.
 */
export function formatKindSelectorReference(k: {
  name: string;
  selector: KindSelector;
}): BlockKindSelectorReference {
  return `${k.name}@${formatKindSelector(k.selector)}` as BlockKindSelectorReference;
}

/**
 * Widen a resolved {@link BlockKindReference} to its `exact`-tier selector form.
 *
 * The export direction: a block implements exactly one kind version, so export
 * always emits `{name}@X.Y.Z` (A-0041). Validates on the way through, so a
 * malformed stored reference fails at the boundary rather than in the file.
 */
export function kindReferenceToSelectorReference(
  ref: BlockKindReference,
): BlockKindSelectorReference {
  const { name, version } = parseKindRef(ref);
  return formatKindSelectorReference({ name, selector: parseKindSelector(version) });
}

/** Whether `value` is a well-formed `{name}@{selector}` string. */
export function isBlockKindSelectorReference(value: unknown): value is BlockKindSelectorReference {
  if (typeof value !== "string") return false;
  try {
    parseKindSelectorReference(value as BlockKindSelectorReference);
    return true;
  } catch {
    return false;
  }
}
