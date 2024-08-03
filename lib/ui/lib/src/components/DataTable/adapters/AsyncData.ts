import type * as Types from '../types';
import type { DataRow, Row } from '../types';
import { GAP } from '../constants';

export class AsyncData<D extends DataRow> implements Types.DataSource {
  constructor(
    public readonly api: Types.ExternalApi<D>,
    public readonly rowHeight: number,
    public readonly resolvePrimaryKey: Types.ResolvePrimaryKey,
  ) {}

  get height() {
    return this.rowHeight + GAP;
  }

  async getHeight(): Promise<number> {
    return (await this.api.count()) * this.height;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Row[]> {
    const offset = Math.floor(scrollTop / this.height);
    const limit = Math.ceil(bodyHeight + 40 / this.height); // @TODO safe window
    const rows = await this.api.query({ offset, limit });
    return rows.map<Types.Row>((dataRow, index) => ({
      dataRow,
      index: offset + index,
      primaryKey: this.resolvePrimaryKey(dataRow, offset + index) as Types.PrimaryKey,
      offset: (offset + index) * (this.rowHeight + GAP),
      height: this.rowHeight,
    }));
  }
}
