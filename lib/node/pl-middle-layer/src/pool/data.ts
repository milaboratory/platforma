import {
  createGlobalPObjectId,
  createLocalPObjectId,
  PFrameDriverError,
  type BinaryChunk,
  type ParquetChunk,
  type ParquetChunkMapping,
  type ParquetChunkMetadata,
  type PColumnValue,
  type PObjectId,
  type PObjectSpec,
} from "@platforma-sdk/model";
import { makeResourceSnapshot, type PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import canonicalize from "canonicalize";
import {
  anyResourceIdToBigint,
  isNullSignedResourceId,
  resourceIdToString,
  resourceType,
  resourceTypeToString,
  resourceTypesEqual,
  type SignedResourceId,
  type ResourceType,
} from "@milaboratories/pl-client";
import type { Writable } from "utility-types";
import { createHash } from "node:crypto";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { OnDemandBlobResourceSnapshot } from "@milaboratories/pl-drivers";

/**
 * Tree-independent reference to a blob resource used by the PFrame data flow.
 *
 * The earlier design carried a {@link PlTreeEntry} all the way into the blob pools;
 * resolution then went back through the originating tree, so when that tree dropped
 * the resource (e.g., a project recalculated with new settings), shared pool entries
 * — held alive by other projects — would start failing with "resource not found in
 * the tree" even though the underlying blob was still valid backend-side.
 *
 * BlobResourceRef captures the snapshot at parse time, where the tree is guaranteed
 * to resolve. The pools then key by rid (`resourceInfo.id`) and call into the
 * download driver with the snapshot directly — independent of any specific tree.
 */
export class BlobResourceRef {
  constructor(
    public readonly resourceInfo: { readonly id: SignedResourceId; readonly type: ResourceType },
    /** Present only for on-demand (remote) blobs; needed for size and signed handle. */
    public readonly onDemandSnapshot: OnDemandBlobResourceSnapshot | undefined,
  ) {}

  toJSON(): string {
    return resourceIdToString(this.resourceInfo.id);
  }
}

export function makeLocalBlobRef(accessor: PlTreeNodeAccessor): BlobResourceRef {
  return new BlobResourceRef(accessor.resourceInfo, undefined);
}

function makeRemoteBlobRef(accessor: PlTreeNodeAccessor): BlobResourceRef {
  return new BlobResourceRef(
    accessor.resourceInfo,
    makeResourceSnapshot(accessor, OnDemandBlobResourceSnapshot),
  );
}

export const PColumnDataJsonPartitioned = resourceType("PColumnData/JsonPartitioned", "1");
export const PColumnDataJsonSuperPartitioned = resourceType(
  "PColumnData/Partitioned/JsonPartitioned",
  "1",
);
export const PColumnDataBinaryPartitioned = resourceType("PColumnData/BinaryPartitioned", "1");
export const PColumnDataBinarySuperPartitioned = resourceType(
  "PColumnData/Partitioned/BinaryPartitioned",
  "1",
);
export const PColumnDataParquetPartitioned = resourceType("PColumnData/ParquetPartitioned", "1");
export const PColumnDataParquetSuperPartitioned = resourceType(
  "PColumnData/Partitioned/ParquetPartitioned",
  "1",
);
export const PColumnDataJson = resourceType("PColumnData/Json", "1");

export const ParquetChunkResourceType = resourceType("ParquetChunk", "1");

export type PColumnDataJsonResourceValue = {
  keyLength: number;
  data: Record<string, PColumnValue>;
};

export type PColumnDataPartitionedResourceValue = {
  partitionKeyLength: number;
};

export type PColumnDataSuperPartitionedResourceValue = {
  superPartitionKeyLength: number;
  partitionKeyLength: number;
};

const BinaryPartitionedIndexFieldSuffix = ".index";
const BinaryPartitionedValuesFieldSuffix = ".values";

export function parseDataInfoResource(
  data: PlTreeNodeAccessor,
): undefined | PFrameInternal.DataInfo<BlobResourceRef> {
  if (!data.getIsReadyOrError()) return undefined;

  const resourceData = data.getDataAsJson();
  if (resourceData === undefined)
    throw new PFrameDriverError("unexpected data info structure, no resource data");

  if (resourceTypesEqual(data.resourceType, PColumnDataJson)) {
    const dataContent = resourceData as PColumnDataJsonResourceValue;

    return {
      type: "Json",
      keyLength: dataContent.keyLength,
      data: dataContent.data,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts = Object.fromEntries(
      data
        .listInputFields()
        .map((field) => [
          field,
          makeLocalBlobRef(data.traverse({ field, errorIfFieldNotSet: true })),
        ]),
    );

    return {
      type: "JsonPartitioned",
      partitionKeyLength: meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonSuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, BlobResourceRef> = {};
    for (const superKey of data.listInputFields()) {
      const superPart = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superPart.listInputFields();
      if (keys === undefined)
        throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const key of keys) {
        const partKey = JSON.stringify([
          ...(JSON.parse(superKey) as PColumnValue[]),
          ...(JSON.parse(key) as PColumnValue[]),
        ]);
        parts[partKey] = makeLocalBlobRef(
          superPart.traverse({ field: key, errorIfFieldNotSet: true }),
        );
      }
    }

    return {
      type: "JsonPartitioned",
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinaryPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts: Record<string, Partial<Writable<BinaryChunk<BlobResourceRef>>>> = {};

    // parsing the structure
    for (const field of data.listInputFields()) {
      if (field.endsWith(BinaryPartitionedIndexFieldSuffix)) {
        const partKey = field.slice(0, -BinaryPartitionedIndexFieldSuffix.length);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.index = makeLocalBlobRef(data.traverse({ field, errorIfFieldNotSet: true }));
      } else if (field.endsWith(BinaryPartitionedValuesFieldSuffix)) {
        const partKey = field.slice(0, -BinaryPartitionedValuesFieldSuffix.length);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.values = makeLocalBlobRef(data.traverse({ field, errorIfFieldNotSet: true }));
      } else throw new PFrameDriverError(`unrecognized part field name: ${field}`);
    }

    // structure validation
    for (const [key, part] of Object.entries(parts)) {
      if (part.index === undefined) throw new PFrameDriverError(`no index for part ${key}`);
      if (part.values === undefined) throw new PFrameDriverError(`no values for part ${key}`);
    }

    return {
      type: "BinaryPartitioned",
      partitionKeyLength: meta.partitionKeyLength,
      parts: parts as Record<string, BinaryChunk<BlobResourceRef>>,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinarySuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, Partial<Writable<BinaryChunk<BlobResourceRef>>>> = {};
    for (const superKey of data.listInputFields()) {
      const superData = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superData.listInputFields();
      if (keys === undefined)
        throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const field of keys) {
        if (field.endsWith(BinaryPartitionedIndexFieldSuffix)) {
          const key = field.slice(0, -BinaryPartitionedIndexFieldSuffix.length);

          const partKey = JSON.stringify([
            ...(JSON.parse(superKey) as PColumnValue[]),
            ...(JSON.parse(key) as PColumnValue[]),
          ]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].index = makeLocalBlobRef(
            superData.traverse({ field, errorIfFieldNotSet: true }),
          );
        } else if (field.endsWith(BinaryPartitionedValuesFieldSuffix)) {
          const key = field.slice(0, -BinaryPartitionedValuesFieldSuffix.length);

          const partKey = JSON.stringify([
            ...(JSON.parse(superKey) as PColumnValue[]),
            ...(JSON.parse(key) as PColumnValue[]),
          ]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].values = makeLocalBlobRef(
            superData.traverse({ field, errorIfFieldNotSet: true }),
          );
        } else throw new PFrameDriverError(`unrecognized part field name: ${field}`);
      }
    }

    return {
      type: "BinaryPartitioned",
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts: parts as Record<string, BinaryChunk<BlobResourceRef>>,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataParquetPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts: Record<string, ParquetChunk<BlobResourceRef>> = {};
    for (const key of data.listInputFields()) {
      const resource = data.traverse({
        field: key,
        assertFieldType: "Input",
        errorIfFieldNotSet: true,
      });

      parts[key] = traverseParquetChunkResource(resource);
    }

    return {
      type: "ParquetPartitioned",
      partitionKeyLength: meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataParquetSuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, ParquetChunk<BlobResourceRef>> = {};
    for (const superKey of data.listInputFields()) {
      const superPart = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superPart.listInputFields();
      if (keys === undefined)
        throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const key of keys) {
        const resource = data.traverse({ field: key, errorIfFieldNotSet: true });

        const partKey = JSON.stringify([
          ...(JSON.parse(superKey) as PColumnValue[]),
          ...(JSON.parse(key) as PColumnValue[]),
        ]);
        parts[partKey] = traverseParquetChunkResource(resource);
      }
    }

    return {
      type: "ParquetPartitioned",
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts,
    };
  }

  throw new PFrameDriverError(
    `unsupported resource type: ${resourceTypeToString(data.resourceType)}`,
  );
}

export function traverseParquetChunkResource(
  resource: PlTreeNodeAccessor,
): ParquetChunk<BlobResourceRef> {
  if (!resourceTypesEqual(resource.resourceType, ParquetChunkResourceType)) {
    throw new PFrameDriverError(
      `unknown resource type: ${resourceTypeToString(resource.resourceType)}, ` +
        `expected: ${resourceTypeToString(ParquetChunkResourceType)}`,
    );
  }

  const blob = makeRemoteBlobRef(
    resource.traverse({ field: "blob", assertFieldType: "Service", errorIfFieldNotSet: true }),
  );
  const partInfo = resource.getDataAsJson() as ParquetChunkMetadata;
  const mapping = resource
    .traverse({ field: "mapping", assertFieldType: "Service", errorIfFieldNotSet: true })
    .getDataAsJson() as ParquetChunkMapping;

  return {
    data: blob,
    ...partInfo,
    ...mapping,
  };
}

export function deriveLegacyPObjectId(spec: PObjectSpec, data: PlTreeNodeAccessor): PObjectId {
  const hash = createHash("sha256");
  hash.update(canonicalize(spec)!);
  const rid = !isNullSignedResourceId(data.originalId) ? data.originalId : data.id;
  hash.update(String(anyResourceIdToBigint(rid)));
  return hash.digest().toString("hex") as PObjectId;
}

export function deriveGlobalPObjectId(blockId: string, exportName: string): PObjectId {
  return createGlobalPObjectId(blockId, exportName);
}

export function deriveLocalPObjectId(resolvePath: string[], outputName: string): PObjectId {
  return createLocalPObjectId(resolvePath, outputName);
}
