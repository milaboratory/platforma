import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";

/**
 * What a template's orchestrator is allowed to do to a project.
 *
 * A template is applied by an orchestrator that walks the document and drives
 * construction entry by entry. In this version that orchestrator is
 * {@link applyProjectTemplateV1}, written in TypeScript and shipped with the
 * middle layer — but it reaches project construction only through this interface,
 * never through anything else, because the same interface is what a template-supplied
 * orchestrator running in a sandbox would be handed later. Adding the sandbox then
 * becomes a hosting change with nothing to redesign here.
 *
 * That intent fixes two properties of every signature below:
 *
 * - **Plain data only.** Arguments and results are JSON values. No class instances,
 *   no `Error` objects, no functions — nothing that cannot cross into a sandbox.
 *   This is why failures come back as strings inside a result rather than as throws.
 * - **Synchronous.** An implementation must have everything slow already in hand
 *   before the orchestrator runs: kinds resolved, block packs fetched, the project
 *   created. What is left — placing blocks and writing their state — is in-memory
 *   work inside a single transaction. A sandboxed orchestrator therefore needs no
 *   async bridge, and an apply cannot be interrupted half-way through by a network
 *   call.
 *
 * The interface is deliberately narrow: everything an orchestrator does not need
 * to decide stays out of it. Reference resolution, id assignment and block labelling
 * are all the implementation's business — see {@link AddBlockRequest}.
 */
export type TemplateApplyApi = {
  /**
   * Add the block described by one template entry.
   *
   * @param request Which entry to add, and the params to add it with
   * @returns The id the block was given, or why it could not be added
   */
  addBlock: (request: AddBlockRequest) => AddBlockOutcome;
};

/**
 * An instruction to add one entry's block.
 *
 * Notice what is absent. There is no block pack, kind or version: the entry is named
 * by its template-local `id` and the implementation looks up what it already resolved
 * for it, so an orchestrator cannot pick a different implementation than the one the
 * document was validated against. There is no project-local id: ids are assigned by
 * the implementation, which is what keeps the id map — template-local id to assigned
 * id — in the one place that needs it for rewriting references. And there is no
 * label: a template names no block instances, so the label comes from the block
 * package's own metadata.
 */
export type AddBlockRequest = {
  /** The entry's template-local id, as it appears in the document. */
  readonly id: string;
  /**
   * The entry's params, exactly as the file carries them — references still name
   * other entries by their template-local ids.
   *
   * They are passed through untouched on purpose: rewriting references is the
   * implementation's job, since only it knows which project-local id each entry
   * received. An orchestrator that rewrote them itself would have to be told the id
   * map, and every orchestrator would then own a copy of the same logic.
   *
   * Absent means "initialize this block from its kind's defaults", which is not the
   * same as `{}` — empty params are params.
   */
  readonly params?: Record<string, unknown>;
};

/** The id assigned to a newly added block, or why the entry could not be added. */
export type AddBlockOutcome =
  | { readonly ok: true; readonly blockId: string }
  | { readonly ok: false; readonly error: string };

/** One entry that made it into the project. */
export type AppliedEntry = {
  /** The entry's id in the file. */
  readonly templateLocalId: string;
  /** The project-local id the block was given. */
  readonly blockId: string;
};

/**
 * What an apply left behind.
 *
 * `added` is in the order the blocks were placed, and lists them whether or not the
 * apply as a whole succeeded — a failed apply keeps the blocks that already landed,
 * so a caller reporting the failure can say how far it got.
 */
export type TemplateApplyOutcome = {
  readonly added: readonly AppliedEntry[];
  /** Absent if every entry was added. */
  readonly problem?: {
    /** The template-local id of the entry that could not be added. */
    readonly entryId: string;
    readonly error: string;
  };
};

/**
 * Apply a `template-v1` document: add each entry's block, in file order.
 *
 * The fixed orchestrator — the whole of it. It is this short because everything
 * interesting happens on either side: the caller has already parsed the document,
 * checked its references, resolved every entry's kind and created the project, and
 * the {@link TemplateApplyApi} implementation owns id assignment and reference
 * rewriting. What is left is the sequencing, and the sequence is the file's own.
 *
 * File order is instantiation order and a reference to a later entry is rejected
 * before this point, so one forward pass is enough: by the time an entry is added,
 * every entry it references already exists and already has an id.
 *
 * **Stops at the first entry it cannot add.** Continuing would place blocks whose
 * upstream is missing, so the surviving project would be wired to nothing in the
 * middle — worse than a project that is short a tail. The blocks already added are
 * kept and reported, because they are valid and the user can finish by hand;
 * deleting them would also destroy the only evidence of how far the apply got.
 *
 * @param document A parsed, validated template document
 * @param api The project this is applied into
 */
export function applyProjectTemplateV1(
  document: ProjectTemplateV1,
  api: TemplateApplyApi,
): TemplateApplyOutcome {
  const added: AppliedEntry[] = [];

  for (const entry of document.blocks) {
    const outcome = api.addBlock({
      id: entry.id,
      ...(entry.params !== undefined ? { params: entry.params } : {}),
    });

    if (!outcome.ok) {
      return { added, problem: { entryId: entry.id, error: outcome.error } };
    }

    added.push({ templateLocalId: entry.id, blockId: outcome.blockId });
  }

  return { added };
}
