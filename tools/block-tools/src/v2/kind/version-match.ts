import { parseKindRef, type BlockKindReference } from "@milaboratories/pl-model-common";
import { npmNameToKindPath } from "../registry/schema_kinds";

/**
 * Thrown when the kind version the model was compiled against does not match
 * the kind version the facade ships. Typed so the publish command (and future
 * callers) can distinguish this hard-fail from generic errors.
 */
export class KindVersionMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindVersionMismatchError";
  }
}

/**
 * Pure pre-publish gate: assert the model's compiled-against kind and the
 * facade's declared kind are the same kind at the same version. Throws
 * {@link KindVersionMismatchError} on mismatch; success is "did not throw".
 *
 * No I/O — both inputs are already-resolved `{name}@{version}` references, so a
 * mismatch aborts before any S3 write (a strict superset of "abort before the
 * facade publish"). Reuses the SINGLE `{name}@{version}` codec `parseKindRef`
 * from `block_kind_ref.ts` (§3) — it is NOT redefined here.
 *
 * @param modelKindRef  reference the model was compiled against (`description.kind`)
 * @param facadeKindDep concrete reference the facade ships (from resolve-refs)
 */
export function checkKindVersionMatch(
  modelKindRef: BlockKindReference,
  facadeKindDep: BlockKindReference,
): void {
  const m = parseKindRef(modelKindRef);
  const f = parseKindRef(facadeKindDep);

  // Version is the load-bearing comparison. Exact-match, no semver range: the
  // facade reference is already normalized to a concrete version by resolve-refs
  // (which resolves `workspace:*`/`catalog:` via the kind's built manifest), so
  // a range never reaches here.
  if (m.version !== f.version) {
    throw new KindVersionMismatchError(
      `Kind version mismatch: model compiled against ${modelKindRef}, ` +
        `facade declares ${facadeKindDep}. Rebuild the model against the declared kind.`,
    );
  }

  const mLoc = npmNameToKindPath(m.name);
  const fLoc = npmNameToKindPath(f.name);
  if (mLoc.org !== fLoc.org || mLoc.name !== fLoc.name) {
    throw new KindVersionMismatchError(
      `Kind name mismatch: model compiled against ${modelKindRef}, ` +
        `facade declares ${facadeKindDep}.`,
    );
  }
}
