import type { HighlightedColumn } from './types';

export const getHighlightImageBlob = <T extends string>(
  { columns, rowCount, colors }: {
    columns: HighlightedColumn<T>[];
    rowCount: number;
    colors: Record<T, string>;
  },
): Blob =>
  new Blob([
    `<svg viewBox="0 0 ${columns.length} ${rowCount}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">`,
    ...columns
      .flatMap((column, columnIndex) => {
        if (!column.length) return [];
        return column.map(
          ({ category, start, end }) => {
            const pathDefinition = [
              `M${columnIndex},${start}`,
              'h1',
              `v${end - start + 1}`,
              'h-1',
              'z',
            ].join('');
            return `<path d="${pathDefinition}" fill="${colors[category]}" />`;
          },
        );
      }),
    `</svg>`,
  ], { type: 'image/svg+xml' });
