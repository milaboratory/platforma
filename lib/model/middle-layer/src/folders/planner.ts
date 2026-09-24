import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import type { FoldersDocument, FolderId } from "./document";
import { foldersUniqueName } from "./naming";
import type { FoldersView } from "./view";
import { foldersDocumentFromView, foldersSiblingNames, foldersSubtree } from "./view";

/** A folder, a project or a stored template, as something a move acts on. */
export type FoldersItem =
  | { readonly kind: "folder"; readonly id: FolderId }
  | { readonly kind: "project"; readonly id: ProjectId }
  | { readonly kind: "template"; readonly id: TemplateId };

/** A tree item that is not a folder: a project or a stored template. */
export type FoldersLeafItem = Exclude<FoldersItem, { readonly kind: "folder" }>;

/** What one item is called after the move, and what it was called before. */
export interface FoldersMoveEntry {
  readonly item: FoldersItem;
  readonly currentName: string;
  /** The name the item carries once the plan is applied. */
  readonly name: string;
  /** True when the destination already held that name and the item is being renamed. */
  readonly renamed: boolean;
  /** Folder the item is coming from; absent when it is at the top level. */
  readonly sourceFolder?: FolderId;
}

/**
 * Every item of a move and its resulting name.
 *
 * A plan is computed for the preview and recomputed inside the write, and the write commits only
 * when the two are identical, so a plan confirmed against state that has since changed is refused
 * rather than applied. Entries are in a canonical order for exactly that comparison.
 */
export interface FoldersMovePlan {
  /** Folder everything lands in; absent for the top level. */
  readonly destination?: FolderId;
  readonly entries: readonly FoldersMoveEntry[];
}

/** One reason a move cannot be planned. */
export type FoldersMoveIssue =
  | { readonly kind: "unknown-destination"; readonly folder: FolderId }
  | { readonly kind: "unknown-item"; readonly item: FoldersItem }
  | {
      readonly kind: "into-own-descendant";
      readonly folder: FolderId;
      readonly destination: FolderId;
    };

/** A plan, or everything standing in the way of one. */
export type FoldersMovePlanResult =
  | { readonly ok: true; readonly plan: FoldersMovePlan }
  | { readonly ok: false; readonly issues: readonly FoldersMoveIssue[] };

/**
 * Plan a move of any mix of folders, projects and templates into one destination.
 *
 * The only function that decides what a moved item ends up called. The preview and the write both
 * call it, over the same view, so the two cannot drift apart.
 *
 * A folder moves with everything inside it. When the selection holds a folder together with
 * something inside it, that item travels with the folder and is not planned on its own: moving it
 * separately as well would pull it out of the subtree it belongs to.
 */
export function planFoldersMove(
  view: FoldersView,
  items: readonly FoldersItem[],
  destination?: FolderId,
): FoldersMovePlanResult {
  const issues: FoldersMoveIssue[] = [];

  const destinationKnown =
    destination === undefined || view.folders.some((folder) => folder.id === destination);
  if (destination !== undefined && !destinationKnown)
    issues.push({ kind: "unknown-destination", folder: destination });

  const located: Located[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const known = locate(view, item);
    if (known === undefined) {
      issues.push({ kind: "unknown-item", item });
      continue;
    }
    located.push({ item, ...known });
  }

  const carried = new Set<FolderId>(
    located.flatMap(({ item }) => (item.kind === "folder" ? foldersSubtree(view, item.id) : [])),
  );
  const moved = located.filter(
    ({ sourceFolder }) => sourceFolder === undefined || !carried.has(sourceFolder),
  );

  if (destination !== undefined && destinationKnown)
    for (const { item } of moved) {
      if (item.kind !== "folder") continue;
      if (foldersSubtree(view, item.id).includes(destination))
        issues.push({ kind: "into-own-descendant", folder: item.id, destination });
    }

  if (issues.length > 0) return { ok: false, issues };

  const taken = foldersSiblingNames(
    view,
    destination,
    moved.map(({ item }) => item.id),
  );

  const entries: FoldersMoveEntry[] = [];
  for (const { item, name, sourceFolder } of moved.sort(byCanonicalOrder)) {
    const resulting = foldersUniqueName(name, taken);
    taken.push(resulting);
    entries.push({
      item,
      currentName: name,
      name: resulting,
      renamed: resulting !== name,
      ...(sourceFolder === undefined ? {} : { sourceFolder }),
    });
  }

  return {
    ok: true,
    plan: { ...(destination === undefined ? {} : { destination }), entries },
  };
}

/** True when two plans say exactly the same thing. */
export function foldersMovePlansEqual(a: FoldersMovePlan, b: FoldersMovePlan): boolean {
  if (a.destination !== b.destination) return false;
  if (a.entries.length !== b.entries.length) return false;
  return a.entries.every((entry, index) => {
    const other = b.entries[index];
    if (other === undefined) return false;
    return (
      entry.item.kind === other.item.kind &&
      entry.item.id === other.item.id &&
      entry.currentName === other.currentName &&
      entry.name === other.name &&
      entry.renamed === other.renamed &&
      entry.sourceFolder === other.sourceFolder
    );
  });
}

/**
 * A project or a template the move gives a new name. Their names live in their own metadata, not
 * in the folder document, so the write path has to carry these out separately; a folder's name is
 * in the document and is renamed there.
 */
export interface FoldersLabelRename {
  readonly item: FoldersLeafItem;
  readonly name: string;
}

/** What applying a plan changes. */
export interface FoldersMoveApplication {
  /** The document to persist. */
  readonly document: FoldersDocument;
  /** Projects and templates whose label the move changes. */
  readonly labelRenames: readonly FoldersLabelRename[];
}

/**
 * The document a plan produces, plus the project and template label renames it implies.
 *
 * Applying a plan is arithmetic on an already validated plan; whether that plan may be committed
 * is the write path's decision.
 */
export function applyFoldersMove(
  view: FoldersView,
  movePlan: FoldersMovePlan,
): FoldersMoveApplication {
  const folderParents = new Map<FolderId, FolderId | undefined>();
  const folderNames = new Map<FolderId, string>();
  const projectFolders = new Map<ProjectId, FolderId | undefined>();
  const templateFolders = new Map<TemplateId, FolderId | undefined>();
  const labelRenames: FoldersLabelRename[] = [];

  for (const entry of movePlan.entries) {
    switch (entry.item.kind) {
      case "folder":
        folderParents.set(entry.item.id, movePlan.destination);
        folderNames.set(entry.item.id, entry.name);
        break;
      case "project":
        projectFolders.set(entry.item.id, movePlan.destination);
        if (entry.renamed) labelRenames.push({ item: entry.item, name: entry.name });
        break;
      case "template":
        templateFolders.set(entry.item.id, movePlan.destination);
        if (entry.renamed) labelRenames.push({ item: entry.item, name: entry.name });
        break;
    }
  }

  const folders = view.folders.map((folder) => ({
    ...folder,
    parent: folderParents.has(folder.id) ? folderParents.get(folder.id) : folder.parent,
    name: folderNames.get(folder.id) ?? folder.name,
  }));

  const projects = view.projects.map((project) => ({
    ...project,
    folder: projectFolders.has(project.id) ? projectFolders.get(project.id) : project.folder,
  }));

  const templates = view.templates.map((template) => ({
    ...template,
    folder: templateFolders.has(template.id) ? templateFolders.get(template.id) : template.folder,
  }));

  const document = foldersDocumentFromView({ ...view, folders, projects, templates });
  return { document, labelRenames };
}

//
// Internals
//

/** An item of the selection, with what the view says about it. */
interface Located {
  readonly item: FoldersItem;
  readonly name: string;
  /** Folder holding the item; absent when it is at the top level. */
  readonly sourceFolder?: FolderId;
}

/** The name and containing folder of an item the view holds, whichever kind it is. */
function locate(
  view: FoldersView,
  item: FoldersItem,
): { readonly name: string; readonly sourceFolder?: FolderId } | undefined {
  switch (item.kind) {
    case "folder": {
      const folder = view.folders.find((candidate) => candidate.id === item.id);
      return folder === undefined ? undefined : { name: folder.name, sourceFolder: folder.parent };
    }
    case "project": {
      const project = view.projects.find((candidate) => candidate.id === item.id);
      return project === undefined
        ? undefined
        : { name: project.name, sourceFolder: project.folder };
    }
    case "template": {
      const template = view.templates.find((candidate) => candidate.id === item.id);
      return template === undefined
        ? undefined
        : { name: template.name, sourceFolder: template.folder };
    }
  }
}

/**
 * Folders, then projects, then templates; within a kind by name, then by id. The order of the
 * items a caller hands in must not change the plan, or a preview and its write could differ over
 * nothing.
 */
function byCanonicalOrder(a: Located, b: Located): number {
  if (a.item.kind !== b.item.kind) return KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind];
  const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  if (byName !== 0) return byName;
  return String(a.item.id).localeCompare(String(b.item.id));
}

const KIND_ORDER: Readonly<Record<FoldersItem["kind"], number>> = {
  folder: 0,
  project: 1,
  template: 2,
};
