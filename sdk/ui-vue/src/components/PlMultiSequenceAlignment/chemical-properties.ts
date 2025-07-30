import type { HighlightLegend, ResidueCounts } from './types';

export function highlightByChemicalProperties(
  { sequences, residueCounts }: {
    sequences: string[];
    residueCounts: ResidueCounts;
  },
): { blob: Blob; legend: HighlightLegend } {
  const lines: {
    category: ChemicalCategory;
    column: number;
    start: number;
    length: number;
  }[] = [];
  const chemicalProperties = getAlignmentChemicalProperties({
    residueCounts,
    rowCount: sequences.length,
  });
  const width = sequences.at(0)?.length ?? 0;
  const height = sequences.length;
  for (let column = 0; column < width; column += 1) {
    for (let row = 0; row < height; row += 1) {
      const residue = sequences[row][column];
      const category = chemicalProperties
        .at(column)
        ?.find(({ residues }) => residues.includes(residue))
        ?.category;
      if (!category) continue;
      const lastLine = lines.at(-1);
      if (
        lastLine
        && lastLine.category === category
        && lastLine.column === column
        && lastLine.start + lastLine.length === row
      ) {
        lastLine.length += 1;
      } else {
        lines.push({ category, column, start: row, length: 1 });
      }
    }
  }
  const linesByCategory = Map.groupBy(lines, ({ category }) => category);
  const blob = new Blob(
    (function*() {
      const viewBox = `0 0 ${width * 2} ${height}`;
      yield `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" stroke-width="2" preserveAspectRatio="none">`;
      for (const [category, lines] of linesByCategory) {
        const color = chemicalPropertiesColorScheme[category]?.color;
        if (!color) continue;
        yield `<path stroke="${color}" d="`;
        let x = 0, y = 0;
        for (const { column, start, length } of lines) {
          yield `m${column * 2 + 1 - x},${start - y}v${length}`;
          x = column * 2 + 1;
          y = start + length;
        }
        yield '"/>';
      }
      yield '</svg>';
    })().toArray(),
    { type: 'image/svg+xml' },
  );
  const legend = Object.fromEntries(
    Object.entries(chemicalPropertiesColorScheme)
      .filter(([color]) => linesByCategory.has(color as ChemicalCategory)),
  );
  return { blob, legend };
}

const getAlignmentChemicalProperties = (
  { residueCounts, rowCount }: {
    residueCounts: ResidueCounts;
    rowCount: number;
  },
): ColumnChemicalProperties[] =>
  residueCounts.map((column) => {
    const matchedRules = new Set<string>();
    return categoryCriterion.filter(({ residues, rules }) =>
      residues.split('').some((residue) => residue in column)
      && (!rules || rules.split('').map((ruleName) =>
        [ruleName, ruleDefinitions[ruleName as RuleName]] as const,
      ).some(([ruleName, { residues, threshold }]) => {
        if (matchedRules.has(ruleName)) return true;
        const groupCount = residues.split('')
          .reduce((acc, residue) => acc + (column[residue] ?? 0), 0);
        const matches = groupCount >= rowCount * threshold;
        if (matches) matchedRules.add(ruleName);
        return matches;
      })),
    );
  });

type ColumnChemicalProperties = {
  residues: string;
  category: ChemicalCategory;
}[];

const chemicalPropertiesColorScheme = {
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
} satisfies HighlightLegend;

export type ChemicalCategory = keyof typeof chemicalPropertiesColorScheme;

/*
 * Below taken mostly from
 * https://www.rbvi.ucsf.edu/chimera/1.2065/docs/ContributedSoftware/multalignviewer/colprot.par}
 */

const ruleDefinitions = {
  '%': { residues: 'WLVIMAFCYHP', threshold: 0.6 },
  '#': { residues: 'WLVIMAFCYHP', threshold: 0.8 },
  '-': { residues: 'ED', threshold: 0.5 },
  '+': { residues: 'KR', threshold: 0.6 },
  'g': { residues: 'G', threshold: 0.5 },
  'n': { residues: 'N', threshold: 0.5 },
  'q': { residues: 'QE', threshold: 0.5 },
  'p': { residues: 'P', threshold: 0.5 },
  't': { residues: 'TS', threshold: 0.5 },
  'A': { residues: 'A', threshold: 0.85 },
  'C': { residues: 'C', threshold: 0.85 },
  'D': { residues: 'D', threshold: 0.85 },
  'E': { residues: 'E', threshold: 0.85 },
  'F': { residues: 'F', threshold: 0.85 },
  'G': { residues: 'G', threshold: 0.85 },
  'H': { residues: 'H', threshold: 0.85 },
  'I': { residues: 'I', threshold: 0.85 },
  'K': { residues: 'K', threshold: 0.85 },
  'L': { residues: 'L', threshold: 0.85 },
  'M': { residues: 'M', threshold: 0.85 },
  'N': { residues: 'N', threshold: 0.85 },
  'P': { residues: 'P', threshold: 0.85 },
  'Q': { residues: 'Q', threshold: 0.85 },
  'R': { residues: 'R', threshold: 0.85 },
  'S': { residues: 'S', threshold: 0.85 },
  'T': { residues: 'T', threshold: 0.85 },
  'V': { residues: 'V', threshold: 0.85 },
  'W': { residues: 'W', threshold: 0.85 },
  'Y': { residues: 'Y', threshold: 0.85 },
};

type RuleName = keyof typeof ruleDefinitions;

const categoryCriterion: Criteria[] = [
  { residues: 'G', category: 'glycine', rules: '' },
  { residues: 'P', category: 'proline', rules: '' },
  { residues: 'T', category: 'polar', rules: 'tST%#' },
  { residues: 'S', category: 'polar', rules: 'tST#' },
  { residues: 'N', category: 'polar', rules: 'nND' },
  { residues: 'Q', category: 'polar', rules: 'qQE+KR' },
  // criteria below has to go before the other criteria for C,
  // otherwise it will never match
  { residues: 'C', category: 'cysteine', rules: 'C' },
  { residues: 'WLVIMF', category: 'hydrophobic', rules: '%#ACFHILMVWYPp' },
  // below there was an 's' rule too,
  // but no definition of such rule was provided
  { residues: 'A', category: 'hydrophobic', rules: '%#ACFHILMVWYPpTSG' },
  { residues: 'C', category: 'hydrophobic', rules: '%#AFHILMVWYSPp' },
  { residues: 'HY', category: 'aromatic', rules: '%#ACFHILMVWYPp' },
  { residues: 'E', category: 'negativeCharge', rules: '-DEqQ' },
  { residues: 'D', category: 'negativeCharge', rules: '-DEnN' },
  { residues: 'KR', category: 'positiveCharge', rules: '+KRQ' },
];

type Criteria = {
  residues: string;
  category: ChemicalCategory;
  rules: string;
};
