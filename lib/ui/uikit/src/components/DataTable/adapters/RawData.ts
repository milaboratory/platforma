import type * as Types from '../types';
import type { DataRow, ResolvePrimaryKey, Row, ResolveRowHeight } from '../types';
import { GAP } from '../constants';
import { sliceBy } from '../domain';
import { notEmpty } from '@milaboratories/helpers';

const rowsStore = new WeakMap<WeakKey, Row[]>();

export class RawData<D extends DataRow = DataRow> implements Types.DataSource {
  private dataHeight: number;

  constructor(
    public readonly datum: D[],
    public readonly resolveHeight: ResolveRowHeight<D>,
    public readonly resolvePrimaryKey: ResolvePrimaryKey<D>,
  ) {
    const offsets = datum.reduce(
      (dict, it, index) => {
        dict.indices.set(index, dict.total);
        dict.total += this.resolveHeight(it, index) + GAP;
        return dict;
      },
      {
        total: 0,
        indices: new Map<number, number>(),
      },
    );

    this.dataHeight = offsets.total;

    const rows = datum.map((dataRow, index) => ({
      dataRow,
      index,
      primaryKey: this.resolvePrimaryKey(dataRow, index) as Types.PrimaryKey,
      offset: notEmpty(offsets.indices.get(index)),
      height: this.resolveHeight(dataRow, index),
    }));

    rowsStore.set(this, rows);
  }

  get rows(): Row<D>[] {
    return rowsStore.get(this)! as Row<D>[];
  }

  async getHeight() {
    return this.dataHeight;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Row<D>[]> {
    return sliceBy(this.rows, (it) => {
      const offset = it.offset;
      return scrollTop < offset + it.height && offset < bodyHeight + scrollTop;
    });
  }
}
