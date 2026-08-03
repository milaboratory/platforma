import YAML from "yaml";
import type {
  BlockKindReference,
  BlockKindSelectorReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  findProjectTemplateV1ReferenceProblems,
  kindReferenceToSelectorReference,
  parseProjectTemplateV1,
} from "@milaboratories/pl-model-common";
import type { ProjectStructure } from "./project_model";
import type {
  TemplateExportProblem,
  TemplateExportWalk,
  TemplateParamsResult,
} from "./template_export";
import { walkProjectForTemplateExport } from "./template_export";

/** A block's exact kind reference, or `undefined` for a block that declares no kind. */
export type BlockKindProvider = (blockId: string) => BlockKindReference | undefined;

/** What the caller gets back for a whole project. */
export type ProjectTemplateExportOutcome =
  | {
      readonly ok: true;
      readonly yaml: string;
      /** The document the YAML was rendered from, already validated. */
      readonly document: ProjectTemplateV1;
    }
  | {
      readonly ok: false;
      /** Every block that stands in the way, not just the first. */
      readonly problems: readonly TemplateExportProblem[];
    };

/**
 * Turn a project into a template document.
 *
 * Assembly is deliberately dull — the entry is the block's id, its widened kind
 * reference, and the params the walk already collected. The interesting decisions
 * were made upstream; what is left here is the two things only this layer can
 * check, both of which produce problems rather than a broken file:
 *
 * - **A block with no kind cannot be written.** An entry's `kind` is required — it
 *   is the params contract the entry is typed against — while a block's kind is
 *   optional, so a block that predates kinds, or that uses the deprecated
 *   kind-less model overload, has no legal entry. Reported per block. This is not
 *   an edge case today: it is what most existing projects will hit until their
 *   blocks are republished.
 * - **References must point at an entry declared earlier.** Verbatim id reuse
 *   means a reference to a deleted block survives into the file naming nothing:
 *   deleting a block only removes it from the structure and does not rewrite
 *   downstream args, so a live project holds such references routinely.
 *
 * `block` is never emitted. That override exists to pin an implementation against
 * a kind's version range, and export always writes the exact version the block
 * implements, so there is nothing left for it to pin.
 *
 * Problems from `walk` are carried through, so a caller can hand a walk straight
 * in and get one combined list.
 */
export function assembleProjectTemplateV1(
  walk: TemplateExportWalk,
  kindProvider: BlockKindProvider,
): { document: ProjectTemplateV1; problems: readonly TemplateExportProblem[] } {
  const problems: TemplateExportProblem[] = [...walk.problems];
  const blocks: ProjectTemplateV1Entry[] = [];

  for (const entry of walk.entries) {
    const kind = kindProvider(entry.blockId);

    if (kind === undefined) {
      problems.push({
        blockId: entry.blockId,
        error:
          "Block declares no kind, so it cannot be written to a template: an entry's kind " +
          "carries the params contract the entry is typed against",
      });
      continue;
    }

    let selector: BlockKindSelectorReference;
    try {
      // Widening validates, and therefore throws — which is why it happens here
      // and not where the reference is read: every read site sits inside a
      // recomputed project overview, where one malformed stored reference must not
      // be able to break unrelated blocks.
      selector = kindReferenceToSelectorReference(kind);
    } catch (e) {
      problems.push({
        blockId: entry.blockId,
        error: `Block's stored kind reference is malformed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    blocks.push({
      id: entry.blockId,
      kind: selector,
      // Omitted, not set to undefined: an absent `params` means "re-initialize
      // from the kind's defaults", and `{}` means "use these empty params". The
      // YAML renderer would write an explicit `params: null` for undefined,
      // collapsing the distinction.
      ...(entry.params !== undefined ? { params: entry.params } : {}),
    });
  }

  const document: ProjectTemplateV1 = { schema: PROJECT_TEMPLATE_SCHEMA_V1, blocks };

  for (const problem of findProjectTemplateV1ReferenceProblems(document)) {
    problems.push({ blockId: problem.entryId, error: problem.message });
  }

  return { document, problems };
}

/**
 * Render a template document to YAML text.
 *
 * Line folding is switched off: a wrapped kind reference or params string still
 * parses, but it makes a diff between two exported templates unreadable, which is
 * most of the reason to prefer YAML over JSON here.
 */
export function stringifyProjectTemplateV1(document: ProjectTemplateV1): string {
  return YAML.stringify(document, { lineWidth: 0 });
}

/**
 * Export a project as `template-v1` YAML, or report every reason it cannot be.
 *
 * All-or-nothing on purpose. A partial template silently drops blocks and the
 * surviving entries may reference the dropped ones, so what looks like a
 * successful export would produce a project missing pieces the user never chose
 * to leave out. Reporting everything at once instead of failing on the first
 * problem is the other half of that: fixing an export should take one pass.
 *
 * @param structure The project structure, which supplies both membership and order
 * @param paramsProvider A block's derived template params, in template form
 * @param kindProvider A block's exact kind reference, read from its stored config
 */
export function exportProjectAsTemplateV1(
  structure: ProjectStructure,
  paramsProvider: (blockId: string) => TemplateParamsResult | undefined,
  kindProvider: BlockKindProvider,
): ProjectTemplateExportOutcome {
  const walk = walkProjectForTemplateExport(structure, paramsProvider);
  const { document, problems } = assembleProjectTemplateV1(walk, kindProvider);

  if (problems.length > 0) return { ok: false, problems };

  // Export must emit exactly what import parses, so that is asserted on every
  // export rather than only in tests — running the import-side parser over the
  // document we are about to write is the cheapest possible proof of it. Nothing
  // user-facing is expected to fail here: the kind grammar was checked by the
  // widening above, params were checked to be a mapping by the walk, and the
  // reference rules by the assembler. A throw means a bug in the assembler, with
  // one known exception: a project structure holding two blocks with the same id,
  // which is reachable through the mutator and produces duplicate entry ids.
  parseProjectTemplateV1(document);

  return { ok: true, yaml: stringifyProjectTemplateV1(document), document };
}
