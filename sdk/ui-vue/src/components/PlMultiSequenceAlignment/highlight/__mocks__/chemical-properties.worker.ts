import type { ChemicalCategory } from '../chemical-properties';
import type { HighlightedColumn } from '../types';

// Copied directly from the original chemical-properties.worker.ts
// to avoid any worker-specific logic or imports in the test environment.

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
    groupMatches: Record<string, number>;
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

// This is what comlink's wrap(new Worker(...)) expects.
// The main file (chemical-properties.ts) does:
// const worker = wrap<ChemicalPropertiesWorkerApi>(new ChemicalPropertiesWorker());
// worker.getChemicalPropertiesHighlight(...);
// So, the default export of the mocked worker should be a constructor
// that, when instantiated, gives an object with the `getChemicalPropertiesHighlight` method.
export default class MockedWorker {
  getChemicalPropertiesHighlight = getChemicalPropertiesHighlight;
  // comlink might also try to call terminate() on the worker instance
  terminate() {
    // no-op
  }
}

// Export the type, as the original worker module does.
export type ChemicalPropertiesWorkerApi = typeof workerApi;