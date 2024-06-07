import { PlTreeEntry } from '@milaboratory/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { computable, ComputableSU } from '@milaboratory/computable';
import { resourceTypesEqual } from '@milaboratory/pl-client-v2';
import { FrontendFromUrlData, FrontendFromUrlResourceType } from '../model/block_pack_spec';
import { PathResult } from '@milaboratory/pl-drivers';

export function frontendPath(entry: PlTreeEntry | undefined, env: MiddleLayerEnvironment): ComputableSU<PathResult> | undefined {
  if (entry === undefined)
    return undefined;
  return computable(entry, {}, a => {
    const node = a.node();
    if (node === undefined)
      return undefined;
    if (!resourceTypesEqual(node.resourceType, FrontendFromUrlResourceType))
      throw new Error(`Unsupported resource type: ${JSON.stringify(node.resourceType)}`);
    const data = node.getDataAsJson<FrontendFromUrlData>();
    if (data === undefined)
      throw new Error(`No resource data.`);
    return env.frontendDownloadDriver.getPath(new URL(data.url));
  }).withStableType();
}
