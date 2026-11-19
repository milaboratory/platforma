import type { PlClient, SignedResourceId, PlTransaction } from "@milaboratories/pl-client";
import {
  field,
  isNotFoundError,
  isNullSignedResourceId,
  resourceIdToString,
} from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import {
  ProjectMetaKey,
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp,
  SchemaVersionKey,
  ProjectStructureKey,
  ProjectsField,
  ProjectsResourceType,
  duplicateProject,
} from "@milaboratories/pl-middle-layer";
import type { ProjectMeta } from "@milaboratories/pl-middle-layer";

export interface ProjectEntry {
  id: string;
  rid: SignedResourceId;
  label: string;
  created: Date;
  lastModified: Date;
}

export interface ProjectIdentity {
  /** Project ID (resourceIdToString of resource ID) */
  id: string;
  /** Signed resource ID for use in transactions */
  rid: SignedResourceId;
  /** UUID field name in the project list resource */
  fieldName: string;
}

export interface ProjectInfo extends ProjectEntry {
  schemaVersion: string | undefined;
  blockCount: number;
  blockIds: string[];
}

/** List all projects from a project list resource. */
export async function listProjects(
  pl: PlClient,
  projectListRid: SignedResourceId,
): Promise<ProjectEntry[]> {
  return await pl.withReadTx("listProjects", async (tx) => {
    const data = await tx.getResourceData(projectListRid, true);
    const entries: ProjectEntry[] = [];

    for (const f of data.fields) {
      if (isNullSignedResourceId(f.value)) continue;

      const [metaStr, createdStr, modifiedStr] = await Promise.all([
        tx.getKValueStringIfExists(f.value, ProjectMetaKey),
        tx.getKValueStringIfExists(f.value, ProjectCreatedTimestamp),
        tx.getKValueStringIfExists(f.value, ProjectLastModifiedTimestamp),
      ]);

      const meta: ProjectMeta = metaStr ? JSON.parse(metaStr) : { label: "(unknown)" };

      const projectId = resourceIdToString(f.value);
      entries.push({
        id: projectId,
        rid: f.value,
        label: meta.label,
        created: createdStr ? new Date(Number(createdStr)) : new Date(0),
        lastModified: modifiedStr ? new Date(Number(modifiedStr)) : new Date(0),
      });
    }

    entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    return entries;
  });
}

/** A project's identity plus its label — what a whole-root operation needs per project. */
export interface ProjectIdentityWithLabel extends ProjectIdentity {
  label: string;
}

/**
 * Lists every project in a project list with the field name holding it, which
 * {@link listProjects} omits. Whole-root operations (moving a user's projects out before the
 * account is deleted) need that field name to detach each project from its old owner.
 */
export async function listProjectIdentities(
  pl: PlClient,
  projectListRid: SignedResourceId,
): Promise<ProjectIdentityWithLabel[]> {
  return await pl.withReadTx("listProjectIdentities", async (tx) => {
    return await listProjectIdentitiesInTx(tx, projectListRid);
  });
}

/**
 * {@link listProjectIdentities} against a transaction the caller already holds, so a write that
 * acts on the list can read it in the same transaction rather than trusting an earlier snapshot.
 */
export async function listProjectIdentitiesInTx(
  tx: PlTransaction,
  projectListRid: SignedResourceId,
): Promise<ProjectIdentityWithLabel[]> {
  const data = await tx.getResourceData(projectListRid, true);
  const projects: ProjectIdentityWithLabel[] = [];

  for (const f of data.fields) {
    if (isNullSignedResourceId(f.value)) continue;

    const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
    const meta: ProjectMeta = metaStr ? JSON.parse(metaStr) : { label: "(unknown)" };

    projects.push({
      id: resourceIdToString(f.value),
      rid: f.value,
      fieldName: f.name,
      label: meta.label,
    });
  }

  return projects;
}

/** Get detailed info about a project. */
export async function getProjectInfo(
  pl: PlClient,
  projectId: string,
  rid: SignedResourceId,
): Promise<ProjectInfo> {
  return await pl.withReadTx("getProjectInfo", async (tx) => {
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
      rid: rid,
      label: meta.label,
      created: createdKV ? new Date(Number(createdKV.value)) : new Date(0),
      lastModified: modifiedKV ? new Date(Number(modifiedKV.value)) : new Date(0),
      schemaVersion,
      blockCount: blockIds.length,
      blockIds,
    };
  });
}

/** Resolve a project identifier (id or label) to its project ID, ResourceId and field name. */
export async function resolveProject(
  pl: PlClient,
  projectListRid: SignedResourceId,
  identifier: string,
): Promise<ProjectIdentity> {
  return await pl.withReadTx("resolveProject", async (tx) => {
    const data = await tx.getResourceData(projectListRid, true);
    for (const f of data.fields) {
      if (isNullSignedResourceId(f.value)) continue;
      const projectId = resourceIdToString(f.value);
      if (projectId === identifier) {
        return { id: projectId, rid: f.value, fieldName: f.name };
      }
    }
    // Fallback: match by label
    for (const f of data.fields) {
      if (isNullSignedResourceId(f.value)) continue;
      const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
      if (metaStr) {
        const meta: ProjectMeta = JSON.parse(metaStr);
        if (meta.label === identifier) {
          return { id: resourceIdToString(f.value), rid: f.value, fieldName: f.name };
        }
      }
    }

    throw new Error(`Project "${identifier}" not found (searched by id and label).`);
  });
}

/** Read all project labels within an existing transaction. */
export async function getExistingLabelsInTx(
  tx: PlTransaction,
  projectListRid: SignedResourceId,
): Promise<string[]> {
  const data = await tx.getResourceData(projectListRid, true);
  const labels: string[] = [];
  for (const f of data.fields) {
    if (isNullSignedResourceId(f.value)) continue;
    const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
    if (metaStr) {
      const meta: ProjectMeta = JSON.parse(metaStr);
      labels.push(meta.label);
    }
  }
  return labels;
}

/** Get all project labels from a project list. */
export async function getProjectLabels(
  pl: PlClient,
  projectListRid: SignedResourceId,
): Promise<string[]> {
  return await pl.withReadTx("getProjectLabels", async (tx) => {
    return getExistingLabelsInTx(tx, projectListRid);
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
  projectRid: SignedResourceId,
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
  projectListRid: SignedResourceId,
  fieldName: string,
): Promise<void> {
  await pl.withWriteTx("deleteProject", async (tx) => {
    tx.removeField(field(projectListRid, fieldName));
    await tx.commit();
  });
}

/** One project moved by {@link moveProjects}, as it ended up in the target root. */
export interface MovedProject {
  id: string;
  /** Label the project had in the source root. */
  sourceLabel: string;
  /** Label it carries in the target root — differs when the name collided and was deduplicated. */
  targetLabel: string;
}

/**
 * Re-attaches projects from one user's project list to another's, keeping the same project
 * resources — no copy is made, so nothing is duplicated and no data is rewritten.
 *
 * This works across roots because the backend permits a reference between differently coloured
 * resources when the caller holds write access to both, which admin credentials do. Names that
 * collide in the target are deduplicated the way {@link duplicateProject} callers deduplicate
 * theirs, so a move never silently shadows a project the target user already has.
 *
 * The whole batch is one transaction: either every project lands in the target root, or none
 * moves and both roots are untouched.
 */
export async function moveProjects(
  pl: PlClient,
  sourceProjectListRid: SignedResourceId,
  targetProjectListRid: SignedResourceId,
): Promise<MovedProject[]> {
  return await pl.withWriteTx("moveProjects", async (tx) => {
    // Read here rather than taken from the caller: a list read before an operator answered a
    // confirmation prompt describes the account as it was minutes ago, and a project attached
    // since then would be left on the source root — where the account deletion that follows
    // destroys it. Moving what this transaction sees narrows that to the transaction itself.
    const projects = await listProjectIdentitiesInTx(tx, sourceProjectListRid);
    if (projects.length === 0) return [];

    const takenLabels = await getExistingLabelsInTx(tx, targetProjectListRid);
    const moved: MovedProject[] = [];

    for (const project of projects) {
      const metaStr = await tx.getKValueString(project.rid, ProjectMetaKey);
      const meta: ProjectMeta = JSON.parse(metaStr);
      const sourceLabel = meta.label;

      let targetLabel = sourceLabel;
      if (takenLabels.includes(targetLabel)) {
        targetLabel = deduplicateName(sourceLabel, takenLabels);
        tx.setKValue(project.rid, ProjectMetaKey, JSON.stringify({ ...meta, label: targetLabel }));
        tx.setKValue(project.rid, ProjectLastModifiedTimestamp, String(Date.now()));
      }
      // Reserved even when the label was free, so two source projects with the same name do not
      // both keep it.
      takenLabels.push(targetLabel);

      // Attached to the target before being detached from the source: the project keeps a
      // reference throughout, so it is never momentarily unreferenced.
      tx.createField(field(targetProjectListRid, randomUUID()), "Dynamic", project.rid);
      tx.removeField(field(sourceProjectListRid, project.fieldName));

      moved.push({ id: project.id, sourceLabel, targetLabel });
    }

    await tx.commit();
    return moved;
  });
}

/** Get the project list ResourceId for the connected user. */
export async function getProjectListRid(pl: PlClient): Promise<SignedResourceId> {
  return await pl.withReadTx("getProjectList", async (tx) => {
    const fieldData = await tx.getField({
      resourceId: tx.clientRoot,
      fieldName: ProjectsField,
    });
    if (isNullSignedResourceId(fieldData.value)) {
      throw new Error("No project list found for this user.");
    }
    return fieldData.value;
  });
}

/**
 * Resolves a user's root and, if they have one, their project list.
 *
 * Unlike {@link navigateToUserRoot} a missing project list is not an error here: a user who has
 * never opened the app has a root and no list, and that account is still a legitimate target for
 * whole-account operations. Callers that need a list to write into use
 * {@link ensureUserProjectList}.
 */
export async function openUserRoot(
  pl: PlClient,
  username: string,
): Promise<{ userRoot: SignedResourceId; projectListRid: SignedResourceId | undefined }> {
  let userRoot: SignedResourceId | undefined;
  try {
    userRoot = await pl.getUserRoot({ login: username });
  } catch (e) {
    // The backend reports an unknown login as NOT_FOUND on the root, which reads as a missing
    // resource rather than a missing user. Name the actual problem.
    if (isNotFoundError(e)) {
      throw new Error(`User "${username}" not found on this server.`);
    }
    throw e;
  }
  if (userRoot === undefined) {
    throw new Error(`User "${username}" not found on this server (no root resource).`);
  }

  return await pl.withReadTx("openUserRoot", async (tx) => {
    const projectsField = await tx.getFieldIfExists(field(userRoot, ProjectsField));
    if (projectsField === undefined || isNullSignedResourceId(projectsField.value)) {
      return { userRoot, projectListRid: undefined };
    }
    return { userRoot, projectListRid: projectsField.value };
  });
}

/**
 * Returns a user's project list, creating an empty one when the root has none — the same lazy
 * creation the middle layer performs for the signed-in user, but against an impersonated root, so
 * projects can be re-homed to a user who has never opened the app.
 */
export async function ensureUserProjectList(
  pl: PlClient,
  userRoot: SignedResourceId,
): Promise<SignedResourceId> {
  return await pl.withWriteTx("ensureUserProjectList", async (tx) => {
    const projectsField = field(userRoot, ProjectsField);
    tx.createField(projectsField, "Dynamic");
    const fieldData = await tx.getField(projectsField);
    if (!isNullSignedResourceId(fieldData.value)) {
      await tx.commit();
      return fieldData.value;
    }

    const list = tx.createEphemeral(ProjectsResourceType);
    tx.lock(list);
    tx.setField(projectsField, list);
    await tx.commit();
    return await list.globalId;
  });
}

/**
 * Navigates to a specific user's project list resource ID.
 * Tries ListUserResources first (new backend), falls back to SHA256 named resource lookup.
 */
export async function navigateToUserRoot(
  pl: PlClient,
  username: string,
): Promise<{ userRoot: SignedResourceId; projectListRid: SignedResourceId }> {
  let userRootRid: SignedResourceId | undefined;

  userRootRid = await pl.getUserRoot({ login: username });
  if (userRootRid === undefined) {
    throw new Error(`User "${username}" not found on this server (no root resource).`);
  }

  // Read the projects field from the resolved user root
  return await pl.withReadTx("navigateToUserProjects", async (tx) => {
    const projectsFieldData = await tx.getField({
      resourceId: userRootRid,
      fieldName: ProjectsField,
    });

    if (isNullSignedResourceId(projectsFieldData.value)) {
      throw new Error(`User "${username}" has no project list.`);
    }

    return { userRoot: userRootRid, projectListRid: projectsFieldData.value };
  });
}

// Re-export duplicateProject from pl-middle-layer for use in commands
export { duplicateProject };
