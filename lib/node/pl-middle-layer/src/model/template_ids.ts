import { randomUUID } from "node:crypto";
import { resolveTemplateRefs } from "@milaboratories/pl-model-common";

/**
 * The bookkeeping that turns template-local entry ids into project-local block ids,
 * and file-form params into params a block can be initialized with.
 *
 * A template names blocks by ids that mean nothing outside the file; a project names
 * them by UUIDs that do not exist until the blocks are created. One map spans that gap, and
 * it is separate from the apply loop for one reason: the discipline that makes it correct —
 * an id is a redirect target only once the block it names actually landed — is easier to keep
 * behind two methods (`assign`, then `record`) than inline in a loop that also places blocks.
 *
 * The pass is forward-only. File order is instantiation order, and a reference to a
 * later entry is rejected before an apply starts, so by the time an entry's params are
 * converted every entry they name already has a block and an id. Nothing here has to
 * look ahead, defer a reference or patch a block after the fact.
 */
export type TemplateIdMap = {
  /**
   * Reserve a project-local block id for one entry.
   *
   * The id is returned but not yet visible to {@link TemplateIdMap.liveParams}: it
   * becomes a resolvable reference target only once {@link TemplateIdMap.record}
   * confirms the block landed. Two things fall out of that. Params are never wired to a
   * block that failed to be created, which matters because a failed apply keeps the
   * blocks that already landed rather than unwinding them. And an entry cannot resolve a
   * reference to itself: its own id is still unpublished while its params are rewritten,
   * so a self-reference is reported instead of quietly connecting a block to its own
   * output.
   *
   * @throws If the entry already has an id. Entry ids are unique by the document
   *   schema, so a second reservation for the same entry means the document never went
   *   through the parser, and the first block would be silently orphaned.
   */
  assign: (templateLocalId: string) => string;

  /**
   * Publish a block as a reference target, once it exists.
   *
   * `blockId` is passed in rather than read back from the assignment because the
   * project is the authority on the id its block actually got.
   */
  record: (templateLocalId: string, blockId: string) => void;

  /**
   * Rewrite one entry's params from file form into live form: inside every reference wrapper,
   * each template-local entry id is replaced by the block id that entry received, and the
   * payload is then handed back unwrapped — exactly the shape the block projected.
   *
   * Call it with params that are present. A caller holding an entry that omitted the
   * key substitutes `{}` before this point, so there is no absent case to decide here.
   */
  liveParams: (params: Record<string, unknown>) => TemplateParamsRewrite;
};

/** Params ready to initialize a block with, or why a reference could not be connected. */
export type TemplateParamsRewrite =
  | { readonly ok: true; readonly params: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

/**
 * A fresh id map for one apply.
 *
 * @param newBlockId Source of project-local block ids. Defaults to random UUIDs, the
 *   same ids `Project.addBlock` would have generated on its own; injectable so the
 *   forward pass can be exercised without a project.
 */
export function createTemplateIdMap(newBlockId: () => string = randomUUID): TemplateIdMap {
  const assigned = new Set<string>();
  const recorded = new Map<string, string>();

  return {
    assign: (templateLocalId) => {
      if (assigned.has(templateLocalId)) {
        throw new Error(`template entry '${templateLocalId}' was already assigned a block id`);
      }
      assigned.add(templateLocalId);
      return newBlockId();
    },

    record: (templateLocalId, blockId) => {
      recorded.set(templateLocalId, blockId);
    },

    liveParams: (params) => {
      return { ok: true, params: resolveTemplateRefs(params, recorded) };
    },
  };
}

/**
 * Params in live shape, with each entry's template-local id standing in for the block id
 * it has not been given yet.
 *
 * For the pre-flight params check, which runs before any block exists and therefore
 * before any reference can be resolved. Checking the file form directly would not work:
 * a kind describing a param as a reference sees the `{ $ref: … }` wrapper and rejects it, so
 * every entry with a reference would fail a check meant to catch the opposite. Feeding it
 * the live shape with unresolvable ids asks the only question that stage can answer — are
 * these params the right shape — and leaves what they point at to validation, which
 * already owns it.
 *
 * The ids are the file's own rather than invented placeholders: nothing dereferences them
 * here, and if one does surface in a kind's rejection message it names something the
 * reader can find in their file.
 */
export function liveParamsForCheck(params: Record<string, unknown>): Record<string, unknown> {
  // An empty map: nothing to redirect yet, and the wrappers come off all the same, which is
  // the whole point — the kind sees the shape it declared.
  return resolveTemplateRefs(params, new Map());
}
