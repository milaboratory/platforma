import type { HighlightedColumn } from './types';

export function getCssBackgroundImage<T extends string>(
  { columns, rowCount, colors }: {
    columns: HighlightedColumn<T>[];
    rowCount: number;
    colors: Record<T, string>;
  },
): string {
  const rects = columns
    .flatMap((column, columnIndex) => {
      if (!column.length) return [];
      return column.map(
        ({ category, start, end }) =>
          `<rect x="${columnIndex}" y="${start}" width="1" height="${
            end - start + 1
          }" fill="${colors[category]}" />`,
      );
    });
  const svg
    = `<svg viewBox="0 0 ${columns.length} ${rowCount}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${
      rects.join('')
    }</svg>`;
  return `url('data:image/svg+xml;base64,${btoa(svg)}')`;
}
