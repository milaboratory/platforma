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
} from "../model/project_model";
import type { MiddleLayerEnvironment } from "./middle_layer";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";

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
    const result: ProjectListEntry[] = [];

    // Projects list resource keeps projects assigned to fields. Each field name is project's UUID
    for (const field of node.listDynamicFields()) {
      const prj = node.traverse(field);
      if (prj === undefined) continue;
      const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
      const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
      const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));
      const projectId = resourceIdToString(prj.id) as ProjectId;
      result.push({
        id: projectId,
        created: new Date(created),
        lastModified: new Date(lastModified),
        opened: oProjects.indexOf(projectId) >= 0,
        meta,
      });
    }
    result.sort((p) => -p.lastModified.valueOf());
    return result;
  }).withStableType();

  return { computable: c, tree };
}
