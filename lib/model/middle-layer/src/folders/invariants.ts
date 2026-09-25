import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import { asProjectId, asTemplateId } from "@milaboratories/pl-model-common";
import type { FoldersDocument, FolderId } from "./document";
import { foldersNameBlank, foldersNameTaken } from "./naming";
import type { FoldersItem } from "./planner";
import type { FoldersProjectInput, FoldersTemplateInput } from "./view";

/** One way a document breaks the rules the write path enforces. */
export type FoldersViolation =
  | { readonly kind: "duplicate-folder-id"; readonly folder: FolderId }
  | { readonly kind: "empty-folder-name"; readonly folder: FolderId }
  | {
      readonly kind: "missing-parent";
      readonly folder: FolderId;
      readonly parent: FolderId;
    }
  | { readonly kind: "cycle"; readonly folder: FolderId }
  | {
      readonly kind: "duplicate-name";
      /** Which kind of item the name is used twice among. */
      readonly item: FoldersItem["kind"];
      readonly parent?: FolderId;
      readonly name: string;
    }
  | {
      readonly kind: "unknown-assignment-folder";
      readonly project: ProjectId;
      readonly folder: FolderId;
    }
  | {
      readonly kind: "unknown-template-assignment-folder";
      readonly template: TemplateId;
      readonly folder: FolderId;
    };

/**
 * Everything wrong with a document, in one pass.
 *
 * This is the write path's check: a read heals the same problems instead of reporting them, but a
 * write that would persist any of them is refused, because a document no reader can render as
 * stored is a document someone has to repair by hand.
 *
 * Project and template names are optional. Without them only folder names can be checked for
 * duplicates, so a write path that can supply them should. The template list also tells an assignment for a template that is gone — which a read
 * prunes — from one naming a folder that does not exist, which is a broken document.
 */
export function validateFoldersDocument(
  document: FoldersDocument,
  projects?: readonly FoldersProjectInput[],
  templates?: readonly FoldersTemplateInput[],
): readonly FoldersViolation[] {
  const violations: FoldersViolation[] = [];

  const byId = new Map<FolderId, { name: string; parent?: FolderId }>();
  for (const folder of document.folders) {
    if (byId.has(folder.id)) {
      violations.push({ kind: "duplicate-folder-id", folder: folder.id });
      continue;
    }
    if (foldersNameBlank(folder.name))
      violations.push({ kind: "empty-folder-name", folder: folder.id });
    byId.set(folder.id, { name: folder.name, parent: folder.parent });
  }

  for (const [id, folder] of byId) {
    if (folder.parent !== undefined && !byId.has(folder.parent)) {
      violations.push({ kind: "missing-parent", folder: id, parent: folder.parent });
      continue;
    }

    if (onCycle(id, byId)) violations.push({ kind: "cycle", folder: id });
  }

  // The comparison is the naming rule's, not a second one written here: a document is invalid in
  // exactly the cases the rule would have refused, or the write path and the checker would drift.
  // Each kind of item has a namespace of its own inside a parent.
  const namesByParent = new Map<string, string[]>();
  const claim = (item: FoldersItem["kind"], parent: FolderId | undefined, name: string) => {
    const key = `${item}:${parent ?? ""}`;
    const names = namesByParent.get(key) ?? [];
    namesByParent.set(key, names);
    if (foldersNameTaken(name, names))
      violations.push({ kind: "duplicate-name", item, parent, name });
    names.push(name);
  };

  for (const folder of byId.values()) claim("folder", folder.parent, folder.name);

  const knownProjects = new Set<string>((projects ?? []).map((project) => project.id));
  for (const project of projects ?? []) {
    const parent = document.assignments[project.id];
    if (parent === undefined || byId.has(parent)) claim("project", parent, project.name);
  }

  for (const [project, folder] of Object.entries(document.assignments))
    if (!byId.has(folder) && (projects === undefined || knownProjects.has(project)))
      violations.push({
        kind: "unknown-assignment-folder",
        project: asProjectId(project),
        folder,
      });

  for (const template of templates ?? []) {
    const parent = document.templateAssignments[template.id];
    if (parent === undefined || byId.has(parent)) claim("template", parent, template.name);
  }

  const knownTemplates = new Set<string>((templates ?? []).map((template) => template.id));
  for (const [template, folder] of Object.entries(document.templateAssignments))
    if (!byId.has(folder) && (templates === undefined || knownTemplates.has(template)))
      violations.push({
        kind: "unknown-template-assignment-folder",
        template: asTemplateId(template),
        folder,
      });

  return violations;
}

/** A one-line description of a violation, for an error a user or a log will read. */
export function formatFoldersViolation(violation: FoldersViolation): string {
  switch (violation.kind) {
    case "duplicate-folder-id":
      return `folder id ${violation.folder} appears more than once`;
    case "empty-folder-name":
      return `folder ${violation.folder} has an empty name`;
    case "missing-parent":
      return `folder ${violation.folder} names a parent that does not exist (${violation.parent})`;
    case "cycle":
      return `folder ${violation.folder} sits in a cycle of parents`;
    case "duplicate-name":
      return violation.parent === undefined
        ? `the ${violation.item} name "${violation.name}" is used more than once at the top level`
        : `the ${violation.item} name "${violation.name}" is used more than once inside folder ${violation.parent}`;
    case "unknown-assignment-folder":
      return `project ${violation.project} is assigned to a folder that does not exist (${violation.folder})`;
    case "unknown-template-assignment-folder":
      return `template ${violation.template} is assigned to a folder that does not exist (${violation.folder})`;
  }
}

//
// Internals
//

/**
 * True when following parents from this folder leads back to it. A folder that merely hangs below
 * a cycle is not on it.
 */
function onCycle(id: FolderId, byId: ReadonlyMap<FolderId, { parent?: FolderId }>): boolean {
  const seen = new Set<FolderId>();
  let current = byId.get(id)?.parent;
  while (current !== undefined && !seen.has(current)) {
    if (current === id) return true;
    seen.add(current);
    current = byId.get(current)?.parent;
  }
  return false;
}
