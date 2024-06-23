import { PruningFunction, SynchronizedTreeState } from '@milaboratory/pl-tree';
import { PlClient, ResourceId, ResourceType, resourceTypesEqual } from '@milaboratory/pl-client-v2';
import { TreeAndComputableU } from './types';
import { Computable, WatchableValue } from '@milaboratory/computable';
import {
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp, ProjectListEntry,
  ProjectMetaKey
} from '../model/project_model';
import { MiddleLayerEnvironment } from './middle_layer';
import { notEmpty } from '@milaboratory/ts-helpers';
import { ProjectMeta } from '@milaboratory/sdk-model';

export const ProjectsField = 'projects';
export const ProjectsResourceType: ResourceType = { name: 'Projects', version: '1' };

export const ProjectsListTreePruningFunction: PruningFunction = resource => {
  if (!resourceTypesEqual(resource.type, ProjectsResourceType))
    return [];
  return resource.fields;
};

export async function createProjectList(pl: PlClient, rid: ResourceId, openedProjects: WatchableValue<ResourceId[]>,
                                        env: MiddleLayerEnvironment): Promise<TreeAndComputableU<ProjectListEntry[]>> {
  const tree = await SynchronizedTreeState.init(pl, rid,
    { ...env.ops.defaultTreeOptions, pruning: ProjectsListTreePruningFunction });

  const c = Computable.make(ctx => {
    const node = ctx.accessor(tree.entry()).node();
    const oProjects = openedProjects.getValue(ctx);
    if (node === undefined)
      return undefined;
    const result: ProjectListEntry[] = [];
    for (const field of node.listDynamicFields()) {
      const prj = node.traverse(field);
      if (prj === undefined)
        continue;
      const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
      const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
      const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));
      result.push({
        id: field, rid: prj.id,
        created: new Date(created),
        lastModified: new Date(lastModified),
        opened: oProjects.indexOf(prj.id) >= 0, meta
      });
    }
    result.sort(p => -p.lastModified.valueOf());
    return result;
  }).withStableType();

  return { computable: c, tree };
}
