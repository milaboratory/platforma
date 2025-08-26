import type { HighlightLegend } from './types';

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

export function highlightByMarkup(
  { markupRows, columnCount, labels }: {
    markupRows: Markup[];
    columnCount: number;
    labels: Record<string, string>;
  },
): { blob: Blob; legend: HighlightLegend } {
  const linesById: Map<string, {
    row: number;
    start: number;
    length: number;
  }[]> = new Map();
  for (const [row, markup] of markupRows.entries()) {
    for (const { id, start, length } of markup) {
      let bucket = linesById.get(id);
      if (!bucket) linesById.set(id, bucket = []);
      bucket.push({ row, start, length });
    }
  }
  const legend: HighlightLegend = Object.fromEntries(
    Object.entries(labels)
      .map(([id, label], index) =>
        [
          id,
          {
            label,
            color: markupColors[index % markupColors.length],
          },
        ] as const,
      )
      .filter(([id]) => linesById.has(id)),
  );
  const blob = new Blob(
    (function*() {
      const viewBox = `0 0 ${columnCount} ${markupRows.length * 2}`;
      yield `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" stroke-width="2" preserveAspectRatio="none">`;
      for (const [id, lines] of linesById) {
        const { color } = legend[id];
        yield `<path stroke="${color}" d="`;
        let x = 0, y = 0;
        for (const { row, start, length } of lines) {
          yield `m${start - x},${row * 2 + 1 - y}h${length}`;
          x = start + length;
          y = row * 2 + 1;
        }
        yield '"/>';
      }
      yield '</svg>';
    })().toArray(),
    { type: 'image/svg+xml' },
  );
  return { blob, legend };
}

const markupColors = [
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
