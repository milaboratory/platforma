import type { DataTable } from '@milaboratory/platforma-uikit.lib';
import { randomString, uniqueId } from '@milaboratory/helpers/strings';
import { arrayFrom, randomInt } from '@milaboratory/helpers/utils';
import { reactive, computed } from 'vue';
import { faker } from '@faker-js/faker';
import { asConst, renderSequence } from './helpers';

export function useData() {
  const lorem = randomString(40);

  const data = reactive({
    loading: false,
    numColumns: 15,
    numRows: 1000,
    tableData: undefined as DataTable.Types.TableData | undefined,
    rows: [] as Record<string, unknown>[],
  });

  const columnsRef = computed(() => {
    const rest = arrayFrom(data.numColumns, (i) => {
      const valueType = i % 2 === 0 ? 'string' : 'integer';

      return {
        label: i + 2 + ') ' + faker.word.noun(),
        id: uniqueId(),
        valueType,
        width: 200,
        editable: true,
      } as DataTable.Types.TableSettings['columns'][number];
    });

    return [
      asConst<DataTable.Types.ColumnSpec>({
        id: 'frozen',
        label: 'Frozen',
        width: 200,
        frozen: true,
      }),
      ...rest,
    ];
  });

  async function generate() {
    const rows = [] as Record<string, unknown>[];
    for await (const id of renderSequence(Number(data.numRows))) {
      const row = Object.fromEntries(
        columnsRef.value.map((col, colIndex) => {
          if (col.id === 'ID') {
            return [col.id, id];
          }

          return [col.id, colIndex % 2 === 0 ? randomInt(0, 1000) : lorem];
        }),
      );
      rows.push(row);
    }

    data.rows = rows;
  }

  return { data, columnsRef, generate };
}
