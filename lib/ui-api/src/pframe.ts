import {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  FindColumnsRequest,
  FindColumnsResponse,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrame,
  PFrameHandle,
  PObjectId,
  UniqueValuesRequest,
  UniqueValuesResponse
} from '@milaboratory/sdk-model';

export class PFrameImpl implements PFrame {
  constructor(private readonly handle: PFrameHandle) {}

  public async findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse> {
    return await platforma.pFrameDriver.findColumns(this.handle, request);
  }

  public async getColumnSpec(columnId: PObjectId): Promise<PColumnSpec> {
    return await platforma.pFrameDriver.getColumnSpec(this.handle, columnId);
  }

  public async listColumns(): Promise<PColumnIdAndSpec[]> {
    return await platforma.pFrameDriver.listColumns(this.handle);
  }

  public async calculateTableData(
    request: CalculateTableDataRequest<PObjectId>
  ): Promise<CalculateTableDataResponse> {
    return await platforma.pFrameDriver.calculateTableData(this.handle, request);
  }

  public async getUniqueValues(request: UniqueValuesRequest): Promise<UniqueValuesResponse> {
    return await platforma.pFrameDriver.getUniqueValues(this.handle, request);
  }
}
