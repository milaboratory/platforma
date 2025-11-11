import {
  assertNever,
  bigintReplacer,
  canonicalizeJson,
  ensureError,
  mapPObjectData,
  PFrameDriverError,
  type JsonSerializable,
  type PColumn,
  type PFrameHandle,
} from '@platforma-sdk/model';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import {
  hashJson,
  RefCountPoolBase,
  type PoolEntry,
} from '@milaboratories/ts-helpers';
import { PFrameFactory } from '@milaboratories/pframes-rs-node';
import { mapValues } from 'es-toolkit';
import { logPFrames } from './logging';

export interface LocalBlobProvider<TreeEntry extends JsonSerializable> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2;
}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  httpServerInfo(): PFrameInternal.HttpServerInfo;
}

export class PFrameHolder<TreeEntry extends JsonSerializable> implements AsyncDisposable {
  public readonly pFramePromise: Promise<PFrameInternal.PFrameV12>;
  private readonly abortController = new AbortController();
  private readonly localBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];
  private readonly remoteBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];

  constructor(
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    logger: PFrameInternal.Logger,
    private readonly spillPath: string,
    columns: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
  ) {
    const makeLocalBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
      const localBlob = this.localBlobProvider.acquire(blob);
      this.localBlobs.push(localBlob);
      return localBlob.key;
    };

    const makeRemoteBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
      const remoteBlob = this.remoteBlobProvider.acquire(blob);
      this.remoteBlobs.push(remoteBlob);
      return `${remoteBlob.key}${PFrameInternal.ParquetExtension}`;
    };

    const mapColumnData = (
      data: PFrameInternal.DataInfo<TreeEntry>,
    ): PFrameInternal.DataInfo<PFrameInternal.PFrameBlobId> => {
      switch (data.type) {
        case 'Json':
          return { ...data };
        case 'JsonPartitioned':
          return {
            ...data,
            parts: mapValues(data.parts, makeLocalBlobId),
          };
        case 'BinaryPartitioned':
          return {
            ...data,
            parts: mapValues(data.parts, (v) => ({
              index: makeLocalBlobId(v.index),
              values: makeLocalBlobId(v.values),
            })),
          };
        case 'ParquetPartitioned':
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

    try {
      const pFrame = PFrameFactory.createPFrame({ spillPath: this.spillPath, logger });
      pFrame.setDataSource(this.localBlobProvider.makeDataSource(this.disposeSignal));

      const promises: Promise<void>[] = [];
      for (const column of jsonifiedColumns) {
        pFrame.addColumnSpec(column.id, column.spec);
        promises.push(pFrame.setColumnData(column.id, column.data, { signal: this.disposeSignal }));
      }

      this.pFramePromise = Promise.all(promises)
        .then(() => pFrame)
        .catch((err) => {
          this.dispose();
          pFrame.dispose();
          throw new PFrameDriverError(
            `PFrame creation failed asynchronously, `
            + `columns: ${JSON.stringify(jsonifiedColumns)}, `
            + `error: ${ensureError(err)}`,
          );
        });
    } catch (err: unknown) {
      throw new PFrameDriverError(
        `PFrame creation failed synchronously, `
        + `columns: ${JSON.stringify(jsonifiedColumns)}, `
        + `error: ${ensureError(err)}`,
      );
    }
  }

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public get parquetServer(): PFrameInternal.HttpServerInfo {
    return this.remoteBlobProvider.httpServerInfo();
  }

  private dispose(): void {
    this.abortController.abort();
    this.localBlobs.forEach((entry) => entry.unref());
    this.remoteBlobs.forEach((entry) => entry.unref());
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.dispose();
    await this.pFramePromise
      .then((pFrame) => pFrame.dispose())
      .catch(() => { /* mute error */ });
  }
}

export class PFramePool<TreeEntry extends JsonSerializable>
  extends RefCountPoolBase<
    PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
    PFrameHandle,
    PFrameHolder<TreeEntry>> {
  constructor(
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    private readonly logger: PFrameInternal.Logger,
    private readonly spillPath: string,
  ) {
    super();
  }

  protected calculateParamsKey(params: PColumn<PFrameInternal.DataInfo<TreeEntry>>[]): PFrameHandle {
    return stableKeyFromPFrameData(params);
  }

  protected createNewResource(
    params: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
    key: PFrameHandle,
  ): PFrameHolder<TreeEntry> {
    if (logPFrames()) {
      this.logger('info',
        `PFrame creation (pFrameHandle = ${key}): `
        + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }
    return new PFrameHolder(
      this.localBlobProvider,
      this.remoteBlobProvider,
      this.logger,
      this.spillPath,
      params,
    );
  }

  public getByKey(key: PFrameHandle): PFrameHolder<TreeEntry> {
    const resource = super.tryGetByKey(key);
    if (!resource) throw new PFrameDriverError(`PFrame not found, handle = ${key}`);
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
        case 'Json':
          result = {
            type: r.type,
            keyLength: r.keyLength,
            payload: Object.entries(r.data).map(([part, value]) => ({
              key: part,
              value,
            })),
          };
          break;
        case 'JsonPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: canonicalizeJson(info),
            })),
          };
          break;
        case 'BinaryPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: [canonicalizeJson(info.index), canonicalizeJson(info.values)] as const,
            })),
          };
          break;
        case 'ParquetPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: info.dataDigest || [
                canonicalizeJson(info.data),
                JSON.stringify({ axes: info.axes, column: info.column }),
              ] as const,
            })),
          };
          break;
        default:
          throw new PFrameDriverError(`unsupported resource type: ${JSON.stringify(type satisfies never)}`);
      }
      result.payload.sort((lhs, rhs) => lhs.key < rhs.key ? -1 : 1);
      return result;
    }),
  );
  orderedData.sort((lhs, rhs) => lhs.id < rhs.id ? -1 : 1);
  return hashJson(orderedData) as string as PFrameHandle;
}
