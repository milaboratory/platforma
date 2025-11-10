import type { DownloadDriver } from '@milaboratories/pl-drivers';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { isPlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type {
  Computable,
  ComputableStableDefined,
} from '@milaboratories/computable';
import type {
  LocalBlobHandleAndSize,
  PColumn,
  PFrameDef,
  RemoteBlobHandleAndSize,
  RemoteBlobHandle,
  ContentHandler,
} from '@platforma-sdk/model';
import {
  mapPObjectData,
  mapDataInfo,
  isDataInfo,
  ensureError,
  PFrameDriverError,
  isAbortError,
  ValueType,
} from '@platforma-sdk/model';
import {
  parseDataInfoResource,
  traverseParquetChunkResource,
} from './data';
import { type MiLogger } from '@milaboratories/ts-helpers';
import {
  emptyDir,
  RefCountPoolBase,
  type PoolEntry,
} from '@milaboratories/ts-helpers';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  makeDataInfoFromPColumnValues,
  PFrameDriver as AbstractPFrameDriver,
  type AbstractInternalPFrameDriver,
  type PFrameDriverOps,
  type PColumnDataUniversal,
  type LocalBlobProvider,
  type RemoteBlobProvider,
} from '@milaboratories/pf-driver';
import { HttpHelpers } from '@milaboratories/pframes-rs-node';

function makeBlobId(res: PlTreeEntry): PFrameInternal.PFrameBlobId {
  return String(res.rid);
}

type LocalBlob = ComputableStableDefined<LocalBlobHandleAndSize>;
class LocalBlobProviderImpl
  extends RefCountPoolBase<PlTreeEntry, PFrameInternal.PFrameBlobId, LocalBlob>
  implements LocalBlobProvider<PlTreeEntry> {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(params: PlTreeEntry, _key: PFrameInternal.PFrameBlobId): LocalBlob {
    return this.blobDriver.getDownloadedBlob(params);
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): LocalBlob {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Local blob with id ${blobId} not found.`);
    return resource;
  }

  public makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2 {
    return {
      preloadBlob: async (blobIds: string[]) => {
        try {
          await Promise.all(blobIds.map((blobId) => this.getByKey(blobId).awaitStableFullValue(signal)));
        } catch (err: unknown) {
          if (!isAbortError(err)) throw err;
        }
      },
      resolveBlobContent: async (blobId: string) => {
        const computable = this.getByKey(blobId);
        const blob = await computable.awaitStableValue(signal);
        return await this.blobDriver.getContent(blob.handle, { signal });
      },
    };
  }
}

type RemoteBlob = Computable<RemoteBlobHandleAndSize>;
class RemoteBlobPool
  extends RefCountPoolBase<PlTreeEntry, PFrameInternal.PFrameBlobId, RemoteBlob> {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(params: PlTreeEntry, _key: PFrameInternal.PFrameBlobId): RemoteBlob {
    return this.blobDriver.getOnDemandBlob(params);
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): RemoteBlob {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Remote blob with id ${blobId} not found.`);
    return resource;
  }

  public async withContent<T>(
    handle: RemoteBlobHandle,
    options: {
      range: PFrameInternal.FileRange;
      signal: AbortSignal;
      handler: ContentHandler<T>;
    },
  ): Promise<T> {
    return await this.blobDriver.withContent(handle, {
      range: {
        from: options.range.start,
        to: options.range.end + 1,
      },
      signal: options.signal,
      handler: options.handler,
    });
  }
}

interface BlobStoreOptions extends PFrameInternal.ObjectStoreOptions {
  remoteBlobProvider: RemoteBlobPool;
};

class BlobStore extends PFrameInternal.BaseObjectStore {
  private readonly remoteBlobProvider: RemoteBlobPool;

  constructor(options: BlobStoreOptions) {
    super(options);
    this.remoteBlobProvider = options.remoteBlobProvider;
  }

  public override async request(
    filename: PFrameInternal.ParquetFileName,
    params: {
      method: PFrameInternal.HttpMethod;
      range?: PFrameInternal.HttpRange;
      signal: AbortSignal;
      callback: (response: PFrameInternal.ObjectStoreResponse) => Promise<void>;
    },
  ): Promise<void> {
    const blobId = filename.slice(0, -PFrameInternal.ParquetExtension.length);
    const respond = async (response: PFrameInternal.ObjectStoreResponse): Promise<void> => {
      try {
        await params.callback(response);
      } catch (error: unknown) {
        this.logger('warn',
          `PFrames blob store received unhandled rejection from HTTP handler: ${ensureError(error)}`,
        );
      }
    };

    try {
      const computable = this.remoteBlobProvider.tryGetByKey(blobId);
      if (!computable) return await respond({ type: 'NotFound' });

      let blob: RemoteBlobHandleAndSize;
      try {
        blob = await computable.getValue();
      } catch (error: unknown) {
        this.logger('error',
          `PFrames blob store failed to get blob from computable: ${ensureError(error)}`,
        );
        return await respond({ type: 'InternalError' });
      }
      params.signal.throwIfAborted();

      const translatedRange = this.translate(blob.size, params.range);
      if (!translatedRange) {
        return await respond({
          type: 'RangeNotSatisfiable',
          size: blob.size,
        });
      }

      if (params.method === 'HEAD') {
        return await respond({
          type: 'Ok',
          size: blob.size,
          range: translatedRange,
        });
      }

      this.logger('info',
        `PFrames blob store requesting content for ${blobId}, `
        + `range [${translatedRange.start}..=${translatedRange.end}]`,
      );
      return await this.remoteBlobProvider.withContent(blob.handle, {
        range: translatedRange,
        signal: params.signal,
        handler: async (data) => {
          return await respond({
            type: 'Ok',
            size: blob.size,
            range: translatedRange,
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
            data: Readable.fromWeb(data),
          });
        },
      });
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        this.logger('warn',
          `PFrames blob store unhandled error: ${ensureError(error)}`,
        );
      }
      return await respond({ type: 'InternalError' });
    }
  }
}

class RemoteBlobProviderImpl implements RemoteBlobProvider<PlTreeEntry> {
  constructor(
    private readonly pool: RemoteBlobPool,
    private readonly server: PFrameInternal.HttpServer,
  ) {}

  public static async init(
    blobDriver: DownloadDriver,
    logger: PFrameInternal.Logger,
    serverOptions: Omit<PFrameInternal.HttpServerOptions, 'handler'>,
  ): Promise<RemoteBlobProviderImpl> {
    const remoteBlobProvider = new RemoteBlobPool(blobDriver);
    const store = new BlobStore({ remoteBlobProvider, logger });
    const handler = HttpHelpers.createRequestHandler({ store });
    const server = await HttpHelpers.createHttpServer({ ...serverOptions, handler });
    return new RemoteBlobProviderImpl(remoteBlobProvider, server);
  }

  public acquire(params: PlTreeEntry): PoolEntry {
    return this.pool.acquire(params);
  }

  public httpServerInfo(): PFrameInternal.HttpServerInfo {
    return this.server.info;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.stop();
  }
}

export interface InternalPFrameDriver extends AbstractInternalPFrameDriver<PlTreeNodeAccessor> {};

export async function createPFrameDriver(
  blobDriver: DownloadDriver,
  miLogger: MiLogger,
  spillPath: string,
  ops: PFrameDriverOps,
): Promise<InternalPFrameDriver> {
  const resolvedSpillPath = path.resolve(spillPath);
  await emptyDir(resolvedSpillPath);

  const logger: PFrameInternal.Logger = (level, message) => miLogger[level](message);
  const localBlobProvider = new LocalBlobProviderImpl(blobDriver);
  const remoteBlobProvider = await RemoteBlobProviderImpl.init(
    blobDriver,
    logger,
    { port: ops.parquetServerPort },
  );

  const unfoldAccessors = (params: PFrameDef<PColumn<PColumnDataUniversal<PlTreeNodeAccessor>>>) => {
    const ValueTypes = Object.values(ValueType);
    const columns: PColumn<PFrameInternal.DataInfo<PlTreeEntry>>[] = params
      .filter((c) => ValueTypes.includes(c.spec.valueType))
      .map((c) =>
        mapPObjectData(c, (d) =>
          isPlTreeNodeAccessor(d)
            ? parseDataInfoResource(d)
            : isDataInfo(d)
              ? d.type === 'ParquetPartitioned'
                ? mapDataInfo(d, (a) => traverseParquetChunkResource(a))
                : mapDataInfo(d, (a) => a.persist())
              : makeDataInfoFromPColumnValues(c.spec, d),
        ),
      );
    return columns;
  };

  return new AbstractPFrameDriver(
    logger,
    localBlobProvider,
    remoteBlobProvider,
    resolvedSpillPath,
    ops,
    unfoldAccessors,
  );
}
