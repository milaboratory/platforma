import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import type { FoldersDocument, FolderId } from "./document";
import type { FoldersView } from "./view";
import { foldersDocumentFromView, foldersSubtree } from "./view";

/**
 * Everything a folder deletion destroys: the folder, every folder beneath it, and every project
 * and template held anywhere inside.
 *
 * Deleting a project or a template cannot be undone, so this is computed for the dialog and
 * recomputed inside the write, which commits only if the two agree. Without that, a project
 * dropped into the folder between the two reads would be destroyed without ever appearing in the
 * dialog that asked. Every list is in a canonical order for exactly that comparison.
 */
export interface FoldersRemoval {
  readonly folders: readonly FolderId[];
  readonly projects: readonly ProjectId[];
  readonly templates: readonly TemplateId[];
}

/** One reason a folder cannot be deleted. */
export type FoldersRemovalIssue = {
  readonly kind: "unknown-folder";
  readonly folder: FolderId;
};

/** A removal, or everything standing in the way of one. */
export type FoldersRemovalPlanResult =
  | { readonly ok: true; readonly removal: FoldersRemoval }
  | { readonly ok: false; readonly issues: readonly FoldersRemovalIssue[] };

/** What deleting this folder would destroy. */
export function planFoldersRemoval(view: FoldersView, folder: FolderId): FoldersRemovalPlanResult {
  if (!view.folders.some((candidate) => candidate.id === folder))
    return { ok: false, issues: [{ kind: "unknown-folder", folder }] };

  const folders = [...foldersSubtree(view, folder)].sort();
  const doomed = new Set<FolderId>(folders);
  const projects = view.projects
    .filter((project) => project.folder !== undefined && doomed.has(project.folder))
    .map((project) => project.id)
    .sort();
  const templates = view.templates
    .filter((template) => template.folder !== undefined && doomed.has(template.folder))
    .map((template) => template.id)
    .sort();

  return { ok: true, removal: { folders, projects, templates } };
}

/** True when two removals destroy exactly the same things. */
export function foldersRemovalsEqual(a: FoldersRemoval, b: FoldersRemoval): boolean {
  return (
    a.folders.length === b.folders.length &&
    a.projects.length === b.projects.length &&
    a.templates.length === b.templates.length &&
    a.folders.every((id, index) => id === b.folders[index]) &&
    a.projects.every((id, index) => id === b.projects[index]) &&
    a.templates.every((id, index) => id === b.templates[index])
  );
}

/**
 * The document left once a removal is applied. The projects and templates themselves are deleted
 * by the write path.
 */
export function applyFoldersRemoval(view: FoldersView, removal: FoldersRemoval): FoldersDocument {
  const doomedFolders = new Set<FolderId>(removal.folders);
  const doomedProjects = new Set<ProjectId>(removal.projects);
  const doomedTemplates = new Set<TemplateId>(removal.templates);
  return foldersDocumentFromView({
    ...view,
    folders: view.folders.filter((folder) => !doomedFolders.has(folder.id)),
    projects: view.projects.filter((project) => !doomedProjects.has(project.id)),
    templates: view.templates.filter((template) => !doomedTemplates.has(template.id)),
  });
}
