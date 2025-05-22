import type { SegmentedColumn } from './types';

export const colorizeSegmentedColumns = <T extends string>(
  { columns, rowCount, colors }: {
    columns: SegmentedColumn<T>[];
    rowCount: number;
    colors: Record<T, string>;
  },
): Blob => {
  const pathsByColor: Record<string, string> = {};
  for (const [columnIndex, column] of columns.entries()) {
    for (const { category, start, end } of column) {
      const color = colors[category];
      pathsByColor[color] = (pathsByColor[color] ?? '').concat(
        [
          `M${columnIndex},${start}`,
          'h1',
          `v${end - start + 1}`,
          'h-1',
          'z',
        ].join(''),
      );
    }
  }
  return new Blob([
    `<svg viewBox="0 0 ${columns.length} ${rowCount}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">`,
    ...Object.entries(pathsByColor).map(
      ([color, pathDefinition]) =>
        `<path d="${pathDefinition}" fill="${color}" />`,
    ),
    `</svg>`,
  ], { type: 'image/svg+xml' });
};
