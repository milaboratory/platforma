import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { PlClient, ResourceId, ResourceType } from "@milaboratories/pl-client";
import { resourceIdToString, resourceTypesEqual } from "@milaboratories/pl-client";
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

export const ProjectsListTreePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, ProjectsResourceType)) return [];
  return resource.fields;
};

export async function createProjectList(
  pl: PlClient,
  rid: ResourceId,
  openedProjects: WatchableValue<ProjectId[]>,
  env: MiddleLayerEnvironment,
): Promise<TreeAndComputableU<ProjectListEntry[]>> {
  const tree = await SynchronizedTreeState.init(
    pl,
    rid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: ProjectsListTreePruningFunction,
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
