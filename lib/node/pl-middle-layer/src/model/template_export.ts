import { inferAllReferencedBlocks } from "./args";
import type { ProjectStructure } from "./project_model";
import { allBlocks } from "./project_model_util";

/**
 * One block's template-descriptor output as the walk receives it.
 *
 * Deliberately the same shape the `__pl_templateParams_derive` facade callback
 * returns, so a provider can hand the VM's result straight through without
 * reshaping it.
 */
export type TemplateParamsResult =
  | { readonly error: string }
  | { readonly error?: undefined; readonly value: unknown };

/** One block's contribution to the template being exported. */
export type TemplateExportEntry = {
  /**
   * The block's project-local id, which is also its template-local id: a template
   * has no id namespace of its own, so the id is reused verbatim and references
   * already stored in params need no translation.
   */
  readonly blockId: string;
  /**
   * The block's params in template form, or `undefined` when the block declares
   * no `templateParams`.
   *
   * `undefined` is written as an entry with **no** `params` key. Only a block built
   * against an older SDK gets here: a current block cannot be built without
   * `templateParams`, and one whose state carries nothing worth restoring returns `{}`
   * rather than declining.
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
 * caller can report every offending block at once instead of making the user fix
 * them one export at a time. Whether a non-empty `problems` aborts the export is
 * the caller's policy, not the walk's — but note that emitting `entries` while
 * ignoring `problems` can produce a file whose surviving entries reference a
 * dropped block, which is an unusable template.
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
 * structure is already stored in topological order, and that is enforced rather
 * than assumed: `productionGraph` traverses `allBlocks(structure)` and passes the
 * set of blocks seen *so far* as the allowed set to `inferAllReferencedBlocks`, so
 * a reference to a block that is not already above is recorded as a missing
 * reference instead of an upstream. A block can therefore only legally reference
 * blocks earlier in this sequence — which is exactly what a template file needs,
 * since its block order is the instantiation order and the engine creates blocks
 * upstream-first. Emitting entries in structure order satisfies that for free.
 *
 * Groups are flattened in order, so cross-group ordering is the structure's too.
 *
 * A structure that violates the ordering rule is reported as-is, not repaired:
 * reordering would change which references are legal in the first place.
 *
 * Ids are reused verbatim rather than remapped, so the walk also guards the one
 * thing verbatim reuse depends on — that every block id reaching the file names a
 * block the file describes. Accumulating the exported ids as it goes is what lets it
 * answer that, and it is also why a block that failed carries its failure forward:
 * an entry wired to a block that never made it into the document is unusable, and
 * saying so beats emitting it. See {@link unrewrittenBlockIds}.
 *
 * @param structure The project structure — the source of both membership and order
 * @param paramsProvider Yields a block's derived template params. Return
 *   `undefined` for a block whose state cannot be read at all; such a block is
 *   recorded as a problem rather than skipped, because a template that quietly
 *   omits a block does not describe the project it was exported from, and the
 *   surviving entries may still reference the omitted one.
 */
export function walkProjectForTemplateExport(
  structure: ProjectStructure,
  paramsProvider: (blockId: string) => TemplateParamsResult | undefined,
): TemplateExportWalk {
  const entries: TemplateExportEntry[] = [];
  const problems: TemplateExportProblem[] = [];
  /** Blocks this document describes so far, and so the only ones its params may name. */
  const exportable = new Set<string>();

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

    // An entry's `params` must be a mapping. The lambda's declared return type is the
    // block kind's params type, and the kind's parser checks values coming IN, but
    // nothing checks what the lambda hands back on the way out — so a block whose
    // params type is a primitive or a tuple compiles fine and would produce an
    // unwritable entry. This is the only place that can catch it.
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      problems.push({
        blockId: id,
        error: `templateParams() must return an object, got ${typeName(params)}`,
      });
      continue;
    }

    // Nothing renames ids on the way out, which is precisely what makes it
    // load-bearing that every id-carrying reference was already rewritten into
    // template form.
    const unrewritten = unrewrittenBlockIds(params, exportable);
    if (unrewritten.length > 0) {
      problems.push({
        blockId: id,
        error:
          `params still name block(s) ${unrewritten.join(", ")}, which this template does ` +
          `not describe — a reference carried inside a string that is not a column id is ` +
          `invisible to toTemplateForm and would name nothing on apply`,
      });
      continue;
    }

    entries.push({ blockId: id, params: params as Record<string, unknown> });
    // Only now is this block nameable: an entry may reference blocks above it, and
    // its own params referencing itself is a cycle, not a wire.
    exportable.add(id);
  }

  return { entries, problems };
}

/**
 * Block ids in already-template-form params that name a block outside `exportable`,
 * i.e. carriers `toTemplateForm` failed to rewrite. Empty for correct params.
 *
 * The two walks disagree about what carries a block id, and this closes the gap.
 * `toTemplateForm` recognizes a plain `PlRef` object and a block id inside a column
 * id. `inferAllReferencedBlocks` is the project's own reference detector and the
 * authority on the question, since the block dependency graph is built from it, and
 * it additionally recognizes a `PlRef` serialized into a string, unwrapping any
 * number of `JSON.stringify` passes — so it reaches a carrier the codec does not.
 *
 * A hit is not by itself a fault. A rewritten `PlRef` is a plain `{ block, output }`
 * pair the detector cannot see, but a rewritten column id still holds
 * `{ __isRef: true, blockId, name }` inside its string, because it has to stay a
 * resolvable column id — and its block id is legitimate exactly when the document
 * describes that block. So membership, not presence, is the test: a hit naming an
 * exported entry is a wire, and a hit naming anything else would name nothing on
 * apply.
 *
 * Checked here rather than inside `toTemplateForm` because the detector is
 * middle-layer code, while the codec ships in every block-model and UI bundle.
 */
function unrewrittenBlockIds(
  templateFormParams: unknown,
  exportable: ReadonlySet<string>,
): string[] {
  const { upstreams } = inferAllReferencedBlocks(templateFormParams);
  return [...upstreams].filter((blockId) => !exportable.has(blockId)).sort();
}

/** Name the offending value's type for an error message, without printing the value. */
function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
