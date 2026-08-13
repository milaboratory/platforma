import type { ProjectTemplateV1, TemplateReferenceProblem } from "@milaboratories/pl-model-common";
import { findProjectTemplateV1ReferenceProblems } from "@milaboratories/pl-model-common";
import type { TemplateApplyProblem } from "./template_apply";

/**
 * Everything wrong with a template document that can be known from the document alone.
 *
 * The stage between reading the file and touching anything: it needs no registry and no
 * project, so its failures are statements about the file. That placement is the point —
 * once a project exists, the same problems would have to be reported against a
 * half-built project instead.
 *
 * One check: **references name an earlier entry.** Detection is shared with export
 * (`findProjectTemplateV1ReferenceProblems`), the wording is not — export tells a developer
 * their project cannot be written out, this tells a reader how to fix a file they wrote.
 *
 * Nothing here looks inside an entry's params beyond the `{ $ref: … }` wrapper. What a
 * payload contains, and whether the block that wrote it wrapped the right things, is not
 * something this layer models: it exposes the wrapper mechanic and nothing else.
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
  }

  return problems;
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
