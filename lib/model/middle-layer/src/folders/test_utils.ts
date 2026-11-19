import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import type { FoldersDocument, FolderId } from "./document";
import { FOLDERS_SCHEMA_VERSION } from "./document";
import type { FoldersItem } from "./planner";
import type { FoldersView } from "./view";
import { foldersViewFromDocument } from "./view";

/** A folder as a test writes it: plain string ids. */
export interface TestFolder {
  readonly id: string;
  readonly name: string;
  readonly parent?: string;
  readonly description?: string;
}

/** A project or a template as a test writes it, with the folder holding it. */
export interface TestItem {
  readonly id: string;
  readonly name: string;
  readonly folder?: string;
}

export const fid = (id: string) => id as FolderId;
export const pid = (id: string) => id as ProjectId;
export const tid = (id: string) => id as TemplateId;

export const folder = (id: string): Extract<FoldersItem, { kind: "folder" }> => ({
  kind: "folder",
  id: fid(id),
});
export const project = (id: string): Extract<FoldersItem, { kind: "project" }> => ({
  kind: "project",
  id: pid(id),
});
export const template = (id: string): Extract<FoldersItem, { kind: "template" }> => ({
  kind: "template",
  id: tid(id),
});

/** A current-schema document holding exactly what it is given. */
export function document(
  folders: readonly TestFolder[],
  assignments: Readonly<Record<string, string>> = {},
  templateAssignments: Readonly<Record<string, string>> = {},
): FoldersDocument {
  return {
    schemaVersion: FOLDERS_SCHEMA_VERSION,
    folders: folders.map((entry) => ({
      id: fid(entry.id),
      name: entry.name,
      ...(entry.parent === undefined ? {} : { parent: fid(entry.parent) }),
      ...(entry.description === undefined ? {} : { description: entry.description }),
    })),
    assignments: branded(assignments),
    templateAssignments: branded(templateAssignments),
  };
}

/** The healed view of a tree in which every project and template sits where it says. */
export function view(
  folders: readonly TestFolder[],
  projects: readonly TestItem[],
  templates: readonly TestItem[] = [],
): FoldersView {
  return foldersViewFromDocument(
    document(folders, placements(projects), placements(templates)),
    projects.map((entry) => ({ id: pid(entry.id), name: entry.name })),
    templates.map((entry) => ({ id: tid(entry.id), name: entry.name })),
  );
}

//
// Internals
//

function placements(items: readonly TestItem[]): Record<string, string> {
  return Object.fromEntries(
    items.flatMap((entry) => (entry.folder === undefined ? [] : [[entry.id, entry.folder]])),
  );
}

function branded(assignments: Readonly<Record<string, string>>): Record<string, FolderId> {
  return Object.fromEntries(
    Object.entries(assignments).map(([item, folderId]) => [item, fid(folderId)]),
  );
}
