import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
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
import type { TreeAndComputableU } from "./types";
import type { WatchableValue } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import type { ProjectId, ProjectListEntry } from "../model/project_model";
import {
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectResourceType,
} from "../model/project_model";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";
import { asProjectId } from "@milaboratories/pl-model-common";

export const ProjectsField = "projects";
export const ProjectsResourceType: ResourceType = { name: "Projects", version: "1" };

/**
 * Resolves the projects-list resource on the transaction's client root, lazily creating (and
 * locking) an empty one when the {@link ProjectsField} is not yet populated. Returns its signed
 * id. Used when writing into a root that may have no projects list yet, e.g. copying a project
 * into another user's root during admin impersonation.
 */
export async function ensureProjectListRid(tx: PlTransaction): Promise<SignedResourceId> {
  const projectsField = field(tx.clientRoot, ProjectsField);
  tx.createField(projectsField, "Dynamic");
  const fData = await tx.getField(projectsField);
  if (isNullSignedResourceId(fData.value)) {
    const ref = tx.createEphemeral(ProjectsResourceType);
    tx.lock(ref);
    tx.setField(projectsField, ref);
    return await ref.globalId;
  }
  return fData.value;
}

export const ProjectsListTreePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, ProjectsResourceType)) return [];
  return resource.fields;
};

export const projectsListFieldFilter: Filter = treeFilter.resourceTypeEq("Projects");

export async function createProjectList(
  pl: PlClient,
  rid: SignedResourceId,
  openedProjects: WatchableValue<ProjectId[]>,
  env: MiddleLayerEnvironment,
): Promise<TreeAndComputableU<ProjectListEntry[]>> {
  const tree = await SynchronizedTreeState.init(
    pl,
    rid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: ProjectsListTreePruningFunction,
      fieldFilter: projectsListFieldFilter,
    },
    env.logger,
  );

  const c = Computable.make((ctx) => {
    const node = ctx.accessor(tree.entry()).node();
    const oProjects = openedProjects.getValue(ctx);
    if (node === undefined) return undefined;
    return projectListEntries(node, oProjects);
  }).withStableType();

  return { computable: c, tree };
}

/** The part of a tree node this reader needs from a single entry of the projects list. */
interface ProjectListEntryNode {
  readonly id: SignedResourceId;
  readonly resourceType: ResourceType;
  getKeyValueAsJson<T>(key: string): T | undefined;
}

/** The part of a tree node this reader needs from the projects-list resource itself. */
interface ProjectsListNode {
  listDynamicFields(): string[];
  traverse(fieldName: string): ProjectListEntryNode | undefined;
}

/**
 * Builds the project list out of the projects-list resource, most recently modified first.
 *
 * Skips, rather than throws on, anything that is not a fully synced project. The projects
 * resource carries the user's entire project list, so one unexpected sibling field — or one
 * project whose metadata has not arrived yet — must cost that entry and nothing else. Both the
 * traversal and the metadata reads are watched, so an entry appears as soon as it syncs.
 *
 * The resource type is matched by name only: the point is to exclude foreign resources, not to
 * hide a project stored under an earlier resource-type version.
 */
export function projectListEntries(
  node: ProjectsListNode,
  openedProjects: readonly ProjectId[],
): ProjectListEntry[] {
  const result: ProjectListEntry[] = [];

  // Projects list resource keeps projects assigned to fields. Each field name is project's UUID
  for (const field of node.listDynamicFields()) {
    const prj = node.traverse(field);
    if (prj === undefined) continue;
    if (prj.resourceType.name !== ProjectResourceType.name) continue;

    const meta = prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey);
    const created = prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp);
    const lastModified = prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp);
    if (meta === undefined || created === undefined || lastModified === undefined) continue;

    const projectId = asProjectId(resourceIdToString(prj.id));
    result.push({
      id: projectId,
      created: new Date(created),
      lastModified: new Date(lastModified),
      opened: openedProjects.indexOf(projectId) >= 0,
      meta,
    });
  }

  result.sort((a, b) => b.lastModified.valueOf() - a.lastModified.valueOf());
  return result;
}
