import {
  assertNever,
  bigintReplacer,
  canonicalizeJson,
  ensureError,
  mapPObjectData,
  PFrameDriverError,
  ValueType,
  resolveAnnotationParents,
  type JsonSerializable,
  type PColumn,
  type PColumnSpec,
  type PFrameHandle,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { hashJson, PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { RefCountPoolBase, type PoolEntry } from "@milaboratories/helpers";
import { PFrameFactory } from "@milaboratories/pframes-rs-node";
import { createPFrame as createPFrameSpec } from "@milaboratories/pframes-rs-wasm";
import { mapValues } from "es-toolkit";
import { logPFrames } from "./logging";

export interface LocalBlobProvider<TreeEntry extends JsonSerializable> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  makeDataSource(signal: AbortSignal): Omit<PFrameInternal.PFrameDataSourceV2, "parquetServer">;
}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  httpServerInfo(): PFrameInternal.HttpServerInfo;
}

export class PFrameHolder<TreeEntry extends JsonSerializable> implements Disposable {
  public readonly pFrameDataPromise: Promise<PFrameInternal.PFrameV17>;
  /**
   * WASM-spec frame built from this PFrame's columns. Source of truth
   * for spec-side operations: column discovery, selector resolution,
   * legacy-query lowering.
   */
  public readonly pFrameSpec: PFrameInternal.PFrameWasmV3;
  public readonly columnSpecs: Record<PObjectId, PColumnSpec>;
  private readonly abortController = new AbortController();

  private readonly localBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];
  private readonly remoteBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];

  constructor(
    frameId: PFrameInternal.PFrameId,
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    logger: PFrameInternal.Logger,
    private readonly spillPath: string,
    columns: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
  ) {
    const ValueTypes = new Set(Object.values(ValueType));
    const specColumnsMap: Record<PObjectId, PColumnSpec> = {};
    for (const c of columns) {
      if (ValueTypes.has(c.spec.valueType)) {
        specColumnsMap[c.id] = resolveAnnotationParents(c.spec);
      }
    }
    this.pFrameSpec = createPFrameSpec(specColumnsMap);
    this.columnSpecs = specColumnsMap;

    try {
      const makeLocalBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
        const localBlob = this.localBlobProvider.acquire(blob);
        this.localBlobs.push(localBlob);
        return localBlob.key;
      };

      const makeRemoteBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
        const remoteBlob = this.remoteBlobProvider.acquire(blob);
        this.remoteBlobs.push(remoteBlob);
        return `${remoteBlob.key}${PFrameInternal.ParquetExtension}` as PFrameInternal.PFrameBlobId;
      };

      const mapColumnData = (
        data: PFrameInternal.DataInfo<TreeEntry>,
      ): PFrameInternal.DataInfo<PFrameInternal.PFrameBlobId> => {
        switch (data.type) {
          case "Json":
            return { ...data };
          case "JsonPartitioned":
            return {
              ...data,
              parts: mapValues(data.parts, makeLocalBlobId),
            };
          case "BinaryPartitioned":
            return {
              ...data,
              parts: mapValues(data.parts, (v) => ({
                index: makeLocalBlobId(v.index),
                values: makeLocalBlobId(v.values),
              })),
            };
          case "ParquetPartitioned":
            return {
              ...data,
              parts: mapValues(data.parts, (v) => ({
                ...v,
                data: makeRemoteBlobId(v.data),
              })),
            };
          default:
            assertNever(data);
        }
      };

      const jsonifiedColumns = columns.map((column) => ({
        ...column,
        data: mapColumnData(column.data),
      }));

      const pFrameData = PFrameFactory.createPFrame({ frameId, spillPath: this.spillPath, logger });
      try {
        pFrameData.setDataSource({
          ...this.localBlobProvider.makeDataSource(this.disposeSignal),
          parquetServer: this.remoteBlobProvider.httpServerInfo(),
        });

        this.pFrameDataPromise = pFrameData
          .addColumns(
            jsonifiedColumns.map((c) => ({
              id: c.id,
              data: {
                ...c.data,
                typeSpec: {
                  axes: c.spec.axesSpec.map((a) => a.type),
                  column: c.spec.valueType,
                },
              },
            })),
            { signal: this.disposeSignal },
          )
          .then(() => pFrameData)
          .catch((err: unknown) => {
            this.dispose();
            pFrameData.dispose();
            const error = new PFrameDriverError("PFrame creation failed asynchronously");
            error.cause = new Error(
              `PFrame cannot be created from columns: ${JSON.stringify(jsonifiedColumns)}`,
              { cause: ensureError(err) },
            );
            throw error;
          });
      } catch (err: unknown) {
        // setDataSource / addColumns threw synchronously before
        // pFrameDataPromise was assigned — dispose the addon's pFrameData
        // explicitly (the dispose() path can't reach it yet).
        pFrameData.dispose();
        throw err;
      }
    } catch (err: unknown) {
      // Release everything allocated so far in this constructor:
      // acquired blobs, the WASM spec frame, and the abort signal.
      this.abortController.abort();
      this.localBlobs.forEach((entry) => entry.unref());
      this.remoteBlobs.forEach((entry) => entry.unref());
      this.pFrameSpec[Symbol.dispose]();
      const error = new PFrameDriverError("PFrame creation failed synchronously");
      error.cause = new Error(`PFrame cannot be created from columns: ${JSON.stringify(columns)}`, {
        cause: ensureError(err),
      });
      throw error;
    }
  }

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  private dispose(): void {
    this.abortController.abort();
    this.localBlobs.forEach((entry) => entry.unref());
    this.remoteBlobs.forEach((entry) => entry.unref());
    this.pFrameSpec[Symbol.dispose]();
    void this.pFrameDataPromise
      .then((pFrameData) => pFrameData.dispose())
      .catch(() => {
        /* mute error */
      });
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export class PFramePool<TreeEntry extends JsonSerializable> extends RefCountPoolBase<
  PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
  PFrameHandle,
  PFrameHolder<TreeEntry>
> {
  constructor(
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    private readonly logger: PFrameInternal.Logger,
    private readonly spillPath: string,
  ) {
    super();
  }

  protected calculateParamsKey(
    params: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
  ): PFrameHandle {
    return stableKeyFromPFrameData(params);
  }

  protected createNewResource(
    params: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
    key: PFrameHandle,
  ): PFrameHolder<TreeEntry> {
    if (logPFrames()) {
      this.logger(
        "info",
        `PFrame creation (pFrameHandle = ${key}): ` + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }
    return new PFrameHolder(
      key,
      this.localBlobProvider,
      this.remoteBlobProvider,
      this.logger,
      this.spillPath,
      params,
    );
  }

  public getByKey(key: PFrameHandle): PFrameHolder<TreeEntry> {
    const resource = super.tryGetByKey(key);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid PFrame handle`);
      error.cause = new Error(`PFrame with handle ${key} not found`);
      throw error;
    }
    return resource;
  }
}

function stableKeyFromPFrameData<TreeEntry extends JsonSerializable>(
  data: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
): PFrameHandle {
  const orderedData = [...data].map((column) =>
    mapPObjectData(column, (r) => {
      let result: {
        type: string;
        keyLength: number;
        payload: {
          key: string;
          value: null | number | string | [string, string];
        }[];
      };
      const type = r.type;
      switch (type) {
        case "Json":
          result = {
            type: r.type,
            keyLength: r.keyLength,
            payload: Object.entries(r.data).map(([part, value]) => ({
              key: part,
              value,
            })),
          };
          break;
        case "JsonPartitioned":
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: canonicalizeJson(info),
            })),
          };
          break;
        case "BinaryPartitioned":
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: [canonicalizeJson(info.index), canonicalizeJson(info.values)] as const,
            })),
          };
          break;
        case "ParquetPartitioned":
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value:
                info.dataDigest ||
                ([
                  canonicalizeJson(info.data),
                  JSON.stringify({ axes: info.axes, column: info.column }),
                ] as const),
            })),
          };
          break;
        default:
          throw new PFrameDriverError(
            `unsupported resource type: ${JSON.stringify(type satisfies never)}`,
          );
      }
      result.payload.sort((lhs, rhs) => (lhs.key < rhs.key ? -1 : 1));
      return result;
    }),
  );
  orderedData.sort((lhs, rhs) => (lhs.id < rhs.id ? -1 : 1));
  return hashJson(orderedData) as string as PFrameHandle;
}
