import { PruningFunction, SynchronizedTreeState } from '@milaboratory/pl-tree';
import { PlClient, ResourceId, ResourceType, resourceTypesEqual } from '@milaboratory/pl-client-v2';
import { TemporalSynchronizedTreeOps, TreeAndComputableU } from './types';
import { computable } from '@milaboratory/computable';
import { ProjectMeta, ProjectMetaKey } from '../model/project_model';

export const ProjectsField = 'projects';
export const ProjectsResourceType: ResourceType = { name: 'Projects', version: '1' };

export const ProjectsListTreePruningFunction: PruningFunction = resource => {
  if (!resourceTypesEqual(resource.type, ProjectsResourceType))
    return [];
  return resource.fields;
};

export interface ProjectListEntry {
  rid: ResourceId,
  id: string,
  meta: ProjectMeta
}

export type ProjectList = ProjectListEntry[];

export function createProjectList(pl: PlClient, rid: ResourceId, ops: TemporalSynchronizedTreeOps): TreeAndComputableU<ProjectList> {
  const tree = new SynchronizedTreeState(pl, rid,
    { ...ops, pruning: ProjectsListTreePruningFunction });

  const c = computable(tree.entry(), {}, a => {
    const node = a.node();
    if (node === undefined)
      return undefined;
    const result: ProjectListEntry[] = [];
    for (const field of node.listDynamicFields()) {
      const prj = node.get(field)?.value;
      if (prj === undefined)
        continue;
      const meta = JSON.parse(prj.getKeyValueString(ProjectMetaKey)!) as ProjectMeta;
      result.push({ id: field, rid: prj.id, meta });
    }
    return result;
  }).withStableType();

  return { computable: c, tree };
}
