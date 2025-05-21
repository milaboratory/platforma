import type { SegmentedColumn } from './types';

export const chemicalCategories = [
  'hydrophobic',
  'positiveCharge',
  'negativeCharge',
  'polar',
  'cysteine',
  'glycine',
  'proline',
  'aromatic',
] as const;

export type ChemicalCategory = typeof chemicalCategories[number];

export const chemicalPropertiesLabels: Record<ChemicalCategory, string> = {
  hydrophobic: 'Hydrophobic',
  positiveCharge: 'Positive Charge',
  negativeCharge: 'Negative Charge',
  polar: 'Polar',
  cysteine: 'Cysteine',
  glycine: 'Glycine',
  proline: 'Proline',
  aromatic: 'Aromatic',
};

export const chemicalPropertiesColors: Record<ChemicalCategory, string> = {
  hydrophobic: '#99CCFF',
  positiveCharge: '#FFA2A3',
  negativeCharge: '#C1ADFF',
  polar: '#99E099',
  cysteine: '#FAAAFA',
  glycine: '#F7BC5D',
  proline: '#FFFF8F',
  aromatic: '#A2F5FA',
};

type ColumnConsensus = { residues: string; category: ChemicalCategory }[];

export const getColumnConsensuses = (
  { residueFrequencies, rowsCount }: {
    residueFrequencies: Record<string, number>[];
    rowsCount: number;
  },
): ColumnConsensus[] =>
  residueFrequencies.map((column) => (
    categoryCriterion
      .filter(({ rules }) =>
        rules.some(({ groups, threshold }) =>
          groups.some((group) => {
            const groupFrequency = Array.from(group).reduce(
              (acc, residue) => acc + (column[residue] ?? 0),
              0,
            );
            return groupFrequency > rowsCount * threshold;
          })
        )
      )
      .map(({ residues, category }) => ({ residues, category }))
  ));

export function alignedSequencesToSegmentedColumns(
  { alignedSequences, consensuses }: {
    alignedSequences: string[];
    consensuses: ColumnConsensus[];
  },
): SegmentedColumn<ChemicalCategory>[] {
  const columns: SegmentedColumn<ChemicalCategory>[] = [];
  for (const [rowIndex, sequence] of alignedSequences.entries()) {
    for (const [columnIndex, residue] of Array.from(sequence).entries()) {
      const category = consensuses
        .at(columnIndex)
        ?.find(({ residues }) => residues.includes(residue))
        ?.category;
      if (!category) continue;
      const column = (columns[columnIndex] ??= []);
      const lastSegment = column.at(-1);
      if (
        !lastSegment
        || lastSegment.category !== category
        || lastSegment.end !== rowIndex
      ) {
        column.push({ category, start: rowIndex, end: rowIndex + 1 });
      } else {
        lastSegment.end += 1;
      }
    }
  }
  return columns;
}

const categoryCriterion: Criteria[] = [
  {
    residues: 'ACILMFWV',
    category: 'hydrophobic',
    rules: [
      { groups: ['WLVIMAFCYHP'], threshold: 0.6 },
    ],
  },
  {
    residues: 'KR',
    category: 'positiveCharge',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: [...'KRQ'], threshold: 0.8 },
    ],
  },
  {
    residues: 'E',
    category: 'negativeCharge',
    rules: [
      { groups: ['KR'], threshold: 0.6 },
      { groups: ['QE'], threshold: 0.5 },
      { groups: ['ED'], threshold: 0.5 },
      { groups: [...'EQD'], threshold: 0.85 },
    ],
  },
  {
    residues: 'D',
    category: 'negativeCharge',
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

type Criteria = {
  residues: string;
  category: ChemicalCategory;
  rules: {
    groups: string[];
    threshold: number;
  }[];
};
