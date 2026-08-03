import type { ProjectStructure } from "./project_model";
import { allBlocks } from "./project_model_util";

/**
 * One block's template-descriptor output as the walk receives it.
 *
 * Deliberately the same shape the facade callback returns
 * (`__pl_templateParams_derive`), so a provider can hand the VM's result straight
 * through without reshaping it.
 */
export type TemplateParamsResult =
  | { readonly error: string }
  | { readonly error?: undefined; readonly value: unknown };

/** One block's contribution to the template being exported. */
export type TemplateExportEntry = {
  /** The block's project-local UUID, reused verbatim as the template-local id (A-0038). */
  readonly blockId: string;
  /**
   * The block's params in template form, or `undefined` when the block declares
   * no `templateParams`. `undefined` is written as an entry with **no** `params`
   * key, which means "re-initialize from the kind's defaults" (A-0041) — it is
   * not interchangeable with `{}`, which is written out and used as-is by `init`.
   */
  readonly params: Record<string, unknown> | undefined;
};

/** Why one block could not be exported. */
export type TemplateExportProblem = {
  readonly blockId: string;
  readonly error: string;
};

/**
 * Outcome of the walk: the blocks that can be written, and the ones that cannot.
 *
 * Both lists are returned rather than throwing on the first failure, so the
 * caller can report every offending block at once instead of making the user
 * fix them one export at a time. Whether a non-empty `problems` aborts the
 * export is the caller's policy, not the walk's — but note that emitting
 * `entries` while ignoring `problems` can produce a file whose surviving entries
 * reference a dropped block, which then fails
 * `validateProjectTemplateV1References`.
 */
export type TemplateExportWalk = {
  readonly entries: readonly TemplateExportEntry[];
  readonly problems: readonly TemplateExportProblem[];
};

/**
 * Walk a project's blocks in dependency order, collecting each one's
 * template-descriptor output.
 *
 * **No topological sort is performed, because none is needed.** The project
 * structure is already stored in topological order: `productionGraph` traverses
 * `allBlocks(structure)` and passes the set of blocks seen *so far* as the
 * `allowed` set to `inferAllReferencedBlocks`, so a reference to a block that is
 * not already above is recorded as a missing reference rather than as an
 * upstream (`project_model_util.ts`, `args.ts`). A block can therefore only
 * legally reference blocks earlier in this sequence — which is exactly the
 * ordering rule a template file needs ("every block must appear after the blocks
 * it references", A-0036) and the order the engine expects on apply
 * ("upstream-first", A-0041). Emitting entries in structure order satisfies both
 * for free, and `BlockGraph` documents the same invariant on its node map.
 *
 * Groups are flattened in order, so cross-group ordering is the structure's too.
 *
 * @param structure The project structure — the source of both membership and order
 * @param paramsProvider Yields a block's derived template params. Return
 *   `undefined` for a block whose state cannot be read at all; unlike
 *   `productionGraph`, which skips such blocks silently, the walk records them as
 *   problems, since a template that quietly omits a block does not describe the
 *   project it was exported from.
 */
export function walkProjectForTemplateExport(
  structure: ProjectStructure,
  paramsProvider: (blockId: string) => TemplateParamsResult | undefined,
): TemplateExportWalk {
  const entries: TemplateExportEntry[] = [];
  const problems: TemplateExportProblem[] = [];

  for (const { id } of allBlocks(structure)) {
    const derived = paramsProvider(id);

    if (derived === undefined) {
      problems.push({
        blockId: id,
        error: "Block state is unavailable, so its template params could not be derived",
      });
      continue;
    }

    if (derived.error !== undefined) {
      problems.push({ blockId: id, error: derived.error });
      continue;
    }

    const params = derived.value;

    // A block that declares no `templateParams` yields `undefined` — legal, and
    // the whole point of the method being optional.
    if (params === undefined) {
      entries.push({ blockId: id, params: undefined });
      continue;
    }

    // An entry's `params` is a mapping (A-0036). The lambda's return type is the
    // kind's `Params`, but a kind carries that as a TYPE only (A-0019), so
    // nothing upstream can enforce it at runtime — a block whose params type is
    // a primitive or a tuple compiles fine and would produce an unwritable
    // entry. This is the only place that can catch it.
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      problems.push({
        blockId: id,
        error: `templateParams() must return an object, got ${typeName(params)}`,
      });
      continue;
    }

    entries.push({ blockId: id, params: params as Record<string, unknown> });
  }

  return { entries, problems };
}

/** Name the offending value's type for an error message, without printing the value. */
function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
