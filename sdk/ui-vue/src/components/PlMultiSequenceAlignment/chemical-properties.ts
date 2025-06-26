import type { ColorMap, ResidueCounts } from './types';

export const chemicalPropertiesColorMap: ColorMap = {
  hydrophobic: {
    label: 'Hydrophobic',
    color: '#99CCFF',
  },
  positiveCharge: {
    label: 'Positive Charged',
    color: '#FFA2A3',
  },
  negativeCharge: {
    label: 'Negative Charged',
    color: '#C1ADFF',
  },
  polar: {
    label: 'Polar',
    color: '#99E099',
  },
  cysteine: {
    label: 'Cysteines',
    color: '#FAAAFA',
  },
  glycine: {
    label: 'Glycines',
    color: '#F7BC5D',
  },
  proline: {
    label: 'Prolines',
    color: '#FFFF8F',
  },
  aromatic: {
    label: 'Aromatic',
    color: '#A2F5FA',
  },
};

export type ChemicalCategory = keyof typeof chemicalPropertiesColorMap;

export function colorizeSequencesByChemicalProperties(
  { sequences, residueCounts, colorMap }: {
    sequences: string[];
    residueCounts: ResidueCounts;
    colorMap: ColorMap;
  },
): Promise<Blob> {
  const canvas = new OffscreenCanvas(
    sequences[0]?.length ?? 0,
    sequences.length,
  );
  const context = canvas.getContext('2d')!;
  const chemicalProperties = getAlignmentChemicalProperties({
    residueCounts,
    rowCount: sequences.length,
  });
  for (const [rowIndex, sequence] of sequences.entries()) {
    for (const [columnIndex, residue] of sequence.split('').entries()) {
      const category = chemicalProperties
        .at(columnIndex)
        ?.find(({ residues }) => residues.includes(residue))
        ?.category;
      if (!category) continue;
      const color = colorMap[category]?.color;
      if (!color) continue;
      context.fillStyle = colorMap[category].color;
      context.fillRect(columnIndex, rowIndex, 1, 1);
    }
  }
  return canvas.convertToBlob();
}

const getAlignmentChemicalProperties = (
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

type ColumnChemicalProperties = {
  residues: string;
  category: ChemicalCategory;
}[];

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
