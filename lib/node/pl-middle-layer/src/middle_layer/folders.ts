import type {
  Filter,
  PlClient,
  PlTransaction,
  ResourceType,
  SignedResourceId,
} from "@milaboratories/pl-client";
import {
  field,
  isNullSignedResourceId,
  resourceIdToString,
  resourceTypesEqual,
  treeFilter,
} from "@milaboratories/pl-client";
import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { WatchableValue } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import type {
  FoldersDecoded,
  FoldersDocument,
  FoldersDocumentProblem,
  FoldersEdit,
  FolderId,
  FolderView,
  FoldersItem,
  FoldersLabelRename,
  FoldersLeafItem,
  FoldersMoveOutcome,
  FoldersMovePlan,
  FoldersMovePlanResult,
  FoldersPlacement,
  FoldersProjectInput,
  FoldersRemoval,
  FoldersRemovalOutcome,
  FoldersRemovalPlanResult,
  FoldersTemplateInput,
  FoldersView,
  FoldersViolation,
  ProjectMeta,
} from "@milaboratories/pl-model-middle-layer";
import { asProjectId, asTemplateId } from "@milaboratories/pl-model-common";
import {
  asFolderId,
  commitFoldersMove,
  commitFoldersRemoval,
  decodeStoredFoldersDocument,
  emptyFoldersDocument,
  formatFoldersViolation,
  healFolders,
  planFoldersRemoval,
  planFoldersMove,
  foldersDocumentFromView,
  foldersNameBlank,
  foldersNameTaken,
  foldersSiblingNames,
  foldersSubtree,
  foldersUniqueName,
  normalizeDescription,
  validateFoldersDocument,
} from "@milaboratories/pl-model-middle-layer";
import { randomUUID } from "node:crypto";
import type { ProjectId, ProjectListEntry } from "../model/project_model";
import { ProjectLastModifiedTimestamp, ProjectMetaKey } from "../model/project_model";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type { TreeAndComputableU } from "./types";
import { projectListEntries } from "./project_list";
import type { TemplateId, TemplateListEntry } from "./template_list";
import { TemplateLabelKey, templateListEntries } from "./template_list";
import { renameTemplate } from "../mutator/template";
import type { ListedKind } from "../mutator/list";
import { listedById, notListedError } from "../mutator/list";

/** Field on the user's client root holding the folder singleton. */
export const FoldersField = "folders";
export const FoldersResourceType: ResourceType = { name: "Folders", version: "1" };

/**
 * The one field of the singleton. It holds the whole tree as a single immutable JSON value
 * resource; a write mints a new value and re-points this field at it, the way a block's stored
 * state is rewritten.
 */
export const FoldersDocumentField = "document";

/** A project list entry with its place in the folder tree resolved. */
export type FoldersProjectEntry = ProjectListEntry & FoldersPlacement;

/** A template list entry with its place in the folder tree resolved. */
export type FoldersTemplateEntry = TemplateListEntry & FoldersPlacement;

/**
 * The single value the folder feature puts across the API boundary: the tree and the project list
 * already joined.
 *
 * Two independently refreshed values would let a project show up in a folder the tree has not
 * heard of, with nobody owning the reconciliation, so the join happens here and the desktop never
 * sees the halves.
 */
export interface FoldersListing {
  readonly folders: readonly FolderView[];
  /** Every project, most recently modified first. Nothing here is ever dropped. */
  readonly projects: readonly FoldersProjectEntry[];
  /** Every stored template, most recently created first. Nothing here is ever dropped. */
  readonly templates: readonly FoldersTemplateEntry[];
  /** False when every folder write is refused, because the document is not ours to rewrite. */
  readonly writable: boolean;
  /** Present when the stored document could not be used as it stands. */
  readonly problem?: FoldersDocumentProblem;
  /** True when what the listing shows differs from what is stored, because the read healed it. */
  readonly healed: boolean;
}

/** Every singleton a folder operation touches. */
export interface FoldersRids {
  readonly folders: SignedResourceId;
  readonly projects: SignedResourceId;
  readonly templates: SignedResourceId;
}

/**
 * Resolves the folder singleton on the transaction's client root, lazily creating (and locking)
 * an empty one when {@link FoldersField} is not yet populated. Same shape as the
 * project-list and template-list singletons beside it.
 */
export async function ensureFoldersRid(tx: PlTransaction): Promise<SignedResourceId> {
  const f = field(tx.clientRoot, FoldersField);
  tx.createField(f, "Dynamic");
  const fData = await tx.getField(f);
  if (isNullSignedResourceId(fData.value)) {
    const ref = tx.createEphemeral(FoldersResourceType);
    tx.lock(ref);
    tx.setField(f, ref);
    return await ref.globalId;
  }
  return fData.value;
}

export const FoldersTreePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, FoldersResourceType)) return [];
  return resource.fields;
};

export const foldersFieldFilter: Filter = treeFilter.resourceTypeEq(FoldersResourceType.name);

/**
 * The folder tree plus the computable that joins it with the project list.
 *
 * Both halves are read from one computable context, so the listing is always one consistent
 * snapshot. Nothing is published while either half is still syncing: a project would otherwise
 * render at the top level for a poll or two and then jump into its folder.
 */
export async function createFolderList(
  pl: PlClient,
  rid: SignedResourceId,
  projectsTree: SynchronizedTreeState,
  templatesTree: SynchronizedTreeState,
  openedProjects: WatchableValue<ProjectId[]>,
  env: MiddleLayerEnvironment,
): Promise<TreeAndComputableU<FoldersListing>> {
  const tree = await SynchronizedTreeState.init(
    pl,
    rid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: FoldersTreePruningFunction,
      fieldFilter: foldersFieldFilter,
    },
    env.logger,
  );

  const c = Computable.make((ctx) => {
    const projectsNode = ctx.accessor(projectsTree.entry()).node();
    const templatesNode = ctx.accessor(templatesTree.entry()).node();
    const foldersNode = ctx.accessor(tree.entry()).node();
    if (projectsNode === undefined || templatesNode === undefined || foldersNode === undefined) {
      ctx.markUnstable("folders_not_synced");
      return undefined;
    }

    const entries = projectListEntries(projectsNode, openedProjects.getValue(ctx));
    const templates = templateListEntries(templatesNode);
    const result = foldersListing(foldersNode, entries, templates);
    if (result.status === "not-synced") {
      ctx.markUnstable(result.reason);
      return undefined;
    }
    return result.listing;
  }).withStableType();

  return { computable: c, tree };
}

/** The part of a tree node the folder reader needs from the folder singleton. */
export interface FoldersNode {
  listDynamicFields(): string[];
  traverse(step: {
    field: string;
    stableIfNotFound: true;
  }): { getDataAsString(): string | undefined } | undefined;
}

/** Either a listing to publish, or the reason there is nothing worth publishing yet. */
export type FoldersListingResult =
  | { readonly status: "not-synced"; readonly reason: string }
  | { readonly status: "ready"; readonly listing: FoldersListing };

/**
 * Joins the folder singleton with an already-read project list.
 *
 * Split out of the computable so that the join, the first-paint rule and the degrade can be
 * exercised without a backend — the same reason {@link projectListEntries} is a function rather
 * than a closure. The interface it takes is the exact slice of the tree accessor it touches, so
 * the real accessor satisfies it structurally.
 *
 * The listing is built by mapping over the **project list**, never over the folder view, so no
 * folder input can drop a project. Do not refactor that into a map over the view.
 */
export function foldersListing(
  foldersNode: FoldersNode,
  entries: readonly ProjectListEntry[],
  templateEntries: readonly TemplateListEntry[] = [],
): FoldersListingResult {
  // The field is absent on every account that has never made a folder, and that absence is
  // final until a write creates it.
  const documentNode = foldersNode.traverse({
    field: FoldersDocumentField,
    stableIfNotFound: true as const,
  });

  // A document field that exists but whose value has not arrived is not "no folders" — it is a
  // tree we cannot describe yet, and publishing a flat list here is exactly the first-paint
  // flicker this join exists to avoid.
  if (documentNode === undefined && foldersNode.listDynamicFields().includes(FoldersDocumentField))
    return { status: "not-synced", reason: "folders_document_not_synced" };

  // A node that is in the tree carries whatever data it had when the frame was taken; the tree
  // never fills data in later. So a document resource present with no blob is not a slow sync —
  // it is a document this build cannot read, and the read degrades to the flat list with writes
  // refused rather than waiting for something that will not arrive.
  const decoded = decodeStoredFoldersDocument(
    documentNode === undefined
      ? { present: false }
      : { present: true, raw: documentNode.getDataAsString() },
  );

  const view = healFolders(
    decoded,
    entries.map((entry) => ({ id: entry.id, name: entry.meta.label })),
    templateEntries.map((entry) => ({ id: entry.id, name: entry.label })),
  );

  return {
    status: "ready",
    listing: {
      folders: view.folders,
      projects: withPlacement(entries, view.projects),
      templates: withPlacement(templateEntries, view.templates),
      writable: view.writable,
      ...(view.problem === undefined ? {} : { problem: view.problem }),
      healed: view.healed,
    },
  };
}

/**
 * The one way the folder document is written by a folder operation.
 *
 * The whole body runs inside a single write transaction: the document and the project list are
 * re-read there, the edit is computed from what that read found, and only then is a new value
 * resource minted and the field re-pointed. The backend validates read sets, so a racing commit
 * aborts this one and the client replays the body against fresh state — which is only true
 * because the reading happens *inside* the body. Nothing may be carried across attempts, and
 * anything with an identity of its own (a folder id) is minted by the caller beforehand, so a
 * retry cannot hand back an id that was never stored.
 *
 * The advisory lock serialises writers inside one process. It is not a substitute for the
 * backend's conflict detection — it just removes the cheap case, one window racing itself.
 */
export async function withFolders<T>(
  pl: PlClient,
  name: string,
  rids: FoldersRids,
  body: (view: FoldersView) => FoldersEdit<T>,
): Promise<T> {
  return await pl.withWriteTx(
    name,
    async (tx) => {
      const read = await readFolders(tx, rids);
      if (!read.decoded.writable) throw new Error(refusalMessage(read.decoded.problem));

      const edit = body(read.view);
      if (edit.document === undefined) return edit.result;

      rejectNewViolations(read, edit.document, edit.labelRenames ?? [], [
        ...(edit.deletedProjects ?? []),
        ...(edit.deletedTemplates ?? []),
      ]);
      writeFoldersDocument(tx, rids, read, edit.document);

      // A project's label is written straight into its metadata rather than through the project
      // mutator, which would migrate projects the user only asked to move. Everything else the
      // metadata carries — the description — is preserved by writing the value read here rather
      // than a fresh one. It is safe to do so because that value was read in this same
      // transaction: a writable transaction's point reads are conflict-tracked, so a metadata
      // write committing in parallel aborts one of the two and the loser is replayed against the
      // winner's state. A template's label is a value of its own and is simply replaced.
      const timestamp = JSON.stringify(Date.now());
      for (const rename of edit.labelRenames ?? []) {
        if (rename.item.kind === "template") {
          const rid = read.templateRids.get(rename.item.id);
          if (rid === undefined) throw notListedError("Template", rename.item.id);
          renameTemplate(tx, rid, rename.name);
          continue;
        }
        const rid = read.projectRids.get(rename.item.id);
        const meta = read.projectMetas.get(rename.item.id);
        if (rid === undefined || meta === undefined)
          throw notListedError("Project", rename.item.id);
        tx.setKValue(rid, ProjectMetaKey, JSON.stringify({ ...meta, label: rename.name }));
        tx.setKValue(rid, ProjectLastModifiedTimestamp, timestamp);
      }

      // Removing the field from the list is what deletes a project or a template, exactly as
      // MiddleLayer.deleteProject and deleteTemplate do it; here it rides the same transaction as
      // the document rewrite, so a folder never disappears while what it held survives, or the
      // reverse.
      await removeListedFields(tx, rids.projects, edit.deletedProjects ?? [], "Project");
      await removeListedFields(tx, rids.templates, edit.deletedTemplates ?? [], "Template");

      await tx.commit();
      return edit.result;
    },
    { lockId: foldersLockId(rids.folders) },
  );
}

/**
 * The same read the write path performs, in a read transaction — what a preview is computed from,
 * so that a preview and the write that follows it never disagree about how the tree was read.
 */
export async function readFoldersView(
  pl: PlClient,
  name: string,
  rids: FoldersRids,
): Promise<FoldersView> {
  return await pl.withReadTx(name, async (tx) => {
    return (await readFolders(tx, rids)).view;
  });
}

/**
 * The folder tree inside a transaction that is not a folder operation of its own: one that
 * creates, renames or copies a project or a template and has to name it or place it.
 *
 * Opening it reads the tree once, and every call answers from that read. A placement updates
 * the tree in memory as well as in the transaction, so a later call on the same handle sees the
 * folders and assignments it wrote. An item created in the transaction after the handle was
 * opened is placed by id only: the handle never learned its name.
 *
 * Unlike {@link withFolders} this takes no advisory lock, because it does not own the
 * transaction. The backend's read-set validation still applies: a folder write committing in
 * parallel aborts one of the two and the loser is replayed.
 *
 * Every placement is best-effort towards a document that is not ours to rewrite — one written by
 * a newer build, or one nothing here can parse: it writes nothing and never throws, and the item
 * stays at the top level, exactly where it landed before folders existed. An item that could not
 * be placed is still an item, and failing its creation over the placement would be the worse
 * trade. A destination that no longer exists is different: it is a folder the caller named and
 * the user chose, so the placement throws and the creation fails with it.
 */
export interface FoldersTx {
  /** The tree as this transaction sees it, placements made through this handle included. */
  readonly view: FoldersView;
  /** Resource id of every project the list holds. */
  readonly projectRids: ReadonlyMap<ProjectId, SignedResourceId>;
  /** Resource id of every template the list holds under a label. */
  readonly templateRids: ReadonlyMap<TemplateId, SignedResourceId>;
  /**
   * Names already taken by items of one kind in a folder, or at the top level, for choosing one
   * that is free before anything of that kind is created. Each kind has a namespace of its own.
   *
   * Empty when the folder document is not ours to read: nothing is then known about who sits
   * where, and inventing collisions out of that would rename copies for no reason.
   */
  namesTakenIn(folder: FolderId | undefined, kind: FoldersItem["kind"]): string[];
  /** Names already taken by items of one kind where `project` sits — where something made from it
   *  lands. Empty for the same reason {@link namesTakenIn} can be. */
  namesTakenBeside(project: ProjectId, kind: FoldersItem["kind"]): string[];
  /** The folder holding a project, or undefined at the top level. */
  folderOf(project: ProjectId): FolderId | undefined;
  /**
   * Refuses a name for a project or template rename when a sibling of the same kind already
   * carries it. A folder, a project and a template beside each other may share a name; two
   * projects, or two templates, may not.
   *
   * Renaming a project or a template is not a folder operation and does not go through
   * {@link withFolders} — it writes the item's own metadata. But the folder rule governs its
   * name, so without this check a user could rename two projects sitting in the same folder to
   * the same name, and the uniqueness the rest of the feature relies on would be false from the
   * day it shipped.
   *
   * The name is checked against the state the rename actually commits against, since the read
   * happened in the rename's own transaction. Four things it deliberately does not do:
   *
   * - It never refuses a blank name: projects and templates may carry an empty label.
   * - It never refuses a rename to what the item is already called, compared without regard to
   *   case. An account predating folders may already hold two projects with the same name in
   *   one place, because nothing enforced uniqueness before; such a pair must stay renameable,
   *   and neither of them is rewritten by anything here.
   * - It stays silent when the item is not in the tree — a project whose metadata could not be
   *   read — since there is then no current name to compare against and refusing would block a
   *   rename on a transient read.
   * - It stays silent when the folder document is not ours to read. Such a document reads as
   *   "no folders", which would put every project at the top level and turn this per-parent
   *   check into a global one, refusing renames that are perfectly legal in the tree that is
   *   actually stored. Folder *writes* are refused in that state; a rename is not a folder write
   *   and must keep working.
   */
  assertNameFree(item: FoldersLeafItem, name: string): void;
  /** Puts items into a folder. Items destined for the top level need no assignment at all, so
   *  nothing is written for them. */
  place(items: readonly FoldersLeafItem[], folder: FolderId | undefined): void;
  /**
   * Recreates a folder subtree under `destination`, or at the top level, and puts each item in
   * its own folder inside it.
   *
   * What travels is the shape of a subtree, not its identity: the incoming folder keys are the
   * caller's and mean nothing here, so a fresh id is minted for each. Only the root is renamed to
   * be free among the folders in the destination — the folders inside it are only ever compared
   * with each other, and they came in already distinct.
   *
   * @returns `unwritable` when the document is not ours to rewrite and nothing was grafted.
   */
  graft(subtree: FoldersGraft, destination: FolderId | undefined): "grafted" | "unwritable";
}

/** A subtree to graft: folders under keys local to the caller, and items naming the folder
 *  holding them. */
export interface FoldersGraft {
  /** Key of the folder that becomes the grafted root; the one folder with no parent. */
  readonly root: string;
  readonly folders: Readonly<
    Record<
      string,
      { readonly name: string; readonly parent?: string; readonly description?: string }
    >
  >;
  readonly items: readonly (FoldersLeafItem & { readonly folder: string })[];
}

/** Opens the folder tree inside the caller's transaction; see {@link FoldersTx}. */
export async function openFoldersTx(tx: PlTransaction, rids: FoldersRids): Promise<FoldersTx> {
  const read = await readFolders(tx, rids);
  const projects = read.view.projects.map(({ id, name }) => ({ id, name }));
  const templates = read.view.templates.map(({ id, name }) => ({ id, name }));

  let view = read.view;
  let document = foldersDocumentFromView(read.view);
  let documentFieldExists = read.documentFieldExists;

  const write = (next: FoldersDocument): void => {
    writeFoldersDocument(tx, rids, { ...read, documentFieldExists }, next);
    documentFieldExists = true;
    document = next;
    view = healFolders({ document: next, writable: true }, projects, templates);
  };

  const assertFolderExists = (folder: FolderId): void => {
    if (!view.folders.some((candidate) => candidate.id === folder))
      throw new Error(`Folder ${folder} does not exist.`);
  };

  const namesTakenIn = (folder: FolderId | undefined, kind: FoldersItem["kind"]): string[] =>
    read.decoded.writable ? foldersSiblingNames(view, kind, folder) : [];

  const folderOf = (project: ProjectId): FolderId | undefined =>
    view.projects.find((candidate) => candidate.id === project)?.folder;

  return {
    get view() {
      return view;
    },
    projectRids: read.projectRids,
    templateRids: read.templateRids,
    namesTakenIn,
    namesTakenBeside: (project, kind) => namesTakenIn(folderOf(project), kind),
    folderOf,

    assertNameFree(item, name) {
      if (foldersNameBlank(name) || !read.decoded.writable) return;

      const placed =
        item.kind === "project"
          ? view.projects.find((candidate) => candidate.id === item.id)
          : view.templates.find((candidate) => candidate.id === item.id);
      if (placed === undefined) return;

      // Nothing is in collision with itself, so a rename that only changes the case of its own
      // name goes through even where a pre-existing duplicate sits beside it.
      if (foldersNameTaken(name, [placed.name])) return;

      const siblings = foldersSiblingNames(view, item.kind, placed.folder, [item.id]);
      if (foldersNameTaken(name, siblings)) throw new Error(nameTakenMessage(item.kind, name));
    },

    place(items, folder) {
      if (folder === undefined || items.length === 0 || !read.decoded.writable) return;
      assertFolderExists(folder);

      const assignments = { ...document.assignments };
      const templateAssignments = { ...document.templateAssignments };
      for (const item of items) {
        if (item.kind === "project") assignments[item.id] = folder;
        else templateAssignments[item.id] = folder;
      }
      write({ ...document, assignments, templateAssignments });
    },

    graft(subtree, destination) {
      if (!read.decoded.writable) return "unwritable";
      if (destination !== undefined) assertFolderExists(destination);

      const root: FoldersGraft["folders"][string] | undefined = subtree.folders[subtree.root];
      if (root === undefined) throw new Error(`The subtree holds no folder ${subtree.root}.`);
      const rootName = foldersUniqueName(
        root.name,
        foldersSiblingNames(view, "folder", destination),
      );

      const incoming = Object.keys(subtree.folders);
      const minted = new Map<string, FolderId>();
      for (const key of incoming) minted.set(key, asFolderId(randomUUID()));

      const folders = [...document.folders];
      for (const key of incoming) {
        const incomingFolder = subtree.folders[key];
        const parent =
          key === subtree.root
            ? destination
            : mustGet(minted, incomingFolder.parent ?? subtree.root);
        const description = normalizeDescription(incomingFolder.description);
        folders.push({
          id: mustGet(minted, key),
          name: key === subtree.root ? rootName : incomingFolder.name,
          ...(parent === undefined ? {} : { parent }),
          ...(description === undefined ? {} : { description }),
        });
      }

      const assignments = { ...document.assignments };
      const templateAssignments = { ...document.templateAssignments };
      for (const item of subtree.items) {
        const folder = minted.get(item.folder);
        if (folder === undefined) continue; // an item pointing at a folder that never arrived
        if (item.kind === "project") assignments[item.id] = folder;
        else templateAssignments[item.id] = folder;
      }

      write({ ...document, folders, assignments, templateAssignments });
      return "grafted";
    },
  };
}

/**
 * Creates a folder and returns its id.
 *
 * The name is typed by a human, so a name another folder in the destination already carries is
 * rejected rather than quietly suffixed — a text field that disagrees with what was typed is worse
 * than one that says no. A project or a template of that name beside it is no obstacle.
 */
export async function createFolder(
  pl: PlClient,
  rids: FoldersRids,
  name: string,
  parent?: FolderId,
): Promise<FolderId> {
  if (foldersNameBlank(name)) throw new Error("A folder name cannot be empty.");
  const wanted = name.trim();

  // Minted here, outside the transaction: an attempt that conflicts persists nothing, so an id
  // minted inside one could be handed back to the caller after never having been stored.
  const id = asFolderId(randomUUID());

  await withFolders(pl, "MLCreateFolder", rids, (view) => {
    if (parent !== undefined && !view.folders.some((folder) => folder.id === parent))
      throw new Error(`Folder ${parent} does not exist.`);
    if (foldersNameTaken(wanted, foldersSiblingNames(view, "folder", parent)))
      throw new Error(nameTakenMessage("folder", wanted));

    const base = foldersDocumentFromView(view);
    return {
      result: undefined,
      document: {
        ...base,
        folders: [
          ...base.folders,
          parent === undefined ? { id, name: wanted } : { id, name: wanted, parent },
        ],
      },
    };
  });

  return id;
}

/** Renames a folder. A human typed this name too, so a collision is rejected, not suffixed. */
export async function renameFolder(
  pl: PlClient,
  rids: FoldersRids,
  folder: FolderId,
  name: string,
): Promise<void> {
  if (foldersNameBlank(name)) throw new Error("A folder name cannot be empty.");
  const wanted = name.trim();

  await withFolders(pl, "MLRenameFolder", rids, (view) => {
    const target = view.folders.find((candidate) => candidate.id === folder);
    if (target === undefined) throw new Error(`Folder ${folder} does not exist.`);

    const siblings = foldersSiblingNames(view, "folder", target.parent, [folder]);
    if (foldersNameTaken(wanted, siblings)) throw new Error(nameTakenMessage("folder", wanted));

    const base = foldersDocumentFromView(view);
    return {
      result: undefined,
      document: {
        ...base,
        folders: base.folders.map((candidate) =>
          candidate.id === folder ? { ...candidate, name: wanted } : candidate,
        ),
      },
    };
  });
}

/**
 * Sets what a folder says about itself. Blank clears it.
 *
 * Unlike a name, a description is in no namespace: nothing is checked against the siblings, and
 * two folders may say the same thing about themselves.
 */
export async function setFolderDescription(
  pl: PlClient,
  rids: FoldersRids,
  folder: FolderId,
  description: string,
): Promise<void> {
  const wanted = normalizeDescription(description);

  await withFolders(pl, "MLSetFolderDescription", rids, (view) => {
    const target = view.folders.find((candidate) => candidate.id === folder);
    if (target === undefined) throw new Error(`Folder ${folder} does not exist.`);

    const base = foldersDocumentFromView(view);
    return {
      result: undefined,
      document: {
        ...base,
        folders: base.folders.map((candidate) => {
          if (candidate.id !== folder) return candidate;
          const { description: _dropped, ...rest } = candidate;
          return wanted === undefined ? rest : { ...rest, description: wanted };
        }),
      },
    };
  });
}

/**
 * The shape of a folder subtree under ids local to the caller: a fresh id per folder, the root's
 * own parent left behind so the subtree stands alone, and a lookup from a real folder id to its
 * local one.
 *
 * Both ways of copying a folder need this. A share carries the shape into another user's tree and
 * a duplicate rebuilds it beside the source, and neither may carry the folder ids themselves,
 * because the document that receives the subtree mints its own.
 */
export function foldersLocalSubtree<Id extends string>(
  view: FoldersView,
  root: FolderId,
  mint: () => Id,
): {
  readonly inSubtree: ReadonlySet<FolderId>;
  readonly localId: (id: FolderId) => Id;
  readonly folders: Record<Id, { name: string; parent?: Id; description?: string }>;
} {
  const inSubtree = new Set(foldersSubtree(view, root));

  const localIds = new Map<FolderId, Id>();
  for (const id of inSubtree) localIds.set(id, mint());
  const localId = (id: FolderId): Id => {
    const local = localIds.get(id);
    if (local === undefined) throw new Error(`Folder ${id} is not under ${root}.`);
    return local;
  };

  const folders = {} as Record<Id, { name: string; parent?: Id; description?: string }>;
  for (const candidate of view.folders) {
    if (!inSubtree.has(candidate.id)) continue;
    // The copied folder is the subtree's root: its own parent stays behind. Every other folder of
    // the subtree has its parent in the subtree too.
    const parent = candidate.id === root ? undefined : localId(candidate.parent ?? root);
    folders[localId(candidate.id)] = {
      name: candidate.name,
      ...(parent === undefined ? {} : { parent }),
      ...(candidate.description === undefined ? {} : { description: candidate.description }),
    };
  }

  return { inSubtree, localId, folders };
}

/**
 * The plan a move would produce, computed from a fresh read — what the confirmation dialog shows.
 * The same planner runs again inside the write, over the same shape of read.
 */
export async function previewFoldersMove(
  pl: PlClient,
  rids: FoldersRids,
  items: readonly FoldersItem[],
  destination?: FolderId,
): Promise<FoldersMovePlanResult> {
  const view = await readFoldersView(pl, "MLPreviewFoldersMove", rids);
  return planFoldersMove(view, items, destination);
}

/**
 * Moves any mix of folders, projects and templates into one destination, committing only when
 * the plan recomputed inside the transaction is identical to `confirmedPlan`.
 */
export async function moveFolderItems(
  pl: PlClient,
  rids: FoldersRids,
  items: readonly FoldersItem[],
  destination: FolderId | undefined,
  confirmedPlan: FoldersMovePlan,
): Promise<FoldersMoveOutcome> {
  return await withFolders(pl, "MLMoveFolderItems", rids, (view) =>
    commitFoldersMove(view, planFoldersMove(view, items, destination), confirmedPlan),
  );
}

/** What deleting a folder would destroy: the subtree of folders, and every project and template
 *  in it. */
export async function previewFolderDeletion(
  pl: PlClient,
  rids: FoldersRids,
  folder: FolderId,
): Promise<FoldersRemovalPlanResult> {
  const view = await readFoldersView(pl, "MLPreviewFolderDeletion", rids);
  return planFoldersRemoval(view, folder);
}

/**
 * Deletes a folder, every folder inside it, and every project and template held anywhere in that
 * subtree.
 *
 * Deletion cannot be undone, so `confirmedRemoval` is required: the removal is recomputed here and
 * the write commits only if it names exactly the same things the caller confirmed. A project
 * dropped into the folder after the dialog opened therefore aborts the deletion rather than being
 * destroyed unseen.
 */
export async function deleteFolder(
  pl: PlClient,
  rids: FoldersRids,
  folder: FolderId,
  confirmedRemoval?: FoldersRemoval,
): Promise<FoldersRemovalOutcome> {
  return await withFolders(pl, "MLDeleteFolder", rids, (view) =>
    commitFoldersRemoval(view, planFoldersRemoval(view, folder), confirmedRemoval),
  );
}

/**
 * Replaces a folder document this build cannot read with an empty one: no folders and no
 * assignments, so every project and template shows at the top level. Nothing but the document is
 * touched, and what the unreadable tree held is lost for good.
 *
 * It is refused while the document reads fine, so a working tree can never be wiped through it.
 * "Reads fine" is decided by the same decode the listing uses, in the transaction that writes.
 */
export async function resetFolders(pl: PlClient, rids: FoldersRids): Promise<void> {
  await pl.withWriteTx(
    "MLResetFolders",
    async (tx) => {
      const stored = await readStoredFolders(tx, rids);
      if (stored.decoded.writable)
        throw new Error(
          "Folders can only be reset when they cannot be read, and these can be read. Nothing was changed.",
        );

      writeFoldersDocument(
        tx,
        rids,
        { carriedAssignments: {}, documentFieldExists: stored.documentFieldExists },
        emptyFoldersDocument(),
      );
      await tx.commit();
    },
    { lockId: foldersLockId(rids.folders) },
  );
}

/** Why a typed name is refused: another item of the same kind beside it already carries it. */
export function nameTakenMessage(kind: FoldersItem["kind"], name: string): string {
  return `A ${kind} named "${name}" is already here.`;
}

//
// Internals
//

/** A key looked up in a map that was built from those very keys; absent means the code above
 *  changed and the two no longer agree. */
function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`No entry for ${String(key)}.`);
  return value;
}

/** Each entry of a list with its place in the tree, looked up by id; an entry the tree does not
 *  place is at the top level. */
function withPlacement<E extends { readonly id: string }>(
  entries: readonly E[],
  placed: readonly ({ readonly id: string } & FoldersPlacement)[],
): (E & FoldersPlacement)[] {
  const byId = new Map(placed.map((item) => [item.id, item]));
  return entries.map((entry) => {
    const placement = byId.get(entry.id);
    return {
      ...entry,
      ...(placement?.folder === undefined ? {} : { folder: placement.folder }),
      ancestors: placement?.ancestors ?? [],
      path: placement?.path ?? [],
    };
  });
}

interface FoldersRead {
  readonly view: FoldersView;
  readonly decoded: FoldersDecoded;
  readonly projectRids: ReadonlyMap<ProjectId, SignedResourceId>;
  readonly projectMetas: ReadonlyMap<ProjectId, ProjectMeta>;
  readonly templateRids: ReadonlyMap<TemplateId, SignedResourceId>;
  readonly documentFieldExists: boolean;
  /**
   * Assignments of projects that are in the list but whose metadata could not be read. They are
   * missing from the view, so a document rebuilt from the view would drop them — and a project
   * whose folder is forgotten because its metadata was briefly unreadable is a loss, not healing.
   */
  readonly carriedAssignments: Readonly<Record<string, FolderId>>;
}

/**
 * The folder document and both item lists, read inside a transaction.
 *
 * An absent document field is a user with no folders, and is writable. A field that points at
 * something carrying no readable blob is a document that exists and cannot be read here, and must
 * refuse writes, or the first folder edit replaces that tree with an empty one.
 *
 * A list entry counts as a project when it carries project metadata, and as a template when it
 * carries a template label. Nothing else is checked. The listing readers are stricter:
 * {@link projectListEntries} also requires the project resource type by name and both the created
 * and the last-modified timestamps, and {@link templateListEntries} also requires the template
 * resource type by name, the data blob and the created timestamp. So every entry the listing shows
 * is kept here, and so is an entry the listing skips because it has only partly synced or is a
 * foreign resource carrying one of those keys: it still holds its name and its folder assignment,
 * which is the safe side for a write. Telling a foreign resource apart by its type instead would
 * read the state of every resource in the list, and a read of a project's state conflicts with
 * every write that project's own session makes, so a folder edit would keep losing to any project
 * that is open.
 */
async function readFolders(tx: PlTransaction, rids: FoldersRids): Promise<FoldersRead> {
  const { decoded, documentFieldExists } = await readStoredFolders(tx, rids);

  const [listedProjects, listedTemplates] = await Promise.all([
    listedById(tx, rids.projects),
    listedById(tx, rids.templates),
  ]);
  const [metas, labels] = await Promise.all([
    Promise.all(
      [...listedProjects.values()].map(({ rid }) =>
        tx.getKValueJsonIfExists<ProjectMeta>(rid, ProjectMetaKey),
      ),
    ),
    Promise.all(
      [...listedTemplates.values()].map(({ rid }) =>
        tx.getKValueJsonIfExists<string>(rid, TemplateLabelKey),
      ),
    ),
  ]);

  const projectRids = new Map<ProjectId, SignedResourceId>();
  const projectMetas = new Map<ProjectId, ProjectMeta>();
  const projects: FoldersProjectInput[] = [];
  const carriedAssignments: Record<string, FolderId> = {};
  [...listedProjects.values()].forEach(({ rid }, index) => {
    const id = asProjectId(resourceIdToString(rid));
    projectRids.set(id, rid);
    const meta = metas[index];
    if (meta === undefined) {
      const folder = decoded.document.assignments[id];
      if (folder !== undefined) carriedAssignments[id] = folder;
      return;
    }
    projectMetas.set(id, meta);
    projects.push({ id, name: meta.label });
  });

  // Labels as well as ids: a template's name is held to the folder rule, among templates.
  const templateRids = new Map<TemplateId, SignedResourceId>();
  const templates: FoldersTemplateInput[] = [];
  [...listedTemplates.values()].forEach(({ rid }, index) => {
    const label = labels[index];
    if (label === undefined) return;
    const id = asTemplateId(resourceIdToString(rid));
    templateRids.set(id, rid);
    templates.push({ id, name: label });
  });

  return {
    view: healFolders(decoded, projects, templates),
    decoded,
    projectRids,
    projectMetas,
    templateRids,
    documentFieldExists,
    carriedAssignments,
  };
}

/** The folder document alone, decoded, and whether its field exists at all. */
async function readStoredFolders(
  tx: PlTransaction,
  rids: FoldersRids,
): Promise<Pick<FoldersRead, "decoded" | "documentFieldExists">> {
  const documentField = await tx.getFieldIfExists(field(rids.folders, FoldersDocumentField));
  const decoded = decodeStoredFoldersDocument(
    documentField === undefined || isNullSignedResourceId(documentField.value)
      ? { present: false }
      : { present: true, raw: await readDocumentText(tx, documentField.value) },
  );
  return { decoded, documentFieldExists: documentField !== undefined };
}

/** The stored JSON of a document value, or undefined when the value carries no blob. */
async function readDocumentText(
  tx: PlTransaction,
  rid: SignedResourceId,
): Promise<string | undefined> {
  const data = await tx.getResourceData(rid, false);
  return data.data === undefined ? undefined : Buffer.from(data.data).toString("utf-8");
}

/**
 * Persists a folder document: the assignments the read had to carry are added back, a new value
 * resource is minted, and the one document field is created or re-pointed at it.
 */
function writeFoldersDocument(
  tx: PlTransaction,
  rids: FoldersRids,
  read: Pick<FoldersRead, "carriedAssignments" | "documentFieldExists">,
  document: FoldersDocument,
): void {
  const ref = tx.createJsonValue(withCarriedAssignments(document, read.carriedAssignments));
  const documentField = field(rids.folders, FoldersDocumentField);
  if (read.documentFieldExists) tx.setField(documentField, ref);
  else tx.createField(documentField, "Dynamic", ref);
}

/**
 * A document written by a newer build, or one nothing here can parse, reads as no folders so that
 * the project list still renders — and every write is refused, because degrading the read while
 * still writing would silently replace that tree with this build's truncated view of it.
 */
function refusalMessage(problem: FoldersDocumentProblem): string {
  return (
    `Folders cannot be changed: ${problem.message}. ` +
    `Update the application to a version that understands this folder document.`
  );
}

function withCarriedAssignments(
  document: FoldersDocument,
  carried: Readonly<Record<string, FolderId>>,
): FoldersDocument {
  const entries = Object.entries(carried).filter(([, folder]) =>
    document.folders.some((candidate) => candidate.id === folder),
  );
  if (entries.length === 0) return document;
  return { ...document, assignments: { ...document.assignments, ...Object.fromEntries(entries) } };
}

/**
 * Refuses a write that would put a *new* rule violation into the document.
 *
 * Only new ones: accounts predating folders may already hold two projects with the same name in
 * one place, because nothing enforced uniqueness before, and a write that merely carries such a
 * collision along must not be blocked by it. What the folder machinery must never do is create
 * one.
 *
 * What the write deletes is left out of the document it leaves behind. A deleted project or
 * template has no folder any more, and counted anyway it would stand at the top level under its
 * old name — where it clashes with whatever is really there, and refuses the deletion.
 */
function rejectNewViolations(
  read: FoldersRead,
  document: FoldersDocument,
  renames: readonly FoldersLabelRename[],
  deleted: readonly string[],
): void {
  const renamed = new Map<string, string>(renames.map((rename) => [rename.item.id, rename.name]));
  const gone = new Set<string>(deleted);
  const templates = read.view.templates.map(({ id, name }) => ({ id, name }));
  const before = validateFoldersDocument(
    foldersDocumentFromView(read.view),
    [...read.projectMetas].map(([id, meta]) => ({ id, name: meta.label })),
    templates,
  );
  const after = validateFoldersDocument(
    document,
    [...read.projectMetas]
      .filter(([id]) => !gone.has(id))
      .map(([id, meta]) => ({ id, name: renamed.get(id) ?? meta.label })),
    templates
      .filter(({ id }) => !gone.has(id))
      .map(({ id, name }) => ({ id, name: renamed.get(id) ?? name })),
  );

  const known = new Set(before.map(violationKey));
  const introduced = after.filter((violation) => !known.has(violationKey(violation)));
  if (introduced.length === 0) return;

  throw new Error(`Folder change refused: ${introduced.map(formatFoldersViolation).join("; ")}.`);
}

/**
 * Deletes the named items from one of the root's lists. Every id must be there: an id the list
 * does not hold means the write is deleting something other than what was planned, and the
 * transaction is abandoned rather than allowed to destroy a guess.
 */
async function removeListedFields(
  tx: PlTransaction,
  listRid: SignedResourceId,
  ids: readonly string[],
  kind: ListedKind,
): Promise<void> {
  if (ids.length === 0) return;

  const listed = await listedById(tx, listRid);
  for (const id of new Set(ids)) {
    const entry = listed.get(id);
    if (entry === undefined) throw notListedError(kind, id);
    tx.removeField(field(listRid, entry.fieldName));
  }
}

function violationKey(violation: FoldersViolation): string {
  return JSON.stringify(violation);
}

/**
 * Scoped to the singleton rather than to the process, so that two middle layers over two users'
 * roots — an impersonating admin session and the admin's own — do not queue behind each other.
 */
function foldersLockId(foldersRid: SignedResourceId): string {
  return `folders:${foldersRid}`;
}
