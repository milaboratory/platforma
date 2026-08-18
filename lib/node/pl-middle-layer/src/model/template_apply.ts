import type {
  BlockKindReference,
  BlockKindSelectorReference,
} from "@milaboratories/pl-model-common";
import { parseKindRef, parseKindSelectorReference } from "@milaboratories/pl-model-common";
import { selectorToRange } from "@platforma-sdk/block-tools";
import { ensureError } from "@platforma-sdk/model";
import * as semver from "semver";

/**
 * One entry the file describes in a way this project cannot honour.
 *
 * Thrown, not returned, and that is the whole failure policy: an apply either creates every
 * entry or creates none. It travels out through the open transaction, which is therefore
 * never committed, so a rejected file leaves the project exactly as it was. The caller turns
 * it into a {@link TemplateApplyProblem}; anything else reaching that caller is an outage
 * rather than a statement about the file, and keeps propagating.
 */
export class TemplateEntryRejected extends Error {
  constructor(
    readonly entryId: string,
    message: string,
  ) {
    super(message);
    this.name = "TemplateEntryRejected";
  }
}

/**
 * Something that stopped one entry from being applied.
 *
 * Every stage of an apply reports in this shape — resolution, validation,
 * construction — so a caller assembles one list and the reader sees which entry in
 * their file each problem belongs to. `error` is a finished sentence for the person
 * who applied the file, not a code.
 */
export type TemplateApplyProblem = {
  /** The template-local id of the entry the problem belongs to. */
  readonly entryId: string;
  readonly error: string;
};

/** One entry that made it into the project. */
export type AppliedEntry = {
  /** The entry's id in the file. */
  readonly templateLocalId: string;
  /** The project-local id the block was given. */
  readonly blockId: string;
};

/**
 * What a whole apply — reading, checking, resolving, placing — left behind.
 *
 * One shape for every stage's findings, because the reader does not care which stage
 * objected. `problems` empty means the project holds exactly what the document described;
 * otherwise `added` is empty, because no stage creates anything until every entry has passed.
 *
 * A stage that checks reports every problem it found, so a file with three mistakes takes one
 * pass to fix. Placement stops at the first one — hence at most one problem from there.
 */
export type TemplateApplyReport = {
  readonly added: readonly AppliedEntry[];
  readonly problems: readonly TemplateApplyProblem[];
};

/**
 * Why the block prepared for an entry cannot serve it, or `undefined` when it can.
 *
 * An entry's `kind` is the contract its params are written against, so the block that ends up
 * installed has to implement it. Only one of the three routes to a block gives that for free:
 * kind resolution, where the kind's own projection picks the block. The two overrides do not —
 * a location's folder can change without the file changing, and a pinned version names a
 * package with no reference to a kind at all.
 *
 * So this belongs here, with the apply's other per-entry checks, and not in resolution: it is
 * asked once, of the block that was actually prepared, whichever route found it. Resolution
 * could answer it for a location — `byLocation` reads the block's config anyway — and doing so
 * there would have been a second place stating the same invariant, with the pinned-version
 * route still uncovered. One caller is the point.
 *
 * It is also the check that makes the params check meaningful, so it is asked first: params are
 * checked by the INSTALLED block's kind parser, which against a block of the wrong kind would
 * hold params written for one contract against another.
 *
 * Version comparison goes through the same selector-to-range translation the registry resolver
 * uses, so "this resolves locally" and "this would resolve once published" cannot disagree
 * about the version math.
 *
 * Messages name no route, so a caller adds whichever locator the entry carried.
 */
export function kindMismatch(
  asked: BlockKindSelectorReference,
  declared: BlockKindReference | undefined,
): string | undefined {
  if (declared === undefined) {
    return (
      "The block resolved for this entry declares no kind, so it cannot be the " +
      "implementation it asks for"
    );
  }

  let wanted: { name: string; selector: { op: "exact" | "patch" | "minor"; version: string } };
  let has: { name: string; version: string };
  try {
    wanted = parseKindSelectorReference(asked);
    has = parseKindRef(declared);
  } catch (e) {
    // The entry's own selector was checked when the document was parsed, so this is the
    // block's stored reference being unreadable.
    return `The block resolved for this entry declares an unreadable kind: ${ensureError(e).message}`;
  }

  if (wanted.name !== has.name) {
    return (
      `This entry asks for kind '${wanted.name}', but the block resolved for it ` +
      `implements '${has.name}'`
    );
  }

  if (!semver.satisfies(has.version, selectorToRange(wanted.selector))) {
    return (
      `This entry asks for '${asked}', but the block resolved for it implements ` +
      `version ${has.version} of that kind`
    );
  }

  return undefined;
}
