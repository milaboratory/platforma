import type { ProjectTemplateV1, TemplateReferenceProblem } from "@milaboratories/pl-model-common";
import { findProjectTemplateV1ReferenceProblems } from "@milaboratories/pl-model-common";
import { inferAllReferencedBlocks } from "./args";
import type { TemplateApplyProblem } from "./template_apply";

/**
 * Everything wrong with a template document that can be known from the document alone.
 *
 * The stage between reading the file and touching anything: it needs no registry and no
 * project, so its failures are statements about the file. That placement is the point —
 * once a project exists, the same problems would have to be reported against a
 * half-built project instead.
 *
 * Two checks, both structural:
 *
 * - **References name an earlier entry.** Detection is shared with export
 *   (`findProjectTemplateV1ReferenceProblems`), the wording is not: export tells a
 *   developer their project cannot be written out, this tells a reader how to fix a file
 *   they wrote.
 * - **No params carry a block id from somewhere else.** See {@link foreignBlockIds}.
 *
 * Problems are grouped by entry in file order, so the report reads in the same order as
 * the file, and every entry's problems appear together. Everything is collected: a file
 * with three mistakes should take one pass to fix.
 *
 * What is deliberately NOT here: whether an entry's kind resolves (that needs a
 * registry) and whether its params suit the kind (nothing types them at runtime yet).
 */
export function validateTemplateV1ForApply(document: ProjectTemplateV1): TemplateApplyProblem[] {
  const byEntry = new Map<string, TemplateReferenceProblem[]>();
  for (const problem of findProjectTemplateV1ReferenceProblems(document)) {
    const existing = byEntry.get(problem.entryId);
    if (existing === undefined) byEntry.set(problem.entryId, [problem]);
    else existing.push(problem);
  }

  const problems: TemplateApplyProblem[] = [];

  for (const entry of document.blocks) {
    for (const reference of byEntry.get(entry.id) ?? []) {
      problems.push({ entryId: entry.id, error: describeReferenceProblem(reference) });
    }

    const foreign = foreignBlockIds(entry.params);
    if (foreign.length > 0) {
      problems.push({
        entryId: entry.id,
        error:
          `This entry carries ${foreign.length === 1 ? "a block id" : "block ids"} from another ` +
          `project (${foreign.join(", ")}). A reference written inside a value cannot be ` +
          `redirected to the blocks this template creates, so remove it from the entry's params.`,
      });
    }
  }

  return problems;
}

/**
 * Block ids found in an entry's params that name a block in some other project.
 *
 * In a template file, a reference between entries is a `{ block, output }` pair — the
 * form that gets redirected to real ids on apply. Anything that instead looks like a
 * live project reference (`{ __isRef: true, blockId, name }`, whether as an object or
 * canonicalized into a string, as an enrichment's `PObjectId` is) names a block in the
 * project the file was written in, and nothing here can turn it into a block of the
 * project being created. Applied as-is it would be valid-looking params wired to
 * nothing, with no error anywhere — which is why it is rejected rather than warned about.
 *
 * That makes the check unusually cheap to state: because legitimate references are the
 * other shape, everything this finds is by construction foreign, with nothing to
 * subtract. Running it before ids are assigned, rather than after the rewrite, is what
 * buys that.
 *
 * Our own export cannot produce such a file — it fails the export instead — so this
 * only ever fires on a file that was written or edited by hand.
 */
function foreignBlockIds(params: unknown): string[] {
  if (params === undefined) return [];
  // The same detector the export guard uses, and the reason both exist: it recognizes a
  // reference as an object AND inside any number of JSON.stringify passes, which the
  // structural rewrite cannot see.
  const { upstreams } = inferAllReferencedBlocks(params);
  return [...upstreams].sort();
}

/**
 * An import-facing sentence for one bad reference.
 *
 * The shared detector's own `message` describes the document; these name the edit. The
 * `reason` is a discriminant precisely so each direction can word it for its own reader
 * without re-deriving the finding.
 */
function describeReferenceProblem(problem: TemplateReferenceProblem): string {
  const { ref } = problem;
  switch (problem.reason) {
    case "self":
      return (
        `This entry uses its own output '${ref.output}' as an input. Point it at another ` +
        `entry, or remove the reference.`
      );
    case "unknown":
      return (
        `This entry uses output '${ref.output}' of entry '${ref.block}', which this file does ` +
        `not define. Add that entry, or correct the id.`
      );
    case "forward":
      return (
        `This entry uses entry '${ref.block}', which is listed after it. Blocks are created in ` +
        `the order they are listed, so move '${ref.block}' above this entry.`
      );
  }
}
