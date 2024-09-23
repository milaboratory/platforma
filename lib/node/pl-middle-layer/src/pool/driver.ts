import { DownloadDriver } from '@milaboratories/pl-drivers';
import type PFramesType from '@milaboratories/pframes-node';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import { PlTreeNodeAccessor, ResourceInfo } from '@milaboratories/pl-tree';
import { ComputableCtx, ComputableStableDefined } from '@milaboratories/computable';
import {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  FindColumnsRequest,
  FindColumnsResponse,
  LocalBlobHandleAndSize,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PObjectId,
  PTableColumnSpec,
  PTableHandle,
  PTableShape,
  PTableVector,
  TableRange,
  UniqueValuesRequest,
  UniqueValuesResponse,
  PFrameDriver as SdkPFrameDriver,
  PColumn,
  mapPObjectData,
  PFrameDef,
  JoinEntry,
  PTableDef,
  mapPTableDef
} from '@platforma-sdk/model';
import { RefCountResourcePool } from './ref_count_pool';
import { allBlobs, mapBlobs, parseDataInfoResource } from './data';
import { createHash } from 'crypto';
import { assertNever } from '@milaboratories/ts-helpers';
import canonicalize from 'canonicalize';

// special way of importing native node module
const PFrames: PFramesType = require('@milaboratories/pframes-node');

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

type InternalPFrameData = PFrameDef<PFrameInternal.DataInfo<ResourceInfo>>;

class PFrameHolder implements PFrameInternal.PFrameDataSource, Disposable {
  public readonly pFrame: PFrameInternal.PFrame = new PFrames.PFrame();
  private readonly blobIdToResource = new Map<string, ResourceInfo>();
  private readonly blobHandleComputables = new Map<
    string,
    ComputableStableDefined<LocalBlobHandleAndSize>
  >();

  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly columns: InternalPFrameData
  ) {
    // pframe initialization
    this.pFrame.setDataSource(this);
    for (const column of columns) {
      for (const blob of allBlobs(column.data)) this.blobIdToResource.set(blobKey(blob), blob);
      const dataInfo = mapBlobs(column.data, blobKey);
      try {
        this.pFrame.addColumnSpec(column.id, column.spec);
        this.pFrame.setColumnData(column.id, dataInfo);
      } catch (err) {
        throw new Error(
          `Adding column ${column.id} to PFrame failed: ${err}; Spec: ${column.spec}, DataInfo: ${dataInfo}.`
        );
      }
    }
  }

  private getOrCreateComputableForBlob(blobId: string) {
    let computable = this.blobHandleComputables.get(blobId);
    if (computable !== undefined) return computable;

    const blobResource = this.blobIdToResource.get(blobId);
    if (blobResource === undefined) throw new Error(`Blob with id ${blobId} not found.`);

    // precalculation of value tree will trigger the download proecess right away
    computable = this.blobDriver.getDownloadedBlob(blobResource).withPreCalculatedValueTree();

    this.blobHandleComputables.set(blobId, computable);

    return computable;
  }

  public readonly preloadBlob = async (blobIds: string[]): Promise<void> => {
    const computables = blobIds.map((blobId) => this.getOrCreateComputableForBlob(blobId));
    for (const computable of computables) await computable.awaitStableFullValue();
  };

  public readonly resolveBlob = async (blobId: string): Promise<string> => {
    const computable = this.getOrCreateComputableForBlob(blobId);
    return this.blobDriver.getLocalPath((await computable.awaitStableValue()).handle);
  };

  [Symbol.dispose](): void {
    for (const computable of this.blobHandleComputables.values()) computable.resetState();
    this.pFrame.dispose();
  }
}

type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export class PFrameDriver implements SdkPFrameDriver {
  private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>;
  private readonly pTables: RefCountResourcePool<FullPTableDef, Promise<PFrameInternal.PTable>>;

  constructor(private readonly blobDriver: DownloadDriver) {
    this.pFrames = new (class extends RefCountResourcePool<InternalPFrameData, PFrameHolder> {
      constructor(private readonly blobDriver: DownloadDriver) {
        super();
      }
      protected createNewResource(params: InternalPFrameData): PFrameHolder {
        return new PFrameHolder(this.blobDriver, params);
      }
      protected calculateParamsKey(params: InternalPFrameData): string {
        return stableKeyFromPFrameData(params);
      }
    })(this.blobDriver);

    this.pTables = new (class extends RefCountResourcePool<
      FullPTableDef,
      Promise<PFrameInternal.PTable>
    > {
      constructor(
        private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>
      ) {
        super();
      }
      protected async createNewResource(params: FullPTableDef): Promise<PFrameInternal.PTable> {
        const pFrame = this.pFrames.getByKey(params.pFrameHandle);
        const rawPTable = await pFrame.pFrame.createTable({
          src: joinEntryToInternal(params.def.src),
          filters: params.def.filters
        });
        return params.def.sorting.length !== 0 ? rawPTable.sort(params.def.sorting) : rawPTable;
      }
      protected calculateParamsKey(params: FullPTableDef): string {
        return stableKeyFromFullPTableDef(params);
      }
    })(this.pFrames);
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(def: PFrameDef<PlTreeNodeAccessor>, ctx: ComputableCtx): PFrameHandle {
    const internalData = def.map((c) => mapPObjectData(c, (d) => parseDataInfoResource(d)));
    const res = this.pFrames.acquire(internalData);
    ctx.addOnDestroy(res.unref);
    return res.key as PFrameHandle;
  }

  public createPTable(
    def: PTableDef<PColumn<PlTreeNodeAccessor>>,
    ctx: ComputableCtx
  ): PTableHandle {
    const pFrameHandle = this.createPFrame(extractAllColumns(def.src), ctx);
    const defIds = mapPTableDef(def, (c) => c.id);
    const res = this.pTables.acquire({ def: defIds, pFrameHandle });
    ctx.addOnDestroy(res.unref); // in addition to pframe unref added in createPFrame above
    return res.key as PTableHandle;
  }

  //
  // PFrame istance methods
  //

  public async findColumns(
    handle: PFrameHandle,
    request: FindColumnsRequest
  ): Promise<FindColumnsResponse> {
    const iRequest: PFrameInternal.FindColumnsRequest = {
      ...request,
      compatibleWith:
        request.compatibleWith.length !== 0
          ? [{ axesSpec: request.compatibleWith, qualifications: [] }]
          : []
    };
    return {
      hits: (await this.pFrames.getByKey(handle).pFrame.findColumns(iRequest)).hits.map(
        (h) => h.hit
      )
    };
  }

  public async getColumnSpec(handle: PFrameHandle, columnId: PObjectId): Promise<PColumnSpec> {
    return this.pFrames.getByKey(handle).pFrame.getColumnSpec(columnId);
  }

  public async listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    return this.pFrames.getByKey(handle).pFrame.listColumns();
  }

  public async calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>
  ): Promise<CalculateTableDataResponse> {
    let table = await this.pFrames.getByKey(handle).pFrame.createTable({
      src: joinEntryToInternal(request.src),
      filters: request.filters
    });

    if (request.sorting.length > 0) {
      const sortedTable = await table.sort(request.sorting);
      table.dispose();
      table = sortedTable;
    }

    const spec = table.getSpec();
    const data = await table.getData([...spec.keys()]);
    table.dispose();

    return spec.map((spec, i) => ({
      spec: spec,
      data: data[i]
    }));
  }

  public async getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest
  ): Promise<UniqueValuesResponse> {
    return await this.pFrames.getByKey(handle).pFrame.getUniqueValues(request);
  }

  //
  // PTable istance methods
  //

  public async getShape(handle: PTableHandle): Promise<PTableShape> {
    const pTable = await this.pTables.getByKey(handle);
    return pTable.getShape();
  }

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const pTable = await this.pTables.getByKey(handle);
    return pTable.getSpec();
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range?: TableRange
  ): Promise<PTableVector[]> {
    const pTable = await this.pTables.getByKey(handle);
    return pTable.getData(columnIndices, range);
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntry {
  switch (entry.type) {
    case 'column':
      return {
        type: 'column',
        columnId: entry.column,
        qualifications: []
      };
    case 'inner':
    case 'full':
      return {
        type: entry.type,
        entries: entry.entries.map((col) => joinEntryToInternal(col))
      };
    case 'outer':
      return {
        type: 'outer',
        primary: joinEntryToInternal(entry.primary),
        secondary: entry.secondary.map((col) => joinEntryToInternal(col))
      };
    default:
      assertNever(entry);
  }
}

function stableKeyFromFullPTableDef(data: FullPTableDef): string {
  const hash = createHash('sha256');
  hash.update(data.pFrameHandle);
  hash.update(canonicalize(data.def)!);
  return hash.digest().toString('hex');
}

function stableKeyFromPFrameData(data: PColumn<unknown>[]): string {
  // PObject IDs derived from the PObjects canonical identity, so represents the content
  const ids = data.map((d) => d.id).sort();
  const hash = createHash('sha256');
  let previous = '';
  for (const id of ids) {
    if (previous === id) continue; // only unique ids
    hash.update(id);
    previous = id;
  }
  return hash.digest().toString('hex');
}

export function extractAllColumns<D>(entry: JoinEntry<PColumn<D>>): PFrameDef<D> {
  const columns = new Map<PObjectId, PColumn<D>>();
  addAllColumns(entry, columns);
  return [...columns.values()];
}

function addAllColumns<D>(entry: JoinEntry<PColumn<D>>, map: Map<PObjectId, PColumn<D>>): void {
  switch (entry.type) {
    case 'column':
      map.set(entry.column.id, entry.column);
      return;
    case 'full':
    case 'inner':
      for (const e of entry.entries) addAllColumns(e, map);
      return;
    case 'outer':
      addAllColumns(entry.primary, map);
      for (const e of entry.secondary) addAllColumns(e, map);
      return;
    default:
      assertNever(entry);
  }
}
