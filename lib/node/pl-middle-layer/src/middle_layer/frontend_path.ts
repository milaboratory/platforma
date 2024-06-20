import { PlTreeEntry, PlTreeEntryAccessor } from '@milaboratory/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { Pl, resourceTypesEqual } from '@milaboratory/pl-client-v2';
import {
  FrontendFromFolderData,
  FrontendFromFolderResourceType,
  FrontendFromUrlData,
  FrontendFromUrlResourceType
} from '../model';
import { PathResult } from '@milaboratory/pl-drivers';
import { projectFieldName } from '../model/project_model';
import { BlockPackFrontendField } from '../mutator/block-pack/block_pack';

function kernel(a: PlTreeEntryAccessor, env: MiddleLayerEnvironment): undefined | string | ComputableStableDefined<PathResult> {
  const node = a.node();
  if (node === undefined)
    return undefined;
  if (resourceTypesEqual(node.resourceType, FrontendFromUrlResourceType)) {
    const data = node.getDataAsJson<FrontendFromUrlData>();
    if (data === undefined)
      throw new Error(`No resource data.`);
    return env.frontendDownloadDriver.getPath(new URL(data.url)).withStableType();
  } else if (resourceTypesEqual(node.resourceType, FrontendFromFolderResourceType)) {
    const data = node.getDataAsJson<FrontendFromFolderData>();
    if (data === undefined)
      throw new Error(`No resource data.`);
    env.signer.verify(data.path, data.signature,
      `Frontend path signature mismatch for: ${data.path}`);
    return data.path;
  } else {
    throw new Error(`Unsupported resource type: ${JSON.stringify(node.resourceType)}`);
  }
}

function frontendPathComputable(entry: PlTreeEntry | undefined, env: MiddleLayerEnvironment): ComputableStableDefined<string> | undefined {
  if (entry === undefined)
    return undefined;
  return Computable.make(c => {
    return kernel(c.accessor(entry), env);
  }, {
    postprocessValue: v => {
      if (v === undefined)
        return undefined;
      if (typeof v === 'string')
        return v;
      if (v.error !== undefined)
        throw new Error(v.error);
      return v.path;
    }
  }).withStableType();
}

export function frontendPath(projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment): ComputableStableDefined<string> {
  return Computable.make(ctx => {
    const prj = ctx.accessor(projectEntry).node();
    const frontendEntry = prj.traverse(
      { field: projectFieldName(id, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
      { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true },
      { field: BlockPackFrontendField, assertFieldType: 'Input' }
    )?.persist();
    return frontendPathComputable(frontendEntry, env);
  }).withStableType();
}
