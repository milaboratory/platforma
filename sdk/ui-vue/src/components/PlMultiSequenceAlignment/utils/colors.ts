/*
Clustal X Default Colouring Rules (adapted for this implementation):

The table below gives these criteria as clauses: {>X%,xx,y}, where X is the threshold percentage presence for any of the xx (or y) residue types.
For example, K or R is coloured red if the column includes more than 60% K or R (combined), or more than 80% of either K or R or Q (individually).

The coloring logic below is based on the Clustal X default coloring scheme.
Thresholds refer to the percentage of residues in a column belonging to a specified group.

- Hydrophobic (blue):
  - Residues: A, C, I, L, M, F, W, V
    - Condition: >60% in group WLVIMAFCYHP (W, L, V, I, M, A, F, C, Y, H, P)
  - Residue: C (also covered by the above, but sometimes listed separately)
    - Condition: >60% in group WLVIMAFCYHP

- Positive charge (red):
  - Residues: K, R
    - Conditions: >60% in group KR (K, R) OR >85% in group {K, R, Q}

- Negative charge (magenta):
  - Residue: E
    - Conditions: >60% in group KR OR >50% in group QE (Q, E) OR >50% in group ED (E, D) OR >85% in group {E, Q, D}
  - Residue: D
    - Conditions: >60% in group KR OR >85% in group DEN (D, E, N) OR >50% in group ED (E, D)

- Polar (green):
  - Residue: N
    - Conditions: >50% in group {N} OR >85% in group DEN (D, E, N)
  - Residue: Q
    - Conditions: >60% in group KR OR >50% in group QE (Q, E) OR >85% in group {Q, T, K, R}
  - Residues: S, T
    - Conditions: >60% in group WLVIMAFCYHP OR >50% in group ST (S, T) OR >85% in group ST (S, T)

- Cysteines (pink):
  - Residue: C
    - Condition: >85% in group {C}

- Glycines (orange):
  - Residue: G
    - Condition: If residue is G (effectively >0% in group {G})

- Prolines (yellow):
  - Residue: P
    - Condition: If residue is P (effectively >0% in group {P})

- Aromatic (cyan):
  - Residues: H, Y
    - Conditions: >60% in group WLVIMAFCYHP OR >85% in group WYA (W, Y, A, C, P, Q, F, H, I, L, M, V)

- Gap / Unconserved (black):
  - Residue: - (gap) or any other residue not matching above criteria.
    - Condition: Always 'black' for gaps. For other residues, if no other rule applies.

Note: Residue groups mentioned (e.g., WLVIMAFCYHP, KR) are defined as constants within the function.
The percentages are strict inequalities (e.g., >60% means count/total > 0.6).
*/

export const residueType = [
  'hydrophobic',
  'positive_charge',
  'negative_charge',
  'polar',
  'cysteine_specific',
  'glycine',
  'proline',
  'aromatic',
  'unconserved_or_default',
] as const;

export type ResidueType = typeof residueType[number];

export const residueTypeLabels: Record<ResidueType, string> = {
  hydrophobic: 'Hydrophobic',
  positive_charge: 'Positive Charge',
  negative_charge: 'Negative Charge',
  polar: 'Polar',
  cysteine_specific: 'Cysteine (Specific)',
  glycine: 'Glycine',
  proline: 'Proline',
  aromatic: 'Aromatic',
  unconserved_or_default: 'Unconserved / Default',
};

export const residueTypeColorMap: Record<ResidueType, string> = {
  hydrophobic: '#2D93FA',
  positive_charge: '#F05670',
  negative_charge: '#845CFF',
  polar: '#198020',
  cysteine_specific: '#E553E5',
  glycine: '#FF9429',
  proline: '#95C700',
  aromatic: '#27C2C2',
  unconserved_or_default: '#ffffff',
};

export type HighlightedResidue = {
  residue: string;
  position: number;
  color: ResidueType;
};

function getColumnCounts(column: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const res of column) {
    const r = res.toUpperCase();
    if (r === '-') continue;
    counts[r] = (counts[r] || 0) + 1;
  }
  return counts;
}

function getResidueType(
  residue: string,
  counts: Record<string, number>,
  totalNonGapInColumn: number,
): ResidueType {
  residue = residue.toUpperCase();
  if (residue === '-') return 'unconserved_or_default';
  if (totalNonGapInColumn === 0) return 'unconserved_or_default'; // Avoid division by zero

  const percent = (group: string[]) =>
    group.reduce((sum, r) => sum + (counts[r] || 0), 0) / totalNonGapInColumn;

  const doesAnyResidueMeetPercentThreshold = (group: string[], threshold = 0.6) =>
    group.some((r) => (counts[r] || 0) / totalNonGapInColumn > threshold);

  const WLVIMAFCYHP = ['W', 'L', 'V', 'I', 'M', 'A', 'F', 'C', 'Y', 'H', 'P'];
  const KR = ['K', 'R'];
  const QE = ['Q', 'E'];
  const ED = ['E', 'D'];
  const ST = ['S', 'T'];
  const WYA_MEMBERS = ['W', 'Y', 'A', 'C', 'P', 'Q', 'F', 'H', 'I', 'L', 'M', 'V'];

  if (['A', 'C', 'I', 'L', 'M', 'F', 'W', 'V'].includes(residue) && percent(WLVIMAFCYHP) > 0.6)
    return 'hydrophobic';

  if (['K', 'R'].includes(residue) && (percent(KR) > 0.6 || doesAnyResidueMeetPercentThreshold(['K', 'R', 'Q'], 0.85)))
    return 'positive_charge';

  if (residue === 'E' && (
    percent(KR) > 0.6 || percent(QE) > 0.5 || percent(ED) > 0.5 || doesAnyResidueMeetPercentThreshold(['E', 'Q', 'D'], 0.85)))
    return 'negative_charge';

  if (residue === 'D' && (
    percent(KR) > 0.6 || doesAnyResidueMeetPercentThreshold(['D', 'E', 'N'], 0.85) || percent(ED) > 0.5))
    return 'negative_charge';

  if (residue === 'N' && (
    ((counts['N'] || 0) / totalNonGapInColumn > 0.5) || doesAnyResidueMeetPercentThreshold(['D', 'E', 'N'], 0.85)))
    return 'polar';

  if (residue === 'Q' && (
    percent(KR) > 0.6 || percent(QE) > 0.5 || doesAnyResidueMeetPercentThreshold(['Q', 'T', 'K', 'R'], 0.85)))
    return 'polar';

  if (['S', 'T'].includes(residue) && (
    percent(WLVIMAFCYHP) > 0.6 || percent(ST) > 0.5 || doesAnyResidueMeetPercentThreshold(['S', 'T'], 0.85)))
    return 'polar';

  if (residue === 'C' && ((counts['C'] || 0) / totalNonGapInColumn > 0.85))
    return 'cysteine_specific';

  if (residue === 'G') return 'glycine';
  if (residue === 'P') return 'proline';

  if (['H', 'Y'].includes(residue) && (
    percent(WLVIMAFCYHP) > 0.6 || doesAnyResidueMeetPercentThreshold(WYA_MEMBERS, 0.85)))
    return 'aromatic';

  return 'unconserved_or_default';
}

export function highlightAlignment(sequences: string[]): HighlightedResidue[][] {
  if (!sequences || sequences.length === 0 || sequences[0].length === 0) {
    return [];
  }

  const alignmentLength = sequences[0].length;
  const numSequences = sequences.length;
  const result: HighlightedResidue[][] = Array(numSequences).fill(null).map(() => []);

  const columnProcessedCache = new Map<string, Map<string, ResidueType>>();

  for (let i = 0; i < alignmentLength; i++) {
    const currentColumnArray: string[] = [];
    for (let k = 0; k < numSequences; k++) {
      currentColumnArray.push(sequences[k][i]);
    }

    const columnKey = currentColumnArray.join('');
    let residueToColorMapForThisColumn: Map<string, ResidueType>;

    if (columnProcessedCache.has(columnKey)) {
      residueToColorMapForThisColumn = columnProcessedCache.get(columnKey)!;
    } else {
      residueToColorMapForThisColumn = new Map<string, ResidueType>();
      const columnCounts = getColumnCounts(currentColumnArray);
      const totalNonGapInColumn = currentColumnArray.filter((r) => r !== '-').length;

      const uniqueResiduesInColumn = new Set(currentColumnArray);
      for (const uniqueResidue of uniqueResiduesInColumn) {
        const color = getResidueType(uniqueResidue, columnCounts, totalNonGapInColumn);
        residueToColorMapForThisColumn.set(uniqueResidue, color);
      }
      columnProcessedCache.set(columnKey, residueToColorMapForThisColumn);
    }

    for (let j = 0; j < numSequences; j++) {
      const residueChar = currentColumnArray[j];
      const color = residueToColorMapForThisColumn.get(residueChar)!;
      result[j].push({ residue: residueChar, position: i, color });
    }
  }
  return result;
}

// Example usage comments can remain if desired
// const sequences = [
//   'GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKF',
//   '-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPF',
//   'MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKY',
//   '-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKY',
// ];

// const highlighted = highlightAlignment(sequences);
// console.log(highlighted);
