import type { PlClient, ResourceId } from "@milaboratories/pl-client";
import { field, isNullResourceId } from "@milaboratories/pl-client";
import {
  ProjectMetaKey,
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp,
  SchemaVersionKey,
  ProjectStructureKey,
  ProjectsField,
  duplicateProject,
} from "@milaboratories/pl-middle-layer";
import type { ProjectMeta } from "@milaboratories/pl-middle-layer";
import { createHash } from "node:crypto";

export interface ProjectEntry {
  id: string;
  rid: string;
  label: string;
  created: Date;
  lastModified: Date;
}

export interface ProjectInfo extends ProjectEntry {
  schemaVersion: string | undefined;
  blockCount: number;
  blockIds: string[];
}

/** List all projects from a project list resource. */
export async function listProjects(
  pl: PlClient,
  projectListRid: ResourceId,
): Promise<ProjectEntry[]> {
  return await pl.withReadTx("listProjects", async (tx) => {
    const data = await tx.getResourceData(projectListRid, true);
    const entries: ProjectEntry[] = [];

    for (const f of data.fields) {
      if (isNullResourceId(f.value)) continue;

      const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
      const createdStr = await tx.getKValueStringIfExists(f.value, ProjectCreatedTimestamp);
      const modifiedStr = await tx.getKValueStringIfExists(f.value, ProjectLastModifiedTimestamp);

      const meta: ProjectMeta = metaStr ? JSON.parse(metaStr) : { label: "(unknown)" };

      entries.push({
        id: f.name,
        rid: String(f.value),
        label: meta.label,
        created: createdStr ? new Date(Number(createdStr)) : new Date(0),
        lastModified: modifiedStr ? new Date(Number(modifiedStr)) : new Date(0),
      });
    }

    entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    return entries;
  });
}

/** Get detailed info about a project. */
export async function getProjectInfo(
  pl: PlClient,
  projectListRid: ResourceId,
  projectId: string,
): Promise<ProjectInfo> {
  return await pl.withReadTx("getProjectInfo", async (tx) => {
    const fieldData = await tx.getField(field(projectListRid, projectId));
    if (isNullResourceId(fieldData.value)) {
      throw new Error(`Project "${projectId}" not found.`);
    }

    const rid = fieldData.value;
    const kvs = await tx.listKeyValuesString(rid);

    const metaKV = kvs.find((kv: { key: string }) => kv.key === ProjectMetaKey);
    const createdKV = kvs.find((kv: { key: string }) => kv.key === ProjectCreatedTimestamp);
    const modifiedKV = kvs.find((kv: { key: string }) => kv.key === ProjectLastModifiedTimestamp);
    const schemaKV = kvs.find((kv: { key: string }) => kv.key === SchemaVersionKey);
    const structureKV = kvs.find((kv: { key: string }) => kv.key === ProjectStructureKey);

    const meta: ProjectMeta = metaKV ? JSON.parse(metaKV.value) : { label: "(unknown)" };
    const schemaVersion = schemaKV ? JSON.parse(schemaKV.value) : undefined;

    const blockIds: string[] = [];
    if (structureKV) {
      const structure = JSON.parse(structureKV.value);
      for (const group of structure.groups ?? []) {
        for (const block of group.blocks ?? []) {
          blockIds.push(block.id);
        }
      }
    }

    return {
      id: projectId,
      rid: String(rid),
      label: meta.label,
      created: createdKV ? new Date(Number(createdKV.value)) : new Date(0),
      lastModified: modifiedKV ? new Date(Number(modifiedKV.value)) : new Date(0),
      schemaVersion,
      blockCount: blockIds.length,
      blockIds,
    };
  });
}

/** Resolve a project identifier (id or label) to its field ID and ResourceId. */
export async function resolveProject(
  pl: PlClient,
  projectListRid: ResourceId,
  identifier: string,
): Promise<{ id: string; rid: ResourceId }> {
  return await pl.withReadTx("resolveProject", async (tx) => {
    const data = await tx.getResourceData(projectListRid, true);
    for (const f of data.fields) {
      if (isNullResourceId(f.value)) continue;
      if (f.name === identifier) {
        return { id: f.name, rid: f.value };
      }
      const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
      if (metaStr) {
        const meta: ProjectMeta = JSON.parse(metaStr);
        if (meta.label === identifier) {
          return { id: f.name, rid: f.value };
        }
      }
    }

    throw new Error(`Project "${identifier}" not found (searched by id and label).`);
  });
}

/** Get all project labels from a project list. */
export async function getProjectLabels(
  pl: PlClient,
  projectListRid: ResourceId,
): Promise<string[]> {
  return await pl.withReadTx("getProjectLabels", async (tx) => {
    const data = await tx.getResourceData(projectListRid, true);
    const labels: string[] = [];
    for (const f of data.fields) {
      if (isNullResourceId(f.value)) continue;
      const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
      if (metaStr) {
        const meta: ProjectMeta = JSON.parse(metaStr);
        labels.push(meta.label);
      }
    }
    return labels;
  });
}

/**
 * Deduplicates a project name against existing labels.
 * "X" → "X (Copy)" → "X (Copy 2)" → ...
 */
export function deduplicateName(baseName: string, existingLabels: string[]): string {
  let candidate = `${baseName} (Copy)`;
  let i = 2;
  while (existingLabels.includes(candidate)) {
    candidate = `${baseName} (Copy ${i})`;
    i++;
  }
  return candidate;
}

/** Rename a project (update its label). */
export async function renameProject(
  pl: PlClient,
  projectRid: ResourceId,
  newLabel: string,
): Promise<void> {
  await pl.withWriteTx("renameProject", async (tx) => {
    const metaStr = await tx.getKValueString(projectRid, ProjectMetaKey);
    const meta: ProjectMeta = JSON.parse(metaStr);
    const updated: ProjectMeta = { ...meta, label: newLabel };
    tx.setKValue(projectRid, ProjectMetaKey, JSON.stringify(updated));
    tx.setKValue(projectRid, ProjectLastModifiedTimestamp, String(Date.now()));
    await tx.commit();
  });
}

/** Delete a project from the project list. */
export async function deleteProject(
  pl: PlClient,
  projectListRid: ResourceId,
  projectId: string,
): Promise<void> {
  await pl.withWriteTx("deleteProject", async (tx) => {
    tx.removeField(field(projectListRid, projectId));
    await tx.commit();
  });
}

/** Get the project list ResourceId for the connected user. */
export async function getProjectListRid(pl: PlClient): Promise<ResourceId> {
  return await pl.withReadTx("getProjectList", async (tx) => {
    const fieldData = await tx.getField({
      resourceId: tx.clientRoot,
      fieldName: ProjectsField,
    });
    if (isNullResourceId(fieldData.value)) {
      throw new Error("No project list found for this user.");
    }
    return fieldData.value;
  });
}

/**
 * Navigates to a specific user's project list resource ID.
 * Computes SHA256(username) to find the user's root, then reads the "projects" field.
 */
export async function navigateToUserRoot(
  pl: PlClient,
  username: string,
): Promise<{ userRoot: ResourceId; projectListRid: ResourceId }> {
  const rootName = createHash("sha256").update(username).digest("hex");

  return await pl.withReadTx("navigateToUserRoot", async (tx) => {
    if (!(await tx.checkResourceNameExists(rootName))) {
      throw new Error(`User "${username}" not found on this server (no root resource).`);
    }

    const userRootRid = await tx.getResourceByName(rootName);

    const projectsFieldData = await tx.getField({
      resourceId: userRootRid,
      fieldName: ProjectsField,
    });

    if (isNullResourceId(projectsFieldData.value)) {
      throw new Error(`User "${username}" has no project list.`);
    }

    return { userRoot: userRootRid, projectListRid: projectsFieldData.value };
  });
}

// Re-export duplicateProject from pl-middle-layer for use in commands
export { duplicateProject };
