import { resolveTemplateRefs } from "@milaboratories/pl-model-common";

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
 * Params in live shape, with each entry's template-local id standing in for the block id it
 * has not been given yet.
 *
 * For the pre-flight check, which runs before any block exists and therefore before any
 * reference can be redirected. Checking the file form directly would not work: a kind
 * describing a param as a reference sees the `{ $ref: … }` wrapper and rejects it, so every
 * entry with a reference would fail a check meant to catch the opposite. Unwrapping with
 * nothing to redirect asks the only question this stage can answer — are these params the
 * right shape — and leaves what they point at to validation, which already owns it.
 *
 * The ids stay the file's own rather than becoming invented placeholders: nothing dereferences
 * them here, and if one surfaces in a kind's rejection message it names something the reader
 * can find in their file.
 */
export function liveParamsForCheck(params: Record<string, unknown>): Record<string, unknown> {
  return resolveTemplateRefs(params, new Map());
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
