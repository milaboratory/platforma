import type {
  JsonSerializable,
  StringifiedJson } from '@platforma-sdk/model';
import {
  parseJson,
  PFrameDriverError,
  type Branded,
  type PColumnSpec,
  type PColumnValues,
} from '@platforma-sdk/model';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import { RefCountPoolBase, type PoolEntry } from '@milaboratories/ts-helpers';
import { HttpHelpers } from '@milaboratories/pframes-rs-node';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { AbstractInternalPFrameDriver } from './driver_decl';
import {
  AbstractPFrameDriver,
  AbstractPFrameDriverOpsDefaults,
  type LocalBlobProvider,
  type RemoteBlobProvider,
} from './driver_impl';
import { makeJsonDataInfo } from './data_info_helpers';

export type FileName = Branded<string, 'FileName'>;
export type FilePath = Branded<string, 'FilePath'>;
export type FolderPath = Branded<string, 'FolderPath'>;

export function makeFolderPath(dataFolder: string): FolderPath {
  if (!fs.statSync(dataFolder, { throwIfNoEntry: false })?.isDirectory()) {
    throw new PFrameDriverError(`Data folder ${dataFolder} does not exist`);
  }
  return dataFolder as FolderPath;
}

function makeBlobId(res: FileName): PFrameInternal.PFrameBlobId {
  return res as string;
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
      throw new PFrameDriverError(`File ${filePath} does not exist`);
    }
    return filePath as FilePath;
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): FilePath {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Local blob with id ${blobId} not found.`);
    return resource;
  }

  public makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2 {
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
    const remoteBlobProvider = new LocalBlobProviderImpl(dataFolder);
    const store = await HttpHelpers.createFsStore({ rootDir: dataFolder, logger });

    const handler = HttpHelpers.createRequestHandler({ store });
    const server = await HttpHelpers.createHttpServer({ ...serverOptions, handler });

    return new RemoteBlobProviderImpl(remoteBlobProvider, server);
  }

  public acquire(params: FileName): PoolEntry {
    return this.pool.acquire(params);
  }

  public httpServerInfo(): PFrameInternal.HttpServerInfo {
    return this.server.info;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.stop();
  }
}

export async function createPFrameDriverDouble(
  dataFolder: FolderPath,
  logger: PFrameInternal.Logger = () => {},
): Promise<AbstractInternalPFrameDriver<FolderPath | PColumnValues>> {
  const localBlobProvider = new LocalBlobProviderImpl(dataFolder);
  const remoteBlobProvider = await RemoteBlobProviderImpl.init(dataFolder, logger, {});

  const resolveDataInfo = (spec: PColumnSpec, data: FolderPath | PColumnValues) => {
    if (typeof data === 'string') {
      // const files = fs.readdirSync(dataFolder);
      // for (const file of files) {
      //   if (file.endsWith('.spec')) {
      //     const columnId = file.replace('.spec', '') as PObjectId;
      //     const columnSpec = readJsonFile(dataFolder, file);
      //     pframe.addColumnSpec(columnId, columnSpec);

      //     const dataInfoFile = file.replace('.spec', '.datainfo');
      //     if (files.includes(dataInfoFile)) {
      //       const dataInfo = readJsonTestFile(testCase, dataInfoFile);
      //     }
      //   }
      // }
      throw new PFrameDriverError(`TODO`); // TODO
    } else {
      return makeJsonDataInfo(spec, data);
    }
  };

  return new AbstractPFrameDriver(
    logger,
    localBlobProvider,
    remoteBlobProvider,
    tmpdir(),
    AbstractPFrameDriverOpsDefaults,
    resolveDataInfo,
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function readJsonFile<T extends JsonSerializable>(dataFolder: FolderPath, fileName: string): T {
  const filePath = path.join(dataFolder, fileName);
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new PFrameDriverError(`File ${filePath} does not exist`);
  }
  const content = fs.readFileSync(filePath).toString() as StringifiedJson<T>;
  return parseJson(content);
}
