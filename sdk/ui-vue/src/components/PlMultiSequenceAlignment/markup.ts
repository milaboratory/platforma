import type { ColorMap } from './types';

export type Markup = { id: string; start: number; length: number }[];

export function parseMarkup(row: string): Markup {
  return Array.from(row.matchAll(
    /(?<id>[^:]*):(?<start>[0-9A-Za-z]*)(?:\+(?<length>[0-9A-Za-z]*))?\|?/g,
  )).map((match) => {
    const matchGroups = match.groups as {
      id: string;
      start: string;
      length: string | undefined;
    };
    const start = Number.parseInt(matchGroups.start, 36);
    const length = matchGroups.length
      ? Number.parseInt(matchGroups.length, 36)
      : 0;
    return {
      id: matchGroups.id,
      start,
      length,
    };
  });
}

export function markupAlignedSequence(
  alignedSequence: string,
  markup: Markup,
): Markup {
  const indexMap = alignedSequence.split('').reduce<number[]>(
    (acc, char, index) => {
      if (char !== '-') acc.push(index);
      return acc;
    },
    [],
  );
  const adjusted = markup.map((segment) => {
    const start = indexMap[segment.start];
    const end = indexMap[segment.start + segment.length - 1] + 1;
    return {
      id: segment.id,
      start: start,
      length: end - start,
    };
  });
  return adjusted;
}

export function colorizeSequencesByMarkup(
  { markupRows, columnCount, colorMap }: {
    markupRows: Markup[];
    columnCount: number;
    colorMap: ColorMap;
  },
): Promise<Blob> {
  const canvas = new OffscreenCanvas(columnCount, markupRows.length);
  const context = canvas.getContext('2d')!;
  for (const [rowIndex, markup] of markupRows.entries()) {
    for (const segment of markup) {
      const color = colorMap[segment.id]?.color;
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(segment.start, rowIndex, segment.length, 1);
    }
  }
  return canvas.convertToBlob();
}

export const markupColors = [
  '#E5F2FF',
  '#FFE8E8',
  '#F0EBFF',
  '#FFFFE3',
  '#E5F7E5',
  '#FEEAFE',
  '#FDEED6',
  '#E8FDFE',
  '#CCDFF2',
  '#F2CCCD',
  '#D5CCF2',
  '#F2F2CC',
  '#CCF2CC',
  '#F2CCF2',
  '#EFDDBF',
  '#DEEEEF',
];

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test('annotateAlignedRow', () => {
    const alignedSequence
      = 'EVRLVESGGALVQPGGSLRLSCVAASGFTFINNWVTWVRQAPGKGLEWVANIKEDGSQKYYVDSVKGRFTISRDNAEKSVYLQMSSLRVDDTAVYYCAR------------GRAV----D---QWGQGTLVTVSS';
    //   0         10        20        30        40        50        60        70        80        90        100       110       120       130
    //   EVRLVESGGALVQPGGSLRLSCVAASGFTFINNWVTWVRQAPGKGLEWVANIKEDGSQKYYVDSVKGRFTISRDNAEKSVYLQMSSLRVDDTAVYYCARGRAVDQWGQGTLVTVSS
    const markup = [
      { id: '1', start: 0, length: 99 },
      { id: '2', start: 99, length: 3 },
      { id: '3', start: 102, length: 14 },
    ];
    const alignedMarkup = markupAlignedSequence(alignedSequence, markup);
    expect(alignedMarkup).toEqual([
      { id: '1', start: 0, length: 99 },
      { id: '2', start: 111, length: 3 },
      { id: '3', start: 114, length: 21 },
    ]);
  });
}
