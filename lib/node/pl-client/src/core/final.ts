import { Optional } from 'utility-types';
import { BasicResourceData, getField, isNotNullResourceId, isNullResourceId, ResourceData } from './types';

/**
 * Function is used to guide multiple layers of caching in pl-client and derived pl-tree.
 *
 * This function defines expected resource-specific state mutation behaviour,
 * if it returns true, system will expect that this data will never change as long as resource exist.
 *
 * If resource data contain information about fields, if should be taken into account, fields are undefined,
 * "final" state should be calculated for "basic" part of resource data only.
 */
export type FinalResourceDataPredicate = (
  resourceData: Optional<ResourceData, 'fields'>
) => boolean;

function readyOrDuplicateOrError(r: ResourceData | BasicResourceData): boolean {
  return (
    r.resourceReady || isNotNullResourceId(r.originalResourceId) || isNotNullResourceId(r.error)
  );
}

function readyAndHasAllOutputsFilled(r: Optional<ResourceData, 'fields'>): boolean {
  if (!readyOrDuplicateOrError(r)) return false;
  if (!r.outputsLocked) return false;
  if (r.fields === undefined) return true; // if fields are not provided basic resource state is not expected to change in the future
  for (const f of r.fields)
    if (isNullResourceId(f.error) && (isNullResourceId(f.value) || !f.valueIsFinal)) return false;
  return true;
}

// solely for logging
const unknownResourceTypeNames = new Set<string>();

/** Default implementation, defining behaviour for built-in resource types. */
export const DefaultFinalResourceDataPredicate: FinalResourceDataPredicate = (r): boolean => {
  switch (r.type.name) {
    case 'StreamManager':
      if(!readyOrDuplicateOrError(r))
        return false;
      if (r.fields === undefined) return true; // if fields are not provided basic resource state is not expected to change in the future
      if(isNotNullResourceId(r.error)) return true;
      const downloadable = getField(r as ResourceData, "downloadable");
      const stream = getField(r as ResourceData, "stream");
      return stream.value === downloadable.value
    case 'StdMap':
    case 'std/map':
    case 'EphStdMap':
    case 'PFrame':
    case 'BContext':
    case 'BlockPackCustom':
    case 'BinaryMap':
    case 'BinaryValue':
    case 'BlobMap':
    case 'BResolveSingle':
    case 'BResolveSingleNoResult':
    case 'BQueryResult':
    case 'TengoTemplate':
    case 'TengoLib':
    case 'SoftwareInfo':
    case 'Dummy':
      return readyOrDuplicateOrError(r);
    case 'json/resourceError':
      return r.type.version === '1';
    case 'json/object':
    case 'json/string':
    case 'json/array':
    case 'json/number':
    case 'BContextEnd':
    case 'Frontend/FromUrl':
    case 'Frontend/FromFolder':
    case 'BObjectSpec':
    case 'Blob':
      return true;
    case 'UserProject':
    case 'Projects':
    case 'ClientRoot':
      return false;
    default:
      if (r.type.name.startsWith('Blob/')) return true;
      else if (r.type.name.startsWith('BlobUpload/')) {
        return readyAndHasAllOutputsFilled(r);
      } else if (r.type.name.startsWith('PColumnData/')) {
        return readyOrDuplicateOrError(r);
      } else {
        // Unknonw resource type detected
        // Set used to log this message only once
        if (!unknownResourceTypeNames.has(r.type.name)) {
          console.log('UNKNOWN RESOURCE TYPE: ' + r.type.name);
          unknownResourceTypeNames.add(r.type.name);
        }
      }
  }
  return false;
};
