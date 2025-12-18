import {
  isDataInfo,
  PFrameDriverError,
  type Branded,
  type PColumnSpec,
  type PColumnValues,
} from '@platforma-sdk/model';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import { RefCountPoolBase, type PoolEntry } from '@milaboratories/ts-helpers';
import { HttpHelpers } from '@milaboratories/pframes-rs-node';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { AbstractInternalPFrameDriver } from './driver_decl';
import {
  AbstractPFrameDriver,
  type LocalBlobProvider,
  type RemoteBlobProvider,
} from './driver_impl';
import { makeJsonDataInfo } from './data_info_helpers';

export type FileName = Branded<string, 'FileName'>;
export type FilePath = Branded<string, 'FilePath'>;
export type FolderPath = Branded<string, 'FolderPath'>;

export function makeFolderPath(dataFolder: string): FolderPath {
  if (!fs.statSync(dataFolder, { throwIfNoEntry: false })?.isDirectory()) {
    const error = new PFrameDriverError(`Invalid data folder`);
    error.cause = new Error(`Folder ${dataFolder} does not exist`);
    throw error;
  }
  return dataFolder as FolderPath;
}

function makeBlobId(res: FileName): PFrameInternal.PFrameBlobId {
  return res as string as PFrameInternal.PFrameBlobId;
}

class LocalBlobProviderImpl
  extends RefCountPoolBase<FileName, PFrameInternal.PFrameBlobId, FilePath>
  implements LocalBlobProvider<FileName> {
  constructor(private readonly dataFolder: FolderPath) {
    super();
  }

  protected calculateParamsKey(params: FileName): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(params: FileName, _key: PFrameInternal.PFrameBlobId): FilePath {
    const filePath = path.join(this.dataFolder, params);
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      const error = new PFrameDriverError(`Invalid file name`);
      error.cause = new Error(`File ${filePath} does not exist`);
      throw error;
    }
    return filePath as FilePath;
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): FilePath {
    const resource = super.tryGetByKey(blobId);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid blob id`);
      error.cause = new Error(`Blob with id ${blobId} not found.`);
      throw error;
    }
    return resource;
  }

  public makeDataSource(signal: AbortSignal): Omit<PFrameInternal.PFrameDataSourceV2, 'parquetServer'> {
    return {
      preloadBlob: async (_blobIds: PFrameInternal.PFrameBlobId[]) => {},
      resolveBlobContent: async (blobId: PFrameInternal.PFrameBlobId) => {
        const filePath = this.getByKey(blobId);
        return await fs.promises.readFile(filePath, { signal });
      },
    };
  }
}

class RemoteBlobProviderImpl implements RemoteBlobProvider<FileName> {
  constructor(
    private readonly pool: LocalBlobProviderImpl,
    private readonly server: PFrameInternal.HttpServer,
  ) {}

  public static async init(
    dataFolder: FolderPath,
    logger: PFrameInternal.Logger,
    serverOptions: Omit<PFrameInternal.HttpServerOptions, 'handler'>,
  ): Promise<RemoteBlobProviderImpl> {
    const pool = new LocalBlobProviderImpl(dataFolder);

    const underlyingStore = await HttpHelpers.createFsStore({ rootDir: dataFolder, logger });
    const store: PFrameInternal.ObjectStore = {
      request: (filename, params) => {
        const blobId = filename.slice(0, -PFrameInternal.ParquetExtension.length);
        return underlyingStore.request(blobId as PFrameInternal.ParquetFileName, params);
      },
    };

    const handler = HttpHelpers.createRequestHandler({ store });
    const server = await HttpHelpers.createHttpServer({ ...serverOptions, handler });

    return new RemoteBlobProviderImpl(pool, server);
  }

  public acquire(params: FileName): PoolEntry<PFrameInternal.PFrameBlobId> {
    return this.pool.acquire(params);
  }

  public httpServerInfo(): PFrameInternal.HttpServerInfo {
    return this.server.info;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.stop();
  }
}

export type InternalPFrameDriverDouble =
  AbstractInternalPFrameDriver<PFrameInternal.DataInfo<FileName> | PColumnValues>;

export async function createPFrameDriverDouble({
  dataFolder = tmpdir() as FolderPath,
  logger = () => {},
}: {
  dataFolder?: FolderPath;
  logger?: PFrameInternal.Logger;
}): Promise<InternalPFrameDriverDouble> {
  const localBlobProvider = new LocalBlobProviderImpl(dataFolder);
  const remoteBlobProvider = await RemoteBlobProviderImpl.init(dataFolder, logger, {});

  const resolveDataInfo = (
    spec: PColumnSpec,
    data: PFrameInternal.DataInfo<FileName> | PColumnValues,
  ) => isDataInfo(data) ? data : makeJsonDataInfo(spec, data);

  return new AbstractPFrameDriver({
    logger,
    localBlobProvider,
    remoteBlobProvider,
    resolveDataInfo,
  });
}
