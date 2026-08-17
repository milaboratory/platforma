import type { ProjectTemplateV1, TemplateReferenceProblem } from "@milaboratories/pl-model-common";
import { findProjectTemplateV1ReferenceProblems } from "@milaboratories/pl-model-common";
import type { TemplateApplyProblem } from "./template_apply";

/**
 * The one thing a template document can be found wrong about before anything is touched:
 * a reference that does not name an entry declared earlier.
 *
 * The stage between reading the file and touching anything. It needs no registry and no
 * project, so its findings are statements about the file — and that placement is the point:
 * once a project existed, the same problems would have to be reported against a half-built
 * one. Detection is shared with export (`findProjectTemplateV1ReferenceProblems`), the
 * wording is not — export tells a developer their project cannot be written out, this tells a
 * reader how to fix a file they wrote.
 *
 * Problems arrive grouped by entry in file order, because the shared detector walks `blocks`
 * itself, so the report reads in the same order as the file. All of them are returned: a file
 * with three mistakes should take one pass to fix.
 *
 * What this cannot report, deliberately:
 *
 * - **A reference to an id the file does not define.** Detection asks which of the ids this
 *   document defines appear inside a reference payload, so one naming no entry is
 *   indistinguishable from the rest of the payload's text.
 * - **A block id outside a reference wrapper.** The engine models no notion of a reference
 *   beyond the wrapper, so it cannot tell such a value from data.
 * - **Whether an entry's kind resolves** — that needs a registry — **and whether its params
 *   suit the kind**, which the block's own model answers later, in the VM.
 */
export function validateTemplateV1ForApply(document: ProjectTemplateV1): TemplateApplyProblem[] {
  return findProjectTemplateV1ReferenceProblems(document).map((problem) => ({
    entryId: problem.entryId,
    error: describeReferenceProblem(problem),
  }));
}

/**
 * An import-facing sentence for one bad reference.
 *
 * The shared detector's own `message` describes the document; these name the edit. The
 * `reason` is a discriminant precisely so each direction can word it for its own reader
 * without re-deriving the finding.
 */
function describeReferenceProblem(problem: TemplateReferenceProblem): string {
  const { referencedId } = problem;
  switch (problem.reason) {
    case "self":
      return (
        `This entry uses its own output as an input. Point it at another entry, or remove the ` +
        `reference.`
      );
    case "forward":
      return (
        `This entry uses entry '${referencedId}', which is listed after it. Blocks are created ` +
        `in the order they are listed, so move '${referencedId}' above this entry.`
      );
  }
}
