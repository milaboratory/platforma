import type { PlClient, PlTransaction, ResourceId } from "@milaboratories/pl-client";
import { field, isNullResourceId, isNotNullResourceId } from "@milaboratories/pl-client";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";

/** Mirrors the KV key names used in pl-middle-layer project_model.ts */
const ProjectMetaKey = "ProjectMeta";
const ProjectCreatedTimestamp = "ProjectCreated";
const ProjectLastModifiedTimestamp = "ProjectLastModified";
const SchemaVersionKey = "SchemaVersion";
const ProjectStructureKey = "ProjectStructure";
const BlockArgsAuthorKeyPrefix = "BlockArgsAuthor/";
const ProjectStructureAuthorKey = "ProjectStructureAuthor";
const SchemaVersionCurrent = "3";
const ProjectResourceType = { name: "UserProject", version: "2" };

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

    const metaKV = kvs.find((kv) => kv.key === ProjectMetaKey);
    const createdKV = kvs.find((kv) => kv.key === ProjectCreatedTimestamp);
    const modifiedKV = kvs.find((kv) => kv.key === ProjectLastModifiedTimestamp);
    const schemaKV = kvs.find((kv) => kv.key === SchemaVersionKey);
    const structureKV = kvs.find((kv) => kv.key === ProjectStructureKey);

    const meta: ProjectMeta = metaKV ? JSON.parse(metaKV.value) : { label: "(unknown)" };
    const schemaVersion = schemaKV ? JSON.parse(schemaKV.value) : undefined;

    // Extract block IDs from structure
    let blockIds: string[] = [];
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
    // Search all projects by field ID or label
    const data = await tx.getResourceData(projectListRid, true);
    for (const f of data.fields) {
      if (isNullResourceId(f.value)) continue;
      // Match by field ID
      if (f.name === identifier) {
        return { id: f.name, rid: f.value };
      }
      // Match by label
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

/**
 * Duplicates a project within a transaction (low-level).
 * This mirrors the duplicateProject function from pl-middle-layer/mutator/project.ts
 * but avoids importing internal modules.
 */
export async function duplicateProjectInTx(
  tx: PlTransaction,
  sourceRid: ResourceId,
  options?: { label?: string },
) {
  const sourceDataP = tx.getResourceData(sourceRid, true);
  const sourceKVsP = tx.listKeyValuesString(sourceRid);

  const sourceData = await sourceDataP;
  const sourceKVs = await sourceKVsP;

  // Validate schema version
  const schemaKV = sourceKVs.find((kv) => kv.key === SchemaVersionKey);
  const schema = schemaKV ? JSON.parse(schemaKV.value) : undefined;
  if (schema !== SchemaVersionCurrent) {
    throw new Error(
      `Cannot duplicate project with schema version ${schema ?? "unknown"}. ` +
        `Only schema version ${SchemaVersionCurrent} is supported. ` +
        `Try opening the project first to trigger migration.`,
    );
  }

  const newPrj = tx.createEphemeral(ProjectResourceType);
  tx.lock(newPrj);

  const ts = String(Date.now());
  const kvSkipPrefixes = [BlockArgsAuthorKeyPrefix];
  const kvSkipKeys = new Set([
    ProjectCreatedTimestamp,
    ProjectLastModifiedTimestamp,
    ProjectStructureAuthorKey,
  ]);

  for (const { key, value } of sourceKVs) {
    if (kvSkipKeys.has(key)) continue;
    if (kvSkipPrefixes.some((prefix) => key.startsWith(prefix))) continue;

    if (key === ProjectMetaKey && options?.label !== undefined) {
      const meta: ProjectMeta = JSON.parse(value);
      tx.setKValue(newPrj, key, JSON.stringify({ ...meta, label: options.label }));
    } else {
      tx.setKValue(newPrj, key, value);
    }
  }

  tx.setKValue(newPrj, ProjectCreatedTimestamp, ts);
  tx.setKValue(newPrj, ProjectLastModifiedTimestamp, ts);

  for (const f of sourceData.fields) {
    if (isNotNullResourceId(f.value)) {
      tx.createField(field(newPrj, f.name), "Dynamic", f.value);
    }
  }

  return newPrj;
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
