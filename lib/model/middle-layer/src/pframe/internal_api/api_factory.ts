import type {
  AxisValueType,
  BinaryPartitionedDataInfo,
  Branded,
  ColumnValueType,
  JsonDataInfo,
  JsonPartitionedDataInfo,
  ParquetChunk,
  ParquetPartitionedDataInfo,
  PObjectId,
} from "@milaboratories/pl-model-common";
import type { HttpServerInfo } from "./http_helpers";

/** PColumn spec file extension */
export const SpecExtension = ".spec" as const;

/** PColumn data info file extension */
export const DataInfoExtension = ".datainfo" as const;

/** Abstract identifier of a data blob that can be requested from the storage backend */
export type PFrameBlobId = Branded<string, "PFrameInternal.PFrameBlobId">;

/** Path of the file containing requested data (blob). This path is returned by
 * {@link BlobPathResolver} as soon as blob materialized in the file system. */
export type FilePath = string;

/** Data source allows PFrame to retrieve the data blobs for columns with assigned data info. */
export interface PFrameDataSourceV2 {
  /**
   * PFrame may notify storage backend about its plans to use particular blobs in the future.
   * Storage backend will do its best to preload specified blob so the subsequent
   * {@link resolveBlob} will quickly return preloaded file path.
   */
  preloadBlob(blobIds: PFrameBlobId[]): Promise<void>;

  /** Returns raw blob data given the blob id from {@link DataInfo}. */
  resolveBlobContent(blobId: PFrameBlobId): Promise<Uint8Array>;

  /**
   * Parquet HTTP(S) server connection settings, {@link HttpHelpers.createHttpServer}
   * When not provided, parquet BlobIds would be treated as local file paths.
   */
  parquetServer?: HttpServerInfo;
}

/**
 * Structural type information for a single PColumn needed by the data side:
 * the axis value types (in canonical order) and the column value type. Mirrors
 * the on-disk `typeSpec` shape (`{ axes, column }`).
 */
export type PColumnValueTypeSpec = {
  readonly axes: AxisValueType[];
  readonly column: ColumnValueType;
};

/**
 * Union type representing all possible data storage formats for PColumn data.
 * The specific format used depends on data size, access patterns, and performance requirements.
 *
 * @template Blob - Type parameter representing the storage reference type (could be ResourceInfo, PFrameBlobId, etc.)
 */
export type DataInfo<Blob> =
  | JsonDataInfo
  | JsonPartitionedDataInfo<Blob>
  | BinaryPartitionedDataInfo<Blob>
  | ParquetPartitionedDataInfo<ParquetChunk<Blob>>;

/**
 * Self-contained data info: a PColumn data storage format with an embedded
 * {@link PColumnValueTypeSpec}, so the data layer can interpret the values
 * without a separate spec. This is the on-disk `.datainfo` shape and the
 * payload accepted by {@link PFrameFactoryAPIV6.addColumns}.
 *
 * Declared independently of {@link DataInfo} (not as an intersection) so the
 * legacy v1 type can be removed without affecting this one.
 *
 * @template Blob - Type parameter representing the storage reference type (could be ResourceInfo, PFrameBlobId, etc.)
 */
export type DataInfoV2<Blob> = (
  | JsonDataInfo
  | JsonPartitionedDataInfo<Blob>
  | BinaryPartitionedDataInfo<Blob>
  | ParquetPartitionedDataInfo<ParquetChunk<Blob>>
) & {
  readonly typeSpec: PColumnValueTypeSpec;
};

/**
 * Structural type information needed by the data side: axis value
 * types and column value types, in their canonical order. Mirrors
 * the bridge-side `TypeSpec`.
 */
export interface ValueTypeSpec {
  readonly axes: AxisValueType[];
  readonly columns: ColumnValueType[];
}

/** Single column entry for {@link PFrameFactoryAPIV5.addColumns}. */
export interface AddColumnEntry {
  /** Unique column identifier within the PFrame. */
  readonly id: PObjectId;
  /** Structural type info (axes / column value types). */
  readonly typeSpec: ValueTypeSpec;
  /** Data info for the column. */
  readonly data: DataInfo<PFrameBlobId>;
}

/**
 * Single column entry for {@link PFrameFactoryAPIV6.addColumns}. The structural
 * type info is carried inside {@link DataInfoV2.typeSpec} rather than as a
 * separate field, so `data` is self-describing.
 */
export interface AddColumnEntryV2 {
  /** Unique column identifier within the PFrame. */
  readonly id: PObjectId;
  /** Self-contained data info (carries its own `typeSpec`). */
  readonly data: DataInfoV2<PFrameBlobId>;
}

/** API for populating a PFrame with columns and a data source. */
export interface PFrameFactoryAPIV5 extends Disposable {
  /** Associates data source with this PFrame. */
  setDataSource(dataSource: PFrameDataSourceV2): void;

  /**
   * Registers all PColumns at once: specs are recorded and data info
   * is attached atomically. For parquet data info, schema resolution
   * via network is performed during this call.
   */
  addColumns(
    columns: AddColumnEntry[],
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}

/**
 * API for populating a PFrame with columns and a data source. Unlike
 * {@link PFrameFactoryAPIV5}, each column's structural type info is embedded in
 * its self-contained {@link AddColumnEntryV2.data} instead of a separate field.
 */
export interface PFrameFactoryAPIV6 extends Disposable {
  /** Associates data source with this PFrame. */
  setDataSource(dataSource: PFrameDataSourceV2): void;

  /**
   * Registers all PColumns at once: data info (self-contained, carrying its own
   * `typeSpec`) is attached atomically. For parquet data info, schema resolution
   * via network is performed during this call.
   */
  addColumns(
    columns: AddColumnEntryV2[],
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
