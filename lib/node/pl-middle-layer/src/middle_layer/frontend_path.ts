import { PlTreeEntry, PlTreeEntryAccessor } from '@milaboratory/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { computable, ComputableStableDefined } from '@milaboratory/computable';
import { Pl, resourceTypesEqual } from '@milaboratory/pl-client-v2';
import { FrontendFromUrlData, FrontendFromUrlResourceType } from '../model/block_pack_spec';
import { PathResult } from '@milaboratory/pl-drivers';
import { projectFieldName } from '../model/project_model';
import { BlockPackFrontendField } from '../mutator/block-pack/block_pack';

function kernel(a: PlTreeEntryAccessor, env: MiddleLayerEnvironment): undefined | ComputableStableDefined<PathResult> {
  const node = a.node();
  if (node === undefined)
    return undefined;
  if (!resourceTypesEqual(node.resourceType, FrontendFromUrlResourceType))
    throw new Error(`Unsupported resource type: ${JSON.stringify(node.resourceType)}`);
  const data = node.getDataAsJson<FrontendFromUrlData>();
  if (data === undefined)
    throw new Error(`No resource data.`);
  return env.frontendDownloadDriver.getPath(new URL(data.url)).withStableType();
}

function frontendPathComputable(entry: PlTreeEntry | undefined, env: MiddleLayerEnvironment): ComputableStableDefined<string> | undefined {
  if (entry === undefined)
    return undefined;
  return computable(entry, {}, a => {
    return kernel(a, env);
  }, async v => {
    if (v === undefined)
      return undefined;
    if (v.error !== undefined)
      throw new Error(v.error);
    return v.path;
  }).withStableType();
}

export function frontendPath(projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment): ComputableStableDefined<string> {
  return computable(projectEntry, {}, prjA => {
    const prj = prjA.node();
    const frontendEntry = prj.traverse(
      { field: projectFieldName(id, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
      { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true },
      { field: BlockPackFrontendField, assertFieldType: 'Input' }
    )?.persist();
    if (frontendEntry === undefined)
      return undefined;
    return frontendPathComputable(frontendEntry, env);
  }).withStableType();
}
