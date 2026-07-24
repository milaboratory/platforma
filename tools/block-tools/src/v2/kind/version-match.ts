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
  // (a range would spuriously fail — see doc §4 "Exact-match vs. range").
  if (m.version !== f.version) {
    throw new KindVersionMismatchError(
      `Kind version mismatch: model compiled against ${modelKindRef}, ` +
        `facade declares ${facadeKindDep}. Rebuild the model against the declared kind.`,
    );
  }

  // Name check across two name spaces (model logical name vs facade npm package
  // name): compare the terminal name segment via `npmNameToKindPath`. The exact
  // org-qualification equivalence is unsettled (Q-0004/Q-0005), so the org half
  // is intentionally not compared here — see blockedOn.
  const mName = npmNameToKindPath(m.name).name;
  const fName = npmNameToKindPath(f.name).name;
  if (mName !== fName) {
    throw new KindVersionMismatchError(
      `Kind name mismatch: model compiled against ${modelKindRef}, ` +
        `facade declares ${facadeKindDep}.`,
    );
  }
}
