import type { Optional } from "utility-types";
import type { BasicResourceData, ResourceData } from "./types";
import { getField, isNotNullResourceId, isNullResourceId } from "./types";
import { ResourceTypeName, ResourceTypePrefix } from "@milaboratories/pl-model-common";
export { ResourceTypeName, ResourceTypePrefix };

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
  resourceData: Optional<ResourceData, "fields">,
) => boolean;

function readyOrDuplicateOrError(r: ResourceData | BasicResourceData): boolean {
  return (
    r.resourceReady || isNotNullResourceId(r.originalResourceId) || isNotNullResourceId(r.error)
  );
}

function readyAndHasAllOutputsFilled(r: Optional<ResourceData, "fields">): boolean {
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
    case ResourceTypeName.StreamManager: {
      if (!readyOrDuplicateOrError(r)) return false;
      if (r.fields === undefined) return true; // if fields are not provided basic resource state is not expected to change in the future
      if (isNotNullResourceId(r.error)) return true;
      const downloadable = getField(r as ResourceData, "downloadable");
      const stream = getField(r as ResourceData, "stream");
      return stream.value === downloadable.value;
    }
    case ResourceTypeName.StdMap:
    case ResourceTypeName.StdMapSlash:
    case ResourceTypeName.EphStdMap:
    case ResourceTypeName.PFrame:
    case ResourceTypeName.ParquetChunk:
    case ResourceTypeName.BContext:
    case ResourceTypeName.BlockPackCustom:
    case ResourceTypeName.BinaryMap:
    case ResourceTypeName.BinaryValue:
    case ResourceTypeName.BlobMap:
    case ResourceTypeName.BResolveSingle:
    case ResourceTypeName.BResolveSingleNoResult:
    case ResourceTypeName.BQueryResult:
    case ResourceTypeName.TengoTemplate:
    case ResourceTypeName.TengoLib:
    case ResourceTypeName.SoftwareInfo:
    case ResourceTypeName.Dummy:
      return readyOrDuplicateOrError(r);
    case ResourceTypeName.JsonResourceError:
      return r.type.version === "1";
    case ResourceTypeName.JsonObject:
    case ResourceTypeName.JsonGzObject:
    case ResourceTypeName.JsonString:
    case ResourceTypeName.JsonArray:
    case ResourceTypeName.JsonNumber:
    case ResourceTypeName.BContextEnd:
    case ResourceTypeName.FrontendFromUrl:
    case ResourceTypeName.FrontendFromFolder:
    case ResourceTypeName.BObjectSpec:
    case ResourceTypeName.Blob:
    case ResourceTypeName.Null:
    case ResourceTypeName.Binary:
    case ResourceTypeName.LSProvider:
      return true;
    case ResourceTypeName.UserProject:
    case ResourceTypeName.Projects:
    case ResourceTypeName.ClientRoot:
      return false;
    default:
      if (
        r.type.name.startsWith(ResourceTypePrefix.Blob) ||
        r.type.name.startsWith(ResourceTypePrefix.LS)
      ) {
        return true;
      } else if (
        r.type.name.startsWith(ResourceTypePrefix.BlobUpload) ||
        r.type.name.startsWith(ResourceTypePrefix.BlobIndex)
      ) {
        return readyAndHasAllOutputsFilled(r);
      } else if (r.type.name.startsWith(ResourceTypePrefix.PColumnData)) {
        return readyOrDuplicateOrError(r);
      } else if (r.type.name.startsWith(ResourceTypePrefix.StreamWorkdir)) {
        return readyOrDuplicateOrError(r);
      } else {
        // Unknown resource type detected
        // Set used to log this message only once
        if (!unknownResourceTypeNames.has(r.type.name)) {
          console.log("UNKNOWN RESOURCE TYPE: " + r.type.name);
          unknownResourceTypeNames.add(r.type.name);
        }
      }
  }
  return false;
};
