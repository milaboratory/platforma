import {
  mapDataInfo,
  isDataInfo,
  ensureError,
  PFrameDriverError,
  isAbortError,
  type LocalBlobHandleAndSize,
  type RemoteBlobHandleAndSize,
  type RemoteBlobHandle,
  type ContentHandler,
  type PColumnSpec,
  type PColumnDataUniversal,
} from "@platforma-sdk/model";
import { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { emptyDir } from "@milaboratories/ts-helpers";
import { RefCountPoolBase, type PoolEntry, type MiLogger } from "@milaboratories/helpers";
import type { DownloadDriver } from "@milaboratories/pl-drivers";
import { isPlTreeNodeAccessor, type PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { Computable, ComputableStableDefined } from "@milaboratories/computable";
import {
  makeJsonDataInfo,
  AbstractPFrameDriver,
  AbstractPFrameDriverOpsDefaults,
  type AbstractInternalPFrameDriver,
  type AbstractPFrameDriverOps,
  type LocalBlobProvider,
  type RemoteBlobProvider,
} from "@milaboratories/pf-driver";
import { HttpHelpers } from "@milaboratories/pframes-rs-node";
import path from "node:path";
import { Readable } from "node:stream";
import {
  BlobResourceRef,
  makeLocalBlobRef,
  parseDataInfoResource,
  traverseParquetChunkResource,
} from "./data";
import { isDownloadNetworkError400 } from "@milaboratories/pl-drivers";

function makeBlobId(res: BlobResourceRef): PFrameInternal.PFrameBlobId {
  return String(res.resourceInfo.id) as PFrameInternal.PFrameBlobId;
}

type LocalBlob = ComputableStableDefined<LocalBlobHandleAndSize>;
class LocalBlobProviderImpl
  extends RefCountPoolBase<BlobResourceRef, PFrameInternal.PFrameBlobId, LocalBlob>
  implements LocalBlobProvider<BlobResourceRef>
{
  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: PFrameInternal.Logger,
  ) {
    super();
  }

  protected calculateParamsKey(params: BlobResourceRef): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(
    params: BlobResourceRef,
    _key: PFrameInternal.PFrameBlobId,
  ): LocalBlob {
    return this.blobDriver.getDownloadedBlob(params.resourceInfo);
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): LocalBlob {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Local blob with id ${blobId} not found.`);
    return resource;
  }

  public makeDataSource(
    signal: AbortSignal,
  ): Omit<PFrameInternal.PFrameDataSourceV2, "parquetServer"> {
    return {
      preloadBlob: async (blobIds: PFrameInternal.PFrameBlobId[]) => {
        try {
          await Promise.all(
            blobIds.map((blobId) => this.getByKey(blobId).awaitStableFullValue(signal)),
          );
        } catch (err: unknown) {
          if (!isAbortError(err)) throw err;
        }
      },
      resolveBlobContent: async (blobId: PFrameInternal.PFrameBlobId) => {
        const computable = this.getByKey(blobId);
        const blob = await computable.awaitStableValue(signal);
        return await this.blobDriver.getContent(blob.handle, { signal });
      },
    };
  }
}

type RemoteBlob = Computable<RemoteBlobHandleAndSize>;
class RemoteBlobPool extends RefCountPoolBase<
  BlobResourceRef,
  PFrameInternal.PFrameBlobId,
  RemoteBlob
> {
  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: PFrameInternal.Logger,
  ) {
    super();
  }

  protected calculateParamsKey(params: BlobResourceRef): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(
    params: BlobResourceRef,
    _key: PFrameInternal.PFrameBlobId,
  ): RemoteBlob {
    if (params.onDemandSnapshot === undefined) {
      throw new PFrameDriverError(
        `BlobResourceRef for rid ${params.toJSON()} is missing the on-demand snapshot; ` +
          `remote (parquet) blobs must be captured via makeRemoteBlobRef.`,
      );
    }
    return this.blobDriver.getOnDemandBlob(params.onDemandSnapshot);
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
}

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
    const blobId = filename.slice(
      0,
      -PFrameInternal.ParquetExtension.length,
    ) as PFrameInternal.PFrameBlobId;
    const respond = async (response: PFrameInternal.ObjectStoreResponse): Promise<void> => {
      try {
        await params.callback(response);
      } catch (error: unknown) {
        this.logger(
          "warn",
          `PFrames blob store received unhandled rejection from HTTP handler: ${ensureError(error)}`,
        );
      }
    };

    try {
      const computable = this.remoteBlobProvider.tryGetByKey(blobId);
      if (!computable) return await respond({ type: "NotFound" });

      let blob: RemoteBlobHandleAndSize;
      try {
        blob = await computable.getValue();
      } catch (error: unknown) {
        this.logger(
          "error",
          `PFrames blob store failed to get blob from computable: ${ensureError(error)}`,
        );
        return await respond({ type: "InternalError" });
      }
      params.signal.throwIfAborted();

      const translatedRange = this.translate(blob.size, params.range);
      if (!translatedRange) {
        return await respond({
          type: "RangeNotSatisfiable",
          size: blob.size,
        });
      }

      if (params.method === "HEAD") {
        return await respond({
          type: "Ok",
          size: blob.size,
          range: translatedRange,
        });
      }

      this.logger(
        "info",
        `PFrames blob store requesting content for ${blobId}, ` +
          `range [${translatedRange.start}..=${translatedRange.end}]`,
      );
      return await this.remoteBlobProvider.withContent(blob.handle, {
        range: translatedRange,
        signal: params.signal,
        handler: async (data) => {
          return await respond({
            type: "Ok",
            size: blob.size,
            range: translatedRange,
            data: Readable.fromWeb(data),
          });
        },
      });
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        if (isDownloadNetworkError400(error) && error.statusCode === 404) {
          this.logger("info", `PFrames blob store known race error: ${ensureError(error)}`);
        } else {
          this.logger("warn", `PFrames blob store unhandled error: ${ensureError(error)}`);
        }
      }
      return await respond({ type: "InternalError" });
    }
  }
}

class RemoteBlobProviderImpl implements RemoteBlobProvider<BlobResourceRef> {
  constructor(
    private readonly pool: RemoteBlobPool,
    private readonly server: PFrameInternal.HttpServer,
  ) {}

  public static async init(
    blobDriver: DownloadDriver,
    logger: PFrameInternal.Logger,
    serverOptions: Omit<PFrameInternal.HttpServerOptions, "handler">,
  ): Promise<RemoteBlobProviderImpl> {
    const pool = new RemoteBlobPool(blobDriver, logger);
    const store = new BlobStore({ remoteBlobProvider: pool, logger });

    const handler = HttpHelpers.createRequestHandler({ store });
    const server = await HttpHelpers.createHttpServer({ ...serverOptions, handler });
    logger("info", `PFrames HTTP server started on ${server.info.url}`);

    return new RemoteBlobProviderImpl(pool, server);
  }

  public acquire(params: BlobResourceRef): PoolEntry<PFrameInternal.PFrameBlobId> {
    return this.pool.acquire(params);
  }

  public httpServerInfo(): PFrameInternal.HttpServerInfo {
    return this.server.info;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.stop();
    await this.pool[Symbol.asyncDispose]();
  }
}

export interface InternalPFrameDriver extends AbstractInternalPFrameDriver<
  PColumnDataUniversal<PlTreeNodeAccessor>
> {}

export type PFrameDriverOps = AbstractPFrameDriverOps & {
  /** Port to run parquet HTTP server on. */
  parquetServerPort: number;
};

export const PFrameDriverOpsDefaults: PFrameDriverOps = {
  ...AbstractPFrameDriverOpsDefaults,
  parquetServerPort: 0, // 0 means that some unused port will be assigned by the OS
};

export async function createPFrameDriver(params: {
  blobDriver: DownloadDriver;
  logger: MiLogger;
  spillPath: string;
  options: PFrameDriverOps;
}): Promise<InternalPFrameDriver> {
  const resolvedSpillPath = path.resolve(params.spillPath);
  await emptyDir(resolvedSpillPath);

  const logger: PFrameInternal.Logger = (level, message) => params.logger[level](message);
  const localBlobProvider = new LocalBlobProviderImpl(params.blobDriver, logger);
  const remoteBlobProvider = await RemoteBlobProviderImpl.init(params.blobDriver, logger, {
    port: params.options.parquetServerPort,
  });

  const resolveDataInfo = (spec: PColumnSpec, data: PColumnDataUniversal<PlTreeNodeAccessor>) => {
    return isPlTreeNodeAccessor(data)
      ? parseDataInfoResource(data)
      : isDataInfo(data)
        ? data.type === "ParquetPartitioned"
          ? mapDataInfo(data, (a) => traverseParquetChunkResource(a))
          : mapDataInfo(data, (a) => makeLocalBlobRef(a))
        : makeJsonDataInfo(spec, data);
  };

  return new AbstractPFrameDriver({
    logger,
    localBlobProvider,
    remoteBlobProvider,
    spillPath: resolvedSpillPath,
    options: params.options,
    resolveDataInfo,
  });
}
