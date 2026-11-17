import type { Branded } from "@milaboratories/pl-model-common";
import * as v from "valibot";

/**
 * Schema version this build writes and fully understands.
 *
 * A document carrying a higher version is not readable here, and folder writes are refused rather
 * than allowed to truncate whatever the newer build stored.
 */
export const FOLDERS_SCHEMA_VERSION = 1;

/** Identifier of a folder, unique within one user's folder document. */
export type FolderId = Branded<string, "FolderId">;

/** Brands a string already known to be a folder id, such as one handed back by a caller. */
export function asFolderId(id: string): FolderId {
  return id as FolderId;
}

/**
 * A folder as it is persisted: a name, a reference to the folder that contains it, and what the
 * user wrote about it.
 *
 * A folder nobody described carries no description at all rather than an empty one, so clearing
 * a description leaves the same document a folder that never had one has.
 */
export interface FolderEntry {
  readonly id: FolderId;
  readonly name: string;
  /** Absent for a top-level folder. */
  readonly parent?: FolderId;
  /** Free text the user wrote about the folder. Absent when there is none. */
  readonly description?: string;
}

export const FolderEntry: v.GenericSchema<unknown, FolderEntry> = v.strictObject({
  id: folderId(),
  name: v.pipe(v.string(), v.minLength(1)),
  parent: v.optional(folderId()),
  description: v.optional(v.string()),
});

/**
 * The whole folder tree of one user, as one persisted document.
 *
 * Projects and templates live in the same tree, so one folder holds both, and each has its own
 * assignment map. They are separate maps rather than one because the two ids are looked up in
 * two different lists: merged, an id present in neither list could not be told apart from a
 * project that was deleted, and the dead-entry pruning a read performs would have nothing to go
 * on.
 *
 * Each map points from the item to the folder holding it, not the other way round: an item lives
 * in at most one folder, so one entry per item can never contradict itself, and an item the map
 * does not mention needs no entry at all — it is at the top level.
 */
export interface FoldersDocument {
  readonly schemaVersion: typeof FOLDERS_SCHEMA_VERSION;
  readonly folders: readonly FolderEntry[];
  /** Project id to the folder holding it. Projects at the top level are absent. */
  readonly assignments: Readonly<Record<string, FolderId>>;
  /** Template id to the folder holding it. Templates at the top level are absent. */
  readonly templateAssignments: Readonly<Record<string, FolderId>>;
}

export const FoldersDocument: v.GenericSchema<unknown, FoldersDocument> = v.strictObject({
  schemaVersion: v.literal(FOLDERS_SCHEMA_VERSION),
  folders: v.array(FolderEntry),
  assignments: v.record(v.pipe(v.string(), v.minLength(1)), folderId()),
  templateAssignments: v.record(v.pipe(v.string(), v.minLength(1)), folderId()),
});

/** The document of a user who has never made a folder. */
export function emptyFoldersDocument(): FoldersDocument {
  return {
    schemaVersion: FOLDERS_SCHEMA_VERSION,
    folders: [],
    assignments: {},
    templateAssignments: {},
  };
}

//
// Internals
//

/**
 * Folder ids are plain strings on the wire; the brand exists so that a project id and a folder id
 * cannot be swapped by accident in the code consuming them.
 */
function folderId() {
  return v.pipe(v.string(), v.minLength(1), v.transform(asFolderId));
}
