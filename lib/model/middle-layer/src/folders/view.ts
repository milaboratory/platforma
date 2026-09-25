import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import { normalizeDescription } from "../project";
import type { FoldersDecoded, FoldersDocumentProblem } from "./decode";
import type { FoldersDocument, FolderId } from "./document";
import { emptyFoldersDocument } from "./document";
import type { FoldersItem } from "./planner";

/** An item as the folder machinery needs to see it: an identity and the label shown to a user. */
export interface FoldersItemInput<Id extends string> {
  readonly id: Id;
  readonly name: string;
}

/** Where an item sits in the tree. */
export interface FoldersPlacement {
  /** Absent for an item at the top level. */
  readonly folder?: FolderId;
  /** Containing folders, outermost first, including the folder holding the item. */
  readonly ancestors: readonly FolderId[];
  /**
   * Names of those folders, outermost first. Empty for an item at the top level. This is what
   * tells two identically named items apart in a search across the whole tree.
   */
  readonly path: readonly string[];
}

/** An item with the folder holding it resolved. */
export interface FoldersItemView<Id extends string>
  extends FoldersItemInput<Id>, FoldersPlacement {}

export type FoldersProjectInput = FoldersItemInput<ProjectId>;
export type FoldersTemplateInput = FoldersItemInput<TemplateId>;
export type FoldersProjectView = FoldersItemView<ProjectId>;
export type FoldersTemplateView = FoldersItemView<TemplateId>;

/** A folder with its place in the tree resolved. */
export interface FolderView {
  readonly id: FolderId;
  readonly name: string;
  /** Absent for a top-level folder. */
  readonly parent?: FolderId;
  /** Containing folders, outermost first, excluding this folder. */
  readonly ancestors: readonly FolderId[];
  /** Names of the ancestors followed by this folder's own name. */
  readonly path: readonly string[];
  /** Free text the user wrote about the folder. Absent when there is none. */
  readonly description?: string;
  /** True when the stored parent was unusable and this folder was lifted to the top level. */
  readonly lifted: boolean;
}

/** The whole tree as the desktop consumes it. */
export interface FoldersView {
  readonly folders: readonly FolderView[];
  /** Every project handed in, in the order it was handed in. Nothing here is ever dropped. */
  readonly projects: readonly FoldersProjectView[];
  /** Every template handed in, in the order it was handed in. Nothing here is ever dropped. */
  readonly templates: readonly FoldersTemplateView[];
  /** False when folder writes must be refused. */
  readonly writable: boolean;
  /** Present when the stored document could not be used as it stands. */
  readonly problem?: FoldersDocumentProblem;
  /** True when what the view shows differs from what is stored, because the read healed it. */
  readonly healed: boolean;
}

/**
 * Resolve a decoded document against the project and template lists into the view the desktop
 * renders.
 *
 * The read heals rather than fails. An item the document does not mention is at the top level;
 * an assignment naming an item that is gone is ignored; a folder whose parent is missing, or
 * which sits in a cycle, is lifted to the top level instead of being hidden. No input can make a
 * project or a template disappear.
 */
export function healFolders(
  decoded: FoldersDecoded,
  projects: readonly FoldersProjectInput[],
  templates: readonly FoldersTemplateInput[] = [],
): FoldersView {
  const view = foldersViewFromDocument(decoded.document, projects, templates);
  return { ...view, writable: decoded.writable, problem: decoded.problem };
}

/** The same healing read, for a caller that already holds a document. */
export function foldersViewFromDocument(
  document: FoldersDocument,
  projects: readonly FoldersProjectInput[],
  templates: readonly FoldersTemplateInput[] = [],
): FoldersView {
  const resolution = resolveFolders(document);
  const { folders, byId } = resolution;
  let healed = resolution.healed;

  const placedProjects = place(projects, document.assignments, byId);
  const placedTemplates = place(templates, document.templateAssignments, byId);
  if (placedProjects.healed || placedTemplates.healed) healed = true;

  return {
    folders,
    projects: placedProjects.items,
    templates: placedTemplates.items,
    writable: true,
    healed,
  };
}

/** Direct children of a folder, or of the top level when no folder is given. */
export function foldersChildren(
  view: FoldersView,
  parent?: FolderId,
): {
  readonly folders: readonly FolderView[];
  readonly projects: readonly FoldersProjectView[];
  readonly templates: readonly FoldersTemplateView[];
} {
  return {
    folders: view.folders.filter((folder) => folder.parent === parent),
    projects: view.projects.filter((project) => project.folder === parent),
    templates: view.templates.filter((template) => template.folder === parent),
  };
}

/**
 * Names already taken by items of one kind directly inside a folder, or at the top level when no
 * folder is given.
 *
 * Each kind has its own namespace: two folders, two projects or two templates beside each other
 * never answer to one name, but a folder, a project and a template may. This is the one list
 * every naming decision is made against.
 *
 * `exclude` names the ids that must not count against themselves — the items being renamed or
 * moved.
 */
export function foldersSiblingNames(
  view: FoldersView,
  kind: FoldersItem["kind"],
  parent?: FolderId,
  exclude: Iterable<string> = [],
): string[] {
  const skipped = new Set<string>(exclude);
  const children = foldersChildren(view, parent);
  const ofKind: readonly { readonly id: string; readonly name: string }[] =
    kind === "folder"
      ? children.folders
      : kind === "project"
        ? children.projects
        : children.templates;
  return ofKind.filter((item) => !skipped.has(item.id)).map((item) => item.name);
}

/** A folder and every folder beneath it, the folder itself first. */
export function foldersSubtree(view: FoldersView, folder: FolderId): readonly FolderId[] {
  const subtree: FolderId[] = [];
  const queue: FolderId[] = [folder];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    subtree.push(current);
    for (const candidate of view.folders)
      if (candidate.parent === current) queue.push(candidate.id);
  }
  return subtree;
}

/**
 * The document a healed view stands for — what a write must persist so that the next read finds
 * the tree it just rendered.
 */
export function foldersDocumentFromView(view: FoldersView): FoldersDocument {
  const document = emptyFoldersDocument();
  return {
    ...document,
    folders: view.folders.map((folder) => {
      const description = normalizeDescription(folder.description);
      return {
        id: folder.id,
        name: folder.name,
        ...(folder.parent === undefined ? {} : { parent: folder.parent }),
        ...(description === undefined ? {} : { description }),
      };
    }),
    assignments: Object.fromEntries(
      view.projects.flatMap((project) =>
        project.folder === undefined ? [] : [[project.id, project.folder] as const],
      ),
    ),
    templateAssignments: Object.fromEntries(
      view.templates.flatMap((template) =>
        template.folder === undefined ? [] : [[template.id, template.folder] as const],
      ),
    ),
  };
}

//
// Internals
//

/**
 * Resolve where each item of one list sits, and report whether doing so had to heal anything: a
 * duplicate id in the list, an assignment to a folder that is not there, or an assignment naming
 * an item the list no longer holds.
 */
function place<Id extends string>(
  items: readonly FoldersItemInput<Id>[],
  assignments: Readonly<Record<string, FolderId>>,
  byId: ReadonlyMap<FolderId, FolderView>,
): { readonly items: FoldersItemView<Id>[]; readonly healed: boolean } {
  let healed = false;
  const seen = new Set<string>();
  const placed: FoldersItemView<Id>[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      healed = true;
      continue;
    }
    seen.add(item.id);

    const assigned = assignments[item.id];
    const folder = assigned === undefined ? undefined : byId.get(assigned);
    if (assigned !== undefined && folder === undefined) healed = true;

    placed.push(
      folder === undefined
        ? { id: item.id, name: item.name, ancestors: [], path: [] }
        : {
            id: item.id,
            name: item.name,
            folder: folder.id,
            ancestors: [...folder.ancestors, folder.id],
            path: [...folder.path],
          },
    );
  }

  for (const id of Object.keys(assignments)) if (!seen.has(id)) healed = true;

  return { items: placed, healed };
}

interface FolderResolution {
  readonly folders: readonly FolderView[];
  readonly byId: ReadonlyMap<FolderId, FolderView>;
  readonly healed: boolean;
}

/**
 * Place every folder in the tree, lifting to the top level the ones whose stored parent cannot be
 * honoured. A lifted folder keeps its own children, which simply sit one or more levels higher.
 */
function resolveFolders(document: FoldersDocument): FolderResolution {
  const stored = new Map<FolderId, { name: string; parent?: FolderId; description?: string }>();
  let healed = false;
  for (const folder of document.folders) {
    if (stored.has(folder.id)) {
      healed = true;
      continue;
    }
    stored.set(folder.id, {
      name: folder.name,
      parent: folder.parent,
      description: folder.description,
    });
  }

  const resolved = new Map<FolderId, FolderView>();
  const visiting = new Set<FolderId>();

  const resolve = (id: FolderId): FolderView => {
    const existing = resolved.get(id);
    if (existing !== undefined) return existing;

    const entry = stored.get(id);
    if (entry === undefined) throw new Error(`folder ${id} is not in the document`);

    if (visiting.has(id)) {
      // A cycle. Cutting it here, at the folder the walk came back to, keeps the rest of the
      // chain attached below this one instead of scattering every folder in the cycle.
      const lifted = topLevel(id, entry.name, true, entry.description);
      resolved.set(id, lifted);
      healed = true;
      return lifted;
    }

    visiting.add(id);
    try {
      const parentId = entry.parent;
      const parent =
        parentId === undefined || !stored.has(parentId) ? undefined : resolve(parentId);

      const alreadyResolved = resolved.get(id);
      if (alreadyResolved !== undefined) return alreadyResolved;

      const view =
        parent === undefined
          ? topLevel(id, entry.name, parentId !== undefined, entry.description)
          : {
              id,
              name: entry.name,
              parent: parent.id,
              ancestors: [...parent.ancestors, parent.id],
              path: [...parent.path, entry.name],
              ...(entry.description === undefined ? {} : { description: entry.description }),
              lifted: false,
            };

      if (view.lifted) healed = true;
      resolved.set(id, view);
      return view;
    } finally {
      visiting.delete(id);
    }
  };

  const folders: FolderView[] = [];
  for (const id of stored.keys()) folders.push(resolve(id));

  return { folders, byId: resolved, healed };
}

function topLevel(id: FolderId, name: string, lifted: boolean, description?: string): FolderView {
  return {
    id,
    name,
    ancestors: [],
    path: [name],
    ...(description === undefined ? {} : { description }),
    lifted,
  };
}
