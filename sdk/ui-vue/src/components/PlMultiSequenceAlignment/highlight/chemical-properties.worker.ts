import { expose } from 'comlink';
import type { ChemicalCategory } from './chemical-properties';
import type { HighlightedColumn } from './types';

function getChemicalPropertiesHighlight(
  alignedRows: string[],
): HighlightedColumn<ChemicalCategory>[] {
  if (!alignedRows.length) {
    return [];
  }
  const groupsToCheck = Array.from(
    new Set(colorScheme.flatMap(
      ({ rules }) => rules.flatMap(({ groups }) => groups),
    )),
  );
  const table: {
    /** How many times a specific group was matched in a column */
    groupMatches: Record<string, number>;
    /** Parts of a column in a more optimized format */
    segments: { residue: string; start: number; end: number }[];
  }[] = Array.from(
    { length: alignedRows[0].length },
    () => ({ groupMatches: {}, segments: [] }),
  );
  for (const [rowIndex, row] of alignedRows.entries()) {
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const residue = row[columnIndex];
      if (residue === '-') {
        continue;
      }
      const column = table[columnIndex];
      const lastSegment = column.segments.at(-1);
      if (
        lastSegment?.residue === residue
        && lastSegment.end + 1 === rowIndex
      ) {
        lastSegment.end = rowIndex;
      } else {
        column.segments.push({
          residue,
          start: rowIndex,
          end: rowIndex,
        });
      }
      for (const group of groupsToCheck) {
        if (group.includes(residue)) {
          column.groupMatches[group] ??= 0;
          column.groupMatches[group] += 1;
        }
      }
    }
  }
  const colorMap = table.map(({ groupMatches, segments }) => {
    const column: HighlightedColumn<ChemicalCategory> = [];
    for (const segment of segments) {
      const entry = colorScheme.find(({ residues, rules }) =>
        residues.includes(segment.residue)
        && rules.some((rule) =>
          rule.groups.some((group) =>
            (groupMatches[group] ?? 0) > alignedRows.length * rule.threshold,
          ),
        ),
      );
      if (!entry) {
        continue;
      }
      const lastEntry = column.at(-1);
      if (
        lastEntry?.category === entry.category
        && lastEntry.end + 1 === segment.start
      ) {
        lastEntry.end = segment.start;
      } else {
        column.push({
          category: entry.category,
          start: segment.start,
          end: segment.end,
        });
      }
    }
    return column;
  });
  return colorMap;
}

const colorScheme: ColorScheme = [
  {
    residues: 'ACILMFWV',
    category: 'hydrophobic',
    rules: [
      { groups: ['WLVIMAFCYHP'], threshold: 0.6 },
    ],
  },
  {
    residues: 'KR',
    category: 'positive_charge',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: [...'KRQ'], threshold: 0.8 },
    ],
  },
  {
    residues: 'E',
    category: 'negative_charge',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: ['QE'], threshold: 0.5 },
      { groups: ['ED'], threshold: 0.5 },
      { groups: [...'EQD'], threshold: 0.85 },
    ],
  },
  {
    residues: 'D',
    category: 'negative_charge',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: [...'DEN'], threshold: 0.85 },
      { groups: ['ED'], threshold: 0.5 },
    ],
  },
  {
    residues: 'N',
    category: 'polar',
    rules: [
      { groups: ['N'], threshold: 0.5 },
      { groups: [...'ND'], threshold: 0.85 },
    ],
  },
  {
    residues: 'Q',
    category: 'polar',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: ['QE'], threshold: 0.5 },
      { groups: [...'QTKR'], threshold: 0.85 },
    ],
  },
  {
    residues: 'ST',
    category: 'polar',
    rules: [
      { groups: ['WLVIMAFCYHP'], threshold: 0.6 },
      { groups: ['TS'], threshold: 0.5 },
      { groups: [...'ST'], threshold: 0.85 },
    ],
  },
  {
    residues: 'C',
    category: 'cysteine',
    rules: [
      { groups: ['C'], threshold: 0.85 },
    ],
  },
  {
    residues: 'G',
    category: 'glycine',
    rules: [
      { groups: ['G'], threshold: 0 },
    ],
  },
  {
    residues: 'P',
    category: 'proline',
    rules: [
      { groups: ['P'], threshold: 0 },
    ],
  },
  {
    residues: 'HY',
    category: 'aromatic',
    rules: [
      { groups: ['WLVIMAFCYHP'], threshold: 0.6 },
      { groups: [...'WYACPQFHILMV'], threshold: 0.85 },
    ],
  },
];

type ColorScheme = {
  residues: string;
  category: ChemicalCategory;
  rules: {
    groups: string[];
    threshold: number;
  }[];
}[];

const workerApi = { getChemicalPropertiesHighlight };

export type ChemicalPropertiesWorkerApi = typeof workerApi;

expose(workerApi);
