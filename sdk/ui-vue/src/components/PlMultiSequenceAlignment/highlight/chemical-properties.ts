import type { ResidueCounts } from '../types';
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
  positiveCharge: 'Positive Charged',
  negativeCharge: 'Negative Charged',
  polar: 'Polar',
  cysteine: 'Cysteines',
  glycine: 'Glycines',
  proline: 'Prolines',
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

type ColumnChemicalProperties = {
  residues: string;
  category: ChemicalCategory;
}[];

export const getColumnChemicalProperties = (
  { residueCounts, rowCount }: {
    residueCounts: ResidueCounts;
    rowCount: number;
  },
): ColumnChemicalProperties[] =>
  // for every column in a residue counts table
  // (e.g. table = [{ A: 3, R: 5, Q: 1}, { E: 4, T: 2 }, ...])
  residueCounts.map((column) => (
    // find all matching criterion
    categoryCriterion
      .filter(({ rules }) =>
        // by matching at least one rule
        rules.some(({ groups, threshold }) =>
          // where at least one residue group
          groups.some((group) => {
            // combined
            const groupCount = group.split('').reduce(
              (acc, residue) => acc + (column[residue] ?? 0),
              0,
            );
            // is above the required threshold
            return groupCount > rowCount * threshold;
          }),
        ),
      )
      .map(({ residues, category }) => ({ residues, category }))
  ));

export function alignedSequencesToSegmentedColumns(
  { alignedSequences, consensuses }: {
    alignedSequences: string[];
    consensuses: ColumnChemicalProperties[];
  },
): SegmentedColumn<ChemicalCategory>[] {
  const columns: SegmentedColumn<ChemicalCategory>[] = [];
  for (const [rowIndex, sequence] of alignedSequences.entries()) {
    for (const [columnIndex, residue] of sequence.split('').entries()) {
      const column = (columns[columnIndex] ??= []);
      const category = consensuses
        .at(columnIndex)
        ?.find(({ residues }) => residues.includes(residue))
        ?.category;
      if (!category) continue;
      const lastSegment = column.at(-1);
      if (
        !lastSegment
        || lastSegment.category !== category
        || lastSegment.end + 1 !== rowIndex
      ) {
        column.push({ category, start: rowIndex, end: rowIndex });
      } else {
        lastSegment.end = rowIndex;
      }
    }
  }
  return columns;
}

/** @see {@link https://www.jalview.org/help/html/colourSchemes/clustal.html} */
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
