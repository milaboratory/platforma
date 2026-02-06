import type {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  FindColumnsRequest,
  FindColumnsResponse,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrame,
  PFrameHandle,
  PObjectId,
  TableRange,
  UniqueValuesRequest,
  UniqueValuesResponse,
} from "@milaboratories/pl-model-common";
import { patchInSetFilters } from "./render/util/pframe_upgraders";

export class PFrameImpl implements PFrame {
  constructor(private readonly handle: PFrameHandle) {}

  public async findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse> {
    return await this.getPlatforma().pFrameDriver.findColumns(this.handle, request);
  }

  public async getColumnSpec(columnId: PObjectId): Promise<PColumnSpec | null> {
    return await this.getPlatforma().pFrameDriver.getColumnSpec(this.handle, columnId);
  }

  public async listColumns(): Promise<PColumnIdAndSpec[]> {
    return await this.getPlatforma().pFrameDriver.listColumns(this.handle);
  }

  public async calculateTableData(
    request: CalculateTableDataRequest<PObjectId>,
    range?: TableRange,
  ): Promise<CalculateTableDataResponse> {
    if (!cfgRenderCtx.featureFlags?.pFrameInSetFilterSupport) {
      request = {
        ...request,
        filters: patchInSetFilters(request.filters),
      };
    }
    return await this.getPlatforma().pFrameDriver.calculateTableData(this.handle, request, range);
  }

  public async getUniqueValues(request: UniqueValuesRequest): Promise<UniqueValuesResponse> {
    return await this.getPlatforma().pFrameDriver.getUniqueValues(this.handle, request);
  }

  private getPlatforma() {
    if (platforma === undefined) {
      throw new Error("Platforma instance is not available in the current context.");
    }
    return platforma;
  }
}
